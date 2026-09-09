/** Player attack timing and complete layered poses, using the local install.
 * node --import tsx tools/player-attack-probe.ts "Toy Story 2"
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAll } from '../src/formats/all.ts';
import { parseAnm, buildPosedMeshData } from '../src/formats/anm.ts';
import { createPlayer, createRuntime, flatGround, NO_INPUT, stepPlayer } from '../src/sim/player.ts';
import { createAnimation, stepAnimation, LASER_SLOT, SPIN_SLOT } from '../src/sim/player-animation.ts';
import { DEFAULT_KEYS } from '../src/sim/input.ts';

const root = process.argv[2];
if (!root) throw new Error('usage: node --import tsx tools/player-attack-probe.ts <game dir>');
const model = parseAll(readFileSync(join(root, 'data/chars/buzz.all')));
const anm = parseAnm(readFileSync(join(root, 'data/chars/buzz.anm')));
const p = createPlayer(0, 0, 0, 0);
const runtime = createRuntime();
const ground = flatGround(0);
for (let i = 0; i < 120; i++) stepPlayer(p, NO_INPUT, runtime, ground, 0);
const tick = (fire: boolean) => stepPlayer(p, { ...NO_INPUT, fire }, runtime, ground, 0);
const playback = createAnimation();
function pose() {
  const result = stepAnimation(playback, p, false, 0);
  const a = anm.animations[result.slotA]!, b = anm.animations[result.slotB]!;
  const mesh = buildPosedMeshData(model, anm, a, result.frame % a.frameCount,
    { animation: b, frame: result.frameB % b.frameCount });
  return { ...result, triangles: mesh.triangleCount };
}
const baseline = pose().triangles;
assert.ok(baseline > 0);

// A quick tap still raises the arm, fires on tick 12 and lowers it over the
// rest of the original 64-phase sequence, rather than snapping to idle.
tick(true);
assert.equal(p.laserFired, null);
for (let i = 2; i <= 64; i++) {
  tick(false);
  assert.equal(p.laserFired, i === 12 ? 0 : null, `tap firing tick ${i}`);
  const result = pose();
  assert.equal(result.triangles, baseline, `complete body at tick ${i}`);
  assert.equal(result.slotA === LASER_SLOT, i < 64);
}
assert.equal(p.laser, 0);

// Holding loops the aim animation; releasing full charge fires once and
// keeps the pose alive for its recovery.
for (let i = 1; i <= 100; i++) {
  tick(true);
  assert.equal(p.laserFired, i === 12 ? 0 : null);
  assert.equal(pose().triangles, baseline);
}
assert.equal(p.laserCharge, 64);
tick(false);
assert.equal(p.laserFired, 64);
assert.equal(pose().slotA, LASER_SLOT);
for (let i = 0; i < 64; i++) tick(false);
assert.equal(p.laser, 0);

// Repeated taps must finish without leaving the attack or charge stuck.
for (let shot = 0; shot < 100; shot++) {
  tick(true);
  for (let i = 0; i < 70; i++) {
    tick(false);
    assert.equal(pose().triangles, baseline);
  }
  assert.equal(p.laser, 0);
  assert.equal(p.laserCharge, 0);
}

// Spin has the same override bug: keep its base animation and its clock.
p.spin = 40;
const spin = pose();
assert.equal(spin.slotA, SPIN_SLOT);
assert.notEqual(spin.slotA, spin.slotB);
assert.equal(spin.triangles, baseline);
assert.ok(!DEFAULT_KEYS.fire.some(code => code.startsWith('Control')));
console.log(`PASS: tap/charge/recovery, 100 repeated shots, complete ${baseline}-triangle attack poses, safe fire binding`);
