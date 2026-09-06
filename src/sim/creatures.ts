/**
 * Creatures: the entity, the per-tick update and the script interpreter.
 *
 * Ported from `FUN_00406cd0` (construction), `FUN_004086f0` (the tick),
 * `FUN_004076f0` (the update and interpreter) and `FUN_00405c80` (the
 * animation cursor) in toy2.exe. docs/CREATURES.md is the written spec and
 * explains where every field and constant came from; this file is the
 * transcription, so read that first and treat any disagreement as a bug here.
 *
 * Damage and contact are here too, from `FUN_00408a60` and `FUN_00407440`.
 * They need the creature's model: `setCreatureModels` supplies the coarse
 * sphere and the per-state hit ellipsoids read out of its `.all`, and until
 * it is called nothing can be touched.
 *
 * What is NOT here yet: the per-type C handlers (`CREATURE_TYPES[t].handler`),
 * the laser and the dive (kinds 4 and 5 never arise), and the drawn flag —
 * the engine's draw code re-sets it every frame, while here it keeps whatever
 * the placement started it with.
 *
 * Units are the engine's throughout: game units (32 per level unit), +Y down,
 * 12-bit yaw, the sine table scaled to 0x4000 (the movement code shifts it
 * down to 0x1000). `dt` is ticks elapsed, normally 1.
 */

import type { CreaturePlacement } from '../formats/creatures.ts';
import type { HitShape } from '../formats/all.ts';
import { AI_SCRIPTS, ANIM_SCRIPTS, CREATURE_TYPES, DAMAGE_KINDS } from './creature-data.ts';
import { cos, idiv, sin, YAW_MASK, yawOf } from './trig.ts';

/** Entity flags at +0x40. The placement's +0x12 word is the initial value. */
export const CREATURE_FLAGS = {
  /** Kept in the near list however far away it is (the visibility pass sets it). */
  awake: 0x001,
  /** In this tick's near list; cleared and re-set every tick. */
  near: 0x002,
  /** Moving under a script-set velocity, which is also what lets it steer. */
  scriptVelocity: 0x004,
  /** Targets the player while he is inside the home box. */
  chase: 0x008,
  noGravity: 0x010,
  /** Height follows the target rather than the floor; casts a drop shadow. */
  flies: 0x020,
  /** Respawns even in view; with `noGravity`, still checks the ground. */
  respawnInView: 0x040,
  /** Drawn this frame. Contact is gated on it. */
  drawn: 0x080,
  /** Hurts the player on touch. */
  hurts: 0x100,
  /** Talked to or touched. */
  touched: 0x200,
  /** No deceleration this tick; cleared on landing and when shoved. */
  keepMomentum: 0x400,
  /** Has died once. A respawn keeps this bit. */
  diedOnce: 0x800,
  /** Its model is not loaded: never in the near list. */
  noModel: 0x2000,
} as const;

/** Health values the engine treats specially. */
export const CREATURE_HEALTH = {
  /** Cannot hurt the player by touch (the sheep). */
  harmless: 102,
  /** At or above this, damage is not applied. */
  invulnerable: 100,
  /** Set on death. */
  dead: 999,
  /** Always in the near list, whatever the distance. */
  alwaysAwake: 0xca,
} as const;

const INT_MIN = -0x80000000;
/** The ground ray drops this far below the query point (`FUN_00486520`). */
const GROUND_RAY_REACH = 0x10000;
/** The update lifts the position by this much before the ground ray. */
const GROUND_RAY_LIFT = 0x1900;

/**
 * The creature's own copy of its placement. The engine keeps these in one
 * static block and both reads and writes them — `setSpeed`, `setSpeedMax`,
 * `setTurnRate` and `setRecord1a` all write here, and the constructor reads
 * the result — so a respawned creature inherits whatever its script last set.
 * That is why this is a mutable record per slot rather than the parse result.
 */
export interface CreatureRecord {
  slot: number;
  /** Level units, as the file stores them. The constructor shifts left 5. */
  x: number; y: number; z: number;
  type: number;
  script: number;
  turnRate: number;
  facing: number;
  health: number;
  respawn: number;
  /** The entity's initial flags word (placement +0x12). */
  flags: number;
  rangeX: number; rangeZ: number; rangeYaw: number;
  /** Bit 0 spin-vulnerable, bit 1 body attacks; exactly 4 bounces the laser. */
  vulnerable: number;
  accel: number; accelSide: number;
  speedMax: number; speed: number;
}

/** One live creature: the engine's 0x9c-byte entity with its fields named. */
export interface Creature {
  slot: number;
  record: CreatureRecord;
  type: number;
  /** Game units. */
  x: number; y: number; z: number;
  /** 12-bit. */
  heading: number;
  /** The heading it is easing toward. */
  wantYaw: number;
  /** +0x10: a hover offset the per-type handlers ease; read by the draw code. */
  hover: number;
  /** The `.anm` slot the anim opcode selected. */
  animState: number;
  /** 16.16: the whole part is the frame number. */
  frame: number;
  /** INT_MIN when unknown. */
  floorY: number;
  /** Where to fall back to when the ground ray finds nothing. */
  lastFloor: number;
  /** Model-derived, from the `.all` type-9 group's entry; 0 until supplied. */
  offsetX: number; offsetY: number; offsetZ: number; hitRadius: number;
  flags: number;
  bodyRadius: number;
  vx: number; vy: number; vz: number;
  homeX: number; homeY: number; homeZ: number;
  targetX: number; targetY: number; targetZ: number;
  /** Animation rate while grounded (+0x6e) and airborne (+0x6f), signed. */
  animRateGround: number; animRateAir: number;
  /** > 0 counts down to the death effect, < 0 counts up to removal. */
  deathTimer: number;
  /** The frame list being played, and the cursor into it. */
  animScript: readonly number[];
  animIndex: number;
  /** The script runs while this is negative. */
  wait: number;
  /** Ticks until it comes back; 0 = never. */
  respawn: number;
  stun: number;
  health: number;
  /** Word index into `script`. */
  pc: number;
  script: readonly number[];
  /** Free for the per-type handler (+0x8a). */
  timer: number;
  /** The one-bit condition the `test*` opcodes set and `ifSkip` consumes. */
  condition: boolean;
  /** The exe name of the per-type C function, or null. Not called yet. */
  handler: string | null;
  /** One hit ellipsoid per animation state, from the model. Null until loaded. */
  hitShapes: readonly HitShape[] | null;
}

