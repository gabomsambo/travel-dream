/**
 * Tenant-scoped database accessor.
 *
 * Isolation in this app used to be a *discipline*: every author had to remember
 * to write `eq(<table>.userId, user.id)` by hand, in every new query, forever.
 * There are over a hundred of those hand-written filters, and the ones that got
 * forgotten are how the last three cross-tenant bugs happened.
 *
 * This module is the chokepoint that replaces the discipline. Every query it
 * builds is pinned to one user before the caller ever sees a builder, so a
 * route cannot construct an unscoped query through it — not by forgetting a
 * clause, and not by passing a wider predicate, because extras are always
 * AND-ed and AND can only narrow.
 *
 * It is paired with a `no-restricted-imports` rule in `.eslintrc.json` banning
 * `db` / `client` from all of `src/app/**` — every route group, present and
 * future — by both the `@/db` alias and any relative path to the same module.
 * The rule is what makes this the default path; this module is what makes that
 * default usable. See `AGENTS.md` § Multi-Tenancy.
 *
 * ## Two kinds of table
 *
 * - **Owned** tables carry `user_id` themselves. Scoping is `user_id = :userId`.
 * - **Derived** tables have no `user_id` at all; they are owned transitively
 *   through another table. Scoping is
 *   `<owner fk> IN (SELECT id FROM <owner> WHERE user_id = :userId)`.
 *   A subquery rather than a join, so rows keep the derived table's own flat
 *   shape — joining would nest them and silently change the shape of any
 *   response built from them.
 *
 * ## What this deliberately does not cover
 *
 * The shared mass-upload worker (`src/lib/mass-upload/`) has no user context by
 * design: it claims any user's queued source and derives ownership from the row
 * it claimed. `auth/register` runs before the user exists. Both keep the raw
 * client, and both live outside the linted directories.
 */
import { and, eq, getTableName, sql, type SQL } from 'drizzle-orm';
import type { SQLiteUpdateSetSource } from 'drizzle-orm/sqlite-core';
// eslint-disable-next-line no-restricted-imports -- this module IS the scoped wrapper
import { db } from '@/db';
import {
  attachments,
  collections,
  dismissedDuplicates,
  places,
  placesToCollections,
  sources,
  sourcesToPlaces,
  uploadSessions,
} from '@/db/schema';

/** Tables that carry `user_id` themselves. */
const OWNED = [places, sources, collections, uploadSessions, dismissedDuplicates] as const;

/** Any table this module will scope by its own `user_id` column. */
export type OwnedTable = (typeof OWNED)[number];

/**
 * Tables with no `user_id` of their own. `ownerFk` points at the owning table.
 *
 * `placesToCollections` is not a bare join table — it carries `order_index`,
 * `is_pinned` and a user-authored free-text `note`, so reading it unscoped
 * leaks private content, not just graph edges.
 */
const DERIVED = [
  { table: attachments, ownerFk: attachments.placeId, owner: places },
  { table: placesToCollections, ownerFk: placesToCollections.collectionId, owner: collections },
  { table: sourcesToPlaces, ownerFk: sourcesToPlaces.sourceId, owner: sources },
] as const;

/** Any table this module will scope through its owner. */
export type DerivedTable = (typeof DERIVED)[number]['table'];

function derivedEntry(table: DerivedTable): (typeof DERIVED)[number] {
  const name = getTableName(table);
  const entry = DERIVED.find((d) => getTableName(d.table) === name);
  if (!entry) {
    // Unreachable through the public API — the parameter types only admit the
    // three tables above — but a runtime guard beats silently dropping the
    // ownership predicate if someone widens the types later.
    throw new Error(`tenant-db: ${name} has no registered owner`);
  }
  return entry;
}

function scopeOwned(table: OwnedTable, userId: string, extra?: SQL): SQL {
  const owner = eq(table.userId, userId);
  return (extra ? and(owner, extra) : owner) as SQL;
}

function scopeDerived(table: DerivedTable, userId: string, extra?: SQL): SQL {
  const { ownerFk, owner } = derivedEntry(table);
  // Written as a `sql` fragment rather than `db.select(...)` so that building
  // the predicate needs no database handle at all — it stays a pure function of
  // the schema, and works identically inside a transaction.
  const scope = sql`${ownerFk} IN (SELECT ${owner.id} FROM ${owner} WHERE ${owner.userId} = ${userId})`;
  return (extra ? and(scope, extra) : scope) as SQL;
}

/**
 * The slice of Drizzle a scope needs. Both `db` and a transaction handle
 * satisfy it, which is what lets `transaction()` hand back a scoped `tx`.
 */
type Executor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

