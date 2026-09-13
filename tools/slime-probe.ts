/** Run the slime encounter against the install's placements and hit geometry. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAll, readHitShapes } from '../src/formats/all.ts';
import { CREATURE_LIST_TYPE, parseCreatureList, parseCreatureModels } from '../src/formats/creatures.ts';
import { unpackRaw } from '../src/formats/rnc.ts';
import { createCreatureSim, RandomStream, setCreatureModels, stepCreatures, damageCreature } from '../src/sim/creatures.ts';
import { createSlimeBoss, slimeBossBar, slimeBlobTarget, type SlimeWorld } from '../src/sim/slime-boss.ts';

import { parseAnm, buildPosedMeshData } from '../src/formats/anm.ts';
import { createCut, startCut } from '../src/sim/camera-cut.ts';
import { createEffects, spawnEffect } from '../src/sim/effects.ts';
import { readEffectTable } from '../src/formats/effect-table.ts';
import { fireBeam } from '../src/sim/laser.ts';
import { createTasks, stepTasks } from '../src/sim/tasks.ts';
import { LEVEL_TASKS } from '../src/sim/level-data.ts';

const root = process.argv[2];
if (!root) throw new Error('usage: tsx tools/slime-probe.ts <game directory>');
const read = (path: string) => readFileSync(join(root, path));
const placements = parseCreatureList(unpackRaw(read('data/level03/level.raw')).find(r => r.type === CREATURE_LIST_TYPE)!.data);
const sim = createCreatureSim(placements, { groundY: () => 0 }, new RandomStream(read('data/rand.dat')), 3);
const path = parseCreatureModels(read('data/creatures.cfg').toString('latin1')).get(16)!.path;
const model = parseAll(read(path));
const groups = model.groups;
const animations = parseAnm(read(path.replace(/\.all$/, '.anm')));
for (const slot of [1, 3, 5, 7]) {
  const face = animations.animations[slot]!, body = animations.animations[slot ^ 1]!;
  for (let frame = 0; frame < face.frameCount; frame++) {
    const faceOnly = buildPosedMeshData(model, animations, face, frame);
    const bodyOnly = buildPosedMeshData(model, animations, body, frame);
    const complete = buildPosedMeshData(model, animations, face, frame, { animation: body, frame });
    assert.ok(bodyOnly.positions.length > 0);
    assert.equal(complete.positions.length, faceOnly.positions.length + bodyOnly.positions.length,
      'every face and body triangle survives the paired animation');
  }
}
const hit = groups.at(-1)!;
const shapes = readHitShapes(hit)!;
const originalShapes = JSON.stringify(shapes);
setCreatureModels(sim, new Map([[16, { offsetX: hit.hitSphere!.x, offsetY: hit.hitSphere!.y,
  offsetZ: hit.hitSphere!.z, hitRadius: hit.hitSphere!.radius, shapes }]]));
const boss = sim.creatures[0]!;
const startZ = boss.z;
const state = createSlimeBoss(boss);
const tasks = createTasks();
tasks.slime = state;
assert.equal(boss.z, startZ + 0x10000);
assert.equal(boss.drawScale, 0);
assert.equal(slimeBossBar(state), 54);
let spit = 0, shake = 0, burst = 0;
const cut = createCut();
const cuts: number[] = [];
const world: SlimeWorld = { x: boss.x, y: 0, z: boss.z + 200000, rand: sim.rand,
  cut: {
    start: (look, ticks, distance) => {
      startCut(cut, look, ticks, distance, world);
      assert.ok(Math.hypot(cut.eye.x - look.x, cut.eye.z - look.z) < 70000, 'camera distance uses cut units');
      cuts.push(ticks);
    },
    get ticks() { return cut.ticks; },
    get eye() { return cut.eye; }, set eye(v) { cut.eye = v; },
    get look() { return cut.look; }, set look(v) { cut.look = v; },
  },
  spit: () => spit++, shake: () => shake++, burstBlobs: () => burst++ };
const tick = () => {
  cut.ticks = Math.max(0, cut.ticks - 1);
  stepCreatures(sim, world);
  stepTasks(tasks, LEVEL_TASKS[3]!, slot => sim.creatures.find(c => c.slot === slot), {
    ...world, coins: 0, found: 0, talking: false, level: 3, items: 0, tokens: 0,
    onGround: true, pathPoints: () => null, cameraZone: 0, playerZone: 0,
  });
};
tick();
assert.equal(state.phase, 0, 'wait outside the trigger');
world.z = boss.z + 20000;
tick();
assert.equal(state.phase, 1);
for (let n = 0; n < 300; n++) tick();
assert.equal(state.phase, 999, 'entrance releases the AI script');
assert.ok(boss.drawScale > 0 && boss.drawScale <= 0.5);
for (let n = 0; n < 300; n++) { world.x = boss.x; world.z = boss.z + 20000; tick(); }
assert.ok(spit > 0, 'original script produces spit attacks');
// Exercise distant jumping and its landing signal.
for (let n = 0; n < 500; n++) { world.x = boss.x; world.z = boss.z + 60000; tick(); }
assert.ok(shake > 0, 'original script produces landing shakes');
let ticks = 0;
const bars: number[] = [];
let goal = state.goal;
while (state.phase < 1000 && ticks++ < 15000) {
  world.x = boss.x; world.z = boss.z + 20000;
  // A sustained, rapid volley; use the real damage and stun rules.
  if (state.cutTicks === 0 && boss.record.vulnerable !== 4) damageCreature(sim, boss, 0, 2);
  tick();
  assert.equal(boss.health, 99, 'damage is represented by size, not entity health');
  if (state.goal !== goal) { bars.push(slimeBossBar(state)); goal = state.goal; }
}
assert.equal(state.phase, 1000, 'all five stages are beatable');
assert.deepEqual(bars, [43, 32, 21, 10, 0]);
assert.deepEqual(cuts, [300, 180, 220, 260, 300, 420]);
assert.equal(burst, 5, 'stage transitions clear the blobs');
assert.equal(tasks.bossBeaten, true, 'completion reaches the save path');
assert.equal(boss.drawScale, 1 / 8192);
for (let n = 0; n < 449; n++) tick();
assert.equal(boss.type, 0, 'boss removed during death cut');
assert.equal(state.phase, 1030);
assert.equal(tasks.levelWon, true, 'victory waits for the cut and final delay');
tasks.levelWon = false;
for (let n = 0; n < 30; n++) tick();
assert.equal(tasks.levelWon, false, 'victory only emitted once');
assert.equal(JSON.stringify(shapes), originalShapes, 'cached hit geometry stays untouched');
const table = readEffectTable(read('toy2.exe'));
const particles = createEffects(table.kinds, table.modes, sim.rand);
// Construct the real effect through its spawn API, then test beam intersection.
const effectWorld = { playerX: 0, playerY: 0, playerZ: 0, playerYaw: 0,
  cameraX: 0, cameraY: 0, cameraZ: 0, playerVx: 0, playerVz: 0, waterY: 0, level: 3, groundAt: () => null };
const blob = spawnEffect(particles, effectWorld, 0, 0, 20000, 0, -2, 0, 0, 0, 0, 0x3f)!;
assert.ok(blob);
const target = slimeBlobTarget(particles.effects)!;
assert.equal(fireBeam([], { x: 0, y: 0, z: 0 }, 0, 0, [target], () => 1).hit?.creature, blob);
blob.life = 1;
assert.equal(slimeBlobTarget(particles.effects), null, 'burst blobs cease being laser targets');
console.log(`Slime: entrance, spit, jumps, five stages (${ticks} combat ticks), regrowth, defeat, and victory passed.`);