/** What the creature code needs of the world. */
export interface CreatureWorld {
  /**
   * The nearest floor at or below this point, in game units, or null when
   * there is none within `GROUND_RAY_REACH`.
   */
  groundY(x: number, y: number, z: number): number | null;
}

/**
 * The engine's random stream: `data/rand.dat`, 2 KB of bytes read in order
 * and rewound at level start. Everything random in a creature's behaviour
 * comes from here, so the same level plays out the same way every time.
 */
export class RandomStream {
  private readonly bytes: Uint8Array;
  private at = 0;
  constructor(bytes: Uint8Array) {
    if (bytes.length === 0) throw new Error('rand.dat is empty');
    this.bytes = bytes;
  }
  byte(): number {
    const b = this.bytes[this.at]!;
    this.at = (this.at + 1) % this.bytes.length;
    return b;
  }
  rewind(): void { this.at = 0; }
}

/** A sound event a script raised, for the caller to play. */
export interface CreatureSound { event: number; x: number; y: number; z: number }

export interface CreatureSim {
  creatures: Creature[];
  world: CreatureWorld;
  rand: RandomStream;
  /** The game's level number, for the handlers that switch on it. */
  level: number;
  /** Drained by the caller each tick. */
  sounds: CreatureSound[];
  /** Hit sparks a damaging blow asked for, for the caller to draw. */
  sparks: { x: number; y: number; z: number }[];
  /** Bolts a handler fired this tick. The projectile itself is not ported. */
  shots: { x: number; y: number; z: number; heading: number }[];
  /**
   * `DAT_0052b7d8`: how many of the level's five lost things have been
   * brought home. One global for every level, counted by whichever creature
   * type is the collectable one there (docs/LEVELS.md).
   */
  foundCount: number;
  /** The slot killed this tick, whose respawn timer does not start yet. */
  lastKilled: number;
  /** Per-type model data, once supplied. */
  models: ReadonlyMap<number, CreatureModel> | null;
  /**
   * The mini-boss's state. The engine keeps this in its level script's own
   * globals rather than on the entity, and so does the handler here: the
   * health it last saw (`DAT_0052f5a8`), and whether its death has passed the
   * frame that awards the token (`FUN_004a0db0(4, 0)`).
   */
  bossLastHealth: number;
  bossSlotEarned: boolean;
  /** Indices of the creatures updated this tick, in near-list order. */
  near: number[];
}

/** The mutable record for one parsed placement. */
export function recordFromPlacement(p: CreaturePlacement): CreatureRecord {
  return {
    slot: p.slot,
    x: p.x, y: p.y, z: p.z,
    type: p.type, script: p.script,
    turnRate: p.turnRate, facing: p.facing,
    health: p.health, respawn: p.respawn,
    flags: p.flags,
    rangeX: p.rangeX, rangeZ: p.rangeZ, rangeYaw: p.rangeYaw,
    vulnerable: p.vulnerable,
    accel: p.accel, accelSide: p.accelSide,
    speedMax: p.speedMax, speed: p.speed,
  };
}

/**
 * Build the entity for a record (`FUN_00406cd0`). `fromList` is the engine's
 * second argument: 1 for the level's initial build, 0 for a respawn, which
 * keeps the body radius and handler already installed and carries the
 * died-once flag over.
 */
export function buildCreature(record: CreatureRecord, fromList: boolean, previous?: Creature): Creature {
  const x = record.x << 5, y = record.y << 5, z = record.z << 5;
  let flags = record.flags;
  if (!fromList && previous && (previous.flags & CREATURE_FLAGS.diedOnce) !== 0) {
    flags += CREATURE_FLAGS.diedOnce;
  }
  const heading = (record.facing << 4) & YAW_MASK;
  const type = CREATURE_TYPES[record.type];

  return {
    slot: record.slot,
    record,
    type: record.type,
    x, y, z,
    heading,
    wantYaw: heading,
    hover: 0,
    animState: 0,
    frame: 0,
    floorY: INT_MIN,
    lastFloor: y,
    offsetX: previous?.offsetX ?? 0,
    offsetY: previous?.offsetY ?? 0,
    offsetZ: previous?.offsetZ ?? 0,
    hitRadius: previous?.hitRadius ?? 0,
    flags,
    // The switch only runs on the initial build; a respawn keeps what it had.
    bodyRadius: fromList ? (type?.radius ?? 0x500) : (previous?.bodyRadius ?? 0x500),
    vx: 0, vy: 0, vz: 0,
    homeX: x, homeY: y, homeZ: z,
    targetX: x, targetY: y, targetZ: z,
    animRateGround: 0, animRateAir: 0,
    deathTimer: 0,
    animScript: ANIM_SCRIPTS[1]!,
    animIndex: 0,
    wait: 0,
    respawn: record.respawn === 100 ? 0x708 : record.respawn,
    stun: 0,
    health: record.health,
    pc: 0,
    script: AI_SCRIPTS[record.script] ?? AI_SCRIPTS[0]!,
    timer: 0,
    condition: false,
    handler: fromList ? (type?.handler ?? null) : (previous?.handler ?? null),
    hitShapes: previous?.hitShapes ?? null,
  };
}

/** Build the whole cast for a scene. */
export function createCreatureSim(
  placements: readonly CreaturePlacement[],
  world: CreatureWorld,
  rand: RandomStream,
  level: number,
): CreatureSim {
  const creatures = placements.map((p) => buildCreature(recordFromPlacement(p), true));
  // Type 24 (BPLANE) exists only once something spawns it.
  for (const c of creatures) {
    if (c.type === 24) { c.health = 0; c.respawn = 10000; }
  }
  return {
    creatures, world, rand, level,
    sounds: [], sparks: [], shots: [], near: [],
    foundCount: 0, lastKilled: -1, models: null,
    bossLastHealth: -1, bossSlotEarned: false,
  };
}

/** Supply the fields the engine reads out of the creature's model. */
export function setModelFields(
  c: Creature,
  fields: { offsetX: number; offsetY: number; offsetZ: number; hitRadius: number },
): void {
  c.offsetX = fields.offsetX;
  c.offsetY = fields.offsetY;
  c.offsetZ = fields.offsetZ;
  c.hitRadius = fields.hitRadius;
}

/** A ground ray over the parsed collision hull, in the sim's game units. */
export function creatureWorldFromCollision(
  groundBelow: (x: number, y: number, z: number) => number | null,
): CreatureWorld {
  return {
    groundY(x, y, z) {
      const found = groundBelow(x, y, z);
      if (found === null) return null;
      return found - y > GROUND_RAY_REACH ? null : found;
    },
  };
}

