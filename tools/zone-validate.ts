/**
 * npx tsx tools/zone-validate.ts "Toy Story 2"
 *
 * Checks the zone floors (docs/LEVELS.md "Zones") against the two other
 * places a scene records its zones:
 *
 *  1. the set of zones the floors name must equal the set the level.dat
 *     portals join (every room with a doorway has a floor, and no floor
 *     names a room that has none);
 *  2. probing `zoneAt` a little way either side of every portal quad must
 *     find the two zones the portal joins — the engine's two definitions of
 *     "which room" have to agree at the doorways.
 *
 * A probe can miss (a narrow doorway puts both probes in one room, or over
 * a drop with nothing below); those are counted, not failed. So is a probe
 * that lands in a NEIGHBOUR of the doorway's zone: the slabs are hand-laid
 * and overlap or stop short at doorways (level 1's interior has zone 2's
 * slab ending 230 units before a doorway that zone 6's slab covers), and the
 * engine calls that strip whatever slab is there. A probe that finds a zone
 * the doorway's room is not joined to at all is a failure. A portal to 15 is
 * "outside" everywhere but level 10, where 15 is a room of its own.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseAll } from '../src/formats/all.ts';
import { parseCollision, zoneAt } from '../src/formats/collision.ts';
import { parseDat, OUTSIDE } from '../src/formats/dat.ts';

const root = process.argv[2];
if (!root) { console.error('usage: npx tsx tools/zone-validate.ts <game dir>'); process.exit(1); }
const data = join(root, 'data');
const S = 32;
const PROBE = 150; // level units either side of the doorway

let scenes = 0, floors = 0, portals = 0, both = 0, one = 0, nothing = 0, wrong = 0, setMismatch = 0;
for (const dir of readdirSync(data).filter((d) => /^level\d+$/.test(d)).sort()) {
  for (const [terr, scene] of [['TERRAIN.ALL', 'level'], ['TERR1.ALL', 'level1']] as const) {
    const tPath = join(data, dir, terr), dPath = join(data, dir, `${scene}.dat`);
    if (!existsSync(tPath) || !existsSync(dPath)) continue;
    const groups = parseCollision(parseAll(readFileSync(tPath))).groups;
    const zoneFloors = groups.filter((g) => g.zone !== null);
    let dat;
    try { dat = parseDat(readFileSync(dPath)); } catch { continue; }
    if (zoneFloors.length === 0 && dat.zones.length === 0) continue;
    scenes++;
    floors += zoneFloors.length;

    const named = new Set(zoneFloors.map((g) => g.zone!));
    const joined = new Set<number>();
    for (const p of dat.zones) { joined.add(p.from); if (p.to !== OUTSIDE || named.has(OUTSIDE)) joined.add(p.to); }
    const same = named.size === joined.size && [...named].every((z) => joined.has(z));
    if (!same) setMismatch++;

    const adjacent = new Map<number, Set<number>>();
    for (const p of dat.zones) {
      if (!adjacent.has(p.from)) adjacent.set(p.from, new Set());
      adjacent.get(p.from)!.add(p.to);
    }
    let b = 0, o = 0, n = 0, w = 0;
    const notes: string[] = [];
    for (const p of dat.zones) {
      portals++;
      const c = p.corners;
      const cx = (c[0].x + c[1].x + c[2].x + c[3].x) / 4, cy = (c[0].y + c[1].y + c[2].y + c[3].y) / 4, cz = (c[0].z + c[1].z + c[2].z + c[3].z) / 4;
      const ux = c[1].x - c[0].x, uy = c[1].y - c[0].y, uz = c[1].z - c[0].z, vx = c[2].x - c[0].x, vy = c[2].y - c[0].y, vz = c[2].z - c[0].z;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz);
      if (!len) continue;
      nx /= len; ny /= len; nz /= len;
      const probe = (k: number) => zoneAt(groups, { x: (cx + nx * PROBE * k) * S, y: cy * S, z: (cz + nz * PROBE * k) * S }, S);
      const got = [probe(1), probe(-1)].filter((z) => z >= 0);
      const want = new Set([p.from, p.to]);
      const allowed = new Set([p.from, p.to, ...(adjacent.get(p.from) ?? []), ...(adjacent.get(p.to) ?? [])]);
      const toOutside = p.to === OUTSIDE && !named.has(OUTSIDE);
      if (got.some((z) => !allowed.has(z))) { w++; notes.push(`${p.from}->${p.to} found ${got.join(',')}`); }
      else if (got.length === 0) n++;
      else if (toOutside) { if (got.includes(p.from)) b++; else o++; }
      else if (got.length === 2 && got[0] !== got[1] && got.every((z) => want.has(z))) b++;
      else o++;
    }
    both += b; one += o; nothing += n; wrong += w;
    console.log(
      `${dir}/${scene}: ${zoneFloors.length} zone floors naming ${[...named].sort((x, y) => x - y).join(',')}` +
      ` ${same ? '== portal zones' : `!= portal zones ${[...joined].sort((x, y) => x - y).join(',')}`};` +
      ` ${dat.zones.length} portals: both sides ${b}, one side or a neighbour ${o}, no floor ${n}, wrong ${w}` +
      (notes.length ? `  [${notes.join('; ')}]` : ''),
    );
  }
}
console.log(`\n${scenes} scenes, ${floors} zone floors, ${portals} portals: both sides ${both}, one side or a neighbour ${one}, no floor ${nothing}, wrong ${wrong}; zone sets differing ${setMismatch}`);
if (wrong || setMismatch) { console.log('FAIL'); process.exit(1); }
console.log('every zone floor set matches its portals, and no probe beside a doorway found a room it does not connect to');
