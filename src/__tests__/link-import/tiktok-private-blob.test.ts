/**
 * @jest-environment node
 *
 * TikTok photo imports live in a private Vercel Blob store. The pathname handed
 * to `@vercel/blob` is placed in a store URL verbatim, so it must reach the SDK
 * exactly as it appeared in the URL (never percent-decoded) and never carry a
 * `..` segment in any encoding. The store itself is identified by its token.
 */

jest.mock('@vercel/blob', () => ({
  get: jest.fn(),
  put: jest.fn(),
  del: jest.fn(),
  list: jest.fn(),
}));

import { del, get, list, put } from '@vercel/blob';
import {
  deleteTikTokImportsForUser,
  deleteTikTokPrivateBlob,
  deleteTikTokPrivateBlobs,
  getTikTokPrivateBlob,
  isAllowedPrivateBlobUrl,
  privateBlobPathname,
  privateBlobPresence,
  putTikTokPrivateBlob,
  tikTokImportPrefix,
  tikTokPrivateBlobOptions,
} from '@/lib/tiktok-private-blob';

const STORE = 'https://travel-dream.private.blob.vercel-storage.com';
const PUBLIC_STORE = 'https://travel-dream.public.blob.vercel-storage.com';

const priorEnv = {
  token: process.env.TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN,
  storeId: process.env.TIKTOK_PRIVATE_BLOB_STORE_ID,
};

function restore(name: 'TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN' | 'TIKTOK_PRIVATE_BLOB_STORE_ID', value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN;
  delete process.env.TIKTOK_PRIVATE_BLOB_STORE_ID;
});

afterAll(() => {
  restore('TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN', priorEnv.token);
  restore('TIKTOK_PRIVATE_BLOB_STORE_ID', priorEnv.storeId);
});

describe('tikTokPrivateBlobOptions', () => {
  it('is unconfigured without the read/write token', () => {
    expect(tikTokPrivateBlobOptions()).toBeNull();
  });

  it('ignores a store id on its own: the store comes from the token', () => {
    process.env.TIKTOK_PRIVATE_BLOB_STORE_ID = 'store_abc';
    expect(tikTokPrivateBlobOptions()).toBeNull();
  });

  it('passes only the token and private access to the SDK', () => {
    process.env.TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN = ' vercel_blob_rw_private_token ';
    process.env.TIKTOK_PRIVATE_BLOB_STORE_ID = 'store_abc';
    expect(tikTokPrivateBlobOptions()).toEqual({ access: 'private', token: 'vercel_blob_rw_private_token' });
  });
});

describe('isAllowedPrivateBlobUrl', () => {
  it('accepts a private Vercel Blob store URL', () => {
    expect(isAllowedPrivateBlobUrl(`${STORE}/tiktok-imports/u/1.jpg`)).toBe(true);
  });

  it.each([
    ['a public store URL', `${PUBLIC_STORE}/a.jpg`],
    ['a non-https scheme', 'http://travel-dream.private.blob.vercel-storage.com/a.jpg'],
    ['a suffix look-alike host', 'https://travel-dream.private.blob.vercel-storage.com.evil.test/a.jpg'],
    ['a host hidden in the query', `${PUBLIC_STORE}/a.jpg?.private.blob.vercel-storage.com/`],
    ['embedded credentials', 'https://u:p@travel-dream.private.blob.vercel-storage.com/a.jpg'],
    ['an explicit port', 'https://travel-dream.private.blob.vercel-storage.com:8443/a.jpg'],
    ['a malformed URL', 'not-a-url'],
  ])('rejects %s', (_label, url) => {
    expect(isAllowedPrivateBlobUrl(url)).toBe(false);
  });
});

describe('privateBlobPathname', () => {
  it('returns the pathname exactly as it appears in the URL, without percent-decoding', () => {
    expect(privateBlobPathname(`${STORE}/tiktok-imports/u/@creator%20post-1.jpg`))
      .toBe('tiktok-imports/u/@creator%20post-1.jpg');
    expect(privateBlobPathname(`${STORE}/tiktok-imports/u/photo%2Fname.jpg`)).toBeNull();
  });

  it('refuses a public store URL and an empty path', () => {
    expect(privateBlobPathname(`${PUBLIC_STORE}/tiktok-imports/u/1.jpg`)).toBeNull();
    expect(privateBlobPathname(`${STORE}/`)).toBeNull();
    expect(privateBlobPathname(STORE)).toBeNull();
  });

  it.each([
    ['a raw .. segment', `${STORE}/tiktok-imports/..%2Fother/1.jpg`],
    ['a fully encoded .. segment', `${STORE}/tiktok-imports/%2e%2e/other/1.jpg`],
    ['an upper-case encoded .. segment', `${STORE}/tiktok-imports/%2E%2E/other/1.jpg`],
    ['a half-encoded .. segment', `${STORE}/tiktok-imports/.%2e/other/1.jpg`],
    ['the other half-encoded .. segment', `${STORE}/tiktok-imports/%2e./other/1.jpg`],
    ['an encoded . segment', `${STORE}/tiktok-imports/%2e/1.jpg`],
    ['a backslash segment', `${STORE}/tiktok-imports/..%5Cother/1.jpg`],
    ['a trailing encoded .. segment', `${STORE}/tiktok-imports/%2e%2e`],
  ])('rejects %s', (_label, url) => {
    expect(privateBlobPathname(url)).toBeNull();
  });

  it('keeps dots that are part of a file name', () => {
    expect(privateBlobPathname(`${STORE}/tiktok-imports/u/..photo..jpg`)).toBe('tiktok-imports/u/..photo..jpg');
    expect(privateBlobPathname(`${STORE}/tiktok-imports/u/photo.tar.gz`)).toBe('tiktok-imports/u/photo.tar.gz');
  });
});

