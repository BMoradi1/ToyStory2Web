/** node --import tsx tools/ledge-probe.ts ["Toy Story 2"] */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAll } from '../src/formats/all.ts';
import { buildCollisionWorld, parseCollision, type CollisionWorld } from '../src/formats/collision.ts';
import { findLedge, CLIMB_TICKS } from '../src/sim/ledge.ts';
import { createPlayer, createRuntime, groundFromCollision, NO_INPUT, stepPlayer, JumpState } from '../src/sim/player.ts';
import { AnimState, createAnimation, stepAnimation } from '../src/sim/player-animation.ts';
import { yawOf, sin, cos } from '../src/sim/trig.ts';

type V = { x: number; y: number; z: number };
function fixture(ceiling = false, slope = false): CollisionWorld {
  const polys: CollisionWorld['polys'] = [];
  function quad(v: number[][], normal: V) {
    for (const ids of [[0, 1, 2], [0, 2, 3]]) polys.push({
      vertices: ids.map(i => ({ x: v[i]![0]! / 32, y: v[i]![1]! / 32, z: v[i]![2]! / 32 })),
      normal, walkable: normal.y < -0.5, group: 0,
    });
  }
  quad([[-40000, 30000, -40000], [40000, 30000, -40000], [40000, 30000, 40000], [-40000, 30000, 40000]], { x: 0, y: -1, z: 0 });
  quad([[-20000, 0, 0], [20000, 0, 0], [20000, 0, 40000], [-20000, 0, 40000]], slope ? { x: 0, y: -0.8, z: 0.6 } : { x: 0, y: -1, z: 0 });
  quad([[-20000, 0, 0], [20000, 0, 0], [20000, 30000, 0], [-20000, 30000, 0]], { x: 0, y: 0, z: -1 });
  if (ceiling) quad([[-20000, -8000, -20000], [20000, -8000, -20000], [20000, -8000, 40000], [-20000, -8000, 40000]], { x: 0, y: 1, z: 0 });
  const cells = new Map<string, number[]>();
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) cells.set(`${x},${z}`, polys.map((_, i) => i));
  return { polys, cells, cellSize: 1024, lowestY: 30000 / 32, groups: [{ objectNumber: 0, dynamic: false, polys: polys.map((_, i) => i) }] };
}
const probe = { x: 0, y: 13700, z: -4400, yaw: 0, previousY: 13500 };
const world = fixture(), ground = groundFromCollision(world);
assert.ok(findLedge(world, probe), 'clear ledge is reachable');
assert.ok(findLedge(world, { ...probe, y: 15000 }), 'fast descent cannot skip the crossing');
assert.equal(findLedge(fixture(true), probe), null, 'low ceiling rejects climb');
assert.equal(findLedge(fixture(false, true), probe), null, 'steep top rejects climb');
assert.equal(findLedge(world, { ...probe, z: -10000 }), null, 'out of reach');
assert.equal(findLedge(world, { ...probe, previousY: 13700 }), null, 'hands already below edge');
assert.equal(findLedge(world, { ...probe, y: 13000 }), null, 'hands have not crossed edge');
assert.equal(findLedge(world, { ...probe, yaw: 2048 }), null, 'facing away');

function falling() {
  const p = createPlayer(probe.x, probe.y, probe.z, probe.yaw), rt = createRuntime();
  p.vy = 200; p.jumpState = JumpState.Falling; rt.previousY = probe.previousY;
  return { p, rt };
}
for (const blocked of ['rising', 'grounded', 'stunned', 'dying', 'spin', 'hardFall'] as const) {
  const { p, rt } = falling();
  if (blocked === 'rising') p.vy = -200;
  if (blocked === 'grounded') { p.onGround = true; p.coyote = 6; }
  if (blocked === 'stunned') p.hitStun = 90;
  if (blocked === 'dying') p.dying = true;
  if (blocked === 'spin') p.spin = 10;
  if (blocked === 'hardFall') p.fallTimer = 0x50;
  stepPlayer(p, NO_INPUT, rt, ground, 0);
  assert.equal(p.climb, 0, `${blocked} must not grab`);
}
const { p, rt } = falling();
stepPlayer(p, NO_INPUT, rt, ground, 0);
assert.equal(p.climb, CLIMB_TICKS);
assert.deepEqual(p.events, [0x17]);
const anchor = [p.x, p.y, p.z], anim = createAnimation();
for (let i = 0; i < CLIMB_TICKS; i++) {
  if (i) stepPlayer(p, { ...NO_INPUT, moveY: 1, jump: true, spin: true, fire: true }, rt, ground, 0);
  const pose = stepAnimation(anim, p, true, 0);
  assert.equal(anim.state, AnimState.Climb);
  assert.equal(pose.slotA, 10); assert.equal(pose.slotB, 10);
  assert.deepEqual([p.x, p.y, p.z], anchor, 'input cannot move climb anchor');
  assert.equal(p.laserFired, null);
}
for (let i = 0; i < 30; i++) stepPlayer(p, NO_INPUT, rt, ground, 0);
assert.equal(p.climb, 0); assert.ok(p.onGround, 'climb ends standing on the top');
assert.ok(Math.abs(p.y - 192) < 10);
const interrupted = falling();
stepPlayer(interrupted.p, NO_INPUT, interrupted.rt, ground, 0);
interrupted.p.hitStun = 90;
stepPlayer(interrupted.p, NO_INPUT, interrupted.rt, ground, 0);
assert.equal(interrupted.p.climb, 0, 'damage releases climb');
assert.equal(createPlayer().climb, 0, 'respawn clears climb');
const running = createPlayer(0, 30192, -16000), runTime = createRuntime();
for (let i = 0; i < 10; i++) stepPlayer(running, NO_INPUT, runTime, ground, 0);
let grabbed = false;
for (let i = 0; i < 160; i++) {
  stepPlayer(running, { ...NO_INPUT, moveY: 1, jump: i < 25 }, runTime, ground, 0);
  if (running.climb) { grabbed = true; break; }
}
assert.ok(grabbed, 'normal running jump reaches and automatically grabs the ledge');
console.log('Ledge reach, clearance, state gates, animation, input lock, landing and interruption pass');

if (process.argv[2]) {
  const level = buildCollisionWorld(parseCollision(parseAll(readFileSync(join(process.argv[2], 'data/level01/TERRAIN.ALL')))).groups);
  let found = 0;
  for (const poly of level.polys) {
    if (poly.normal.y >= -15000 / 16384) continue;
    for (let e = 0; e < 3; e++) {
      const a = poly.vertices[e]!, b = poly.vertices[(e + 1) % 3]!;
      const mx = (a.x + b.x) * 16, my = (a.y + b.y) * 16, mz = (a.z + b.z) * 16;
      for (const sign of [-1, 1]) {
        const yaw = yawOf((b.z - a.z) * sign, (a.x - b.x) * sign);
        const sample = { x: mx - sin(yaw) / 16384 * 4400, y: my + 13700,
          z: mz - cos(yaw) / 16384 * 4400, yaw, previousY: my + 13500 };
        const target = findLedge(level, sample);
        if (target) { if (!found) console.log('Level 1 example:', JSON.stringify({ sample, target })); found++; }
      }
    }
  }
  assert.ok(found > 0, 'real level has reachable ledges');
  console.log(`Level 1: ${found} reachable ledge samples pass original probe geometry`);
}
