// Renders the app icons in public/ from the coffee-cup glyph.
// Run: npm run icons
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const BG = '#a4542a';
// The glyph on a 64-unit grid, without the rounded tile.
const glyph =
  '<g transform="translate(-2.5 1)" fill="none" stroke="#fff7ee" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 27h30v9a13 13 0 0 1-13 13h-4a13 13 0 0 1-13-13z"/><path d="M44 30h3.5a6 6 0 0 1 0 12H43"/><path d="M25 13c-2 2.5 2 4.5 0 7M33 12c-2 2.5 2 4.5 0 7"/></g>';

/** Full-bleed square with the glyph scaled into the middle `scale` of the tile. */
function svg(scale: number, rx = 0): string {
  const offset = (64 - 64 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="${rx}" fill="${BG}"/><g transform="translate(${offset} ${offset}) scale(${scale})">${glyph}</g></svg>`;
}

const out = new URL('../public/', import.meta.url);
writeFileSync(new URL('favicon.svg', out), svg(1, 14));
const jobs: [string, number, number][] = [
  ['pwa-192x192.png', 192, 1],
  ['pwa-512x512.png', 512, 1],
  ['maskable-512x512.png', 512, 0.72], // keeps the glyph inside the maskable safe zone
  ['apple-touch-icon.png', 180, 0.92],
];
for (const [name, size, scale] of jobs) {
  const png = await sharp(Buffer.from(svg(scale)))
    .resize(size, size)
    .png()
    .toBuffer();
  writeFileSync(new URL(name, out), png);
  console.log(`public/${name}`);
}
