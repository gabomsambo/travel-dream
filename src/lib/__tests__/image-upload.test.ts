/**
 * @jest-environment node
 *
 * The cover upload used to build its filename as `cover.${file.name.split('.').pop()}`,
 * so the extension — and any separators inside it — came straight from the
 * uploaded filename. These helpers replace that with an allow-list.
 */

import {
  ALLOWED_IMAGE_MIME_TYPES,
  coverBlobPathname,
  extensionForMimeType,
  isOwnedCoverBlobUrl,
  isSafeBlobPathname,
} from '@/lib/image-upload';

describe('extensionForMimeType', () => {
  it.each([
    ['image/jpeg', 'jpg'],
    ['image/jpg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/heic', 'heic'],
    ['image/heif', 'heif'],
  ])('maps %s to .%s', (mime, ext) => {
    expect(extensionForMimeType(mime)).toBe(ext);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(extensionForMimeType('  IMAGE/JPEG ')).toBe('jpg');
  });

  it.each([
    ['an executable type', 'application/x-httpd-php'],
    ['html', 'text/html'],
    ['svg, which can carry script', 'image/svg+xml'],
    ['an unknown type', 'image/bmp'],
    ['an empty string', ''],
    ['undefined', undefined],
    ['null', null],
  ])('rejects %s', (_label, mime) => {
    expect(extensionForMimeType(mime as string)).toBeNull();
  });

  it('exposes exactly the allow-listed types', () => {
    expect(ALLOWED_IMAGE_MIME_TYPES).toEqual([
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
    ]);
  });
});

describe('coverBlobPathname', () => {
  it('builds a key under the collection prefix', () => {
    expect(coverBlobPathname('col_1', 'image/png', '1700000000000')).toBe(
      'collections/col_1/cover-1700000000000.png'
    );
  });

  it('returns null for a type outside the allow-list', () => {
    expect(coverBlobPathname('col_1', 'text/html', '1')).toBeNull();
  });

  it('never takes the extension from a filename-shaped MIME value', () => {
    // The old code would have produced `cover./etc/passwd` from this filename.
    expect(coverBlobPathname('col_1', 'x.jpg/../../../../etc/passwd', '1')).toBeNull();
  });
});

describe('isSafeBlobPathname', () => {
  it.each([
    ['a cover key', 'collections/col_1/cover-1.jpg'],
    ['a screenshot key', 'screenshots/session_1/1700-file.jpg'],
    ['dots inside a filename', 'screenshots/s1/my..photo.jpg'],
  ])('accepts %s', (_label, pathname) => {
    expect(isSafeBlobPathname(pathname)).toBe(true);
  });

  it.each([
    ['a traversal segment', 'collections/../../etc/passwd'],
    ['a leading traversal', '../secrets.txt'],
    ['an absolute path', '/etc/passwd'],
    ['a backslash', 'collections\\col_1\\cover.jpg'],
    ['a NUL byte', 'collections/col_1/cover\u0000.jpg'],
    ['a newline', 'collections/col_1/cover\n.jpg'],
    ['an empty key', ''],
  ])('rejects %s', (_label, pathname) => {
    expect(isSafeBlobPathname(pathname)).toBe(false);
  });
});

describe('isOwnedCoverBlobUrl', () => {
  const HOST = 'https://teststore.public.blob.vercel-storage.com';

  it('recognises a cover this collection uploaded', () => {
    expect(isOwnedCoverBlobUrl(`${HOST}/collections/col_1/cover-1.jpg`, 'col_1')).toBe(true);
  });

  it.each([
    ['a place attachment blob', `${HOST}/places/plc_1/photo.jpg`],
    ["another collection's cover", `${HOST}/collections/col_2/cover-1.jpg`],
    ['a legacy local path', '/uploads/collections/col_1/cover.jpg'],
    ['a malformed URL', 'not-a-url'],
    ['null', null],
    ['undefined', undefined],
  ])('does not claim ownership of %s', (_label, url) => {
    expect(isOwnedCoverBlobUrl(url as string, 'col_1')).toBe(false);
  });
});
