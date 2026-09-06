/**
 * Dump and check the executable's sprite table (src/formats/sprite-table.ts).
 *
 *   npx tsx tools/sprite-table.ts "Toy Story 2" [levelId]
 *
 * Every header is checked against the 256 x 256 sheets: the frames the code
 * is known to use (frame 0 everywhere, the coin's ten, the font's 56, the
 * big digits' twelve) must sit inside the texture.
 */
import { readFileSync } from 'node:fs';
import { readSpriteTable, defaultSpriteHeader, SPRITE, LEVEL_SPRITE_BASE } from '../src/formats/sprite-table.ts';

const dir = process.argv[2] ?? 'Toy Story 2';
const only = process.argv[3] !== undefined ? Number(process.argv[3]) : null;
const exe = readFileSync(`${dir}/toy2.exe`);
const SHEET = 256;
const USED: Record<number, number> = { [SPRITE.coin]: 10, [SPRITE.font]: 56, [SPRITE.bigDigits]: 12 };

let bad = 0;
const d = defaultSpriteHeader(exe);
console.log(`default: tex ${d.texture} ${d.width}x${d.height}`);
for (let lv = 0; lv < 20; lv++) {
  if (only !== null && lv !== only) continue;
  const table = readSpriteTable(exe, lv);
  const own = table.slice(LEVEL_SPRITE_BASE).filter(Boolean).length;
  console.log(`level ${lv}: ${own} own headers`);
  for (let i = 0; i < table.length; i++) {
    const h = table[i];
    if (!h) continue;
    if (only === null && lv > 0 && i < LEVEL_SPRITE_BASE) continue;
    const need = USED[i] ?? 1;
    const fit = h.frames.slice(0, need).every((f) => f.u + h.width <= SHEET && f.v + h.height <= SHEET);
    const ok = h.frames.length >= need && fit && h.texture >= 0 && h.texture <= 63 && h.width > 0 && h.height > 0;
    if (!ok) { bad++; console.log(`  FAIL level ${lv} index ${i}: frames ${h.frames.length} need ${need}, fit ${fit}, tex ${h.texture}, ${h.width}x${h.height}`); }
    if (!ok || only !== null || lv === 0 || i >= LEVEL_SPRITE_BASE) {
      console.log(`  ${String(i).padStart(3)} @${h.address.toString(16)} tex ${String(h.texture).padStart(2)} ${String(h.width).padStart(3)}x${String(h.height).padStart(3)} frames<=${h.frames.length} f0=(${h.frames[0]?.u},${h.frames[0]?.v})${fit ? '' : '  DOES NOT FIT'}`);
    }
  }
}
console.log(bad === 0 ? 'every used frame fits its sheet' : `${bad} headers fail`);
process.exitCode = bad === 0 ? 0 : 1;
