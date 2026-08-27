/**
 * CLI: dump every texture from a `.ngn` container to a directory.
 *
 *   npm run extract -- "Toy Story 2/data/level01/level.ngn" out/level01
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseNgn } from '../src/formats/ngn.ts';

const [, , src, outDir] = process.argv;
if (!src || !outDir) {
  console.error('usage: npm run extract -- <file.ngn> <outDir>');
  process.exit(1);
}

const textures = parseNgn(readFileSync(src));
mkdirSync(outDir, { recursive: true });

for (const t of textures) {
  writeFileSync(join(outDir, `${t.tag}.bmp`), t.bmp);
  const dims = `${t.width}x${t.height}`.padEnd(9);
  const slot = t.slot === null ? '   -' : String(t.slot).padStart(4);
  console.log(`${t.tag.padEnd(10)} slot ${slot}  ${dims} ${t.bitsPerPixel}bpp  @0x${t.offset.toString(16)}`);
}
console.log(`\n${textures.length} textures -> ${outDir}/`);
