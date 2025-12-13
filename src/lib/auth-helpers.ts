import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { cache } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email!,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
  };
});

export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return user;
}

export async function requireAuthForApi(): Promise<AuthUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  return user;
}

export function isAuthError(error: unknown): boolean {
  return error instanceof Error && error.message === 'Unauthorized';
}
