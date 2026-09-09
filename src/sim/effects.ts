/**
 * Effects: everything that is neither a model nor level geometry and moves.
 * Ported from `FUN_0040fae0` (spawn), `FUN_0040fdf0` (spawn a child),
 * `FUN_00410f40` (tick), `FUN_00410b80` (die) and `FUN_004100f0` (touch
 * Buzz). The decode is docs/EFFECTS.md, which carries every mode.
 *
 * Buzz's disk is one of these, and so are the hover bot's shots, the
 * coins a dying creature spills, hit sparks, smoke, dust, the stomp's
 * shockwave and the sparkles over an unspent secret. There are 64 records,
 * each a moving, spinning, fading sprite card driven by a template and a
 * behaviour byte.
 *
 * Game units, +Y down, 12-bit angles — the controller's conventions — except
 * the card's `width`/`height`, which are level units as the templates store
 * them.
 */
import {
  EFFECT, EFFECT_FLAGS, EFFECT_KIND, randomised,
  type EffectTemplate, type SpawnMode,
} from '../formats/effect-table.ts';
import { cos, idiv, sin, YAW_MASK, yawDelta, yawOf } from './trig.ts';
import type { RandomStream } from './creatures.ts';

/** What a homing effect is chasing: a creature, kept live by the caller. */
export interface EffectTarget {
  x: number; y: number; z: number;
  alive: boolean;
  /** The placement's vulnerable byte; 4 bounces the disk. */
  vulnerable: number;
  /** The creature itself, handed back with the hit. */
  creature: object;
  /**
   * Refresh `x`/`y`/`z`/`alive` from the creature. The original re-reads the
   * entity's hit-shape centre every tick, so a bolt tracks what it is chasing
   * rather than where it was when it was fired — the difference between
   * hitting a flier and orbiting the spot it left.
   */
  follow: () => void;
}

/** One live effect. Field comments give the original's record offset. */
export interface Effect {
  /** +0x00. */
  x: number; y: number; z: number;
  /** +0x0c, +0x10, +0x14. With `homing` these hold the target and its angles. */
  vx: number; vy: number; vz: number;
  /** +0x18: added to `vy` each tick, or the homing yaw. */
  gravity: number;
  /** +0x1c: the floor under it, or null until asked. */
  floor: number | null;
  /** +0x20: unused unless homing, where it is the pitch (-1 for none). */
  pitch: number;
  /**
   * The creature this is homing on, or null for Buzz / nothing. `vulnerable`
   * is its placement's byte: 4 bounces the disk (docs/CREATURES.md).
   */
  target: EffectTarget | null;
  /** +0x24: ticks left. 0 is dead. */
  life: number;
  /** +0x26, +0x28: card size, level units. */
  width: number; height: number;
  /** +0x2a, +0x2b: ticks per frame and the countdown to the next. */
  period: number; countdown: number;
  /** +0x2c: sprite table index; 0 is not drawn. */
  sprite: number;
  /** +0x2d. */
  kind: number;
  /** +0x2e: what the death hook does. */
  death: number;
  /** +0x2f: the behaviour byte. */
  mode: number;
  /** +0x30, +0x31. */
  frames: number; frame: number;
  /** +0x32. */
  flags: number;
  /** +0x34, +0x36. */
  rotation: number; spin: number;
  /** +0x38: colour, 0..255 with 0x80 neutral. The fades write here. */
  r: number; g: number; b: number;
}

/** A ground mark: the drop shadow an effect leaves under itself. */
export interface GroundMark { x: number; y: number; z: number; size: number }

/** A point light an effect asked for, or a screen glow. */
export interface EffectLight {
  x: number; y: number; z: number; r: number; g: number; b: number;
  /** True for the screen glow (`FUN_0044f200`), false for the point light. */
  glow: boolean;
}

export interface EffectWorld {
  /** Where the camera is looking, for the spawn range and the cull. */
  cameraX: number; cameraY: number; cameraZ: number;
  /** Buzz, for the modes that ride him and for the touch test. */
  playerX: number; playerY: number; playerZ: number;
  playerYaw: number;
  playerVx: number; playerVz: number;
  /** The floor under a point, level units in and game units out, or null. */
  groundAt: (x: number, y: number, z: number) => number | null;
  /** The water line, for the modes that die under it. */
  waterY: number | null;
}

export interface EffectSim {
  effects: Effect[];
  /** Round-robin cursor, `DAT_0052ad90`. */
  cursor: number;
  rand: RandomStream;
  templates: readonly (EffectTemplate | null)[];
  modes: readonly SpawnMode[];
  /** Drained by the caller each tick. */
  marks: GroundMark[];
  lights: EffectLight[];
  sounds: { event: number; x: number; y: number; z: number }[];
  /** Coins picked up by touch this tick, and whether the fiftieth was one. */
  coins: number;
  /** True while Buzz's spin is out, which deflects a missile instead of hurting him. */
  spinning: boolean;
  /** Raised when a shot touched Buzz: the angle it came from. */
  hurt: number | null;
  /** The engine's frame dividers, rebuilt each tick. */
  gate: { two: number; three: number; four: boolean; five: boolean; six: boolean; seven: boolean; eight: boolean; sixteen: boolean; thirtyTwo: boolean };
  /** The 1-in-16 counter itself, which one mode reads as a triangle wave. */
  counter16: number;
  /** Damage the bolt landed: the creature and the angle, for the caller. */
  hits: { target: object; angle: number; kind: number }[];
}

