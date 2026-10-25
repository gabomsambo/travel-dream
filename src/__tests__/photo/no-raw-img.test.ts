import fs from 'fs';
import path from 'path';

// Every photo in Library and Explore goes through `Photo`, which picks the size
// the box needs. A raw <img> here is how a full-size photo lands in a small tile.
const ROOTS = [
  'src/components/explore',
  'src/components/library',
  'src/app/(app)/explore',
  'src/app/(app)/library',
];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx$/.test(entry.name) ? [full] : [];
  });
}

describe('photos in Library and Explore', () => {
  it('are never a raw <img>', () => {
    const offenders = ROOTS.flatMap(sourceFiles).filter((file) =>
      /<img[\s>]/.test(fs.readFileSync(file, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });
});
