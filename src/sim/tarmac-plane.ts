import { carryOnYawPlatform } from './moving-platform.ts';
import type { DatLevel } from '../formats/dat.ts';
import { captureCollisionGroup, collisionGroupByObject, transformCollisionGroup, type CollisionWorld } from '../formats/collision.ts';
import { cos, sin, toRadians, yawOf } from './trig.ts';
import type { PlayerState } from './player.ts';

/** FUN_0042dcb0, called by level 14's tick 0042e790. Object 3 is the
 * helicopter, with its own controller; 16..30 are quarter-scale far meshes. */
export const TARMAC_PLANE_OBJECTS = [0, 1, 2, ...Array.from({ length: 27 }, (_, i) => i + 4), 84, 85, 86];
type Point = { x: number; y: number; z: number };
export function createTarmacPlane(dat: DatLevel, world: CollisionWorld) {
  const group = collisionGroupByObject(world, 0);
  if (group < 0) throw Error('Tarmac plane collision object 0 missing');
  const objects = TARMAC_PLANE_OBJECTS.map(id => {
    const index = dat.objectIds[id];
    const object = index === undefined ? undefined : dat.objects[index];
    if (!object || index === undefined) throw Error(`Tarmac plane object ${id} missing`);
    return { id, index, scale: object.unitScale,
      // 004ccf70 returns quarter-space coordinates for the far meshes.
      rest: { x: object.position.x * 32, y: object.position.y * 32, z: object.position.z * 32 } };
  });
  const a = objects.find(o => o.id === 10)!.rest;
  const b = objects.find(o => o.id === 11)!.rest;
  const d = objects.find(o => o.id === 13)!.rest;
  const pivot = { x: (((a.x + b.x) >> 1) + d.x) >> 1,
    y: (((a.y + b.y) >> 1) + d.y) >> 1, z: (((a.z + b.z) >> 1) + d.z) >> 1 };
  const hull = captureCollisionGroup(world, group);
  return { objects, pivot, hull, angle: 0, ticks: 0,
    position: { x: hull.origin.x * 32, y: hull.origin.y * 32, z: hull.origin.z * 32 },
    renderOrigin: { ...objects[0]!.rest } };
}
export type TarmacPlane = ReturnType<typeof createTarmacPlane>;

/** Original shifts/quantization are intentional; far LOD positions use a
 * separate quarter-space calculation, not rounded copies of near positions. */
export function planePoses(plane: TarmacPlane) {
  const { angle, pivot } = plane;
  const c = cos(angle), sn = sin(-angle);
  const ox = (((pivot.x >> 8) * c - (pivot.z >> 8) * sn) >> 6) - pivot.x;
  const oz = (((pivot.x >> 8) * sn + (pivot.z >> 8) * c) >> 6) - pivot.z;
  return plane.objects.map(o => {
    const far = o.id >= 16 && o.id <= 30;
    const x = far ? o.rest.x - (pivot.x >> 2) : (o.rest.x - pivot.x) >> 4;
    const z = far ? o.rest.z - (pivot.z >> 2) : (o.rest.z - pivot.z) >> 4;
    const shift = far ? 14 : 10;
    const px = ((x * c - z * sn) >> shift) + (far ? (pivot.x >> 2) + (ox >> 2) : pivot.x + ox);
    const pz = ((x * sn + z * c) >> shift) + (far ? (pivot.z >> 2) + (oz >> 2) : pivot.z + oz);
    const id = far ? o.id + (o.id >= 19 ? -15 : -16) : o.id;
    let yaw = angle, roll = 0;
    if (id === 8 || id === 9) roll = angle * 0x327;
    if (id === 10 || id === 11 || id === 13) {
      yaw += id === 13 ? 700 : 0x400;
      roll = angle * (id === 10 ? -15 : id === 11 ? -21 : -18);
    }
    return { ...o, position: { x: (px >> 5) * 32 * o.scale, y: o.rest.y * o.scale,
      z: (pz >> 5) * 32 * o.scale }, angles: [0, yaw & 4095, roll & 4095] as const,
      // Wheel tests use the unquantized near position, original Y + 0xc00.
      hazard: !far && [10, 11, 13].includes(id) ? { x: px, y: o.rest.y + 0xc00, z: pz } : null };
  });
}

export function stepTarmacPlane(plane: TarmacPlane, world: CollisionWorld, player: PlayerState) {
  const before = { ...plane.position };
  // 00487900 stores signed-short translation velocities. The collision mover
  // consumes them on the next simulation tick, along with angular velocity 4
  // in quarter-angle units (= one 12-bit angle per tick).
  const short = (n: number) => (n << 16) >> 16;
  plane.position.x += short(((plane.renderOrigin.x - plane.position.x) * 3) >> 2);
  plane.position.z += short(((plane.renderOrigin.z - plane.position.z) * 3) >> 2);
  plane.angle = (plane.angle + 1) & 4095;
  plane.ticks++;
  transformCollisionGroup(world, plane.hull,
    { x: plane.position.x / 32, y: plane.position.y / 32, z: plane.position.z / 32 }, toRadians(plane.angle));
  carryOnYawPlatform(player, plane.hull.groupIndex, before, plane.position, 1);
  const poses = planePoses(plane);
  plane.renderOrigin = { ...poses[0]!.position };
  return poses;
}

export function planeWheelHit(plane: TarmacPlane, player: Point): number | null {
  for (const { hazard } of planePoses(plane)) {
    if (!hazard) continue;
    const x = (player.x - hazard.x) >> 8, y = (player.y - hazard.y) >> 8, z = (player.z - hazard.z) >> 8;
    if (x * x + y * y + z * z < 0x50 * 0x50) return yawOf(player.x - hazard.x, player.z - hazard.z);
  }
  return null;
}

export function restorePlaneCollision(plane: TarmacPlane, world: CollisionWorld) {
  transformCollisionGroup(world, plane.hull, plane.hull.origin, 0);
}