// --- the animation cursor ----------------------------------------------------

/**
 * Advance the frame list by one entry (`FUN_00405c80`). `0xff n` is a marker:
 * `n = 1` holds the current frame for ever, otherwise the cursor rewinds `n`
 * bytes. A script whose third byte is 0xff and fourth 0 is a single held frame.
 */
function advanceAnim(c: Creature): void {
  const s = c.animScript;
  const i = c.animIndex;
  if (s[i + 2] === 0xff && s[i + 3] === 0) {
    // A one-frame script: park on it with the fraction saturated.
    c.frame = ((s[i]! * 0x10000) + 0xffff) >>> 0;
    return;
  }
  let next = i + 1;
  c.animIndex = next;
  if (s[next] === 0xff) {
    if (s[next + 1] === 1) {
      c.animIndex = next - 1;
      c.frame = (c.frame | 0xffff) >>> 0;
      next = c.animIndex;
    } else {
      c.animIndex = next - s[next + 1]!;
    }
  }
  c.frame = (((c.frame & 0xffff) >>> 0) + (s[c.animIndex]! * 0x10000)) >>> 0;
}

// --- the script interpreter --------------------------------------------------

/** The jump an opcode has asked for, seen by the vertical step. */
const JUMP_NONE = 0, JUMP_KEEP = 1, JUMP_STOP = 2;

/**
 * Run the script until an opcode blocks, then leave `pc` on it. Returns
 * nothing; everything is written into `c`.
 *
 * Blocking opcodes are `end` (0), `yield` (4), the two jumps (6, 7),
 * `facePlayer` (0x20) and anything unrecognised. The engine detects "this
 * opcode made no progress" by comparing the cursor with where the tick
 * started, and steps over it, which is what makes `wait n; yield` wait.
 */
function runScript(sim: CreatureSim, c: Creature, player: { x: number; y: number; z: number }): void {
  const rec = c.record;
  const start = c.pc;
  const s = c.script;
  const boxSin = sin(rec.rangeYaw * 8) >> 2;
  const boxCos = cos(rec.rangeYaw * 8) >> 2;
  const halfX = rec.rangeX * 0x100;
  const halfZ = rec.rangeZ * 0x100;

  let pc = c.pc;
  for (;;) {
    const op = s[pc];
    let next = pc;
    switch (op) {
      case 1: // wait n
        c.wait = s[pc + 1]!;
        next = pc + 2;
        break;
      case 2: // waitRandom mask, add
        c.wait = ((s[pc + 1]! & sim.rand.byte()) + s[pc + 2]!) << 16 >> 16;
        next = pc + 3;
        break;
      case 3: { // targetRandomDir dist
        const n = s[pc + 1]!;
        let dist = n;
        if (n < 0) {
          const range = rec.rangeZ < rec.rangeX ? rec.rangeZ : rec.rangeX;
          dist = idiv(range * -0x40, n);
        }
        const angle = ((sim.rand.byte() * 0x100 + sim.rand.byte()) & YAW_MASK);
        c.targetX = ((sin(angle - 0x800) * dist) >> 9) + c.homeX;
        c.targetY = c.homeY;
        c.targetZ = ((sin(angle - 0x400) * dist) >> 9) + c.homeZ;
        next = pc + 2;
        break;
      }
      case 5: { // targetRandomInBox margin
        const margin = s[pc + 1]!;
        const inset = margin * 0x20;
        let dx = 0;
        if (halfX >= inset) {
          dx = sim.rand.byte() * rec.rangeX * 2;
          if (dx < inset) dx = inset;
          const far = rec.rangeX * 0x200 - inset;
          if (far < dx) dx = far;
          dx -= halfX;
        }
        let dz = 0;
        if (halfZ >= inset) {
          dz = rec.rangeZ * sim.rand.byte() * 2;
          if (dz < inset) dz = inset;
          const far = rec.rangeZ * 0x200 - inset;
          if (far < dz) dz = far;
          dz -= halfZ;
        }
        c.targetX = ((dx * boxCos + dz * boxSin) >> 12) + c.homeX;
        c.targetY = c.homeY;
        c.targetZ = ((dz * boxCos - dx * boxSin) >> 12) + c.homeZ;
        next = pc + 2;
        break;
      }
      case 8: // ifSkip n
        next = c.condition ? pc + s[pc + 1]! + 1 : pc + 2;
        break;
      case 0xb: // nop
      case 0x13:
        next = pc + 2;
        break;
      case 0xc: // flags and, or
        c.flags = ((c.flags & s[pc + 1]!) | s[pc + 2]!) & 0xffff;
        next = pc + 3;
        break;
      case 0xd: { // anim state, script
        c.animState = s[pc + 1]!;
        const script = ANIM_SCRIPTS[s[pc + 2]!] ?? ANIM_SCRIPTS[1]!;
        c.animScript = script;
        c.animIndex = 0;
        c.frame = (script[0]! * 0x10000) >>> 0;
        next = pc + 3;
        break;
      }
      case 0xe: // testRandom mask
        c.condition = ((s[pc + 1]! & 0xff) & sim.rand.byte()) === 0;
        next = pc + 2;
        break;
      case 0xf: // setSpeed n
        rec.speed = ((s[pc + 1]! & 0xffff) >> 4) & 0xff;
        next = pc + 2;
        break;
      case 0x10: { // testPlayerNear r
        const dx = (c.x - player.x) >> 5, dz = (c.z - player.z) >> 5;
        const r = s[pc + 1]!;
        c.condition = dx * dx + dz * dz < r * r;
        next = pc + 2;
        break;
      }
      case 0x11: { // testPlayerInBox
        const dx = (player.x - c.homeX) >> 5, dz = (player.z - c.homeZ) >> 5;
        const inX = (((dx * boxCos - dz * boxSin) >> 7) + halfX) >>> 0 < (rec.rangeX << 9) >>> 0;
        const inZ = (((dz * boxCos + dx * boxSin) >> 7) + halfZ) >>> 0 < (rec.rangeZ << 9) >>> 0;
        c.condition = inX && inZ;
        next = pc + 1;
        break;
      }
      case 0x12: { // testTargetNear r
        const dx = (c.x - c.targetX) >> 5, dz = (c.z - c.targetZ) >> 5;
        const r = s[pc + 1]!;
        c.condition = dx * dx + dz * dz < r * r;
        next = pc + 2;
        break;
      }
      case 0x14: // setSpeedMax n
        rec.speedMax = s[pc + 1]! & 0xff;
        next = pc + 2;
        break;
      case 0x15: // resetFloor
        c.floorY = INT_MIN;
        next = pc + 1;
        break;
      case 0x16: // colour grounded, airborne
        c.animRateGround = (s[pc + 1]! << 24) >> 24;
        c.animRateAir = (s[pc + 2]! << 24) >> 24;
        next = pc + 3;
        break;
      case 0x17: // sound event
        sim.sounds.push({ event: s[pc + 1]!, x: c.x, y: c.y, z: c.z });
        next = pc + 2;
        break;
      case 0x18: { // velocityToTarget -ticks
        const n = s[pc + 1]!;
        const ticks = -n >> 5;
        c.vx = idiv(c.targetX - c.x, ticks);
        c.vz = idiv(c.targetZ - c.z, ticks);
        c.vy = n;
        c.flags |= CREATURE_FLAGS.scriptVelocity;
        next = pc + 2;
        break;
      }
      case 0x19: { // face target (1) or player (2)
        const which = s[pc + 1]!;
        if (which === 1) {
          c.wantYaw = (yawOf(c.x - c.targetX, c.z - c.targetZ) - 0x800) & YAW_MASK;
        } else if (which === 2) {
          c.wantYaw = (yawOf(c.x - player.x, c.z - player.z) - 0x800) & YAW_MASK;
        }
        next = pc + 2;
        break;
      }
      case 0x1a: // velocity vx, vz
        c.vx = s[pc + 1]!;
        c.vz = s[pc + 2]!;
        next = pc + 3;
        break;
      case 0x1b: // targetPlayer
        c.targetX = player.x;
        if ((c.flags & CREATURE_FLAGS.flies) === 0) c.targetY = player.y;
        c.targetZ = player.z;
        next = pc + 1;
        break;
      case 0x1c: // velocityY n
        c.vy = s[pc + 1]!;
        next = pc + 2;
        break;
      case 0x1d: // setTurnRate n
        rec.turnRate = s[pc + 1]! & 0xff;
        next = pc + 2;
        break;
      case 0x1e: // setRecord1a n
        rec.vulnerable = s[pc + 1]! & 0xff;
        next = pc + 2;
        break;
      case 0x1f: { // targetPastPlayer d
        let angle = yawOf(player.x - c.x, player.z - c.z) & YAW_MASK;
        let d = s[pc + 1]!;
        if (d < 1) {
          angle = (angle + 0x80 + d) & YAW_MASK;
          d = 1;
        }
        // The unshifted 0x4000-scale sine: one unit of `d` is 0x4000 game units.
        c.targetX = sin(angle) * d + c.x;
        c.targetZ = cos(angle) * d + c.z;
        next = pc + 2;
        break;
      }
      case 0x21: // setTimer8a n
        c.timer = s[pc + 1]!;
        next = pc + 2;
        break;
      case 0x22: // testGlobal
        // DAT_0053c620, a timer the player code runs. Never set here yet.
        c.condition = false;
        next = pc + 1;
        break;
      case 0x23: { // targetAwayFromPlayer d
        const angle = yawOf(player.x - c.x, player.z - c.z) & YAW_MASK;
        const d = s[pc + 1]!;
        c.targetX = c.x - sin(angle) * d;
        c.targetZ = c.z - cos(angle) * d;
        next = pc + 2;
        break;
      }
      case -1: // loopBack n, counted from this opcode
        next = pc - s[pc + 1]!;
        break;
      default:
        // 0 end, 4 yield, 6/7 the jumps, 0x20 facePlayer, anything unknown.
        next = pc;
        break;
    }

    if (next === pc) {
      // Blocked. If nothing ran this tick we are parked on it, so step over.
      c.pc = pc === start ? pc + 1 : pc;
      return;
    }
    pc = next;
  }
}