const dead = (): Effect => ({
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, gravity: 0, floor: null, pitch: -1,
  target: null, life: 0, width: 0, height: 0, period: 0, countdown: 0,
  sprite: 0, kind: 0, death: 0, mode: 0, frames: 1, frame: 0, flags: 0,
  rotation: 0, spin: 0, r: 128, g: 128, b: 128,
});

export function createEffects(
  templates: readonly (EffectTemplate | null)[],
  modes: readonly SpawnMode[],
  rand: RandomStream,
): EffectSim {
  return {
    effects: Array.from({ length: EFFECT.slots }, dead),
    cursor: 0, rand, templates, modes,
    marks: [], lights: [], sounds: [], coins: 0, spinning: false, hurt: null,
    gate: { two: 0, three: 0, four: false, five: false, six: false, seven: false, eight: false, sixteen: false, thirtyTwo: false },
    counter16: 0,
    hits: [],
  };
}

/** The dividers `FUN_004a5a30` rebuilds every tick, which the emitters gate on. */
const counters = { two: 0, three: 0, four: 0, five: 0, six: 0, seven: 0, eight: 0, sixteen: 0, thirtyTwo: 0 };

export function stepEffectGates(sim: EffectSim, dt = 1): void {
  const g = sim.gate;
  g.two = 0;
  for (counters.two += dt; counters.two > 1; counters.two -= 2) g.two++;
  g.three = 0;
  for (counters.three += dt; counters.three > 2; counters.three -= 3) g.three++;
  const step = (name: 'four' | 'five' | 'six' | 'seven' | 'eight' | 'sixteen' | 'thirtyTwo', wrap: number) => {
    counters[name] += dt;
    const hit = counters[name] > wrap - 1;
    if (hit) counters[name] -= wrap;
    return hit;
  };
  g.four = step('four', 4);
  g.five = step('five', 5);
  g.six = step('six', 6);
  g.seven = step('seven', 7);
  g.eight = step('eight', 8);
  g.sixteen = step('sixteen', 16);
  g.thirtyTwo = step('thirtyTwo', 32);
  sim.counter16 = counters.sixteen;
}

/**
 * `FUN_0040fae0`. Velocity is halved and gravity quartered on the way in, the
 * way the original does; `life` and `period` are doubled from the template.
 *
 * Returns the record so a caller can patch it, which is what most call sites
 * do straight afterwards. Null when the spawn was refused for range.
 */
export function spawnEffect(
  sim: EffectSim, world: EffectWorld,
  x: number, y: number, z: number,
  vx: number, vy: number, vz: number,
  gravity: number, rotation: number, spin: number, kind: number,
): Effect | null {
  const template = sim.templates[kind];
  if (!template) return null;

  const range = EFFECT.nearKinds.includes(kind) ? EFFECT.nearRange : EFFECT.spawnRange;
  const dx = (world.cameraX - x) >> 8, dy = (world.cameraY - y) >> 8, dz = (world.cameraZ - z) >> 8;
  if (dx * dx + dy * dy + dz * dz >= range * range) return null;

  // The next slot, skipping live records that asked to be protected. Having
  // gone all the way round, settle for the protected one with the least life.
  let index = (sim.cursor + 1) % EFFECT.slots;
  let best = index, least = 9999, tries = 0;
  while (tries < EFFECT.slots) {
    const e = sim.effects[index]!;
    if ((e.flags & EFFECT_FLAGS.protect) === 0 || e.life === 0) { best = index; break; }
    if (e.life < least) { least = e.life; best = index; }
    index = (index + 1) % EFFECT.slots;
    tries++;
  }
  sim.cursor = best;

  const e = sim.effects[best]!;
  e.x = x; e.y = y; e.z = z;
  e.vx = idiv(vx, 2); e.vy = idiv(vy, 2); e.vz = idiv(vz, 2);
  e.gravity = idiv(gravity, 4);
  e.floor = null;
  e.pitch = -1;
  e.target = null;
  e.life = template.life * 2;
  e.width = template.width;
  e.height = template.height;
  e.period = template.period * 2;
  e.countdown = e.period;
  e.sprite = template.sprite;
  e.kind = kind;
  e.death = template.death;
  e.mode = template.mode;
  e.frames = template.frames;
  e.frame = 0;
  e.flags = template.flags | EFFECT_FLAGS.drawn;
  e.rotation = rotation & YAW_MASK;
  e.spin = idiv(spin, 2);
  [e.r, e.g, e.b] = template.colour;
  return e;
}

/** Fire an untargeted disk. Facing and elevation are independent:
 * the current player controller has no vertical aiming, so pitch is level.
 * The spawner halves these velocities, as it does for every plain effect.
 */
export function spawnStraightDisk(
  sim: EffectSim, world: EffectWorld,
  origin: { x: number; y: number; z: number },
  yaw: number, pitch = 0,
): Effect | null {
  const flat = cos(pitch);
  return spawnEffect(sim, world, origin.x, origin.y, origin.z,
    idiv((sin(yaw) * flat) >> 14, 3),
    idiv(-sin(pitch), 3),
    idiv((cos(yaw) * flat) >> 14, 3),
    0, 0, 0, EFFECT_KIND.diskStraight);
}

/**
 * `FUN_0040fdf0`: spawn `kind` with a velocity drawn from spawn mode `mode`,
 * whose four packed nibbles say how each component is randomised.
 */
export function spawnChild(
  sim: EffectSim, world: EffectWorld,
  x: number, y: number, z: number, kind: number, mode: number,
): Effect | null {
  const m = sim.modes[mode];
  if (!m) return null;
  const roll = (c: { how: number; value: number }) =>
    (c.how >= 1 && c.how <= 6 ? randomised(c.how, c.value, sim.rand.byte()) : c.value);
  const vx = roll(m.velocity[0]);
  const vy = roll(m.velocity[1]);
  const vz = roll(m.velocity[2]);
  const g = roll(m.gravity);
  return spawnEffect(sim, world, x, y, z, vx, vy, vz, g, m.rotation, m.spin, kind);
}

