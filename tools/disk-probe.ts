/** Check untargeted disk flight with the install's actual effect template.
 * Usage: node --import tsx tools/disk-probe.ts "Toy Story 2"
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readEffectTable } from '../src/formats/effect-table.ts';
import { RandomStream } from '../src/sim/creatures.ts';
import { createEffects, spawnStraightDisk, stepEffects, type EffectWorld } from '../src/sim/effects.ts';
import { effectCardPlacement, SpriteBatch } from '../src/render/world-sprites.ts';
import { PerspectiveCamera, Texture } from 'three';

const root = process.argv[2];
if (!root) throw new Error('usage: node --import tsx tools/disk-probe.ts <game dir>');
const { kinds, modes } = readEffectTable(new Uint8Array(readFileSync(join(root, 'toy2.exe'))));
const world: EffectWorld = {
  cameraX: 0, cameraY: 0, cameraZ: 0,
  playerX: 0, playerY: 0, playerZ: 0, playerYaw: 0, playerVx: 0, playerVz: 0,
  groundAt: () => null, waterY: null,
};
const origin = { x: 100, y: -0x1cc0, z: -200 };

// Check the trajectory, not just the spawn arguments: the template and
// effect tick must preserve forward, level motion at every possible facing.
for (let yaw = 0; yaw < 4096; yaw++) {
  const sim = createEffects(kinds, modes, new RandomStream(new Uint8Array([0])));
  const shot = spawnStraightDisk(sim, world, origin, yaw);
  assert.ok(shot, `shot spawned at yaw ${yaw}`);
  for (let tick = 0; tick < 8; tick++) stepEffects(sim, world);
  assert.ok(shot.life > 0, `shot survived at yaw ${yaw}`);
  assert.equal(shot.y, origin.y, `level flight at yaw ${yaw}`);
  const dx = shot.x - origin.x, dz = shot.z - origin.z;
  const angle = yaw * Math.PI * 2 / 4096;
  const forward = dx * Math.sin(angle) + dz * Math.cos(angle);
  const sideways = dx * Math.cos(angle) - dz * Math.sin(angle);
  assert.ok(forward > 21800 && forward < 21860, `forward speed at yaw ${yaw}: ${forward}`);
  assert.ok(Math.abs(sideways) < 12, `flight follows facing at yaw ${yaw}: ${sideways}`);
}

// Explicit elevation is independent of heading (+Y points down).
for (const yaw of [0, 1024, 2048, 3072]) {
  for (const pitch of [512, -512]) {
    const sim = createEffects(kinds, modes, new RandomStream(new Uint8Array([0])));
    const shot = spawnStraightDisk(sim, world, origin, yaw, pitch);
    assert.ok(shot);
    stepEffects(sim, world);
    assert.equal(Math.sign(shot.y - origin.y), -Math.sign(pitch));
  }
}
// A wrist at (1024, -256, 2048) level units belongs at (4, 1, -8)
// in the renderer. Exercise the actual batch vertices as well as conversion.
const placement = effectCardPlacement({
  x: 1024 * 32, y: -256 * 32, z: 2048 * 32, width: 128, height: 64,
});
assert.deepEqual(placement, { x: 4, y: 1, z: -8, width: 0.5, height: 0.25 });
const batch = new SpriteBatch(false, 'add');
const texture = new Texture();
batch.setSheet(texture);
const camera = new PerspectiveCamera();
camera.updateMatrixWorld();
batch.update([{ ...placement, u0: 0, v0: 0, u1: 1, v1: 1, alpha: 1 }], camera);
assert.equal(batch.mesh.visible, true);
const vertices = batch.mesh.geometry.getAttribute('position');
for (let i = 0; i < 4; i++) {
  assert.ok(Math.abs(vertices.getX(i) - 4) <= 0.25);
  assert.ok(Math.abs(vertices.getY(i) - 1) <= 0.125);
  assert.equal(vertices.getZ(i), -8);
}
console.log('PASS: 4096 level firing directions, 8 elevation checks, and effect card world placement');
