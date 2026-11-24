#!/usr/bin/env node
/**
 * Render the PWA / home-screen icons from public/icons/icon.svg.
 *
 *   node scripts/generate-pwa-icons.mjs
 *
 * Writes public/icons/icon-192.png, icon-512.png, icon-maskable-512.png and
 * src/app/apple-icon.png (Next serves that one as the apple-touch-icon). The
 * mark already sits inside the maskable safe zone, so the maskable icon is the
 * same art at full bleed. Uses `sharp`, which ships with Next.
 */
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const svg = readFileSync(path.join(root, 'public/icons/icon.svg'));

const outputs = [
  ['public/icons/icon-192.png', 192],
  ['public/icons/icon-512.png', 512],
  ['public/icons/icon-maskable-512.png', 512],
  ['src/app/apple-icon.png', 180],
];

for (const [file, size] of outputs) {
  await sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(root, file));
  console.log(`wrote ${file} (${size}x${size})`);
}
