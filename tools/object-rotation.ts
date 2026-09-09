/** Compare object rotations with toy2.exe FUN_00450c70, including its
 * fixed-point truncation and original sine table. No game data is embedded.
 * node --import tsx tools/object-rotation.ts "Toy Story 2"
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { objectRotationMatrix, parseDat } from '../src/formats/dat.ts';

const root = process.argv[2] ?? 'Toy Story 2';
const exe = readFileSync(join(root, 'toy2.exe'));
const sine = (a: number) => Math.trunc(exe.readInt16LE(0x4fe788 - 0x400000 + (a & 4095) * 2) / 4);
const cos = (a: number) => sine(a + 1024);
const fixed = (n: number) => Math.trunc(n / 4096);
// Direct scalar equations from FUN_00450c70, independent of the builder's
// axis-matrix multiplication. Intermediate products truncate toward zero.
function original(x: number, y: number, z: number): number[] {
  const sx = sine(x), cx = cos(x), sy = sine(y), cy = cos(y), sz = sine(z), cz = cos(z);
  const sySx = fixed(sy * sx), syCx = fixed(sy * cx);
  return [
    fixed(cz * cy), -fixed(sz * cy), sy,
    fixed(sySx * cz + sz * cx), fixed(cz * cx - sySx * sz), -fixed(cy * sx),
    fixed(sz * sx - syCx * cz), fixed(syCx * sz + cz * sx), fixed(cy * cx),
  ].map(n => n / 4096);
}

let checked = 0, scenes = 0, worst = 0;
function check(x: number, y: number, z: number) {
  const actual = objectRotationMatrix(x, y, z), expected = original(x, y, z);
  const error = Math.max(...actual.map((v, i) => Math.abs(v - expected[i]!)));
  // Sine table quantization and two truncated fixed-point products.
  assert.ok(error < 0.0015, `rotation ${x},${y},${z}: error ${error}`);
  worst = Math.max(worst, error);
  checked++;
}
for (const dir of readdirSync(join(root, 'data'), { withFileTypes: true })) {
  if (!dir.isDirectory() || !/^level\d+$/.test(dir.name)) continue;
  for (const file of readdirSync(join(root, 'data', dir.name))) {
    if (!/^level\d*\.dat$/i.test(file)) continue;
    // These four alternate files are not supported by the level-list parser.
    if (file === 'level1.dat' && ['level07', 'level08', 'level09', 'level10'].includes(dir.name)) continue;
    const level = parseDat(readFileSync(join(root, 'data', dir.name, file)));
    for (const { rotation: r } of level.objects) check(r.x, r.y, r.z);
    scenes++;
  }
}
for (let a = 0; a < 4096; a += 17) check(a, (a * 7 + 113) & 4095, (a * 13 + 719) & 4095);
// The opposing bedroom/landing trims must face opposite ways. The former
// Ry*Rx*Rz assumption made these two copies face the same way.
const bedroom = objectRotationMatrix(2049, 3073, 2049);
const landing = objectRotationMatrix(0, 1024, 0);
assert.ok(bedroom[2]! < -0.999 && landing[2]! > 0.999);
assert.ok(scenes > 0);
console.log(`${checked} rotations across ${scenes} scenes; worst matrix error ${worst.toExponential(3)}; opposing doorway trims pass`);
