import NextAuth from 'next-auth';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import Credentials from 'next-auth/providers/credentials';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from '@/db';
import { users, accounts, sessions, verificationTokens } from '@/db/schema';
import type { Adapter } from 'next-auth/adapters';
import { authConfig } from './auth.config';

/**
 * Full server-side NextAuth config: the edge-safe base from auth.config.ts plus
 * everything that needs a database.
 *
 * Do NOT import this from middleware — it pulls in Drizzle, libSQL and bcrypt.
 * Middleware builds its own instance from `authConfig` alone. See auth.config.ts.
 */
const adapter = DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
}) as Adapter;

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter,
  providers: [
    ...authConfig.providers,
    // Credentials lives here rather than in the edge config: `authorize` queries
    // the database and runs bcrypt. It is only ever invoked by the /api/auth
    // route handler in the Node runtime, never by middleware.
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user) {
          throw new Error('No user found with this email');
        }

        if (!user.hashedPassword) {
          throw new Error('Please sign in with Google');
        }

        const passwordValid = await bcrypt.compare(password, user.hashedPassword);

        if (!passwordValid) {
          throw new Error('Invalid password');
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Backfills a Google avatar onto an existing account. Needs the database, so
    // it stays out of the edge config.
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user.email) {
        const [existingUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, user.email))
          .limit(1);

        if (existingUser && !existingUser.image && user.image) {
          await db
            .update(users)
            .set({ image: user.image, updatedAt: new Date().toISOString() })
            .where(eq(users.id, existingUser.id));
        }
      }
      return true;
    },
  },
  events: {
    async createUser({ user }) {
      console.log(`New user created: ${user.email}`);
    },
  },
});