// --- the update --------------------------------------------------------------

/**
 * One creature's tick (`FUN_004076f0`): the twelve steps of docs/CREATURES.md.
 * Returns the bits the per-type handler would be passed — 1 driving,
 * 2 grounded, 4 the animation frame changed.
 */
export function updateCreature(
  sim: CreatureSim,
  c: Creature,
  player: { x: number; y: number; z: number },
  dt = 1,
): number {
  const rec = c.record;
  let bits = 0;
  // The fifth field of the handler's argument block: bit 0 is "the player is
  // inside my home box this tick". The update zeroes it at the top and the
  // chase test ORs it in, and it is what a hover bot fires on.
  let chasing = false;
  let jump = JUMP_NONE;

  const halfX = rec.rangeX * 0x100;
  const halfZ = rec.rangeZ * 0x100;
  const boxSin = sin(rec.rangeYaw * 8) >> 2;
  const boxCos = cos(rec.rangeYaw * 8) >> 2;

  // 1. Stun freezes the accelerations at 0x20.
  let accel = rec.accel << 1;
  let accelSide = rec.accelSide << 1;
  if (c.stun > 0) {
    c.stun -= dt;
    if (c.stun < 0) c.stun = 0;
    accel = 0x20;
    accelSide = 0x20;
  }

  // 2. The script, while the wait timer is negative.
  c.wait -= dt;
  if (c.wait < 0) runScript(sim, c, player);

  // 3. Peek at whatever the cursor now rests on, without running it.
  const pending = c.script[c.pc];
  if (pending === 6) { jump = JUMP_KEEP; c.wait = 20; }
  else if (pending === 7) { jump = JUMP_STOP; c.wait = 20; }
  else if (pending === 0x20) {
    c.wantYaw = (yawOf(c.x - player.x, c.z - player.z) - 0x800) & YAW_MASK;
  }
  let targetX = c.targetX, targetY = c.targetY, targetZ = c.targetZ;
  // A fixed facing overrides the wanted heading outright, every tick.
  if (rec.facing !== 0) c.wantYaw = (rec.facing << 4) & YAW_MASK;

  // 4. Chase: while the player is inside the home box he becomes the target.
  let driving = (c.flags & CREATURE_FLAGS.scriptVelocity) !== 0;
  if ((c.flags & CREATURE_FLAGS.chase) !== 0) {
    const dx = (player.x - c.homeX) >> 5, dz = (player.z - c.homeZ) >> 5;
    const inX = (((dx * boxCos - dz * boxSin) >> 7) + halfX) >>> 0 < (rec.rangeX << 9) >>> 0;
    const inZ = (((dz * boxCos + dx * boxSin) >> 7) + halfZ) >>> 0 < (rec.rangeZ << 9) >>> 0;
    if (inX && inZ) {
      chasing = true;
      let pauseScript = true;
      targetX = player.x;
      targetZ = player.z;
      // Per-type standoff: how far above the player to aim, and how far to keep away.
      let above: number, standoff: number;
      switch (c.type) {
        case 4: case 0x14: above = 0x5000; standoff = 0x4b0; break;
        case 5: above = 0x800; standoff = 0; pauseScript = false; break;
        case 0xf: above = -1; standoff = 0x5dc; pauseScript = false; break;
        case 0x39: above = 0x800; standoff = 2000; break;
        default: above = 0x800; standoff = 0; break;
      }
      // Follow his height only while roughly level with him.
      if (Math.abs(c.y - player.y) < 0x10000) {
        if (above !== -1) targetY = player.y - above;
      } else {
        targetY = c.homeY;
      }
      if (pauseScript) c.wait += dt;
      driving = true;
      if (standoff !== 0) {
        const dxs = (c.x - player.x) >> 5, dzs = (c.z - player.z) >> 5;
        if (dxs * dxs + dzs * dzs < standoff * standoff) {
          // Inside the standoff: ease back out to its edge, a sixteenth a tick.
          const a = yawOf(dxs, dzs) & YAW_MASK;
          c.x -= (c.x - ((sin(a) * standoff) >> 9) - player.x) >> 4;
          c.z -= (c.z - ((cos(a) * standoff) >> 9) - player.z) >> 4;
        }
      }
    }
  }

  // 5. Rotate the velocity into the heading's frame and decay it.
  //    `along` runs down the heading (this is what the scripts drive with);
  //    `across` is the perpendicular, which only velocityToTarget ever sets.
  const h = c.heading;
  let across = idiv(c.vx * (cos(h) >> 2) + c.vz * (sin(-h) >> 2), 0x1000);
  let along = idiv(c.vz * (cos(h) >> 2) - c.vx * (sin(-h) >> 2), 0x1000);
  if ((c.flags & CREATURE_FLAGS.keepMomentum) === 0) {
    const decayA = idiv(dt * accel, 4);
    if (across < 0) { across += decayA; if (across > 0) across = 0; }
    else if (across > 0) { across -= decayA; if (across < 0) across = 0; }
    const decayB = idiv(dt * accelSide, 4);
    if (along < 0) { along += decayB; if (along > 0) along = 0; }
    else if (along > 0) { along -= decayB; if (along < 0) along = 0; }
  }

  // 6. Steer toward the target and push the speed toward the placement's.
  if (driving) {
    if (rec.turnRate !== 0) {
      c.wantYaw = (yawOf(c.x - targetX, c.z - targetZ) - 0x800) & YAW_MASK;
    }
    if (rec.speedMax === 0xff) {
      // Drives backwards.
      if (rec.speed * -8 < along) along += -idiv((accelSide + 0x20) * dt, 4);
    } else if (along < rec.speed * 0x10) {
      along += idiv((rec.speedMax + accelSide) * dt, 4);
    }
    bits |= 1;
  }

  // 7. Turn, the short way round.
  let delta = (c.wantYaw - c.heading) & YAW_MASK;
  if (delta > 0x7ff) delta -= 0x1000;
  c.heading = (c.heading + idiv(rec.turnRate * dt * delta, 128)) & YAW_MASK;

  // 8. Rotate back out and move. A creature with speed 0 never moves.
  c.vx = idiv(along * (sin(h) >> 2) + (cos(h) >> 2) * across, 0x1000);
  c.vz = idiv(along * (cos(h) >> 2) - (sin(h) >> 2) * across, 0x1000);
  if (rec.speed === 0) {
    across = 0; along = 0;
    c.vx = 0; c.vz = 0;
  } else {
    c.x += c.vx * dt;
    c.z += c.vz * dt;
  }

  // 9. Clamp back into the home box: it can never walk off its patch.
  {
    const dx = c.x - c.homeX, dz = c.z - c.homeZ;
    const bx = (dx * boxCos - dz * boxSin) >> 12;
    const bz = (dz * boxCos + dx * boxSin) >> 12;
    const cx = bx > halfX ? halfX : bx < -halfX ? -halfX : bx;
    const cz = bz > halfZ ? halfZ : bz < -halfZ ? -halfZ : bz;
    if (cx !== bx || cz !== bz) {
      c.x = ((cx * boxCos + cz * boxSin) >> 12) + c.homeX;
      c.z = ((cz * boxCos - cx * boxSin) >> 12) + c.homeZ;
    }
  }

  // 10. Vertical: gravity and the floor, or the target's height when flying.
  const startY = c.y;
  let grounded = false;
  if ((c.flags & CREATURE_FLAGS.noGravity) === 0) {
    c.vy += idiv(dt * 0x100, 4);
    if (c.vy > 0x800) c.vy = 0x800;
    let fallen = c.vy * dt + startY;
    if ((c.flags & CREATURE_FLAGS.flies) === 0) {
      const found = sim.world.groundY(c.x, fallen - GROUND_RAY_LIFT, c.z);
      if (found === null) {
        c.y = c.lastFloor;
        fallen = startY;
      } else {
        c.y = found;
        c.lastFloor = found;
      }
    } else {
      c.y = targetY;
    }
    if (fallen > c.y - 0x200) {
      // Within reach of the floor: settle onto it, or finish the jump.
      if (jump === JUMP_NONE) {
        let step = (c.y - fallen) >> 2;
        if (step < -0x400) step = -0x400;
        c.y = dt * step + fallen;
      } else {
        c.wait = 0;
        c.pc += 1;
        if ((c.flags & CREATURE_FLAGS.keepMomentum) !== 0) {
          c.flags &= ~CREATURE_FLAGS.keepMomentum;
          if (jump === JUMP_STOP) {
            c.vx = 0; c.vz = 0; c.vy = 0;
            bits |= 2;
            grounded = true;
          }
        }
      }
      if (!grounded) {
        c.vy = 0;
        bits |= 2;
        grounded = true;
      }
    } else {
      c.y = fallen;
    }
  } else if ((c.flags & CREATURE_FLAGS.flies) === 0 || (c.flags & CREATURE_FLAGS.respawnInView) !== 0) {
    // Hovers: eases toward the target's height, but never below the floor.
    const eased = startY + idiv((targetY - startY) * dt, 64);
    const found = sim.world.groundY(c.x, c.y - GROUND_RAY_LIFT, c.z);
    c.y = found === null ? eased : found;
    if (eased < c.y) {
      c.y = eased;
    } else {
      let step = (c.y - eased) >> 2;
      if (step < -0x400) step = -0x400;
      c.y = dt * step + eased;
    }
  } else {
    c.y = targetY;
  }

  // 11. Animation: a fixed rate, or one that follows the legs.
  const rate = (bits & 2) !== 0 ? c.animRateGround : c.animRateAir;
  let step = rate < 0 ? rate * -0x200 : idiv(along * (rate & 0xff), 2);
  if (step > 0) {
    step *= dt;
    if (step > 0x10000) {
      let whole = (step - 1) >>> 16;
      step -= whole * 0x10000;
      while (whole-- > 0) { bits |= 4; advanceAnim(c); }
    }
    const before = c.frame;
    c.frame = (before + step) >>> 0;
    if (((c.frame ^ before) & 0xffff0000) !== 0) { bits |= 4; advanceAnim(c); }
  }

  // 12. The per-type C handler, if this type has one.
  const handler = c.handler ? CREATURE_HANDLERS[c.handler] : undefined;
  if (handler) handler(sim, c, { bits, chasing, fwd: across, side: along, dt });
  return bits;
}

