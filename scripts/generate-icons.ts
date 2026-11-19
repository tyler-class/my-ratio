// Renders Ratio's logo and app icons in public/: the stoneware mug (scripts/logo-art.ts) on a
// tile that runs from Ratio's rust at the bottom to crema at the top, with a fine grain on the
// tile only. Run: npm run icons
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { GRAIN_FILTER, MUG, MUG_DEFS, MUG_SILHOUETTE } from './logo-art';

const TILE =
  '<linearGradient id="bg" x1="0" y1="64" x2="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#93461f"/><stop offset=".55" stop-color="#a4542a"/><stop offset="1" stop-color="#cf9358"/></linearGradient>';

/** How far right of geometric centre the mug sits, in grid units, so it looks centred. */
const NUDGE = 2.5;

/** The logo on a 64-unit square: `rx` rounds the tile, `scale` shrinks the mug into its middle. */
function svg(rx: number, scale = 1): string {
  const o = (64 - 64 * scale) / 2;
  // The body is heavier than the open handle, so true centre looks left: nudge the mug right.
  const t = ` transform="translate(${o + NUDGE * scale} ${o}) scale(${scale})"`;
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
    `<defs>${TILE}${MUG_DEFS}${GRAIN_FILTER}` +
    `<mask id="tile-only" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" fill="#fff"/><g${t}>${MUG_SILHOUETTE}</g></mask></defs>` +
    `<rect width="64" height="64" rx="${rx}" fill="url(#bg)"/>` +
    `<g${t}>${MUG}</g>` +
    `<rect width="64" height="64" rx="${rx}" fill="#000" filter="url(#grain)" mask="url(#tile-only)"/>` +
    '</svg>'
  );
}

const out = new URL('../public/', import.meta.url);
writeFileSync(new URL('favicon.svg', out), svg(14));
const jobs: [string, number, number][] = [
  ['pwa-192x192.png', 192, 1],
  ['pwa-512x512.png', 512, 1],
  ['maskable-512x512.png', 512, 0.72], // keeps the mug inside the maskable safe zone
  ['apple-touch-icon.png', 180, 0.92],
];
for (const [name, size, scale] of jobs) {
  const png = await sharp(Buffer.from(svg(0, scale)), { density: (72 * size) / 64 })
    .resize(size, size)
    .png()
    .toBuffer();
  writeFileSync(new URL(name, out), png);
  console.log(`public/${name}`);
}
