import type { PlayerState } from './player.ts';
import { toRadians } from './trig.ts';
type Point = { x: number; y: number; z: number };

/** Reusable yaw-platform passenger transform, in game units. Only floor
 * contacts and an acquired moving ledge carry Buzz; jumping and unrelated
 * side contacts remain independent. */
export function carryOnYawPlatform(player: PlayerState, group: number, from: Point, to: Point, delta: number) {
  const climbing = player.climbGroup >= 0 && player.climbGroup === group && !player.dying && player.hitStun <= 0;
  const standing = player.onGround && player.climb === 0 && player.contacts.some(c => c.group === group && c.normal.y < -0.5);
  if (!climbing && !standing) return;
  const c = Math.cos(toRadians(delta)), s = Math.sin(toRadians(delta));
  const x = player.x - from.x, z = player.z - from.z;
  player.x = Math.round(to.x + x * c + z * s);
  player.y += to.y - from.y;
  player.z = Math.round(to.z + z * c - x * s);
}