/** A sound event at a record. Negative numbers are sequences, not events. */
function sound(sim: EffectSim, event: number, e: Effect): void {
  if (event < 0) return;
  sim.sounds.push({ event, x: e.x, y: e.y, z: e.z });
}

/** A screen glow at a record (`FUN_0044f200`), capped per frame by the caller. */
function glow(sim: EffectSim, e: Effect, r: number, g: number, b: number): void {
  if (sim.lights.length >= EFFECT.glows) return;
  sim.lights.push({ x: e.x, y: e.y, z: e.z, r, g, b, glow: true });
}

/** A point light (`FUN_0049ee50`). */
function light(sim: EffectSim, e: Effect, r: number, g: number, b: number): void {
  sim.lights.push({ x: e.x, y: e.y, z: e.z, r, g, b, glow: false });
}

function mark(sim: EffectSim, e: Effect, y: number): void {
  if (sim.marks.length >= EFFECT.groundMarks) return;
  sim.marks.push({ x: e.x, y, z: e.z, size: e.width });
}

/** One tick of every live effect. */
export function stepEffects(sim: EffectSim, world: EffectWorld, dt = 1): void {
  sim.marks.length = 0;
  sim.lights.length = 0;
  sim.hits.length = 0;
  stepEffectGates(sim, dt);

  const finished: Effect[] = [];
  for (const e of sim.effects) {
    if (e.life < 1) continue;

    e.life = Math.max(0, e.life - dt);

    if ((e.flags & EFFECT_FLAGS.homing) !== 0) home(e, world, dt);
    else {
      e.y += e.vy * dt;
      e.vy += e.gravity * dt;
      e.x += e.vx * dt;
      e.z += e.vz * dt;
    }

    if (e.frames > 1) {
      e.countdown -= dt;
      while (e.countdown < 1) {
        e.countdown += e.period || 1;
        e.frame = (e.frame + 1) % e.frames;
      }
    }
    if (e.spin !== 0) e.rotation = (e.rotation + e.spin * dt) & YAW_MASK;

    // The ground test, and the drop shadow that comes with it.
    if ((e.flags & EFFECT_FLAGS.ground) !== 0 && e.life > 0) {
      if (e.vx !== 0 || e.vz !== 0 || e.floor === null) {
        e.floor = world.groundAt(e.x, e.y, e.z);
      }
      if (e.floor !== null) {
        if (e.floor < e.y + e.height * 32) {
          e.life = 0;
          e.y = e.floor - e.height * 32;
        }
        mark(sim, e, e.floor);
      }
    }

    // Out of range, or nothing keeping it alive.
    const dx = (world.cameraX - e.x) >> 8, dy = (world.cameraY - e.y) >> 8;
    const dz = (world.cameraZ - e.z) >> 8;
    if (dx * dx + dy * dy + dz * dz > EFFECT.cullRange * EFFECT.cullRange) {
      e.life = 0;
      e.death = 0;
    }
    if ((e.flags & (EFFECT_FLAGS.keep | EFFECT_FLAGS.drawn)) === 0) e.life = 0;

    const fade = behave(sim, world, e, dt);
    applyFade(sim, e, fade);

    if (e.life === 0) finished.push(e);
  }

  for (const e of finished) {
    const code = e.death;
    e.sprite = 0;
    e.death = 0;
    die(sim, world, e, code);
  }
}

/**
 * The homing move. The yaw turns toward the target at `delta / turn`, the
 * pitch at `/ 0x14`, and it flies at `0x4000 / speed` along them. A missile
 * whose creature has gone dies on the spot.
 */
function home(e: Effect, world: EffectWorld, dt: number): void {
  let speed = 16, turn = 8;
  if (e.period === 0xc4 * 2 || e.period === -0x3c * 2) {
    speed = 8;
    const t = idiv(e.life, 16);
    turn = t * t + 4;
  }
  let tx: number, ty: number, tz: number;
  e.target?.follow();
  if (!e.target) {
    tx = world.playerX; ty = world.playerY - 0x2000; tz = world.playerZ;
  } else {
    if (!e.target.alive) e.life = 1;
    tx = e.target.x; ty = e.target.y; tz = e.target.z;
    const near = e.life < 0x20 ? (e.life & 0xf) : (e.life & 0xf) * 3;
    turn = near + 2;
    speed = 6;
  }
  if (e.life > 0) {
    const want = yawOf(tx - e.x, tz - e.z);
    e.gravity = (e.gravity + idiv(yawDelta(want, e.gravity) * dt, turn)) & YAW_MASK;
    if (e.pitch !== -1) {
      // `FUN_004520d0(horizontal, dy) - 0x400`. Ghidra dropped the first
      // argument — it comes off an FPU square root — and the order matters:
      // taken the other way round the bolt dives straight into the floor
      // instead of levelling out at the target's height.
      const flatTo = Math.round(Math.hypot(tx - e.x, tz - e.z)) >> 5;
      const wantPitch = yawOf(flatTo, (ty - e.y) >> 5);
      e.pitch = (e.pitch + idiv(yawDelta(wantPitch - 0x400, e.pitch) * dt, 0x14)) & YAW_MASK;
    }
  }
  const up = e.pitch === -1 ? 0 : sin(e.pitch);
  const flat = e.pitch === -1 ? 0x4000 : cos(e.pitch);
  e.y += idiv(-up, speed) * dt;
  e.x += idiv((sin(e.gravity) * flat) >> 14, speed) * dt;
  e.z += idiv((cos(e.gravity) * flat) >> 14, speed) * dt;
}

