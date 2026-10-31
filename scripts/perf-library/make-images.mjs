// Builds the bench image set from the repo's own destination photos:
// full = 1600px wide JPEG (like an uploaded/Pexels "large"), thumb = 400x400 cover JPEG q80
// (exactly what queue-processor.generateThumbnail writes).
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
const src = fs.readdirSync('public').filter((f) => /^dest_.*\.png$/.test(f)).sort();
let i = 0;
for (const f of src) {
  i++;
  const n = String(i).padStart(2, '0');
  await sharp(path.join('public', f)).resize(1600, null, { withoutEnlargement: false }).jpeg({ quality: 82 }).toFile(`public/bench/full-${n}.jpg`);
  await sharp(path.join('public', f)).resize(400, 400, { fit: 'cover', position: 'centre' }).jpeg({ quality: 80 }).toFile(`public/bench/thumb-${n}.jpg`);
}
console.log('images', i);
