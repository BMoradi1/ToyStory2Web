/** Normal wrist beams (`FUN_004a5d30`/`FUN_004a5c40`), separate from disks.
 * Positions are game units. The four beam records fade and retract; damage
 * is resolved once, along the whole segment, when the trigger fires.
 */
import type { HitShape } from '../formats/all.ts';
import { cos, sin, yawDelta, yawOf } from './trig.ts';

export interface Point { x: number; y: number; z: number }
export interface LaserTarget {
  creature: object;
  position: Point;
  heading: number;
  shape: HitShape;
  vulnerable: number;
}
export interface LaserBeam {
  from: Point; to: Point;
  life: number;
  colour: readonly [number, number, number];
  /** Half width in level units. */
  width: number;
}
export const LASER = { range: 0x20000, life: 32, slots: 4, retract: 0x800 } as const;

function centre(t: LaserTarget): Point {
  const s = sin(t.heading - 0x800) / 16384, c = sin(t.heading - 0x400) / 16384;
  return {
    x: t.position.x + t.shape.offset.x * c + t.shape.offset.z * s,
    y: t.position.y + t.shape.offset.y,
    z: t.position.z + t.shape.offset.z * c - t.shape.offset.x * s,
  };
}

/** Segment/animated hit ellipsoid intersection, as used by FUN_004a5870. */
export function laserHitFraction(from: Point, to: Point, t: LaserTarget): number | null {
  const mid = centre(t), k = sin(t.heading - 0x400) / 16384, s = sin(t.heading - 0x800) / 16384;
  const transform = (p: Point) => {
    const x = p.x - mid.x, z = p.z - mid.z;
    return { x: (x * k + z * s) * t.shape.scale.x / 8192,
      y: (p.y - mid.y) * t.shape.scale.y / 8192,
      z: (z * k - x * s) * t.shape.scale.z / 8192 };
  };
  const a = transform(from), b = transform(to);
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const aa = dx * dx + dy * dy + dz * dz;
  const bb = a.x * dx + a.y * dy + a.z * dz;
  const cc = a.x * a.x + a.y * a.y + a.z * a.z - t.shape.radius ** 2;
  if (cc <= 0) return 0;
  const disc = bb * bb - aa * cc;
  if (aa === 0 || disc < 0) return null;
  const fraction = (-bb - Math.sqrt(disc)) / aa;
  return fraction >= 0 && fraction <= 1 ? fraction : null;
}

export function fireBeam(
  pool: LaserBeam[], origin: Point, facing: number, mode: 0 | 1 | 2,
  targets: readonly LaserTarget[],
  wallFraction: (from: Point, delta: Point) => number,
): { beam: LaserBeam; hit: LaserTarget | null; damageKind: number; yaw: number; wall: boolean } {
  let yaw = facing, pitch = 0, closestAngle = Infinity, aim: Point | null = null;
  for (const t of targets) {
    if ((t.vulnerable & 4) === 0) continue;
    const at = centre(t), dx = at.x - origin.x, dy = at.y - origin.y, dz = at.z - origin.z;
    if (dx * dx + dy * dy + dz * dz >= LASER.range ** 2 || Math.abs(dy) >= 0x300 * 32) continue;
    const angle = Math.abs(yawDelta(yawOf(dx, dz), facing));
    if (angle < 0x80 && angle < closestAngle) { closestAngle = angle; aim = at; }
  }
  if (aim) {
    yaw = yawOf(aim.x - origin.x, aim.z - origin.z);
    pitch = Math.max(-0x40, Math.min(0x40,
      yawDelta(yawOf(Math.hypot(aim.x - origin.x, aim.z - origin.z), aim.y - origin.y) - 0x400, 0)));
  }
  const flat = cos(pitch) / 16384;
  const delta = { x: sin(yaw) / 16384 * flat * LASER.range,
    y: -sin(pitch) / 16384 * LASER.range, z: cos(yaw) / 16384 * flat * LASER.range };
  let fraction = Math.max(0, Math.min(1, wallFraction(origin, delta)));
  const far = { x: origin.x + delta.x, y: origin.y + delta.y, z: origin.z + delta.z };
  let hit: LaserTarget | null = null;
  for (const t of targets) {
    if ((t.vulnerable & 4) === 0) continue;
    const f = laserHitFraction(origin, far, t);
    if (f !== null && f < fraction) { fraction = f; hit = t; }
  }
  const beam: LaserBeam = {
    from: { ...origin }, to: { x: origin.x + delta.x * fraction,
      y: origin.y + delta.y * fraction, z: origin.z + delta.z * fraction },
    life: LASER.life, colour: mode === 0 ? [1, 0, 0] : mode === 1 ? [1, 1, 0] : [0, 1, 0],
    width: mode === 1 ? 64 : 32,
  };
  if (pool.length >= LASER.slots) {
    let oldest = 0;
    for (let i = 1; i < pool.length; i++) if (pool[i]!.life < pool[oldest]!.life) oldest = i;
    pool.splice(oldest, 1);
  }
  pool.push(beam);
  return { beam, hit, damageKind: mode === 0 ? 2 : 3, yaw, wall: hit === null && fraction < 1 };
}

export function stepBeams(pool: LaserBeam[]): void {
  for (let i = pool.length - 1; i >= 0; i--) {
    const b = pool[i]!;
    const dx = b.to.x - b.from.x, dy = b.to.y - b.from.y, dz = b.to.z - b.from.z;
    const length = Math.hypot(dx, dy, dz);
    if (--b.life <= 0 || length <= LASER.retract) { pool.splice(i, 1); continue; }
    b.from.x += dx / length * LASER.retract;
    b.from.y += dy / length * LASER.retract;
    b.from.z += dz / length * LASER.retract;
  }
}