/**
 * The behaviour byte's switch. Returns which fade to run afterwards, 0 for
 * none. Every case is docs/EFFECTS.md's table, in the same order.
 */
function behave(sim: EffectSim, world: EffectWorld, e: Effect, dt: number): number {
  const grow = (by: number) => { e.width += by; e.height = e.width; };
  switch (e.mode) {
    case 1: if (e.floor !== null) mark(sim, e, e.floor); return 0;
    case 2: return 1;
    case 3: return 2;
    case 4:
      if (e.life > 0x10 && sim.gate.four) spawnChild(sim, world, e.x, e.y, e.z, 3, 3);
      return 1;
    case 5: return 3;
    case 6: return 4;
    case 7: glow(sim, e, e.r, e.g, e.b); return 1;
    case 8: {
      const phase = (e.life & 0x1f) * 0x80;
      e.width = (sin(phase & YAW_MASK) >> 10) + 0x78;
      e.height = (cos(phase & YAW_MASK) >> 10) + 0x78;
      if (sim.gate.seven && e.life > 5) {
        const child = spawnChild(sim, world, e.x, e.y, e.z, 0xf, 2);
        if (child) child.spin = (sim.rand.byte() - 0x80) >> 3;
      }
      return 0;
    }
    case 9: grow(2 * dt); return 1;
    case 0xa: e.width = Math.max(0x10, e.width - 4 * dt); e.height = e.width; return 5;
    case 0xb: grow(e.period * dt); return 1;
    case 0xc:
      e.x = world.playerX; e.z = world.playerZ;
      e.y = world.playerY + e.life * -0x22a;
      e.width = Math.max(1, e.width - 8 * dt); e.height = e.width;
      return 1;
    case 0xd:
      e.x = world.playerX; e.z = world.playerZ;
      e.y = world.playerY + (e.life + 0x10) * -400;
      e.width = Math.max(1, e.width - 5 * dt); e.height = e.width;
      return 1;
    case 0xe:
      e.rotation = (sim.rand.byte() << 4) & YAW_MASK;
      glow(sim, e, e.r, e.g, e.b);
      return e.life < 0x20 ? 1 : 6;
    case 0xf: e.width = Math.max(1, e.width - e.period * dt); e.height = e.width; return 1;
    case 0x10:
      if (e.life > 4 && sim.gate.four) spawnChild(sim, world, e.x, e.y, e.z, 0x24, 0xf);
      return 0;
    case 0x11:
      if (e.life > 4) {
        for (let i = 0; i < sim.gate.three; i++) spawnChild(sim, world, e.x, e.y, e.z, 0x27, 2);
      }
      return 0;
    case 0x12:
      if (e.life > 4 && sim.gate.seven) {
        const off = sim.rand.byte() * 2 - 0x100;
        const child = spawnChild(sim, world, e.x + off, e.y + off, e.z + off, 0x2c, 2);
        if (child) child.spin = (sim.rand.byte() - 0x80) >> 1;
      }
      return 0;
    case 0x13: {
      if ((sim.rand.byte() & 7) === 0) {
        e.vx = sim.rand.byte() - 0x80;
        e.vz = sim.rand.byte() - 0x80;
      }
      const phase = (e.life & 0x1f) * 0x80;
      e.width = (sin(phase & YAW_MASK) >> 11) + 0x28;
      e.height = (cos(phase & YAW_MASK) >> 11) + 0x28;
      if (world.waterY !== null && e.y < world.waterY) e.life = 0;
      return 0;
    }
    case 0x14: grow(e.period * dt); return 3;
    case 0x15: {
      // Rides Buzz's wrist, trailing sparks.
      const out = e.period === 0x65 * 2 ? 0x680 : -0x680;
      e.x = world.playerX + (sin((world.playerYaw + out) & YAW_MASK) >> 2);
      e.z = world.playerZ + (cos((world.playerYaw + out) & YAW_MASK) >> 2);
      e.y = world.playerY - 0x400;
      if (e.life > 4) {
        const kind = world.waterY !== null && e.y > world.waterY ? 0x2d : 0x2e;
        const spin = sim.rand.byte() * 8 - 0x400;
        const child = spawnEffect(sim, world, e.x, e.y, e.z,
          idiv(world.playerVx, 2), 0, idiv(world.playerVz, 2), -0x10, 0, spin, kind);
        if (child) child.spin = idiv(spin, 2);
      }
      return 1;
    }
    case 0x16:
      if (e.width < 0x140) { e.width = Math.min(0x140, e.width + 0x20 * dt); e.height = e.width; }
      return 0;
    case 0x17:
      if (e.floor !== null) {
        mark(sim, e, e.floor);
        if (e.floor < e.y + e.height * 32) { e.life = 0; e.y = e.floor - e.height * 32; }
      }
      return 0;
    case 0x18: e.width = Math.max(1, e.width - e.period * dt); return 1;
    case 0x19:
      if (e.floor !== null) {
        mark(sim, e, e.floor);
        if (e.floor < e.y + e.height * 32) {
          e.y = e.floor - e.height * 32;
          if (e.vy > 0) e.vy = idiv(e.vy * -6, 8);
          if (Math.abs(e.vy) < 0x100) e.life = 0;
          sound(sim, 0x1f, e);
        }
      }
      return 0;
    case 0x1a:
      sound(sim, 0x44, e);
      if (e.life > 4) {
        const off = (sim.rand.byte() - 0x80) * 0x20;
        spawnChild(sim, world, e.x + off, e.y + off, e.z + off, 0x40, 2);
      }
      glow(sim, e, e.r, e.g, e.b);
      return 1;
    case 0x1b: {
      const by = e.period * dt;
      e.width = Math.max(1, e.width - by);
      e.height = Math.max(1, e.height - by);
      return 0;
    }
    case 0x1c: return bolt(sim, world, e, dt);
    case 0x1d: return diskHoming(sim, world, e);
    case 0x1e:
      if (e.life > 4) {
        for (let i = 0; i < sim.gate.three; i++) {
          const off = sim.rand.byte() - 0x80;
          spawnEffect(sim, world, e.x + off, e.y + off, e.z + off,
            idiv(e.vx, 3), 0, idiv(e.vz, 3), 0, 0, off, 0x2c);
        }
      }
      return 0;
    case 0x1f: e.width = Math.max(0x10, e.width - 4 * dt); e.height = e.width; return 1;
    case 0x20: {
      const t = sim.counter16 < 8 ? sim.counter16 : 0xf - sim.counter16;
      e.width = t * 8 + 100;
      e.height = e.width;
      if (e.life > 4 && sim.gate.two > 0 && (e.flags & EFFECT_FLAGS.drawn) !== 0) {
        const child = spawnChild(sim, world, e.x, e.y, e.z, 0x4d, 2);
        if (child) child.spin = sim.rand.byte() - 0x80;
      }
      return 0;
    }
    case 0x21:
      e.width = Math.max(1, e.width - idiv(e.period * dt, 2));
      e.height = e.width;
      return 1;
    case 0x22: grow(e.period * dt); return 7;
    case 0x23: {
      const half = e.vy >> 6;
      const flip = (e.rotation & 0x400) !== 0;
      e.width = flip ? 0xfa - half : half + 0xfa;
      e.height = flip ? half + 0xfa : 0xfa - half;
      if (e.floor !== null && e.floor < e.y + e.height * 32) {
        e.y = e.floor - e.height * 32;
        if (e.vy > 0) e.vy = idiv(e.vy * -3, 4);
        sound(sim, 0x71, e);
      }
      if (e.floor !== null) mark(sim, e, e.floor);
      return 0;
    }
    case 0x24: {
      const away = e.spin < 0 ? -1 : 1;
      e.x = world.playerX + away * idiv(cos(world.playerYaw), 10);
      e.z = world.playerZ + away * idiv(sin((world.playerYaw - 0x800) & YAW_MASK), 10);
      e.y = world.playerY + (0x18 - e.life) * 0x120;
      grow(4 * dt);
      return 1;
    }
    case 0x25:
      e.width = Math.max(1, e.width - e.period * dt);
      e.height = idiv(e.width, 2);
      return 1;
    case 0x26:
      if (e.floor !== null && e.floor < e.y + e.height * 32) {
        e.y = e.floor - e.height * 32;
        if (e.vy > 0) e.vy = -e.vy >> 1;
        sound(sim, 0x71, e);
        mark(sim, e, e.floor);
      }
      return 0;
    case 0x27:
      sound(sim, 0x40, e);
      glow(sim, e, e.r, e.g, e.b);
      if (e.life > 4 && sim.gate.four && (e.flags & EFFECT_FLAGS.drawn) !== 0) {
        const child = spawnChild(sim, world, e.x, e.y, e.z, 0x5a, 2);
        if (child) child.spin = sim.rand.byte() - 0x80;
      }
      return 3;
    case 0x28: e.width = Math.max(1, e.width - e.period * dt); e.height = e.width; return 3;
    case 0x29:
      if (e.life > 4 && sim.gate.four && (e.flags & EFFECT_FLAGS.drawn) !== 0) {
        spawnChild(sim, world, e.x, e.y, e.z, 0x62, 2);
      }
      return 0;
    case 0x2a: {
      if (e.vy > 0x180) {
        e.vy = 0x180;
        if (sim.gate.thirtyTwo) {
          e.vx = sim.rand.byte() * 2 - 0x100;
          e.vz = sim.rand.byte() * 2 - 0x100;
        }
      }
      const v = idiv(sin(((e.life & 0x3f) * 0x40) & YAW_MASK), e.period || 1);
      e.width = Math.abs(v);
      return 0;
    }
    case 0x2b: {
      e.rotation = (0x7ff - e.gravity) & YAW_MASK;
      e.floor = world.groundAt(e.x, e.y, e.z);
      if (e.floor !== null) e.y = e.floor - 0x800;
      if (e.life > 4 && sim.gate.two > 0 && sim.gate.four
        && (e.flags & EFFECT_FLAGS.drawn) !== 0) {
        const child = spawnChild(sim, world, e.x, e.y, e.z, 0x6b, 2);
        if (child) child.rotation = (0x7ff - e.gravity) & YAW_MASK;
      }
      return 0;
    }
    case 0x2c: {
      e.floor = world.groundAt(e.x, e.y, e.z);
      if (e.floor !== null && e.y > e.floor + 0x1000) { e.life = 0; return 0; }
      if (e.life > 4 && (e.flags & EFFECT_FLAGS.drawn) !== 0) {
        if (sim.gate.four) {
          const child = spawnChild(sim, world, e.x, e.y, e.z, 0x2c, 4);
          if (child) { child.vx += idiv(e.vx * 2, 3); child.vz += idiv(e.vz * 2, 3); }
        }
        if (sim.gate.six) {
          const child = spawnChild(sim, world, e.x, e.y, e.z, 0x69, 2);
          if (child) child.rotation = e.rotation;
        }
        if (sim.gate.eight) {
          const child = spawnChild(sim, world, e.x, e.y, e.z, 0x6a, 2);
          if (child) child.rotation = (e.rotation + sim.rand.byte() - 0x280) & YAW_MASK;
        }
      }
      return 0;
    }
    case 0x2d:
      e.width = Math.max(1, e.width - e.period * dt);
      e.height = idiv(e.width, 2);
      return 2;
    case 0x2e:
      grow(e.period * dt);
      glow(sim, e, e.b, e.b >> 1, 0);
      return 1;
    case 0x31:
      sound(sim, 0x40, e);
      if (e.life > 4 && sim.gate.two > 0) {
        spawnEffect(sim, world, e.x, e.y, e.z, e.vx, 0, e.vz, 0, 0,
          sim.rand.byte() - 0x80, 0x2e);
      }
      return 0;
    case 0x32:
      if (e.life > 0x3f) {
        const t = 0x52 - e.life;
        const c = sim.templates[e.kind]?.colour ?? [128, 128, 128];
        e.r = idiv(c[0]! * t, 2) >> 3;
        e.g = idiv(c[1]! * t, 2) >> 3;
        e.b = idiv(c[2]! * t, 2) >> 3;
      }
      return 2;
    case 0x33:
      if (e.life > 4 && sim.gate.four) {
        const child = spawnChild(sim, world, e.x, e.y, e.z, e.period >> 1, 2);
        if (child) child.spin = sim.rand.byte() - 0x80;
      }
      return e.period === 0x76 ? 2 : 0;
    case 0x35: {
      const v = idiv(sin((((e.life & 0x3f) * 0x40) & YAW_MASK)), e.period || 1);
      e.width = Math.abs(v);
      if (e.life > 4 && sim.gate.sixteen) {
        const child = spawnChild(sim, world, e.x, e.y, e.z, 0x2e, 2);
        if (child) {
          child.life = 0x30;
          child.width = idiv(0x2000, e.period || 1);
          child.height = child.width;
        }
      }
      return 0;
    }
    case 0x2f: return zurgBall(sim, world, e, dt);
    case 0x30:
      // The same "gone near the target" test as 0x2f, and a trail of 0x6f.
      if (nearZurgTarget(e)) e.life = 0;
      if (e.life > 4 && sim.gate.four) {
        spawnChild(sim, world, e.x - e.vx * dt, e.y, e.z - e.vz * dt, 0x6f, 2);
      }
      return 0;
    case 0x34: {
      // Level 10's bouncer: kept inside a box round the origin, turning back
      // off each wall with a sound (`FUN_00425ad0`).
      const b = ARENA.level10;
      let hit = false;
      if (e.x < b.xMin) { e.vx = Math.abs(e.vx); hit = true; }
      if (e.x > b.xMax) { e.vx = -Math.abs(e.vx); hit = true; }
      if (e.z < b.zMin) { e.vz = Math.abs(e.vz); hit = true; }
      if (e.z > b.zMax) { e.vz = -Math.abs(e.vz); hit = true; }
      if (hit) sound(sim, 0x4a, e);
      return 0;
    }
    default: return 0;
  }
}

