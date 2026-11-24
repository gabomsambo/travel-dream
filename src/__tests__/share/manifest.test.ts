import fs from 'fs';
import path from 'path';
import manifest from '@/app/manifest';

describe('web app manifest', () => {
  const m = manifest();

  it('is installable: name, start URL, standalone display, 192 and 512 icons', () => {
    expect(m.name).toBeTruthy();
    expect(m.start_url).toBe('/inbox');
    expect(m.display).toBe('standalone');
    const sizes = (m.icons ?? []).map((icon) => icon.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect((m.icons ?? []).some((icon) => icon.purpose === 'maskable')).toBe(true);
  });

  it('ships every icon it names', () => {
    for (const icon of m.icons ?? []) {
      expect(fs.existsSync(path.join(process.cwd(), 'public', icon.src))).toBe(true);
    }
  });

  it('registers /share-target as a GET share target reading title, text and url', () => {
    expect(m.share_target).toEqual({
      action: '/share-target',
      method: 'GET',
      params: { title: 'title', text: 'text', url: 'url' },
    });
  });
});
