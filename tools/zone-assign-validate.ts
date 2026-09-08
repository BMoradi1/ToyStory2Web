/**
 * npx tsx tools/zone-assign-validate.ts "Toy Story 2" [scene]
 *
 * Each object's ROOM against the zone floor beneath it. The portal walk
 * (src/sim/portal-walk.ts) only draws the rooms it can see, so a room label
 * decides whether an object is ever drawn.
 *
 * READ THE RESULT CAREFULLY. The labels come from matching `.ngn` scene
 * instances to `level.dat` objects by position (`assignZones`,
 * docs/FORMATS.md), and the `.ngn` label is the ENGINE'S OWN and is what
 * the real game culls by. The zone floors are a different thing: coarse
 * hand-laid slabs used to answer "which room is this point in" for the
 * camera and for Buzz. So a disagreement between the two is NOT proof of a
 * bad label. Checked on level 1, every object in the worst column below sits
 * at a position where all the `.ngn` instances agree on the room, so there
 * was no ambiguity for the matching to get wrong: the label is certain and
 * it is the floor beneath that belongs to a neighbour.
 *
 * What the number is good for is bounding how far the two partitions drift
 * apart, which is what a portal walk feels at room boundaries.
 *
 * A disagreement is only a problem if it can actually hide something, so
 * they are split three ways:
 *
 *   - ROOM 0 is always drawn, whatever the walk decides, so an object
 *     labelled 0 can never be culled however wrong the label is.
 *   - NEXT DOOR: the label and the floor are joined by a doorway. A wall
 *     between two rooms belongs to one of them and stands over the other's
 *     slab, and the slabs are coarse and hand-laid, so these are boundary
 *     cases rather than mistakes, and the room next door is usually drawn
 *     anyway when you can see the object.
 *   - ELSEWHERE: the label names a room the floor's room does not even
 *     join. Either the label is wrong or the rooms overlap in space more
 *     than a doorway's width. These are the ones worth looking at by hand.
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

interface Row {
  scene: string; objects: number; labelled: number; agree: number;
  differ: number; alwaysDrawn: number; nextDoor: number; elsewhere: number; noFloor: number;
}
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

    // Which rooms a doorway joins, either way round.
    const joined = new Set<string>();
    for (const p of dat.zones) { joined.add(`${p.from}|${p.to}`); joined.add(`${p.to}|${p.from}`); }

    const row: Row = {
      scene: id, objects: dat.objects.length, labelled: 0, agree: 0,
      differ: 0, alwaysDrawn: 0, nextDoor: 0, elsewhere: 0, noFloor: 0,
    };
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
      else {
        row.differ++;
        if (label === 0) row.alwaysDrawn++;
        else if (joined.has(`${label}|${floor}`)) row.nextDoor++;
        else row.elsewhere++;
      }
    });
    rows.push(row);
  }
}

let worst = 0;
let worstScene = '';
for (const r of rows) {
  const known = r.agree + r.differ;
  if (known === 0) { console.log(`${r.scene.padEnd(18)} no object stands on a zone floor`); continue; }
  const bad = (r.elsewhere * 100) / known;
  if (bad > worst) { worst = bad; worstScene = r.scene; }
  console.log(
    `${r.scene.padEnd(18)} ${String(known).padStart(5)} checkable  ${String(r.agree).padStart(5)} agree  `
    + `${String(r.alwaysDrawn).padStart(4)} always drawn  ${String(r.nextDoor).padStart(4)} next door  `
    + `${String(r.elsewhere).padStart(4)} ELSEWHERE  (${((r.elsewhere * 100) / known).toFixed(1)}% can be culled wrongly)`,
  );
}
console.log(`\n${rows.length} scenes; worst ${worst.toFixed(1)}% on ${worstScene || 'none'}.`);
console.log('ELSEWHERE is where the two partitions disagree most; see the note at the top');
console.log('of this file before reading it as a count of wrong labels.');