/**
 * The two levels whose bosses throw things around an arena, with the
 * arena's edges in game units (`FUN_0042b090`, `FUN_0042b250`,
 * `FUN_00425ad0`). Level 12's ball dies within 1,024 level units of a fixed
 * point, which is where the boss stands.
 */
const ARENA = {
  level12: {
    /** The pit: inside it the ball has a floor at `floorY`, outside it none. */
    pit: { xMin: -0x256d6, xMax: 0xe0aa, zMin: -0x1b3e9, zMax: 0x1b297 },
    floorY: -0x12bd3,
    /** The whole room, whose walls turn the ball back. */
    room: { xMin: -0x29b56, xMax: 0x2a62a, zMin: -0x230e9, zMax: 0x22b97 },
    target: { x: -0xbd7c, z: 0x99 },
    targetRadiusSq: 0x100000,
  },
  level10: { xMin: -0x169eb, xMax: 0x16915, zMin: -0x16cef, zMax: 0x16991 },
} as const;

/** Within 1,024 level units of level 12's boss, in x and z. */
function nearZurgTarget(e: Effect): boolean {
  const t = ARENA.level12.target;
  const dx = (t.x - e.x) >> 5, dz = (t.z - e.z) >> 5;
  return dx * dx + dz * dz < ARENA.level12.targetRadiusSq;
}

