/**
 * Helpers for the cross-tenant authorization suite.
 *
 * Two things need asserting per route:
 *   1. the query the route issues is scoped to the caller (`whereMentions`)
 *   2. when that scoped query matches nothing, the route refuses (404/403)
 *      instead of falling through to a read or write
 */

/** Recursively collect every primitive embedded in a Drizzle SQL condition. */
function collectPrimitives(node: unknown, seen: WeakSet<object>, out: unknown[]): void {
  if (node === null || node === undefined) return;

  if (typeof node !== 'object') {
    out.push(node);
    return;
  }

  if (seen.has(node as object)) return;
  seen.add(node as object);

  if (Array.isArray(node)) {
    for (const item of node) collectPrimitives(item, seen, out);
    return;
  }

  for (const value of Object.values(node as Record<string, unknown>)) {
    collectPrimitives(value, seen, out);
  }
}

/**
 * True when `condition` (a Drizzle `eq(...)`/`and(...)` tree) binds `value`
 * as a parameter — i.e. the route really did filter on it.
 */
export function whereMentions(condition: unknown, value: string): boolean {
  const values: unknown[] = [];
  collectPrimitives(condition, new WeakSet(), values);
  return values.includes(value);
}

type Terminal = {
  get: jest.Mock;
  limit: jest.Mock;
  orderBy: jest.Mock;
  then: (onFulfilled?: (v: unknown[]) => unknown, onRejected?: (e: unknown) => unknown) => Promise<unknown>;
};

function asRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  return result === null || result === undefined ? [] : [result];
}

/**
 * Terminal node of a mocked Drizzle chain: awaitable, and also answers
 * `.get()` / `.limit()` / `.orderBy()` the way the real builder does.
 */
function terminal(result: unknown): Terminal {
  const rows = asRows(result);
  const node: Terminal = {
    get: jest.fn().mockResolvedValue(rows[0] ?? null),
    // `.limit()` is both awaitable and chainable into `.get()`
    limit: jest.fn(() => terminal(result)),
    orderBy: jest.fn(() => terminal(result)),
    then: (onFulfilled, onRejected) => Promise.resolve(rows).then(onFulfilled, onRejected),
  };
  return node;
}

export interface MockSelect {
  chain: { from: jest.Mock };
  /** Every condition passed to `.where()`, in call order. */
  conditions: unknown[];
}

/**
 * Build a `db.select()` return value that yields `result` and records the
 * `where` conditions the route used.
 */
export function mockSelect(result: unknown): MockSelect {
  const conditions: unknown[] = [];

  const where = jest.fn((condition: unknown) => {
    conditions.push(condition);
    return terminal(result);
  });

  const from = jest.fn(() => ({
    where,
    innerJoin: jest.fn(() => ({ where })),
    orderBy: jest.fn(() => terminal(result)),
  }));

  return { chain: { from }, conditions };
}

/** `db.update()` stub that swallows any `.set().where()` chain. */
export function mockUpdate() {
  return {
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
      returning: jest.fn().mockResolvedValue([]),
    }),
  };
}

/** `db.delete()` stub. */
export function mockDelete() {
  return { where: jest.fn().mockResolvedValue(undefined) };
}
