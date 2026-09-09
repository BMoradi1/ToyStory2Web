/** Regression checks for normal lasers: no moving disk, no homing damage. */
import assert from 'node:assert/strict';
import { fireBeam, LASER, stepBeams, type LaserBeam, type LaserTarget } from '../src/sim/laser.ts';
import { SpriteBatch } from '../src/render/world-sprites.ts';
import { PerspectiveCamera, Texture } from 'three';

const origin = { x: 0, y: 0, z: 0 };
const target = (x: number, z: number, vulnerable = 5): LaserTarget => ({
  creature: {}, position: { x, y: 0, z }, heading: 0, vulnerable,
  shape: { offset: { ...origin }, scale: { x: 256, y: 256, z: 256 }, radius: 16 },
});
const clear = () => 1;
const pool: LaserBeam[] = [];
const normal = fireBeam(pool, origin, 0, 0, [], clear);
assert.deepEqual(normal.beam.to, { x: 0, y: 0, z: LASER.range });
assert.deepEqual(normal.beam.colour, [1, 0, 0]);
assert.equal(normal.damageKind, 2);
assert.equal(normal.beam.width, 32);
const charged = fireBeam(pool, origin, 1024, 1, [], clear);
assert.deepEqual(charged.beam.to, { x: LASER.range, y: 0, z: 0 });
assert.deepEqual(charged.beam.colour, [1, 1, 0]);
assert.equal(charged.beam.width, 64);
assert.equal(charged.damageKind, 3);

const near = target(0, 5000), far = target(0, 10000);
const hit = fireBeam(pool, origin, 0, 0, [far, near], clear);
assert.equal(hit.hit, near, 'nearest creature hit on the firing tick');
assert.equal(hit.beam.to.z, 4488, 'beam ends on the ellipsoid surface');
const blocked = fireBeam(pool, origin, 0, 0, [near], () => 2000 / LASER.range);
assert.equal(blocked.hit, null, 'wall prevents damage behind it');
assert.equal(blocked.wall, true);
assert.equal(blocked.beam.to.z, 2000);
assert.equal(fireBeam(pool, origin, 0, 0, [target(5000, 5000)], clear).hit, null,
  'beam does not seek a creature outside the aim cone');
assert.equal(fireBeam(pool, origin, 0, 0, [target(0, 5000, 2)], clear).hit, null,
  'body-only vulnerability does not take beam hits');
assert.equal(fireBeam(pool, origin, 0, 0, [target(200, 5000)], clear).hit?.position.x, 200,
  'small aiming assistance stays within the decoded cone');

// A nonzero rotated hit-shape centre is transformed into the creature frame.
const offset = target(0, 5000);
offset.heading = 1024;
offset.shape.offset.x = 1000;
assert.equal(fireBeam(pool, origin, 0, 0, [offset], clear).beam.to.z, 5488);

for (let i = 0; i < 100; i++) fireBeam(pool, origin, 0, 0, [], clear);
assert.equal(pool.length, 4, 'beam pool is bounded');
const end = { ...pool[0]!.to };
stepBeams(pool);
assert.deepEqual(pool[0]!.to, end, 'beam endpoint is fixed, not a homing projectile');
assert.equal(pool[0]!.from.z, 2048, 'beam retracts at the decoded speed');
for (let i = 0; i < 32; i++) stepBeams(pool);
assert.equal(pool.length, 0);
const batch = new SpriteBatch(false, 'add'), texture = new Texture();
const camera = new PerspectiveCamera();
camera.position.set(0, 0, 10); camera.updateMatrixWorld();
batch.setSheet(texture);
batch.update([{ x: 0, y: 0, z: 0, width: 1, height: 10,
  axis: { x: 1, y: 0, z: 0 }, u0: 0, u1: 1, v0: 0, v1: 1, alpha: 1 }], camera);
const position = batch.mesh.geometry.getAttribute('position');
const uv = batch.mesh.geometry.getAttribute('uv');
for (let i = 0; i < 4; i++) {
  assert.equal(uv.getX(i), (position.getX(i) + 5) / 10, 'texture length follows beam length');
  assert.equal(uv.getY(i), position.getY(i) + 0.5, 'texture glow runs across beam width');
}
batch.dispose(); texture.dispose();
console.log('PASS: beam colours/range, instant hits, ellipsoids, walls, aim cone, four-slot lifetime, strip alignment');