// --- the per-type C handlers -------------------------------------------------

/**
 * What the update hands a handler. The engine passes a small stack struct:
 * the entity, `bits`, this `chasing` word, and the two speed components.
 * `chasing` sits at +6 and is easy to miss — both builds read it, and the
 * update writes it at the top and ORs bit 0 in from the chase test.
 */
export interface HandlerArgs {
  /** 1 driving, 2 grounded, 4 the animation frame changed. */
  bits: number;
  /** The player is inside this creature's home box. */
  chasing: boolean;
  /** Across the heading; only `velocityToTarget` sets it. */
  fwd: number;
  /** Along the heading: what the scripts drive with. */
  side: number;
  /** Ticks elapsed, normally 1. The engine's handlers scale by it. */
  dt: number;
}

type CreatureHandler = (sim: CreatureSim, c: Creature, args: HandlerArgs) => void;

/**
 * The find-five collectable: the sheep, the troops, the ducklings and the
 * rest. Ten types have this handler, one per level, and they are the same
 * function with different sound events (`FUN_00416a60`, `FUN_00418610`,
 * `FUN_0041bb80` and so on).
 *
 * It chirps on a timer while it is alive, and touching it counts it toward
 * the level's find-five task and takes it away. The puff of smoke it leaves
 * (`FUN_00410410`) needs the effect system and is not ported.
 *
 * The harmless health, 102, is what marks one as still to be collected: the
 * handlers all check it before counting.
 */
