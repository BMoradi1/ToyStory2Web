/** Path-62 zip lines. Movement/thresholds from toy2.exe 0x4359d0. */
import type { Vec3 } from '../formats/dat.ts';
import type { PlayerInput, PlayerState } from './player.ts';
import { ZIPLINE } from './player-constants.ts';
import { sin, cos, yawOf, yawDelta, idiv, YAW_MASK } from './trig.ts';

export interface ZipLine {
  start: Vec3;
  end: Vec3;
  /** Full 3D length in level units; endpoints remain in game units. */
  length: number;
  yaw: number;
}

/** Consecutive endpoint pairs, in authored travel order. Input is level units. */
export function readZipLines(points: readonly Vec3[]): ZipLine[] {
  const lines: ZipLine[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const a = points[i]!, b = points[i + 1]!;
    if (a.x === b.x && a.z === b.z) continue;
    lines.push({
      start: { x: a.x * 32, y: a.y * 32, z: a.z * 32 },
      end: { x: b.x * 32, y: b.y * 32, z: b.z * 32 },
      length: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z),
      yaw: yawOf(b.x - a.x, b.z - a.z),
    });
  }
  return lines;
}

function pointAt(line: ZipLine, distance: number): Vec3 {
  const t = Math.max(0, Math.min(1, distance / line.length));
  return {
    x: Math.round(line.start.x + (line.end.x - line.start.x) * t),
    y: Math.round(line.start.y + (line.end.y - line.start.y) * t),
    z: Math.round(line.start.z + (line.end.z - line.start.z) * t),
  };
}

/** Horizontal projection avoids division by zero on axis-aligned lines. */
function grabDistance(p: Vec3, line: ZipLine): number | null {
  const a = line.start, b = line.end;
  if (p.x < Math.min(a.x,b.x)-0x800 || p.x > Math.max(a.x,b.x)+0x800
      || p.z < Math.min(a.z,b.z)-0x800 || p.z > Math.max(a.z,b.z)+0x800) return null;
  const dx = b.x-a.x, dz = b.z-a.z;
  const t = Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));
  const distance = t * line.length;
  if (line.length-distance < 200) return null;
  const q = pointAt(line, distance);
  if (((p.x-q.x)>>5)**2 + ((p.z-q.z)>>5)**2 >= ZIPLINE.attachDistanceSq) return null;
  const height = q.y + ZIPLINE.hangOffset - p.y;
  return height > -0x1000 && height < ZIPLINE.hangOffset ? distance : null;
}

function detach(p: PlayerState): void {
  p.zipLine = -1; p.zipPhase = 0;
  p.zipCooldown = ZIPLINE.regrabLockoutTicks;
}

/** True when riding/release replaces walking this tick. Catching still falls. */
export function stepZipLine(p: PlayerState, input: PlayerInput, previous: PlayerInput,
  lines: readonly ZipLine[]): boolean {
  if (p.zipCooldown > 0) p.zipCooldown--;
  const busy = p.stomp !== 0 || p.launched || p.dying || p.hitStun > 0 || p.spin !== 0 || p.spinCharge !== 0
    || p.climb > 0 || p.pole >= 0 || p.fallTimer < 0 || p.fallTimer === 0x50;
  if (busy || p.onGround || p.coyote > 0) {
    if (p.zipLine >= 0) detach(p);
    return false;
  }
  if (p.zipLine < 0 && p.zipCooldown === 0) {
    for (let i=0;i<lines.length;i++) {
      const distance = grabDistance(p,lines[i]!);
      if (distance === null) continue;
      p.zipLine = i; p.zipPhase = 1; p.zipDistance = distance;
      p.zipSpeed = 0; p.zipTicks = 0;
      break;
    }
  }
  const line = lines[p.zipLine];
  if (!line) { p.zipLine = -1; p.zipPhase = 0; return false; }
  const q = pointAt(line,p.zipDistance);
  if (p.zipPhase === 1) {
    // Wait for Buzz's hands to descend to the cable before starting the ride.
    p.vx = p.vz = p.forwardSpeed = p.lateralSpeed = 0;
    if (p.y < q.y + ZIPLINE.hangOffset) return false;
    p.zipPhase = 2;
  }
  p.zipTicks++;
  p.zipSpeed = Math.min(ZIPLINE.maxSpeed,p.zipSpeed+1);
  p.x = q.x; p.y = q.y + ZIPLINE.hangOffset; p.z = q.z;
  p.vx = p.vy = p.vz = p.forwardSpeed = p.lateralSpeed = 0;
  p.onGround = false; p.coyote = 0; p.fallTimer = 0;
  p.laser = p.laserCharge = 0;
  p.yaw = (p.yaw + idiv(yawDelta(line.yaw,p.yaw),16)) & YAW_MASK;
  p.targetYaw = p.yaw; p.animPhase = 17;
  p.zipDistance += p.zipSpeed;
  p.events.push(0x23);
  const jump = input.jump && !previous.jump && p.zipTicks > 10;
  if (p.zipDistance >= line.length || jump) {
    detach(p);
    const speed = Math.min(0x400,p.zipSpeed*512);
    p.vx = Math.trunc(sin(p.yaw)*speed/0x4000);
    p.vz = Math.trunc(cos(p.yaw)*speed/0x4000);
    p.vy = ZIPLINE.releaseImpulse;
    p.jumpState = 1; p.animPhase = 3; p.takeoffY = p.y; p.jumpedFromGround = false;
    if (jump) p.events.push(0x19);
  }
  return true;
}
