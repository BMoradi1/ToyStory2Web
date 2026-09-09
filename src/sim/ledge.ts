/** Automatic edge climb, from toy2.exe FUN_00435f30. Game units, +Y down. */
import { groundBelow, sweepSphere, type CollisionWorld } from '../formats/collision.ts';
import { GAME_UNITS_PER_LEVEL_UNIT } from './player-constants.ts';
import { cos, idiv, sin, yawOf } from './trig.ts';

export interface LedgeProbe { x: number; y: number; z: number; yaw: number; previousY: number }
export interface LedgeTarget { x: number; y: number; z: number; yaw: number }
export const CLIMB_TICKS = 0x52;

export function findLedge(world: CollisionWorld, p: LedgeProbe): LedgeTarget | null {
  const scale = GAME_UNITS_PER_LEVEL_UNIT;
  const below = groundBelow(world, p.x / scale, p.y / scale, p.z / scale, 0);
  if (!below || below.y * scale - p.y <= 0x2000) return null;
  const dx = idiv(sin(p.yaw), 3), dz = idiv(cos(p.yaw), 3);
  // FUN_00486280 can return a surface just ABOVE the current probe. Search
  // the whole hand-crossing interval so a fast falling tick cannot skip it.
  const top = groundBelow(world, (p.x + dx) / scale, (p.previousY - 0x3600 + 200) / scale, (p.z + dz) / scale, 0);
  if (!top || top.normal.y >= -15000 / 0x4000) return null;
  const surface = top.y * scale, y = surface - 200;
  // The hands must cross the edge this descending tick; a nearby high shelf
  // is not permission to teleport up to it.
  if (y >= p.y - 0x3600 || p.previousY - 0x3600 > y) return null;
  const from = { x: p.x - idiv(dx, 4), y: p.y, z: p.z - idiv(dz, 4) };
  const sweep = (start: typeof from, velocity: typeof from) =>
    sweepSphere(world, start, velocity, 4000, { scale });
  if (sweep(from, { x: 0, y: y - p.y, z: 0 }).touched) return null;
  const across = { x: dx + idiv(dx, 3), y: 0, z: dz + idiv(dz, 3) };
  if (sweep({ ...from, y: surface - 0x1838 }, across).touched) return null;
  // The lower sweep finds the wall normal used to square Buzz to the edge.
  const wall = sweep({ ...from, y }, across).contacts.find(c => Math.abs(c.normal.y) < 0.5);
  return { x: p.x + dx, y, z: p.z + dz,
    yaw: wall ? yawOf(-wall.normal.x, -wall.normal.z) : p.yaw };
}