function collectable(sim: CreatureSim, c: Creature, args: HandlerArgs): void {
  c.timer -= args.dt;
  if (c.timer < 1 && c.health === CREATURE_HEALTH.harmless) {
    c.timer = (sim.rand.byte() & 0xff7f) + 0x5a;
    sim.sounds.push({ event: 0x6b, x: c.x, y: c.y, z: c.z });
  }
  if ((c.flags & CREATURE_FLAGS.touched) === 0) return;
  if (c.health !== CREATURE_HEALTH.harmless) return;
  sim.foundCount++;
  sim.sounds.push({ event: 0x6c, x: c.x, y: c.y, z: c.z });
  killCreature(c, 2);
}

/**
 * The hover bot (`FUN_00406220`). It hums, eases its hover toward its own
 * speed, and while the player is in its box runs a 0x168-tick cycle: open at
 * 200, fire at 0xb6 and 0xa6, close at 0x88, then turn a half-quarter left or
 * right and drift off again. Out of the box it closes up and resets.
 */
function hoverBot(sim: CreatureSim, c: Creature, args: HandlerArgs): void {
  const lean = args.fwd > 0x100 ? 0x100 : args.fwd < -0x100 ? -0x100 : args.fwd;
  c.hover -= idiv((c.hover + lean) * args.dt, 16);
  if (c.deathTimer >= 0) sim.sounds.push({ event: 0x2c, x: c.x, y: c.y, z: c.z });

  const setAnim = (state: number, script: number) => {
    c.animState = state;
    c.animScript = ANIM_SCRIPTS[script]!;
    c.animIndex = 0;
    c.frame = (c.animScript[0]! * 0x10000) >>> 0;
  };

  if (!args.chasing) {
    if (c.animState === 1) setAnim(0, 7);
    c.timer = 0x104;
    return;
  }

  const before = c.timer;
  c.timer -= args.dt;
  if (c.timer < 0) {
    // Cycle over: pick a new drift, a half-quarter turn either side.
    c.timer = 0x168;
    const turn = sim.rand.byte() < 0x80 ? -0x200 : 0x200;
    const a = (c.heading + turn) & YAW_MASK;
    c.vx = sin(a) >> 4;
    c.vz = cos(a) >> 4;
    return;
  }
  const crossed = (at: number) => before > at && c.timer <= at;
  if (crossed(200)) setAnim(1, 8);
  if (crossed(0xb6) || crossed(0xa6)) {
    // The bolt itself (`FUN_0040fae0` kind 0x26) is not ported.
    sim.shots.push({ x: c.x, y: c.y, z: c.z, heading: c.heading });
    sim.sounds.push({ event: 0xd, x: c.x, y: c.y, z: c.z });
  }
  if (crossed(0x88)) setAnim(0, 7);
}

/**
 * The tin robot, level 1's mini-boss (`FUN_00416ab0`).
 *
 * Three things matter and are ported. Its shell bounces attacks except in
 * the two animation states where it is open, which is the placement's
 * `vulnerable` byte being rewritten every tick. Losing health jumps its
 * script to one of two entry points the script itself provides — word 90 for
 * a hit, word 101 for dying. And once the death animation passes frame
 * twelve, the boss token is earned.
 *
 * Not ported: the taunt dialogue it opens when Buzz reaches its platform,
 * its hover wobble, and the sparks and explosion it throws off, which need
 * the effect system (NEXT_SESSION.txt).
 */
