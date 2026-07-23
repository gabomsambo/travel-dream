import Google from 'next-auth/providers/google';
import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe half of the NextAuth config.
 *
 * This file must never import the database, the Drizzle adapter, bcrypt, or any
 * other Node-only module: it is loaded by `src/middleware.ts`, which runs on
 * every single request. Pulling the ORM in here is what previously inflated the
 * middleware bundle to ~177 kB.
 *
 * Everything that needs a database lives in `src/lib/auth.ts`, which spreads
 * this config and adds the adapter, the Credentials provider, and the signIn
 * callback. Those are only ever exercised by the `/api/auth/*` route handler,
 * which runs in the Node runtime.
 *
 * The `jwt` and `session` callbacks deliberately live HERE rather than in
 * auth.ts: middleware checks `req.auth?.user?.id`, so the callbacks that
 * populate `token.id` and `session.user.id` must be present in the edge config
 * or that check would always be false and every request would redirect to
 * /login.
 */
export const authConfig = {
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    signOut: '/',
    error: '/login',
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
      }
      if (account) {
        token.provider = account.provider;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  trustHost: true,
  secret: process.env.AUTH_SECRET,
} satisfies NextAuthConfig;
