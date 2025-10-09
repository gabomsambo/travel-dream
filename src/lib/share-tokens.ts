import { nanoid } from 'nanoid';

export function generateShareToken(): string {
  return nanoid(21);
}

export function generateShareUrl(collectionId: string, token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/c/${collectionId}-${token}`;
}

export function parseShareUrl(url: string): { collectionId: string; token: string } | null {
  const match = url.match(/\/c\/([^-]+)-(.+)$/);
  if (!match) return null;

  return {
    collectionId: match[1],
    token: match[2],
  };
}