function scopedOn(exec: Executor, userId: string) {
  return {
    /** The user every query below is pinned to. */
    userId,

    // ---- reads ----------------------------------------------------------

    /**
     * `SELECT * FROM <owned> WHERE user_id = :userId [AND <where>]`.
     *
     * Returns a Drizzle builder with the WHERE already applied, so `.limit()`,
     * `.orderBy()`, `.get()` and `await` all behave as they normally would.
     * `.where()` is gone from the returned type, which is the point: there is
     * no way to replace the ownership predicate, only to have narrowed it.
     */
    select<T extends OwnedTable>(table: T, where?: SQL) {
      return exec.select().from(table).where(scopeOwned(table, userId, where));
    },

    /** As `select`, with an explicit projection (aggregates included). */
    selectFields<T extends OwnedTable, F extends Parameters<Executor['select']>[0]>(
      table: T,
      fields: F,
      where?: SQL
    ) {
      return exec.select(fields).from(table).where(scopeOwned(table, userId, where));
    },

    /**
     * `SELECT * FROM <derived> WHERE <owner fk> IN (the caller's owner ids)
     * [AND <where>]`. Rows keep the derived table's own flat shape.
     */
    selectVia<T extends DerivedTable>(table: T, where?: SQL) {
      return exec.select().from(table).where(scopeDerived(table, userId, where));
    },

    /** As `selectVia`, with an explicit projection (aggregates included). */
    selectFieldsVia<T extends DerivedTable, F extends Parameters<Executor['select']>[0]>(
      table: T,
      fields: F,
      where?: SQL
    ) {
      return exec.select(fields).from(table).where(scopeDerived(table, userId, where));
    },

    // ---- writes ---------------------------------------------------------

    /** `UPDATE <owned> SET ... WHERE user_id = :userId [AND <where>]`. */
    update<T extends OwnedTable>(table: T, values: SQLiteUpdateSetSource<T>, where?: SQL) {
      return exec.update(table).set(values).where(scopeOwned(table, userId, where));
    },

    /** `UPDATE <derived> SET ... WHERE <owner fk> IN (owner ids) [AND <where>]`. */
    updateVia<T extends DerivedTable>(table: T, values: SQLiteUpdateSetSource<T>, where?: SQL) {
      return exec.update(table).set(values).where(scopeDerived(table, userId, where));
    },

    /** `DELETE FROM <owned> WHERE user_id = :userId [AND <where>]`. */
    deleteFrom<T extends OwnedTable>(table: T, where?: SQL) {
      return exec.delete(table).where(scopeOwned(table, userId, where));
    },

    /** `DELETE FROM <derived> WHERE <owner fk> IN (owner ids) [AND <where>]`. */
    deleteVia<T extends DerivedTable>(table: T, where?: SQL) {
      return exec.delete(table).where(scopeDerived(table, userId, where));
    },

    /**
     * `INSERT INTO <owned> ...` with `user_id` forced to this user. A `userId`
     * present in `values` is overwritten rather than trusted.
     */
    insert<T extends OwnedTable>(table: T, values: Omit<T['$inferInsert'], 'userId'>) {
      return exec.insert(table).values({ ...values, userId } as T['$inferInsert']);
    },
  };
}

/**
 * Outcome of `findOwned(table, id)`. `not-found` and `forbidden` are separate
 * so handlers can keep answering 404 and 403 the way they always have; the
 * `forbidden` verdict never carries the foreign row.
 */
export type OwnedLookup<T extends OwnedTable> =
  | { status: 'ok'; row: T['$inferSelect'] }
  | { status: 'not-found' }
  | { status: 'forbidden' };

/** A database handle on which every query is pinned to one user. */
export type TenantDb = ReturnType<typeof scopedOn> & {
  /**
   * Look up a single owned row **by primary key**, distinguishing "no such
   * row" from "someone else's row".
   *
   * This is the one method that runs an unscoped query, and the signature is
   * what keeps it narrow. It takes an id rather than a predicate on purpose: an
   * arbitrary `SQL` here would let a caller probe `status = 'active'` and turn
   * a single-row existence signal into a cross-tenant existence oracle over
   * every other user's rows. Built internally as `id = :id`, the probe can only
   * ever answer "does this exact row exist", it selects `id` alone, and that
   * value never leaves this function.
   *
   * Handlers in this codebase already answer 404 for a missing id and 403 for a
   * foreign one, which is that same existence signal — an intentional,
   * pre-existing product decision. This exists so migrating a handler to the
   * accessor preserves it rather than silently turning every 403 into a 404.
   */
  findOwned<T extends OwnedTable>(table: T, id: string): Promise<OwnedLookup<T>>;

  /** Runs `fn` in a transaction; `tx` is scoped to the same user. */
  transaction<T>(fn: (tx: ReturnType<typeof scopedOn>) => Promise<T>): Promise<T>;
};

/**
 * Every read and write through the returned object is pinned to `userId`.
 *
 * ```ts
 * const tdb = forUser(user.id);
 * const [place] = await tdb.select(places, eq(places.id, id)).limit(1);
 * ```
 */
export function forUser(userId: string): TenantDb {
  if (!userId) {
    // An empty id would produce `user_id = ''`, which matches nothing — it
    // fails closed, not open. Throwing anyway: reaching here means the caller
    // skipped authentication, and an empty result set would hide that.
    throw new Error('forUser() requires a user id');
  }
  const scoped = scopedOn(db, userId);
  return {
    ...scoped,
    async findOwned<T extends OwnedTable>(table: T, id: string): Promise<OwnedLookup<T>> {
      const byId = eq(table.id, id);
      const owned = await scoped.select(table, byId).get();
      if (owned) return { status: 'ok', row: owned as T['$inferSelect'] };
      // Existence probe, reached only when the scoped read found nothing. It is
      // pinned to the one primary key the caller named, selects `id` only, and
      // that value never leaves this function.
      const foreign = await db.select({ id: table.id }).from(table).where(byId).get();
      return foreign ? { status: 'forbidden' } : { status: 'not-found' };
    },
    transaction<T>(fn: (tx: ReturnType<typeof scopedOn>) => Promise<T>): Promise<T> {
      return db.transaction((tx) => fn(scopedOn(tx, userId)));
    },
  };
}