/**
 * Mode 0x2f: level 12's bouncing ball. A trail of 0x6e behind it, a floor
 * only inside the pit that it bounces off at seven eighths, the room's four
 * walls that reflect it, and it dies near the boss. Any bounce sounds 0x43.
 */
function zurgBall(sim: EffectSim, world: EffectWorld, e: Effect, dt: number): number {
  const a = ARENA.level12;
  let bounced = false;
  if (e.life > 4 && sim.gate.four) {
    spawnChild(sim, world, e.x - e.vx * dt, e.y, e.z - e.vz * dt, 0x6e, 2);
  }
  const inPit = e.x > a.pit.xMin && e.x < a.pit.xMax && e.z > a.pit.zMin && e.z < a.pit.zMax;
  if (!inPit) {
    e.floor = 400000;
  } else {
    if (e.floor === null) e.floor = a.floorY;
    if (e.y < a.floorY + 1) {
      e.floor = a.floorY;
      mark(sim, e, a.floorY);
    } else if (e.floor === a.floorY) {
      e.y = a.floorY;
      bounced = true;
      e.vy = -Math.abs(idiv(e.vy * 7, 8));
    } else {
      e.vx = -e.vx;
      e.vz = -e.vz;
      bounced = true;
    }
  }
  if (e.x < a.room.xMin) { e.vx = Math.abs(e.vx); bounced = true; }
  if (e.x > a.room.xMax) { e.vx = -Math.abs(e.vx); bounced = true; }
  if (e.z < a.room.zMin) { e.vz = Math.abs(e.vz); bounced = true; }
  if (e.z > a.room.zMax) { e.vz = -Math.abs(e.vz); bounced = true; }
  if (nearZurgTarget(e)) e.life = 0;
  if (bounced) sound(sim, 0x43, e);
  return 0;
}