function tinRobot(sim: CreatureSim, c: Creature): void {
  const rec = c.record;
  // Its top speed is tied to what is left of its health.
  rec.speedMax = ((c.health + 14) * 12) & 0xff;

  // Open to attack only in the states where it has committed to a move.
  rec.vulnerable = c.animState === 3 || c.animState === 5 ? 7 : 4;

  if (sim.bossLastHealth === -1) sim.bossLastHealth = c.health;
  if (c.health !== sim.bossLastHealth) {
    if (c.health < 10) {
      // Dying: the script's own death entry, and the shell closes again.
      c.pc = 101;
      rec.vulnerable = 4;
    } else {
      c.pc = 90;
    }
    c.wait = 0;
    sim.bossLastHealth = c.health;
  }

  // The token is awarded partway through the death animation, not at the
  // moment the last hit lands.
  if (c.animState === 7 && (c.frame >>> 16) > 12) sim.bossSlotEarned = true;
}

/**
 * The handlers that are ported, by the name `CREATURE_TYPES` gives them.
 * The rest are per-level work: the tin robot's (`FUN_00416ab0`) drives level
 * 1's boss state and its token reveal, and the R.C. car's is the level's own
 * race, so both belong with the level script port rather than here.
 */
export const CREATURE_HANDLERS: Record<string, CreatureHandler> = {
  // The ten find-five collectables, one per level.
  FUN_00416a60: collectable,
  FUN_00418610: collectable,
  FUN_0041bb80: collectable,
  FUN_0041dec0: collectable,
  FUN_00420ed0: collectable,
  FUN_00422c70: collectable,
  FUN_004259b0: collectable,
  FUN_00428650: collectable,
  FUN_0042c150: collectable,
  FUN_0042d620: collectable,
  LAB_00406220: hoverBot,
  FUN_00416ab0: tinRobot,
};

/**
 * The whole cast for one tick (`FUN_004086f0`): respawn timers, the wake
 * test, the near list, then an update and the death timers for each.
 *
 * `focus` is the engine's smoothed follow point (`DAT_0052adc0`); passing the
 * player position is the small simplification noted in docs/CREATURES.md.
 */
export function stepCreatures(
  sim: CreatureSim,
  player: { x: number; y: number; z: number },
  dt = 1,
  focus: { x: number; y: number; z: number } = player,
): void {
  sim.sounds.length = 0;
  sim.sparks.length = 0;
  sim.shots.length = 0;
  const near: number[] = [];
  const distances: number[] = [];

  for (let i = 0; i < sim.creatures.length; i++) {
    const c = sim.creatures[i]!;
    c.flags &= ~CREATURE_FLAGS.near;
    if (c.type <= 0) continue;

    if (c.health < 1) {
      // Dormant: count the respawn down, and rebuild once it runs out.
      if (c.respawn === 0) {
        // The original waits until it is off screen unless flag 0x40 is set.
        sim.creatures[i] = buildCreature(c.record, false, c);
      } else if (c.respawn < 5000 && c.slot !== sim.lastKilled) {
        c.respawn -= dt;
        if (c.respawn < 0) c.respawn = 0;
      }
      continue;
    }

    const wake = ((c.bodyRadius * 0x16a) >> 9) + (c.hitRadius >> 3);
    const dx = (focus.x - c.offsetX - c.x) >> 8;
    const dy = (focus.y - c.offsetY - c.y) >> 8;
    const dz = (focus.z - c.offsetZ - c.z) >> 8;
    const d2 = sim.level === 6 || c.health === CREATURE_HEALTH.alwaysAwake
      ? 10
      : dx * dx + dy * dy + dz * dz;
    if (d2 < wake * wake) {
      near.push(i);
      distances.push(d2);
    }
  }

  // The tighter second pass: anything not explicitly awake and beyond this
  // radius drops out, as does anything whose model is missing.
  sim.near = [];
  for (let k = 0; k < near.length; k++) {
    const c = sim.creatures[near[k]!]!;
    const reach = (c.hitRadius >> 3) + 400;
    if (((c.flags & CREATURE_FLAGS.awake) === 0 && reach * reach <= distances[k]!)
      || (c.flags & CREATURE_FLAGS.noModel) !== 0) continue;
    c.flags |= CREATURE_FLAGS.near;
    sim.near.push(near[k]!);
  }

  for (const i of sim.near) {
    const c = sim.creatures[i]!;
    updateCreature(sim, c, player, dt);
    if (c.deathTimer > 0) {
      c.deathTimer -= dt;
      if (c.deathTimer <= 0) { c.deathTimer = 0; killCreature(c, 1); }
    } else if (c.deathTimer < 0) {
      c.deathTimer += dt;
      if (c.deathTimer >= 0) { c.deathTimer = 0; killCreature(c, 2); }
    }
  }
}

/**
 * `FUN_00405d20`: `what & 1` is the death effect, `what & 2` the removal.
 * The particle bursts and per-type death animations are not ported; the state
 * changes are.
 */
export function killCreature(c: Creature, what: number): void {
  if ((what & 1) !== 0) {
    if ((c.flags & CREATURE_FLAGS.diedOnce) === 0) {
      c.flags |= CREATURE_FLAGS.diedOnce;
      c.animRateGround = 0xe0;
      c.animRateAir = 0xe0;
      c.vx = 0; c.vy = -0x400; c.vz = 0;
    }
    // Most types are removed on the next tick; a few play a death animation.
    c.deathTimer = -1;
  }
  if ((what & 2) !== 0) {
    if (c.respawn === 0) c.type = 0;
    c.flags &= ~(CREATURE_FLAGS.awake | CREATURE_FLAGS.near);
    c.health = 0;
  }
}

// --- damage and contact ------------------------------------------------------

/**
 * The model data the creature code reads out of a type's `.all`: the coarse
 * sphere from the type-9 group's entry, and one hit ellipsoid per animation
 * state from its payload (docs/CREATURES.md, "Where the model-derived fields
 * come from").
 */
export interface CreatureModel {
  offsetX: number; offsetY: number; offsetZ: number; hitRadius: number;
  shapes: readonly HitShape[];
}

/**
 * Give every creature of a type its model numbers. A type with no model gets
 * flag 0x2000, which is exactly what the engine's visibility pass does, and
 * keeps it out of the near list so it is never updated or touched.
 */
export function setCreatureModels(sim: CreatureSim, models: ReadonlyMap<number, CreatureModel>): void {
  for (const c of sim.creatures) {
    const model = models.get(c.type);
    if (!model) { c.flags |= CREATURE_FLAGS.noModel; continue; }
    c.offsetX = model.offsetX;
    c.offsetY = model.offsetY;
    c.offsetZ = model.offsetZ;
    c.hitRadius = model.hitRadius;
    c.hitShapes = model.shapes;
    c.flags &= ~CREATURE_FLAGS.noModel;
  }
  sim.models = models;
}