describe('getTikTokPrivateBlob', () => {
  it('hands the SDK the raw pathname and the token-only options', async () => {
    process.env.TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_private_token';
    (get as jest.Mock).mockResolvedValue({ statusCode: 200 });
    const signal = new AbortController().signal;

    await getTikTokPrivateBlob(`${STORE}/tiktok-imports/u/@creator%20post-1.jpg`, '"etag"', signal);

    expect(get).toHaveBeenCalledWith('tiktok-imports/u/@creator%20post-1.jpg', {
      access: 'private',
      token: 'vercel_blob_rw_private_token',
      ifNoneMatch: '"etag"',
      abortSignal: signal,
    });
  });

  it('never reaches the SDK for a traversal path or an unconfigured store', async () => {
    process.env.TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_private_token';
    await expect(getTikTokPrivateBlob(`${STORE}/tiktok-imports/%2e%2e/other/1.jpg`)).resolves.toBeNull();
    expect(get).not.toHaveBeenCalled();

    delete process.env.TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN;
    await expect(getTikTokPrivateBlob(`${STORE}/tiktok-imports/u/1.jpg`)).resolves.toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});

describe('privateBlobPresence', () => {
  const url = `${STORE}/tiktok-imports/u/1.jpg`;

  it('reports a private photo as live through the store, without downloading it', async () => {
    process.env.TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_private_token';
    const cancel = jest.fn().mockResolvedValue(undefined);
    (get as jest.Mock).mockResolvedValue({
      statusCode: 200,
      stream: { cancel },
      headers: new Headers(),
      blob: {},
    });

    await expect(privateBlobPresence(url)).resolves.toBe('live');

    expect(get).toHaveBeenCalledWith('tiktok-imports/u/1.jpg', {
      access: 'private',
      token: 'vercel_blob_rw_private_token',
      ifNoneMatch: undefined,
    });
    expect(cancel).toHaveBeenCalled();
  });

  it('reports a private photo as dead when the store says it is gone', async () => {
    process.env.TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_private_token';
    (get as jest.Mock).mockResolvedValue(null);

    await expect(privateBlobPresence(url)).resolves.toBe('dead');
  });

  it('never reports a private photo as dead when the store cannot be read', async () => {
    process.env.TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_private_token';
    (get as jest.Mock).mockRejectedValue(new Error('Failed to fetch blob: 403'));

    await expect(privateBlobPresence(url)).resolves.toBe('unknown');
  });

  it('never reports a private photo as dead when the store is not configured', async () => {
    await expect(privateBlobPresence(url)).resolves.toBe('unknown');
    expect(get).not.toHaveBeenCalled();
  });
});

describe('deleteTikTokPrivateBlob', () => {
  it('refuses a traversal path before touching the store', async () => {
    process.env.TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_private_token';
    await expect(deleteTikTokPrivateBlob(`${STORE}/tiktok-imports/%2e%2e/other/1.jpg`)).rejects.toThrow();
    expect(del).not.toHaveBeenCalled();
  });
});

describe('deleteTikTokImportsForUser', () => {
  const options = { access: 'private', token: 'vercel_blob_rw_private_token' };

  it('gives every user their own import prefix', () => {
    expect(tikTokImportPrefix('user-alice')).toMatch(/^tiktok-imports\/[0-9a-f]{24}\/$/);
    expect(tikTokImportPrefix('user-alice')).toBe(tikTokImportPrefix('user-alice'));
    expect(tikTokImportPrefix('user-alice')).not.toBe(tikTokImportPrefix('user-bob'));
  });

  it('lists only the user\'s own prefix and deletes what it finds in one request', async () => {
    process.env.TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_private_token';
    const prefix = tikTokImportPrefix('user-alice');
    const mine = [`${STORE}/${prefix}7694/1-abc.jpg`, `${STORE}/${prefix}7694/2-def.jpg`];
    (list as jest.Mock).mockResolvedValue({
      // A store that answered with something outside the prefix must not get it deleted.
      blobs: [...mine, `${STORE}/${tikTokImportPrefix('user-bob')}7694/1-xyz.jpg`, `${STORE}/thumbnails/other.jpg`]
        .map((url) => ({ url })),
      hasMore: false,
    });

    await expect(deleteTikTokImportsForUser('user-alice')).resolves.toEqual({ status: 'deleted', count: 2 });

    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith({ prefix, limit: 1000, token: 'vercel_blob_rw_private_token' });
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(mine, options);
  });

  it('follows the listing cursor until the prefix is exhausted', async () => {
    process.env.TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_private_token';
    const prefix = tikTokImportPrefix('user-alice');
    const first = `${STORE}/${prefix}1/1.jpg`;
    const second = `${STORE}/${prefix}2/1.jpg`;
    (list as jest.Mock)
      .mockResolvedValueOnce({ blobs: [{ url: first }], hasMore: true, cursor: 'next-page' })
      .mockResolvedValueOnce({ blobs: [{ url: second }], hasMore: false });

    await expect(deleteTikTokImportsForUser('user-alice')).resolves.toEqual({ status: 'deleted', count: 2 });

    expect(list).toHaveBeenNthCalledWith(2, { prefix, limit: 1000, token: 'vercel_blob_rw_private_token', cursor: 'next-page' });
    expect(del).toHaveBeenCalledWith([first, second], options);
  });

  it('sends nothing to the store when the prefix is empty or the store is not configured', async () => {
    await expect(deleteTikTokImportsForUser('user-alice')).resolves.toEqual({ status: 'skipped', reason: 'not_configured' });
    expect(list).not.toHaveBeenCalled();

    process.env.TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_private_token';
    (list as jest.Mock).mockResolvedValue({ blobs: [], hasMore: false });
    await expect(deleteTikTokImportsForUser('user-alice')).resolves.toEqual({ status: 'deleted', count: 0 });
    expect(del).not.toHaveBeenCalled();
  });
});

describe('deleteTikTokPrivateBlobs', () => {
  it('deletes every private object in one store request', async () => {
    process.env.TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_private_token';
    const urls = [`${STORE}/tiktok-imports/u/1.jpg`, `${STORE}/tiktok-imports/u/2.jpg`];

    await expect(deleteTikTokPrivateBlobs(urls)).resolves.toEqual({ status: 'deleted', count: 2 });

    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(urls, { access: 'private', token: 'vercel_blob_rw_private_token' });
  });

  it('skips the batch when the private store is not configured', async () => {
    await expect(deleteTikTokPrivateBlobs([`${STORE}/tiktok-imports/u/1.jpg`])).resolves.toEqual({
      status: 'skipped',
      reason: 'not_configured',
      count: 1,
    });
    expect(del).not.toHaveBeenCalled();
  });

  it('never hands a URL that is not a private store object to the SDK', async () => {
    process.env.TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_private_token';
    const privateUrl = `${STORE}/tiktok-imports/u/1.jpg`;

    await expect(deleteTikTokPrivateBlobs([privateUrl, `${PUBLIC_STORE}/a.jpg`])).resolves.toEqual({
      status: 'deleted',
      count: 1,
    });
    expect(del).toHaveBeenCalledWith([privateUrl], { access: 'private', token: 'vercel_blob_rw_private_token' });

    await expect(deleteTikTokPrivateBlobs([`${PUBLIC_STORE}/a.jpg`])).resolves.toEqual({
      status: 'skipped',
      reason: 'no_private_urls',
      count: 1,
    });
  });
});

describe('putTikTokPrivateBlob', () => {
  beforeEach(() => {
    process.env.TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_private_token';
    (put as jest.Mock).mockResolvedValue({ url: `${STORE}/tiktok-imports/u/1.jpg` });
  });

  it('gives every import its own object', async () => {
    await putTikTokPrivateBlob('tiktok-imports/u/1.jpg', Buffer.from('bytes'), 'image/jpeg');

    expect(put).toHaveBeenCalledWith('tiktok-imports/u/1.jpg', expect.any(Buffer), {
      access: 'private',
      token: 'vercel_blob_rw_private_token',
      contentType: 'image/jpeg',
      addRandomSuffix: true,
    });
  });

  it('replaces the object on the same key when asked to overwrite', async () => {
    await putTikTokPrivateBlob('thumbnails/u/1_thumb.jpg', Buffer.from('bytes'), 'image/jpeg', {
      overwrite: true,
    });

    expect(put).toHaveBeenCalledWith('thumbnails/u/1_thumb.jpg', expect.any(Buffer), {
      access: 'private',
      token: 'vercel_blob_rw_private_token',
      contentType: 'image/jpeg',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  });

  it('writes nothing when the store is not configured', async () => {
    delete process.env.TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN;
    await expect(putTikTokPrivateBlob('tiktok-imports/u/1.jpg', Buffer.from('bytes'), 'image/jpeg')).rejects.toThrow();
    expect(put).not.toHaveBeenCalled();
  });
});
