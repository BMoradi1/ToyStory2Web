/** Rope/pole path 61, from toy2.exe 0x414600 and 0x4354e0. +Y down. */
import type { Vec3 } from '../formats/dat.ts';
import type { PlayerInput, PlayerState } from './player.ts';
import { POLE } from './player-constants.ts';
import { sin, cos, yawOf, YAW_MASK } from './trig.ts';

export interface Pole { x: number; z: number; bottom: number; top: number; type: number }
/** Sentinels change the type for subsequent endpoint pairs; they are not poles. */
export function readPoles(points: readonly Vec3[]): Pole[] {
  const poles: Pole[] = [];
  let type = 0;
  for (let i = 0; i < points.length;) {
    const a = points[i++]!;
    if (Math.abs(a.x) === Math.abs(a.y) && Math.abs(a.y) === Math.abs(a.z)) {
      type = Math.trunc(Math.abs(a.x) / 50); continue;
    }
    const b = points[i++];
    if (!b) break;
    poles.push({ x: a.x * 32, z: a.z * 32, bottom: a.y * 32, top: b.y * 32, type });
  }
  return poles;
}

/** Returns true when the pole owns this tick's movement (including jump-off). */
export function stepPole(p: PlayerState, input: PlayerInput, previous: PlayerInput,
  poles: readonly Pole[], cameraYaw: number): boolean {
  if (p.poleLock >= 0) {
    const old = poles[p.poleLock];
    if (!old || ((p.x - old.x) >> 5) ** 2 + ((p.z - old.z) >> 5) ** 2 > 0x8400) p.poleLock = -1;
  }
  if (p.stomp !== 0 || p.launched || p.dying || p.hitStun > 0 || p.spin !== 0 || p.spinCharge !== 0 || p.climb > 0 || p.fallTimer < 0 || p.fallTimer === 0x50) {
    if (p.pole >= 0) p.poleLock = p.pole;
    p.pole = -1; return false;
  }
  if (p.pole < 0 && p.poleLock < 0) {
    p.pole = poles.findIndex(q => q.type !== 3
      && ((p.x - q.x) >> 8) ** 2 + ((p.z - q.z) >> 8) ** 2 < 0x200
      && p.y <= q.bottom + 0x1e00 && p.y >= q.top + 0x3600);
    if (p.pole >= 0) { p.poleTicks = 0; p.vy = 0; }
  }
  const pole = poles[p.pole];
  if (!pole) { p.pole = -1; return false; }
  if (p.y > pole.bottom + 0x1e00 || (p.onGround && (input.moveY < -0.2 || pole.type === 2))) {
    p.poleLock = p.pole; p.pole = -1; return false;
  }
  p.poleTicks++;
  const top = pole.top + 0x3600;
  p.x -= (p.x - pole.x) >> 2; p.z -= (p.z - pole.z) >> 2;
  p.vx = p.vz = p.forwardSpeed = p.lateralSpeed = 0;
  p.coyote = 0; p.fallTimer = 0; p.laser = p.laserCharge = 0;
  p.poleMotion = 0;
  if (pole.type === 2) {
    p.vy = Math.min(POLE.slideTypeTerminal, p.vy + POLE.slideTypeGravity); p.poleMotion = 4;
  } else if (input.moveY > 0.2 && p.y > top) {
    p.vy = POLE.climbSpeed; p.poleMotion = 2;
  } else if (input.moveY < -0.2) {
    p.vy = Math.min(POLE.slideMax, p.vy + POLE.slideAccel);
    p.yaw = (p.yaw + Math.trunc(p.vy / 16)) & YAW_MASK; p.poleMotion = 4;
  } else p.vy = Math.max(0, p.vy - POLE.slideDecay);
  if (Math.abs(input.moveX) > 0.2) p.yaw = (p.yaw + Math.sign(input.moveX) * POLE.rotatePerTick) & YAW_MASK;
  p.targetYaw = p.yaw;
  const atTop = p.y <= top;
  if ((atTop && pole.type === 1) || (input.jump && !previous.jump && p.poleTicks > 10)) {
    p.poleLock = p.pole; p.pole = -1;
    p.vy = atTop ? POLE.topJumpImpulse : POLE.letGoImpulse;
    if (!atTop) {
      if (Math.hypot(input.moveX, input.moveY) > 0.2) p.yaw = (yawOf(input.moveX, input.moveY) + cameraYaw) & YAW_MASK;
      p.vx = Math.trunc(sin(p.yaw) / 16); p.vz = Math.trunc(cos(p.yaw) / 16);
    }
    p.targetYaw = p.yaw; p.jumpState = 1; p.animPhase = 2;
    p.takeoffY = p.y; p.jumpedFromGround = false; p.events.push(0x19);
  } else {
    if (p.y + p.vy < top) { p.vy = top - p.y; }
    p.animPhase = p.poleMotion === 2 ? 14 : p.poleMotion === 4 ? 16 : 15;
    if (p.poleMotion === 4) p.events.push(0x23);
  }
  p.onGround = false;
  return true;
}