/** Damage kinds, as `FUN_00408a60`'s table is indexed. */
export const DAMAGE = {
  /** A plain touch: shove only. */
  touch: 0,
  /** Running into a spinning Buzz. */
  spinBody: 1,
  spinSweep: 2,
  chargedSpinSweep: 3,
  laser: 4,
  dive: 5,
  /** What the level code uses to kill something outright. */
  instant: 6,
} as const;

/**
 * Hurt one creature (`FUN_00408a60`). `angle` is the direction to shove it in,
 * 12-bit; `kind` indexes `DAMAGE_KINDS`.
 *
 * Mode 2 (the spin sweep) only lands when the placement's `vulnerable` bit 0
 * is set, which is how the data marks what a spin can hurt. A creature whose
 * `accelSide` is 0xff is never shoved, and level 6 shoves nothing.
 */
export function damageCreature(sim: CreatureSim, c: Creature, angle: number, kind: number): void {
  const row = DAMAGE_KINDS[kind];
  if (!row) return;
  if (row.mode === 2 && (c.record.vulnerable & 1) === 0) return;

  sim.lastKilled = -1;
  if (c.record.accelSide !== 0xff && sim.level !== 6) {
    c.vx = idiv(sin(angle), 32);
    c.vz = idiv(cos(angle), 32);
    c.flags &= ~CREATURE_FLAGS.keepMomentum;
  }
  if (c.stun !== 0) return;

  c.stun = row.stun;
  if (row.mode === 0) return;
  if (row.mode === 1) sim.sparks.push({ x: c.x, y: c.y, z: c.z });
  if (c.health < CREATURE_HEALTH.invulnerable) {
    c.health -= row.damage;
    sim.sounds.push({ event: 9, x: c.x, y: c.y, z: c.z });
  }
  if (c.health < 1) {
    // Dying: keep only the flags that survive, and run the "show, yield, loop"
    // script while the death timer plays out.
    c.flags &= 0xfe63;
    c.health = CREATURE_HEALTH.dead;
    c.wait = 0;
    c.script = AI_SCRIPTS[2]!;
    c.pc = 0;
    sim.lastKilled = c.slot;
    killCreature(c, 1);
  }
}

/** What Buzz is doing that a creature can run into, from `FUN_00407440`. */
export interface PlayerAttack {
  /** A `DAMAGE` kind, or 0 when he is not attacking. */
  kind: number;
  /** How far the contact test reaches: 150 idle, 400 while attacking. */
  reach: number;
}

/**
 * Read the attack out of the player's state. The engine tests its own globals:
 * the spin timer past 20 of its 48 ticks, or the charged spin still in its
 * damaging phase. The dive is not ported, so kind 5 never appears yet.
 */
export function attackFromPlayer(p: { spin: number; spinCharge: number }): PlayerAttack {
  if (p.spin > 20 || p.spinCharge < -119) return { kind: DAMAGE.spinBody, reach: 400 };
  return { kind: 0, reach: 150 };
}

/** One creature touching Buzz this tick. */
export interface CreatureContact {
  /** Index into `sim.creatures`. */
  index: number;
  /** Direction from the creature to the player, 12-bit. */
  angle: number;
  /** Bit 1: push the player away. Bit 2: hurt him as well. */
  reaction: number;
}

/**
 * Test the near list against Buzz (`FUN_00407440`) and apply what happens to
 * the creatures. Returns what should happen to the player, for the caller to
 * apply — this module does not reach into the player's state.
 *
 * Two tests in sequence: a sphere of `hitRadius + reach` about the creature's
 * centre offset against Buzz's chest, then the ellipsoid for the creature's
 * current animation state, turned by its heading and scaled per axis. Only a
 * creature the draw code has flagged (0x080) can be touched at all.
 */
export function contactCreatures(
  sim: CreatureSim,
  player: { x: number; y: number; z: number },
  attack: PlayerAttack,
): CreatureContact[] {
  const chestY = player.y - 0x1cc0;
  const out: CreatureContact[] = [];

  for (const index of sim.near) {
    const c = sim.creatures[index]!;
    if (c.stun < 0) continue;

    const dx = (c.offsetX - player.x + c.x) >> 5;
    const dy = (c.offsetY - chestY + c.y) >> 5;
    const dz = (c.offsetZ - player.z + c.z) >> 5;
    const coarse = c.hitRadius + attack.reach;
    if (dx * dx + dy * dy + dz * dz >= coarse * coarse) continue;

    const shape = c.hitShapes?.[c.animState];
    if (!shape) continue;
    // The ellipsoid is stored in the creature's own frame, so bring the
    // player into it: turn by the heading, then scale each axis by its own
    // factor (0x2000 is 1.0 once the shift below is taken into account).
    const s = sin(c.heading - 0x800) >> 2;
    const k = sin(c.heading - 0x400) >> 2;
    const px = ((shape.offset.x * k + shape.offset.z * s) >> 12) - player.x + c.x;
    const pz = ((shape.offset.z * k - shape.offset.x * s) >> 12) - player.z + c.z;
    const ex = (((k * pz - s * px) >> 12) * shape.scale.z) >> 13;
    const ez = (((s * pz + k * px) >> 12) * shape.scale.x) >> 13;
    const ey = ((shape.offset.y - chestY + c.y) * shape.scale.y) >> 13;
    const reach = shape.radius + attack.reach;
    if (ex * ex + ez * ez + ey * ey >= reach * reach) continue;
    if ((c.flags & CREATURE_FLAGS.drawn) === 0) continue;

    const angle = yawOf(player.x - c.x, player.z - c.z) & YAW_MASK;
    c.flags |= CREATURE_FLAGS.touched;

    // The attack only counts if the creature is open to body attacks, and a
    // dive only counts when Buzz comes down on it from above.
    let kind = attack.kind;
    if (kind === 0 || (c.record.vulnerable & 2) === 0 || (kind === DAMAGE.dive && ey < 0)) kind = 0;

    // What Buzz gets back: pushed, and hurt too when the creature hurts on
    // touch and he was not the one attacking. The harmless never do either.
    let reaction: number;
    if ((c.flags & CREATURE_FLAGS.hurts) === 0 || attack.kind !== 0) {
      reaction = c.health === CREATURE_HEALTH.harmless || kind !== 0 ? 0 : 1;
    } else {
      reaction = 3;
    }

    damageCreature(sim, c, (angle + 0x800) & YAW_MASK, kind);
    out.push({ index, angle, reaction });
  }
  return out;
}
