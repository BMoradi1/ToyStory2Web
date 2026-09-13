/** Ground-pound level scripts: FUN_00417680 (chair), FUN_0041c640 (paint). */
import type { CollisionWorld } from '../formats/collision.ts';
import type { DatLevel } from '../formats/dat.ts';
import { JumpState, type PlayerState } from './player.ts';
import { cos, sin } from './trig.ts';

export interface StompProps {
  chair: number;
  paint: { first: number; second: number; excess: boolean; cooldown: number; drain: number;
    height: number; colour: [number, number, number]; button: number; solved: number; reward: boolean; pulse: number; success: boolean };
}
export function createStompProps(): StompProps {
  return { chair: 0, paint: { first: 0, second: 0, excess: false, cooldown: 0, drain: 0,
    height: 0, colour: [0, 0, 0], button: 0, solved: 0, reward: false, pulse: 0, success: false } };
}
export function stompObjects(level: number): number[] {
  return level === 1 ? [23] : level === 4 ? [33, 34, 35, 48, 49, 50, 51, 52, 53] : [];
}
/** Ground contacts carry the authored surface byte, independently of mover IDs. */
export function standingSurface(p: PlayerState, world: CollisionWorld): number {
  if (!p.onGround) return -1;
  for (const c of p.contacts) {
    const surface = world.groups[c.group]?.surface;
    if (c.normal.y < -0.5 && surface !== undefined && surface !== 255) return surface;
  }
  return -1;
}

export function stepStompProps(s: StompProps, level: number, p: PlayerState, world: CollisionWorld,
  dat: DatLevel, bucket?: { x: number; y: number; z: number }): void {
  const surface = standingSurface(p, world);
  if (level === 1) {
    if (s.chair === 0 && p.stompImpact && surface === 8) s.chair = 2;
    if (s.chair !== 0) {
      s.chair++;
      if (s.chair === 7) {
        p.stomp = 0; p.vy = -0x1280; p.jumpState = JumpState.Released;
        p.onGround = false; p.coyote = 0; p.animPhase = 2; p.fallTimer = 0;
        p.vx = sin(0x11e); p.vz = cos(0x11e);
        p.yaw = p.targetYaw = 0x11e; p.launched = true; p.events.push(0x1c);
      }
      if (s.chair > 32) s.chair = -32;
    }
  }
  const a = s.paint;
  a.success = false;
  if (level !== 4) return;
  a.pulse = (a.pulse + 1) & 63;
  if (a.drain > 0) { a.drain--; if (a.drain === 0) a.height = 0; return; }
  // FUN_004879c0(0) queries the bucket collision object, NOT Buzz.
  // Lanes 1..3 receive mixed paint; 5..7 are the red, blue, yellow outlets.
  if (!bucket) return;
  const lanes = dat.paths.find(path => path.id === 3)?.points ?? [];
  const lane = lanes.findIndex(point => Math.abs((bucket.x >> 5) - point.x) < 200) + 1;
  if (p.stompImpact && surface >= 32 && surface <= 35 && a.cooldown === 0) {
    a.button = surface - 31; a.cooldown = 60;
    if (lane > 4 && lane - 3 === a.button) {
      if (a.first === 0) a.first = lane - 4;
      else if (a.second === 0) { a.second = lane - 4; a.excess = false; }
      else a.excess = true;
    }
  }
  if (a.cooldown > 0) {
    if (!a.excess && lane >= 5 && lane <= 7 && lane - 3 === a.button) {
      const t = a.cooldown, key = a.first + a.second * 3 - 1;
      // Retail RGB transitions (+0x24) and liquid height (+0x2e).
      const colours: [number, number, number][] = [
        [0x680, 0, 0], [0, 0, 0x600], [0x600, 0x580, 0], a.colour,
        [(60-t)*14, 0, t*8+0x420], [0x600, t*10+0x328, 0],
        [t*12+0x3b0, 0, (60-t)*18], a.colour, [(t*3+12)*8, t*6+0x418, 0],
        [t*2+0x608, (60-t)*12, 0], [0, (60-t)*16, (t*3+12)*8], a.colour,
      ];
      a.colour = colours[key] ?? a.colour;
      a.height = ((key < 3 ? 60 : 124) - t) * 32;
    }
    a.cooldown--;
    if (a.cooldown > 0) return;
  }
  if (a.first !== 0 && a.first === a.second) {
    a.first = a.second = 0; a.excess = false; a.drain = 32; return;
  }
  const key = a.first + a.second * 3 - 1;
  const accepts = [[4, 6], [5, 9], [8, 10]];
  if (lane >= 1 && lane <= 3 && accepts[lane - 1]!.includes(key)) {
    a.solved |= 1 << (lane - 1); a.first = a.second = 0; a.drain = 32;
    a.success = true;
  }
}

/** The authored falling-paint objects grow for eight ticks, then cut off. */
export function paintStreamScale(s: StompProps, id: number): number {
  const a = s.paint;
  if (id !== a.button + 31 || a.cooldown < 12) return 0;
  return Math.min(1, (60 - a.cooldown) / 8);
}
