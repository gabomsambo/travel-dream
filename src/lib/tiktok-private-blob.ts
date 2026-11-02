import { del, get, put } from '@vercel/blob';
import { isAllowedBlobUrl } from '@/lib/blob-url';

export interface TikTokPrivateBlobOptions {
  access: 'private';
  storeId?: string;
  token?: string;
}

export function tikTokPrivateBlobOptions(): TikTokPrivateBlobOptions | null {
  const storeId = process.env.TIKTOK_PRIVATE_BLOB_STORE_ID?.trim();
  const token = process.env.TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN?.trim();
  if (!storeId && !token) return null;
  return {
    access: 'private',
    ...(storeId ? { storeId } : {}),
    ...(token ? { token } : {}),
  };
}

export function isPrivateBlobUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.toLowerCase().endsWith('.private.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

export function privateBlobPathname(value: string): string | null {
  if (!isAllowedBlobUrl(value) || !isPrivateBlobUrl(value)) return null;
  try {
    const path = new URL(value).pathname.slice(1);
    return path ? decodeURIComponent(path) : null;
  } catch {
    return null;
  }
}

export async function putTikTokPrivateBlob(
  pathname: string,
  body: Buffer,
  contentType: string,
) {
  const options = tikTokPrivateBlobOptions();
  if (!options) throw new Error('TikTok private Blob storage is not configured');
  return put(pathname, body, {
    ...options,
    contentType,
    addRandomSuffix: true,
  });
}

export async function getTikTokPrivateBlob(value: string, ifNoneMatch?: string | null) {
  const pathname = privateBlobPathname(value);
  const options = tikTokPrivateBlobOptions();
  if (!pathname || !options) return null;
  return get(pathname, {
    ...options,
    ifNoneMatch: ifNoneMatch ?? undefined,
  });
}

export async function deleteTikTokPrivateBlob(value: string): Promise<void> {
  const pathname = privateBlobPathname(value);
  const options = tikTokPrivateBlobOptions();
  if (!pathname || !options) throw new Error('TikTok private Blob storage is not configured');
  await del(value, options);
}