/** Mode 0x1c: the bouncing spark that also trails. */
function bolt(sim: EffectSim, world: EffectWorld, e: Effect, dt: number): number {
  if (e.period !== -0x3a * 2) {
    e.floor = world.groundAt(e.x, e.y, e.z);
    if (e.floor !== null && e.floor < e.y + e.height * 32) {
      e.y = e.floor - e.height * 32;
      if (e.vy > 0) e.vy = idiv(e.vy * -3, 4);
      if (Math.abs(e.vy) < 0x400) e.life = 0;
      sound(sim, 0x68, e);
    }
  }
  if (sim.gate.seven && e.life > 5 && (e.flags & EFFECT_FLAGS.drawn) !== 0) {
    const child = spawnChild(sim, world, e.x, e.y, e.z, 0xf, 2);
    if (child) child.spin = (sim.rand.byte() - 0x80) >> 3;
  }
  void dt;
  return 0;
}

/**
 * Mode 0x1d: Buzz's disk. Near its creature it either BOUNCES — off one
 * whose placement's vulnerable byte is 4 — or lands damage kind 4 and dies
 * with death code 8.
 */
function diskHoming(sim: EffectSim, world: EffectWorld, e: Effect): number {
  if (sim.gate.eight) sound(sim, 0x55, e);
  const t = e.target;
  if (!t) return 0;
  t.follow();
  const dx = (t.x - e.x) >> 5, dy = (t.y - e.y) >> 5, dz = (t.z - e.z) >> 5;
  if (dx * dx + dy * dy + dz * dz >= 0x4000) return 0;

  if (t.vulnerable === 4) {
    // Disk-proof: the bolt comes off it, straight, and can no longer hurt.
    const away = yawOf(e.x - t.x, e.z - t.z);
    e.flags &= ~(EFFECT_FLAGS.hurts | EFFECT_FLAGS.homing);
    e.vy = -0x400;
    e.gravity = 0x30;
    e.life = 0x32;
    e.mode = 0x1e;
    e.vx = idiv(sin(away), 16);
    e.vz = idiv(cos(away), 16);
    sound(sim, 7, e);
    e.target = null;
    return 0;
  }
  sim.hits.push({ target: t.creature, angle: yawOf(t.x - e.x, t.z - e.z), kind: 4 });
  e.life = 0;
  e.death = 8;
  return 0;
}

/**
 * The fades, run after the mode. Each scales the template colour by how much
 * life is left, over a different window.
 */
function applyFade(sim: EffectSim, e: Effect, which: number): void {
  if (which === 0) return;
  const c = sim.templates[e.kind]?.colour;
  if (!c) return;
  const [tr, tg, tb] = c;
  const ramp = (v: number, t: number, shift: number) => idiv(v * t, 2) >> shift;
  switch (which) {
    case 1:
      if (e.life < 0x20) {
        e.r = ramp(tr!, e.life, 4); e.g = ramp(tg!, e.life, 4); e.b = ramp(tb!, e.life, 4);
      }
      return;
    case 2:
      if (e.life < 0x40) {
        e.r = ramp(tr!, e.life, 5); e.g = ramp(tg!, e.life, 5); e.b = ramp(tb!, e.life, 5);
      }
      return;
    case 3:
      if (e.life < 0x20) {
        e.r = ramp(tr!, e.life, 4);
        if (e.life > 0x10) {
          e.g = ramp(tg!, e.life - 0x10, 3); e.b = ramp(tb!, e.life - 0x10, 3);
        } else { e.g = 0; e.b = 0; }
      }
      return;
    case 4:
      if (e.life < 0x100) {
        e.r = ramp(tr!, e.life, 7); e.g = ramp(tg!, e.life, 7); e.b = ramp(tb!, e.life, 7);
      }
      return;
    case 5:
      if (e.life < 0x20) {
        e.r = e.life < 0x10 ? ramp(tr!, e.life, 4) : 0;
        e.b = e.life < 0xd ? 0 : ramp(tb!, e.life - 0xc, 4);
        e.g = e.life < 0x19 ? 0 : ramp(tg!, e.life - 0x18, 3);
      } else e.r = 0;
      return;
    case 6: {
      const t = (sim.rand.byte() & 0x7f) + 0x80;
      e.r = (tr! * t) >> 8; e.g = (tg! * t) >> 8; e.b = (tb! * t) >> 8;
      return;
    }
    case 7:
      if (e.life < 0x20) {
        e.r = ramp(tr!, e.life, 4); e.g = ramp(tg!, e.life, 4); e.b = ramp(tb!, e.life, 4);
      } else {
        const t = 0x2a - e.life;
        e.r = ramp(tr!, t, 2); e.g = ramp(tg!, t, 2); e.b = ramp(tb!, t, 2);
      }
      return;
    default:
  }
}

