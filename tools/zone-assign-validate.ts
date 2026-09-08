/**
 * npx tsx tools/zone-assign-validate.ts "Toy Story 2" [scene]
 *
 * How trustworthy is each object's ROOM? The portal walk
 * (src/sim/portal-walk.ts) only draws the rooms it can see, so an object
 * labelled with the wrong room is an object that vanishes. The labels come
 * from matching `.ngn` scene instances to `level.dat` objects by position
 * (`assignZones`, docs/FORMATS.md), which is known to be partial.
 *
 * The check: `TERRAIN.ALL`'s zone floors are the authoritative partition of
 * the level into rooms, and `zoneAt` says which room a point is in. For
 * every object that got a label, compare it with the floor under the
 * object's own position. A label that disagrees with the floor beneath it
 * is one the walk would cull wrongly.
 *
 * Objects over no floor at all are counted apart: the floors are coarse
 * slabs and do not cover everything, so those are unknown rather than wrong.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { objectFaceCount, parseDat } from '../src/formats/dat.ts';
import { parseNgnScene, assignZones } from '../src/formats/ngnscene.ts';
import { parseCollision, zoneAt } from '../src/formats/collision.ts';
import { parseAll } from '../src/formats/all.ts';

const root = process.argv[2] ?? 'Toy Story 2';
const only = process.argv[3];

interface Row { scene: string; objects: number; labelled: number; agree: number; differ: number; noFloor: number }
const rows: Row[] = [];

for (const dir of readdirSync(join(root, 'data')).filter((d) => /^level\d\d$/.test(d)).sort()) {
  for (const stem of ['level', 'level1']) {
    const base = join(root, 'data', dir, stem);
    if (!existsSync(`${base}.dat`) || !existsSync(`${base}.ngn`)) continue;
    const id = `${dir}/${stem}`;
    if (only && id !== only) continue;
    const terrain = join(root, 'data', dir, stem === 'level' ? 'TERRAIN.ALL' : 'TERR1.ALL');
    if (!existsSync(terrain)) continue;

    // level07-10 each ship a stale 1998 level1.dat that does not parse; skip.
    let dat, scene;
    try {
      dat = parseDat(readFileSync(`${base}.dat`));
      scene = parseNgnScene(readFileSync(`${base}.ngn`));
    } catch { continue; }
    const zones = assignZones(
      dat.objects.map((o) => ({ ...o, faceCount: objectFaceCount(dat, o) })),
      scene,
    );
    const groups = parseCollision(parseAll(readFileSync(terrain))).groups;

    const row: Row = { scene: id, objects: dat.objects.length, labelled: 0, agree: 0, differ: 0, noFloor: 0 };
    dat.objects.forEach((o, i) => {
      const label = zones[i];
      if (label === null || label === undefined) return;
      row.labelled++;
      const p = { x: o.position.x * o.unitScale, y: o.position.y * o.unitScale, z: o.position.z * o.unitScale };
      // zoneAt takes the point in the sim's units; the objects are in level
      // units, so the scale is 1 rather than the sim's 32.
      const floor = zoneAt(groups, p, 1);
      if (floor < 0) row.noFloor++;
      else if (floor === label) row.agree++;
      else row.differ++;
    });
    rows.push(row);
  }
}

let worst = 0;
for (const r of rows) {
  const known = r.agree + r.differ;
  const pct = known > 0 ? (r.agree * 100) / known : 0;
  if (known > 0) worst = Math.max(worst, (r.differ * 100) / known);
  console.log(
    `${r.scene.padEnd(18)} ${String(r.objects).padStart(5)} objects  ${String(r.labelled).padStart(5)} labelled  `
    + `${String(r.agree).padStart(5)} agree  ${String(r.differ).padStart(5)} differ  ${String(r.noFloor).padStart(5)} no floor  `
    + `${pct.toFixed(1)}% of the checkable ones agree`,
  );
}
console.log(`\n${rows.length} scenes; worst disagreement ${worst.toFixed(1)}% of the objects standing on a zone floor.`);
console.log('A disagreement is an object the portal walk would put in the wrong room.');
