/**
 * Check that turning one of the level's objects in place gives the same
 * vertices as rebuilding the level with that object placed at the new angle.
 *
 *   npx tsx tools/object-turn.ts "Toy Story 2"
 *
 * The viewer turns a pickup by undoing the rotation baked into its vertices
 * and applying another about the object's origin, because the level is one
 * shared buffer with no per-object transform (docs/HUD.md). That is only
 * correct if it agrees with the builder, which is what this measures: the
 * worst disagreement in renderer units, over every level and a spread of
 * angles.
 */
import { readFileSync } from 'node:fs';
import {
  OBJECT_ANGLE_UNITS, buildLevelGeometry, objectRotationMatrix, parseDat,
} from '../src/formats/dat.ts';
import { pickupObjects } from '../src/sim/pickups.ts';

const dir = process.argv[2] ?? 'Toy Story 2';
const DELTAS: [number, number, number][] = [
  [10, 14, 8], [137, 611, 42], [4095, 2048, 1], [1234, 4000, 3999],
];
const TOLERANCE = 1e-4;

let worstAll = 0;
let checked = 0;
let failed = 0;

for (let level = 1; level <= 15; level++) {
  const path = `${dir}/data/level${String(level).padStart(2, '0')}/level.dat`;
  let bytes: Uint8Array;
  try { bytes = readFileSync(path); } catch { continue; }

  const separate = pickupObjects(parseDat(bytes), level);
  // A handful per level is enough: the maths does not vary by object, only
  // by the angles it starts from.
  const targets = [...separate].slice(0, 6);
  let worst = 0;

  for (const target of targets) {
    for (const delta of DELTAS) {
      const build = (d: [number, number, number]) => {
        const dat = parseDat(bytes);
        const o = dat.objects[target];
        if (!o) return null;
        o.rotation = {
          x: (o.rotation.x + d[0]) % OBJECT_ANGLE_UNITS,
          y: (o.rotation.y + d[1]) % OBJECT_ANGLE_UNITS,
          z: (o.rotation.z + d[2]) % OBJECT_ANGLE_UNITS,
        };
        const geometry = buildLevelGeometry(dat, { separate });
        const group = geometry.groups.find((g) => g.object === target);
        return group ? { geometry, group } : null;
      };

      const a = build([0, 0, 0]);
      const b = build(delta);
      if (!a || !b || !a.group.origin || !a.group.rotation) continue;
      checked++;

      const base = a.group.rotation;
      const origin = a.group.origin;
      const r0 = objectRotationMatrix(base[0], base[1], base[2]);
      const r1 = objectRotationMatrix(
        (base[0] + delta[0]) % OBJECT_ANGLE_UNITS,
        (base[1] + delta[1]) % OBJECT_ANGLE_UNITS,
        (base[2] + delta[2]) % OBJECT_ANGLE_UNITS,
      );
      const m: number[] = new Array(9).fill(0);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          let sum = 0;
          for (let k = 0; k < 3; k++) sum += r1[i * 3 + k]! * r0[j * 3 + k]!;
          m[i * 3 + j] = (i === 0) === (j === 0) ? sum : -sum;
        }
      }

      for (let v = 0; v < a.group.count; v++) {
        const s = (a.group.start + v) * 3;
        const d = (b.group.start + v) * 3;
        const x = a.geometry.positions[s]! - origin[0];
        const y = a.geometry.positions[s + 1]! - origin[1];
        const z = a.geometry.positions[s + 2]! - origin[2];
        worst = Math.max(
          worst,
          Math.abs(m[0]! * x + m[1]! * y + m[2]! * z + origin[0] - b.geometry.positions[d]!),
          Math.abs(m[3]! * x + m[4]! * y + m[5]! * z + origin[1] - b.geometry.positions[d + 1]!),
          Math.abs(m[6]! * x + m[7]! * y + m[8]! * z + origin[2] - b.geometry.positions[d + 2]!),
        );
      }
    }
  }
  if (worst > TOLERANCE) failed++;
  worstAll = Math.max(worstAll, worst);
  console.log(`level ${String(level).padStart(2)}: ${targets.length} objects, worst ${worst.toExponential(2)}`);
}

console.log(`${checked} turns checked, worst ${worstAll.toExponential(2)} renderer units`);
console.log(failed === 0 ? 'every turn matches a rebuild' : `${failed} levels disagree`);
process.exitCode = failed === 0 ? 0 : 1;