/** `FUN_00410b80`: what an effect leaves behind. */
function die(sim: EffectSim, world: EffectWorld, e: Effect, code: number): void {
  if (code < 0) { spawnChild(sim, world, e.x, e.y, e.z, -code, 2); return; }
  const top = e.y + e.height * 32;
  const burst = (kind: number, count: number, mode: number, at = top) => {
    for (let i = 0; i < count; i++) {
      const child = spawnChild(sim, world, e.x, at, e.z, kind, mode);
      if (child) {
        child.period = ((sim.rand.byte() & 3) + 3) * 2;
        child.life = child.period * 5;
      }
    }
  };
  switch (code) {
    case 1: case 2: case 4: {
      // `FUN_00410850`: a spray of sparks, a puff, and a sound.
      const twin = (code & 1) === 0;
      const spark = twin ? 0x1e : 0xd;
      const puff = twin ? 0x38 : 0xe;
      sound(sim, twin ? 0x4a : 100, e);
      burst(spark, 5, 9);
      if ((code & 2) === 0) spawnChild(sim, world, e.x, top, e.z, puff, 2);
      return;
    }
    case 3: case 8: {
      for (let i = 0; i < 5; i++) {
        const child = spawnChild(sim, world, e.x, top, e.z, 0x25, 0x11);
        if (child) child.life = (sim.rand.byte() & 7) * 2 + 0x20;
      }
      if (code === 3) spawnChild(sim, world, e.x, top, e.z, 0x28, 2);
      light(sim, e, 0xa0, 0, 0);
      sound(sim, 0xb, e);
      return;
    }
    case 5:
      for (let i = 0; i < 5; i++) {
        const off = ((sim.rand.byte() & 0x3f) - 0x20) * 0x3c;
        const child = spawnChild(sim, world, e.x + off, e.y + off, e.z + off, 0x29, 0xf);
        if (child) {
          child.spin = sim.rand.byte() - 0x80;
          child.life = (sim.rand.byte() & 0xf) * 2 + 0x18;
        }
      }
      light(sim, e, 0x60, 0x40, 0);
      return;
    case 6:
      for (let i = 0; i < 5; i++) {
        const child = spawnChild(sim, world, e.x, e.y, e.z, 0x3e, 9);
        if (child) {
          child.period = ((sim.rand.byte() & 3) + 3) * 2;
          child.life = child.period * 5;
        }
      }
      return;
    case 7:
      for (let i = 0; i < 3; i++) {
        const child = spawnChild(sim, world, e.x, top, e.z, 0x25, 0x11);
        if (child) child.life = (sim.rand.byte() & 7) * 2 + 0x20;
      }
      sound(sim, 0xb, e);
      return;
    case 9:
      for (let i = 0; i < 3; i++) {
        const child = spawnChild(sim, world, e.x, e.y, e.z, 0x11, 4);
        if (child) {
          child.width = 0xfa; child.height = 0xfa;
          child.spin = sim.rand.byte() - 0x40;
          child.life = (sim.rand.byte() & 7) * 2 + 0x20;
        }
      }
      sound(sim, 0xb, e);
      return;
    case 10: spawnChild(sim, world, e.x, top, e.z, 0x78, 2); return;
    case 11: {
      const child = spawnChild(sim, world, e.x, e.y, e.z, 0x75, 0x1c);
      if (child) child.spin = sim.rand.byte() - 0x80;
      return;
    }
    default:
  }
}

/**
 * `FUN_004100f0`: what a live effect does when it touches Buzz. The SPRITE
 * decides, not the kind, which is how one test covers every level's shots.
 *
 * A spinning Buzz DEFLECTS a missile rather than being hurt by it.
 */
export function touchPlayer(sim: EffectSim, world: EffectWorld): void {
  sim.hurt = null;
  sim.coins = 0;
  let last: Effect | null = null;
  let hurtBy = 0;

  const cx = world.playerX, cy = world.playerY - EFFECT.hitAbove, cz = world.playerZ;
  for (const e of sim.effects) {
    if (e.life < 1 || (e.flags & EFFECT_FLAGS.hurts) === 0) continue;
    const dx = ((cx - e.x) * 0x100) >> 13;
    const dy = ((cy - e.y) * 0x80) >> 13;
    const dz = ((cz - e.z) * 0x100) >> 13;
    const reach = e.width + EFFECT.hitSlack;
    if (dx * dx + dy * dy + dz * dz >= reach * reach) continue;

    // The coin is the one that is collected rather than survived.
    if (e.sprite === 0x10) {
      sim.coins++;
      e.life = 1;
      continue;
    }
    const missile = e.sprite === 4 || e.sprite === 5 || e.sprite === 0x33 || e.sprite === 0x34;
    if (missile && sim.spinning) {
      // Deflected: it can no longer hurt, and comes off him.
      const away = yawOf(e.x - cx, e.z - cz);
      e.flags &= ~(EFFECT_FLAGS.hurts | EFFECT_FLAGS.homing);
      e.vy = -0x400;
      e.gravity = 0x30;
      e.life = 0x32;
      e.target = null;
      e.vx = idiv(sin(away), 16);
      e.vz = idiv(cos(away), 16);
      sound(sim, 7, e);
      continue;
    }
    if (missile || e.sprite === 0x15) { e.life = 1; }
    if (e.sprite !== 0x16) { last = e; hurtBy++; }
  }
  if (hurtBy > 0 && last) sim.hurt = yawOf(cx - last.x, cz - last.z);
}

/** Everything alive, for the drawer. */
export function liveEffects(sim: EffectSim): Effect[] {
  return sim.effects.filter((e) => e.life > 0 && e.sprite !== 0);
}

export { EFFECT_KIND };
