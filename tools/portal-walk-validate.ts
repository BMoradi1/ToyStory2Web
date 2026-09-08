/**
 * npx tsx tools/portal-walk-validate.ts "Toy Story 2"
 *
 * The two halves of knowing which room you are in and which rooms you can
 * see, checked over every scene that has doorways.
 *
 * 1. WALKING THROUGH A DOORWAY registers. `crossedPortal` is what moves
 *    Buzz's room when the camera's floor has not already moved it
 *    (`FUN_0043fef0`, src/sim/zones.ts), and a doorway it never fires on is
 *    one he could walk through unnoticed. Every doorway is walked through a
 *    tick at a time, sixty level units a step, straight through its middle,
 *    and must fire exactly once, on the step that crosses the plane.
 *    Doorways to zone 15 on a level with a backdrop are skipped, which is
 *    what both the engine and the port do with them.
 *
 * 2. THE PORTAL WALK behaves. From cameras spread over the level it must
 *    terminate, always return the camera's own room and room 0, and never
 *    name a room the doorway graph cannot reach from there — a room it
 *    named that nothing joins would be a bug in the recursion rather than a
 *    judgement about what is on screen.
 *
 * What this cannot check is the interesting part: whether the rooms it
 * leaves out really are hidden. That is a pixel question, answered in the
 * browser (docs/LEVELS.md "The portal walk").
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseDat, OUTSIDE } from '../src/formats/dat.ts';
import { parseCollision, zoneAt } from '../src/formats/collision.ts';
import { parseAll } from '../src/formats/all.ts';
import { ZONES, crossedPortal } from '../src/sim/zones.ts';
import { basisFromCamera, walkPortals } from '../src/sim/portal-walk.ts';

const root = process.argv[2] ?? 'Toy Story 2';
const S = 32;
let failures = 0;

for (const dir of readdirSync(join(root, 'data')).filter((d) => /^level\d\d$/.test(d)).sort()) {
  for (const stem of ['level', 'level1']) {
    const base = join(root, 'data', dir, stem);
    const terrain = join(root, 'data', dir, stem === 'level' ? 'TERRAIN.ALL' : 'TERR1.ALL');
    if (!existsSync(`${base}.dat`) || !existsSync(terrain)) continue;
    let dat, groups;
    try {
      dat = parseDat(readFileSync(`${base}.dat`));
      groups = parseCollision(parseAll(readFileSync(terrain))).groups;
    } catch { continue; }
    if (dat.zones.length === 0) continue;
    const id = `${dir}/${stem}`;
    const rooms = new Set(groups.map((g) => g.zone).filter((z): z is number => z !== null));
    const outsideIsRoom = rooms.has(OUTSIDE);

    // --- 1. every doorway, walked through.
    let crossed = 0, skipped = 0;
    const stuck: string[] = [];
    for (const p of dat.zones) {
      if (p.to === OUTSIDE && !outsideIsRoom) { skipped++; continue; }
      const c = p.corners;
      const mid = { x: 0, y: 0, z: 0 };
      for (const q of c) { mid.x += q.x / 4; mid.y += q.y / 4; mid.z += q.z / 4; }
      const u = { x: c[1]!.x - c[0]!.x, y: c[1]!.y - c[0]!.y, z: c[1]!.z - c[0]!.z };
      const v = { x: c[2]!.x - c[0]!.x, y: c[2]!.y - c[0]!.y, z: c[2]!.z - c[0]!.z };
      const n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
      const len = Math.hypot(n.x, n.y, n.z) || 1;
      // Front to back: the test wants him to start on the side the quad's
      // normal points to and end behind it. Quarter level units, as the
      // engine does it.
      const Q = 4;
      const at = (step: number) => ({
        x: (mid.x + (n.x / len) * step * 60) / Q,
        y: (mid.y + (n.y / len) * step * 60 + ZONES.raise / S) / Q,
        z: (mid.z + (n.z / len) * step * 60) / Q,
      });
      let fired = 0;
      for (let step = 20; step > -20; step--) {
        if (crossedPortal(p, at(step), at(step - 1))) fired++;
      }
      if (fired === 1) crossed++; else stuck.push(`${p.from}->${p.to}(${fired})`);
    }

    // --- 2. the walk, from cameras over the level.
    const reachable = (from: number): Set<number> => {
      const seen = new Set([from, 0]);
      const queue = [from];
      while (queue.length) {
        const z = queue.shift()!;
        for (const p of dat.zones) if (p.from === z && !seen.has(p.to)) { seen.add(p.to); queue.push(p.to); }
      }
      return seen;
    };
    // Cameras over the zone floors themselves, which is where a camera can
    // actually be: every floor triangle's centre, a little above it.
    const spots: { x: number; y: number; z: number }[] = [];
    for (const g of groups) {
      if (g.zone === null) continue;
      for (const mesh of g.meshes) {
        for (const poly of mesh.polys) {
          const c = { x: g.position.x, y: g.position.y, z: g.position.z };
          for (const v of poly.vertices) {
            c.x += v.x / poly.vertices.length;
            c.y += v.y / poly.vertices.length;
            c.z += v.z / poly.vertices.length;
          }
          // The slabs are at a quarter of the level's scale.
          spots.push({ x: c.x * 4 * S, y: c.y * 4 * S - 0x2000, z: c.z * 4 * S });
        }
      }
    }
    let probes = 0, unreachable = 0, missingSelf = 0;
    for (const eye of spots.filter((_, i) => i % Math.max(1, Math.floor(spots.length / 60)) === 0)) {
      const room = zoneAt(groups, eye, S);
      if (room < 0) continue;
      const graph = reachable(room);
      for (const yaw of [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]) {
        const look = {
          x: eye.x + Math.round(Math.cos(yaw) * 100000),
          y: eye.y,
          z: eye.z + Math.round(Math.sin(yaw) * 100000),
        };
        const seen = walkPortals(dat.zones, room, basisFromCamera(eye, look));
        probes++;
        if (!seen.has(room) || !seen.has(0)) missingSelf++;
        for (const z of seen.keys()) if (!graph.has(z)) unreachable++;
      }
    }

    const bad = stuck.length > 0 || unreachable > 0 || missingSelf > 0;
    if (bad) failures++;
    console.log(
      `${id.padEnd(16)} ${String(dat.zones.length).padStart(3)} doorways: ${crossed} cross, ${skipped} lead outside`
      + `${stuck.length ? `, STUCK ${stuck.join(' ')}` : ''}`
      + `  |  ${probes} camera probes${unreachable ? `, ${unreachable} named an unreachable room` : ''}`
      + `${missingSelf ? `, ${missingSelf} lost their own room` : ''}${bad ? '  FAIL' : ''}`,
    );
  }
}
console.log(failures === 0
  ? '\nevery doorway changes the room when walked through, and every walk kept to the doorway graph'
  : `\nFAIL: ${failures} scenes`);
process.exit(failures === 0 ? 0 : 1);
