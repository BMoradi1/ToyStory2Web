/** Internal level 3, FUN_0041a8a0/FUN_0041aa10; docs/LEVELS.md. */
import { CREATURE_FLAGS, killCreature, type Creature, type RandomStream } from './creatures.ts';
import { ANIM_SCRIPTS } from './creature-data.ts';
import type { CutHandle } from './tasks.ts';
import { yawOf } from './trig.ts';
import type { Effect } from './effects.ts';
import type { LaserTarget } from './laser.ts';

/** The original publishes the first live spit blob as a shootable target. */
export function slimeBlobTarget(effects: readonly Effect[]): LaserTarget | null {
  const blob = effects.find(e => e.kind === 0x3f && e.life > 1);
  return blob ? { creature: blob, position: blob, heading: 0, vulnerable: 7,
    shape: { offset: { x: 0, y: 0, z: 0 }, scale: { x: 256, y: 256, z: 256 }, radius: blob.width } } : null;
}

export interface SlimeBoss {
  phase: number;
  target: number;
  goal: number;
  size: number;
  health: number;
  cutTicks: number;
  nextCut: number;
  flash: number;
  voice: number;
  introVoice: number;
  entranceSound: boolean;
  growSound: boolean;
  beaten: boolean;
  won: boolean;
}

export interface SlimeWorld {
  x: number; y: number; z: number;
  rand: RandomStream;
  cut?: CutHandle;
  sound?: (event: number, at: { x: number; y: number; z: number } | null) => void;
  shout?: (sequence: number) => void;
  effect?: (x: number, y: number, z: number, kind: number, mode: number, spin?: number) => void;
  spit?: (boss: Creature) => void;
  burstBlobs?: () => void;
  touch?: (angle: number, reaction: number) => void;
  shake?: (ticks: number) => void;
}

export function createSlimeBoss(boss: Creature): SlimeBoss {
  boss.heading = boss.wantYaw = 0x800;
  boss.z += 0x10000;
  boss.flags |= CREATURE_FLAGS.diedOnce;
  boss.hitRadius = 1000;
  boss.timer = 0;
  // Each creature owns the rewritten shapes; never mutate the cached model.
  boss.hitShapes = boss.hitShapes?.map(s => ({ ...s, offset: { ...s.offset }, scale: { ...s.scale } })) ?? null;
  boss.drawScale = 0;
  return { phase: 0, target: 0x1000, goal: 0x1000, size: 0, health: boss.health,
    cutTicks: 0, nextCut: 180, flash: 0, voice: 180, introVoice: 150,
    entranceSound: false, growSound: false, beaten: false, won: false };
}

export function slimeBossBar(s: SlimeBoss): number {
  return Math.trunc(((0x3800 - s.goal) >> 11) * 0x36 / 5);
}

/** Called once per simulation tick, after creature attacks and the AI script. */
export function stepSlimeBoss(s: SlimeBoss, boss: Creature, w: SlimeWorld): void {
  const startCut = (ticks: number, up: number) => {
    s.cutTicks = ticks;
    // Framing approximation: 0x40 cut units puts the eye 0x10000 game
    // units away. The decoded timings and look heights are preserved.
    w.cut?.start({ x: boss.x, y: boss.y - up, z: boss.z }, ticks, 0x40);
  };
  s.cutTicks = w.cut ? w.cut.ticks : Math.max(0, s.cutTicks - 1);
  s.flash = Math.max(0, s.flash - 1);
  if (s.introVoice > 0 && --s.introVoice === 0) w.shout?.(0xd2);
  w.sound?.(0x6f, boss);
  w.sound?.(0x67, null);

  if (s.phase === 0 && Math.hypot(w.x - boss.x, w.z - boss.z) < 0x17c * 256) {
    s.phase = 1;
    startCut(300, 11000);
  }
  if (s.phase === 1) {
    // Hits during the entrance must not carry into the first combat tick.
    boss.health = s.health;
    if (s.cutTicks < 240 && !s.entranceSound) {
      w.sound?.(0x46, boss); s.entranceSound = true;
    }
    if (s.cutTicks < 150) {
      if (!s.growSound) { w.shout?.(-4); s.growSound = true; }
      s.size += (s.target - s.size) >> 5;
    }
    if (s.cutTicks === 0) {
      boss.pc = 9; boss.wait = 0;
      s.phase = 999;
    }
  } else if (s.phase === 999) {
    if (--s.voice <= 0) { w.shout?.(0xd1); s.voice = w.rand.byte() + 0x708; }
    if (Math.hypot(w.x - boss.x, w.z - boss.z) < 0x32 * 256) {
      w.touch?.(yawOf(w.x - boss.x, w.z - boss.z), 3);
    }
    if (boss.health !== s.health) {
      boss.health = s.health;
      s.flash = 4;
      s.target -= 0x300;
      if (s.target < 0x200) {
        s.target = 0x200;
        s.goal += 0x800;
        w.burstBlobs?.();
        boss.record.vulnerable = 4;
        boss.wait = 0;
        if (s.goal >= 0x3800) {
          s.goal = 0x3800;
          s.target = s.size = 1;
          boss.pc = 0x5e;
          boss.flags &= ~0x180;
          s.phase = 1000;
          s.beaten = true;
          startCut(420, 11000);
        } else {
          boss.pc = 0x4f;
          boss.vx = boss.vy = boss.vz = 0;
          boss.animState = 1;
          boss.animScript = ANIM_SCRIPTS[0x10]!;
          boss.animIndex = 0;
          boss.frame = boss.animScript[0]! * 0x10000;
          s.growSound = false;
          startCut(s.nextCut, 14000);
          s.nextCut += 40;
        }
      }
    }
    if (s.phase === 999) {
      if (boss.record.vulnerable === 4 && w.cut) {
        Object.assign(w.cut.look, { x: boss.x, y: boss.y - s.size * 2 - 10000, z: boss.z });
      }
      if (s.target < s.goal) {
        if (boss.record.vulnerable === 4) {
          if (s.cutTicks < 120) {
            if (!s.growSound) { w.shout?.(-4); s.growSound = true; }
            s.target += (s.goal - s.target) >> 5;
          } else boss.wait = 5;
        } else s.target = Math.min(s.goal, s.target + 32);
      }
      if (boss.timer === 1) { w.spit?.(boss); w.sound?.(0xd, boss); }
      if (boss.timer === 3) w.shake?.(40);
      boss.timer = 0;
      s.size += (s.target - s.size) >> 3;
    }
  } else if (s.phase === 1000) {
    if (w.cut) Object.assign(w.cut.look, { x: boss.x, y: boss.y - 11000, z: boss.z });
    if (s.cutTicks < 180) { killCreature(boss, 1); s.phase = 1001; }
  } else if (s.phase === 1001) {
    if (s.cutTicks === 0) s.phase = 1002;
  } else if (s.phase >= 1002 && s.phase < 1030) {
    if (++s.phase === 1030) s.won = true;
  }

  boss.drawScale = s.size / 0x2000;
  if (s.phase >= 999 && s.phase <= 1000) {
    w.effect?.(boss.x, boss.y - 10000, boss.z, 0x41, 0x14, ((w.rand.byte() - 0x80) >> 3) + 0x80);
  }
  for (const shape of boss.hitShapes ?? []) {
    shape.offset.y = -12000 - s.size;
    shape.radius = s.size >> 4;
  }
}
