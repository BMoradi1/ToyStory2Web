/**
 * The token tasks: the cast Buzz talks to, and what they want.
 *
 * Ported from the shared helpers every level's tick calls — `FUN_004a1ce0`
 * (Hamm), `FUN_004a1e60` (the hint NPC) and the find-five owner's own two
 * lines — with the slot semantics in docs/LEVELS.md, "The five token slots
 * mean the same thing on every level".
 *
 * Each helper does the same two things: chatter now and then while Buzz is
 * near, and when he actually talks (the creature's `touched` flag), open a
 * dialogue whose last argument is the slot to reveal when the box closes.
 * This module decides that and hands back a request; the caller opens the
 * box and reveals the token, because both of those live above it.
 */

import { CREATURE_FLAGS, CREATURE_HEALTH, type Creature } from './creatures.ts';
import { HAMM_COINS, POTATO_PARTS, TASK_TEXT, type LevelTasks } from './level-data.ts';
import type { RandomStream } from './creatures.ts';
import { cos, sin } from './trig.ts';

/** A dialogue the level wants opened, as `FUN_004027f0` takes it. */
export interface DialogueRequest {
  /** Index into the creature list: who is speaking. */
  creature: number;
  /** The path the camera flies and the two of them stand on. */
  pathTag: number;
  /** Address of the line in toy2.exe. */
  text: number;
  /** 12-bit, or -1 for "face each other along the path". */
  playerYaw: number;
  creatureYaw: number;
  /** The token slot to reveal when the box closes, or -1. */
  slot: number;
}

/** How far the level's race has got (`DAT_0052f2f8`). */
export const enum RaceState {
  /** Not offered yet. */
  Idle = 0,
  /** The challenge has been accepted; waiting for the box to close. */
  Accepted = 1,
  /** Running: laps are being counted. */
  Running = 2,
  /** Over. */
  Done = 3,
}

export interface TaskState {
  /** Bit per slot, the engine's own per-level byte of saved token bits. */
  done: number;
  /** Idle-chatter timers, one per talker. */
  hammChatter: number;
  hintChatter: number;
  /** The hint NPC's rotating hint, or -1 before Buzz first comes near. */
  hintIndex: number;
  /** The boss: 0 not taunted, 1 taunt shown, 2 awake, 3 dead. */
  boss: number;
  /**
   * A WORLD boss (`bossFight`), which is a different thing from the
   * mini-boss above. `phase` is `DAT_0052f9a4`: 0 waiting, 1 the entrance,
   * 2 the fight, 3 dying, 4 over.
   */
  bossPhase: number;
  /** `DAT_0052f9a0`, the lap clock; `DAT_0052f990`, ticks it stays stunned. */
  bossClock: number;
  bossHurt: number;
  /** `DAT_0052f98c`, the health it had last tick. */
  bossHealthWas: number;
  /** `DAT_0052f994`, 0..0x800: how far outside its arena it has drifted. */
  bossRamp: number;
  /** `DAT_0052f9b8`, which way along x it charges; flips every lap. */
  bossSwing: number;
  /** `DAT_0052f9b0` taunt cooldown, `DAT_0052f998` shout cooldown. */
  bossTaunt: number;
  bossShout: number;
  /** `DAT_0052f9b4`, the camera bearing last tick: it taunts when you turn away. */
  bossYaw: number;
  /** `DAT_0052f9a8`, alternating, which drives the flicker while it is hurt. */
  bossFlip: number;
  /**
   * `DAT_0050a1f4`, the camera cut's countdown. The port has no camera cuts
   * yet, so this only holds Buzz still and paces the phases, which is what
   * the fight's own timing hangs off.
   */
  bossCut: number;
  /** Set on the hit that kills it, which is what writes the level's token byte. */
  bossBeaten: boolean;
  /** Set when the fight is over and the level is won (`DAT_00830cc4`). */
  levelWon: boolean;
  /** Counts up once the boss is gone, to the delay before its token. */
  bossGone: number;
  /** The reach-a-box challenge: 0 not offered, 1 accepted, 2 running. */
  reach: number;
  /** The timed fetch run: 0 idle, 1 offered, 2 running. */
  fetch: number;
  /** How many of its two runs have been finished. */
  fetchDone: number;
  /** Its clock, counting down to the floor of 100 that means failure. */
  fetchClock: number;
  /**
   * The engine's 1-in-64 frame divider (`DAT_0052ad63` / `DAT_0052f1cb`).
   * Timed tasks step their clocks on it, so a "second" is 64 ticks.
   */
  slowTick: number;
  /**
   * Mr Potato Head's missing part (`DAT_00830d48`): the level's part number
   * while it is still out there, its negative once Buzz is carrying it, and
   * zero when it has been handed back.
   */
  potatoPart: number;
  /** Power-up bits earned (`DAT_0052f2d8`). */
  powerUps: number;
  potatoChatter: number;
  /** The collect-five challenge: 0 not offered, 1 running, 3 done. */
  challenge: number;
  /** What the item counter read when the challenge was accepted. */
  challengeFrom: number;
  /** The race. */
  race: RaceState;
  laps: number;
  /** The four side bits of the lap box, from last tick. */
  raceQuadrant: number;
  /** The car: which node of its path it is heading for, and its own laps. */
  carNode: number;
  carLaps: number;
  /** How many of a checkpoint race's gates have been passed, in order. */
  checkpoint: number;
  /**
   * Blocks the next outward crossing from counting. It starts set, so the
   * lap you are on when the flag drops does not count, and crossing the line
   * back inward sets it again — which is what stops a player scoring laps by
   * stepping over the line and back.
   */
  raceBlocked: boolean;
}

/**
 * Set the level's starting state: which part Mr Potato Head is missing.
 *
 * `held` is the power-ups the save already carries. The engine tests the
 * level's bit in the table at 0x503a22 before it puts the part in the
 * world, so a power-up already earned means there is no part to find and
 * Mr Potato Head only explains what it does.
 */
export function startLevelTasks(tasks: TaskState, level: number, held = 0): void {
  tasks.powerUps = held;
  const part = POTATO_PARTS[level];
  tasks.potatoPart = part && (held & part.power) === 0 ? part.part : 0;
}

export function createTasks(): TaskState {
  return {
    done: 0, hammChatter: 0, hintChatter: 0, hintIndex: -1,
    boss: 0, bossGone: 0, reach: 0, fetch: 0, fetchDone: 0, fetchClock: 100, slowTick: 0, potatoPart: 0, powerUps: 0, potatoChatter: 0, challenge: 0, challengeFrom: 0,
    bossPhase: 0, bossClock: 0, bossHurt: 0, bossHealthWas: -1, bossRamp: 0, bossSwing: 0,
    bossTaunt: 0, bossShout: 0, bossYaw: 0, bossFlip: 0, bossCut: 0,
    bossBeaten: false, levelWon: false,
    race: RaceState.Idle, laps: 0, raceQuadrant: 0, checkpoint: 0, raceBlocked: true,
    carNode: 0, carLaps: 0,
  };
}

/** Has this slot been earned? */
export function slotDone(tasks: TaskState, slot: number): boolean {
  return (tasks.done & (1 << slot)) !== 0;
}

/** Mark a slot earned, which is what reveals its token. */
export function markSlotDone(tasks: TaskState, slot: number): void {
  tasks.done |= 1 << slot;
}

/** All five earned: the hint NPC then has nothing left to say. */
export function allSlotsDone(tasks: TaskState): boolean {
  return (tasks.done & 0x1f) === 0x1f;
}

/** Was this creature talked to this tick? Clears the flag, as the helpers do. */
function tookTalk(c: Creature): boolean {
  if ((c.flags & CREATURE_FLAGS.touched) === 0) return false;
  c.flags &= ~CREATURE_FLAGS.touched;
  return true;
}

/** The chatter timer the helpers share: `rand * 2 + 0xf0` ticks. */
function chatter(rand: RandomStream): number {
  return rand.byte() * 2 + 0xf0;
}

/**
 * What the boss fight needs from the rest of the world. A superset of the
 * errand levels' needs, kept apart because a boss level uses nothing else.
 */
/** What a level tick can do with the camera cut. */
export interface CutHandle {
  start: (look: { x: number; y: number; z: number }, ticks: number, distance: number) => void;
  ticks: number;
  eye: { x: number; y: number; z: number };
  look: { x: number; y: number; z: number };
}

interface BossWorld {
  x: number; y: number; z: number;
  rand: RandomStream;
  cameraYaw?: number;
  cut?: CutHandle;
  /** Raise a sound event, at a place or flat. */
  sound?: (event: number, at: { x: number; y: number; z: number } | null) => void;
  /** Raise a sequence rather than an event. */
  shout?: (event: number) => void;
  effect?: (x: number, y: number, z: number, kind: number, mode: number, spin?: number) => void;
  groundAt?: (x: number, z: number, y: number) => number | null;
}

/**
 * The world boss (level 6's `FUN_00420060`; docs/LEVELS.md "The world
 * boss"). A boss level's tick is nothing but this.
 *
 * Five phases. It waits until Buzz walks in past `triggerX`, plays an
 * entrance, then flies laps of the arena: for most of each lap it chases him
 * at one height, and for the last third it charges straight along x at
 * another, flipping sides every lap. A hit stuns it and closes its shell
 * (`vulnerable` 4, the trick the tin robot uses too); the hit that takes it
 * under `deathAt` starts the long death and wins the level.
 *
 * `bossCut` stands in for the engine's camera cuts, which are not ported. It
 * still counts down and still holds the phases apart, so the fight keeps its
 * timing; only the camera move is missing.
 */
function stepBossFight(
  tasks: TaskState,
  fight: NonNullable<LevelTasks['bossFight']>,
  creatureAt: (index: number) => Creature | undefined,
  world: BossWorld,
  dt: number,
): void {
  const boss = creatureAt(fight.creature);
  if (!boss) return;
  world.sound?.(fight.sounds.hum, null);
  tasks.bossFlip = (tasks.bossFlip - 1) & 1;

  // --- a hit. The engine watches the health rather than being told about it.
  if (boss.health !== 0 && boss.health !== tasks.bossHealthWas) {
    const first = tasks.bossHealthWas < 0;
    tasks.bossHealthWas = boss.health;
    if (!first) {
      boss.record.vulnerable = 4;
      tasks.bossClock = fight.clock - 1;
      if (boss.health < fight.deathAt) {
        tasks.bossHurt = fight.deathStun;
        // The death is watched from right over the boss, sinking with it.
        world.cut?.start(boss, fight.deathStun, fight.cutDistance);
        if (world.cut) world.cut.eye = { x: boss.x, y: boss.y - fight.deathEyeUp, z: boss.z };
        tasks.bossPhase = 3;
        // This is what writes bit 7 of the level's token byte in the save.
        tasks.bossBeaten = true;
      } else {
        tasks.bossHurt = fight.stun;
        world.cut?.start(boss, fight.stun, fight.cutDistance);
      }
      tasks.bossCut = world.cut?.ticks ?? tasks.bossCut;
    }
  }

  // --- the stun, and the shell opening again when it ends.
  tasks.bossHurt -= dt;
  if (tasks.bossHurt < 0) {
    tasks.bossHurt = 0;
    boss.record.vulnerable = 7;
  } else if (tasks.bossHurt < 0x5a) {
    world.sound?.(fight.sounds.hit, boss);
  }

  // --- how far outside its arena it has drifted, which swings its height.
  const inside = boss.x > fight.arena.xMin && boss.x < fight.arena.xMax
    && boss.z > fight.arena.zMin && boss.z < fight.arena.zMax;
  tasks.bossRamp = Math.max(0, Math.min(0x800, tasks.bossRamp + (inside ? -1 : 1) * dt * 0x80));

  // --- Buzz walking in is what starts it: a cut to the boss, then the eye
  //     pulled well back along x and up, ready to pan through the entrance.
  if (world.x < fight.triggerX && tasks.bossPhase === 0) {
    tasks.bossPhase = 1;
    tasks.bossClock = fight.clock;
    tasks.bossSwing = fight.swing;
    world.cut?.start(boss, fight.clock, fight.cutDistance);
    if (world.cut) {
      world.cut.eye = { x: boss.x - fight.entranceEye.back, y: boss.y - fight.entranceEye.up, z: boss.z };
    }
    tasks.bossCut = world.cut?.ticks ?? fight.clock;
  }

  // --- it notices you turning away from it, and taunts.
  if (tasks.bossPhase > 0 && tasks.bossPhase < 3) {
    if (tasks.bossHurt === 0) world.sound?.(fight.sounds.fly, boss);
    if (tasks.bossTaunt === 0 && dist256(world, boss) < fight.noticeRange) {
      let turned = ((world.cameraYaw ?? 0) - tasks.bossYaw) & 0xfff;
      if (turned > 0x800) turned -= 0x1000;
      if (Math.abs(turned) > 0x40) {
        world.sound?.(fight.sounds.taunt + (world.rand.byte() & 1), boss);
        tasks.bossTaunt = fight.tauntGap;
      }
    } else {
      tasks.bossTaunt = Math.max(0, tasks.bossTaunt - dt);
    }
    tasks.bossYaw = world.cameraYaw ?? tasks.bossYaw;
  }

  // --- the entrance. It flies in along x under the level's own hand, banking
  //     out of a sine sweep, and 30 ticks before the end it is handed to the
  //     creature mover (the script-velocity flag) so the fight can steer it.
  if (tasks.bossPhase === 1) {
    const left = world.cut ? world.cut.ticks : Math.max(0, tasks.bossCut - dt);
    if (left < fight.handOver) boss.flags |= CREATURE_FLAGS.scriptVelocity;
    const sweep = Math.max(0, left - fight.handOver);
    boss.hover = ((cos(sweep * 0x14) >> 3) - 0x800) & 0xfff;
    boss.x -= dt * fight.flyIn;
    // The cut pans: the look follows the boss in, the eye rises through the
    // whole entrance, tracks along x for its first part and along z after.
    if (world.cut) {
      world.cut.look.x = boss.x;
      world.cut.eye.y += dt * fight.entrancePan.rise;
      if (left < fight.entrancePan.turnAt) world.cut.eye.x -= dt * fight.entrancePan.alongX;
      else world.cut.eye.z -= dt * fight.entrancePan.alongZ;
    }
    tasks.bossCut = left;
    if (left === 0) tasks.bossPhase = 2;
  }

  // --- the fight.
  if (tasks.bossPhase === 2) {
    tasks.bossClock -= dt;
    if (tasks.bossClock < 1) {
      tasks.bossClock = fight.lap;
      tasks.bossSwing = -tasks.bossSwing;
    }
    // The height it wants swings with how far out of the arena it has got.
    const lift = cos(tasks.bossRamp) * 3;
    if (tasks.bossClock < fight.chargeUnder) {
      // The charge: straight along x, taking no notice of where Buzz is.
      boss.targetX = tasks.bossSwing;
      boss.targetZ = 0;
      boss.targetY = lift + fight.chargeY + boss.homeY;
    } else {
      boss.targetX = world.x;
      boss.targetZ = world.z;
      boss.targetY = lift + fight.chaseY;
      if (tasks.bossClock < fight.roarOver) {
        world.sound?.(fight.sounds.roar, boss);
        tasks.bossShout -= dt;
        if (tasks.bossShout < 0) {
          tasks.bossShout = fight.shoutGap;
          world.shout?.(fight.sounds.shout);
        }
        // Dust off both feet, thrown where each one meets the ground.
        for (const side of [-fight.foot.angle, fight.foot.angle]) {
          const a = (boss.heading + side) & 0xfff;
          const fx = boss.x + sin(a) * fight.foot.reach;
          const fz = boss.z + cos(a) * fight.foot.reach;
          const fy = world.groundAt?.(fx, fz, boss.y);
          if (fy === null || fy === undefined) continue;
          world.effect?.(fx, fy, fz, 0x7b, 2);
          world.effect?.(fx, fy, fz, 0x7c, 1, world.rand.byte());
        }
      }
    }
  }

  // --- it banks into its turns, and spins while it is stunned. `hover` is
  //     the spare angle the draw code reads (+0x10); the second one the
  //     original rolls while dying (+0x0c) is not modelled here.
  if ((boss.flags & CREATURE_FLAGS.scriptVelocity) !== 0) {
    if (tasks.bossHurt === 0) {
      let turned = (boss.heading - boss.wantYaw) & 0xfff;
      if (turned > 0x800) turned -= 0x1000;
      boss.hover -= (boss.hover - ((turned / 2) | 0)) >> 5;
    } else {
      boss.hover = (boss.hover + dt * 0x40) & 0xfff;
    }
  }

  // --- dying: it sinks, and the level is won when the cut runs out.
  if (tasks.bossPhase === 3) {
    boss.targetY -= dt * 0x280;
    boss.y -= dt * 0x280;
    if (world.cut) world.cut.eye.y -= dt * fight.deathPanUp;
    tasks.bossCut = world.cut ? world.cut.ticks : Math.max(0, tasks.bossCut - dt);
    if (tasks.bossCut === 0) {
      tasks.levelWon = true;
      tasks.bossPhase = 4;
    }
  }
}

/** Steps of 256 game units, the engine's own coarse distance (`FUN_0049f400`). */
function dist256(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  const dx = (a.x - b.x) >> 8, dy = (a.y - b.y) >> 8, dz = (a.z - b.z) >> 8;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Drive the race car along its path (level 1's tick and level 2's, the
 * block after the lap counter; docs/LEVELS.md "How the car drives").
 *
 * Every tick the car's TARGET is the current node. Within 600 level units
 * of it the node is recorded as the car's home and the next one is taken,
 * wrapping into a new lap; after its third lap the car heads for the last
 * node and, once past the finish line, has won: a race still running loses
 * on the spot, and the car's health drops to 1 so it stops being always
 * awake. The creature mover does the driving.
 */
function driveCar(
  tasks: TaskState,
  race: NonNullable<LevelTasks['race']>,
  creatureAt: (index: number) => Creature | undefined,
  world: { pathPoints: (tag: number) => readonly { x: number; y: number; z: number }[] | null; dust?: (x: number, y: number, z: number) => void },
): void {
  const car = creatureAt(race.creature);
  const points = world.pathPoints(race.car.pathTag);
  if (!car || !points || points.length === 0) return;
  const S = 32;
  if (race.car.holdY !== undefined && car.y > race.car.holdY) {
    car.y = race.car.holdY;
    world.dust?.(car.x, race.car.holdY, car.z);
  }
  const node = points[tasks.carNode] ?? points[0]!;
  const dx = node.x - (car.x >> 5), dz = node.z - (car.z >> 5);
  if (dx * dx + dz * dz < 360000) {
    car.homeX = node.x * S;
    car.homeZ = node.z * S;
    if (tasks.carLaps < race.laps) {
      tasks.carNode += 1;
      if (tasks.carNode >= points.length) { tasks.carLaps += 1; tasks.carNode = 0; }
    } else if (car.z > race.car.finishZ) {
      if (tasks.race === RaceState.Running && tasks.laps < race.laps) tasks.race = RaceState.Done;
      car.health = 1;
    }
  }
  const next = points[tasks.carNode] ?? points[0]!;
  car.targetX = next.x * S;
  car.targetZ = next.z * S;
}

/**
 * Run a level's talkers for one tick and return the dialogue to open, if any.
 * `creatureAt` looks a creature up by the index the level's table uses, which
 * is its slot in the placement list.
 */
export function stepTasks(
  tasks: TaskState,
  level: LevelTasks,
  creatureAt: (index: number) => Creature | undefined,
  world: {
    coins: number; found: number; rand: RandomStream; talking: boolean;
    /** Where Buzz is, for the race's lap box and the boss's height band. */
    x: number; y: number; z: number;
    /** The game's level number, for the per-level power-up. */
    level: number;
    /** Category-9 objects collected, for the challenge. */
    items: number;
    /** Bit per token slot already taken, for the timed runs. */
    tokens: number;
    /** `DAT_0052f38e`: most boss taunts will not fire while Buzz is airborne. */
    onGround: boolean;
    /** The level's paths by tag, level units, for the race car. */
    pathPoints: (tag: number) => readonly { x: number; y: number; z: number }[] | null;
    /** A dust puff the car asked for, game units. Only level 2's car does. */
    dust?: (x: number, y: number, z: number) => void;
    /**
     * Which room the game thinks we are in, -1 over a hole. The scripts read
     * two of these and mean different things by them (docs/LEVELS.md
     * "Zones"): `cameraZone` is `DAT_0054dea0`, the zone under the render
     * camera held to the player's neighbourhood, which most levels test;
     * `playerZone` is `DAT_005d2a8c`, Buzz's own, which levels 7, 8, 10, 11
     * and 13 test. src/sim/zones.ts keeps both.
     */
    cameraZone: number;
    playerZone: number;
    /** Which way the camera faces, 12-bit. The boss taunts when you turn away. */
    cameraYaw?: number;
    /** Raise a sound event, at a place or flat. The boss fight is noisy. */
    sound?: (event: number, at: { x: number; y: number; z: number } | null) => void;
    /**
     * Spawn one effect record, game units. The boss throws dust off its feet;
     * src/sim/effects.ts does the work.
     */
    effect?: (x: number, y: number, z: number, kind: number, mode: number, spin?: number) => void;
    /** The ground under a point, game units, or null where there is none. */
    groundAt?: (x: number, z: number, y: number) => number | null;
    /**
     * The camera cut (src/sim/camera-cut.ts): start one, read how long is
     * left, and move its eye and look while it runs, as the boss ticks do.
     */
    cut?: CutHandle;
  },
  dt = 1,
): DialogueRequest | null {
  // The engine's 1-in-64 divider, which is what timed tasks count on.
  tasks.slowTick += dt;
  const slow = tasks.slowTick >= 64;
  if (slow) tasks.slowTick -= 64;

  // --- the timed fetch, offered twice: the token rides the SECOND offer.
  const fetch = level.fetch;
  if (fetch) {
    const giver = creatureAt(fetch.creature);
    let request: DialogueRequest | null = null;
    if (giver && tookTalk(giver)) {
      if (tasks.fetch !== 0) {
        // A run is already going: he only tells Buzz to get on with it.
        request = {
          creature: fetch.creature, pathTag: fetch.pathTag, text: fetch.hurryText,
          playerYaw: -1, creatureYaw: 0, slot: -1,
        };
      } else if (tasks.fetchDone !== 2) {
        const second = tasks.fetchDone !== 0;
        tasks.fetch = 1;
        tasks.fetchClock = second ? fetch.secondClock : fetch.firstClock;
        request = {
          creature: fetch.creature, pathTag: fetch.pathTag,
          text: second ? fetch.againText : fetch.askText,
          playerYaw: -1, creatureYaw: 0,
          // Only the second offer names the token.
          slot: second ? fetch.slot : -1,
        };
      }
    }
    // The clock does not start until the box is out of the way.
    if (tasks.fetch === 1 && !world.talking) tasks.fetch = 2;
    if (tasks.fetch === 2) {
      if (tasks.fetchDone === 0) {
        // First run: done when the chick is gone.
        const watched = creatureAt(fetch.watch);
        if (!watched || watched.type === 0) { tasks.fetchDone = 1; tasks.fetch = 0; }
      } else if ((world.tokens & (1 << fetch.slot)) !== 0) {
        // Second run: done when its token has been taken. The tick reads
        // that from the shared "challenge finished" word at 0x830cf0, which
        // every level's timed task tests the same way.
        tasks.fetchDone = 2;
        tasks.fetch = 0;
      }
      if (tasks.fetch === 2) {
        if (fetch.failZone >= 0 && world.cameraZone === fetch.failZone) tasks.fetchClock = 99;
        else if (slow) tasks.fetchClock -= 1;
        if (tasks.fetchClock < 100) { tasks.fetchClock = 100; tasks.fetch = 0; }
      }
    }
    // The egg is kept awake and drawn for as long as a run is going, and
    // put back to sleep the moment one is not.
    const egg = creatureAt(fetch.watch);
    if (egg) {
      if (tasks.fetch !== 0) egg.flags |= 0x81;
      else egg.flags &= ~0x81;
    }
    if (request) return request;
  }

  // --- beat me to the top: accept, then get into the box.
  const reach = level.reachBox;
  if (reach && !slotDone(tasks, reach.slot)) {
    const c = creatureAt(reach.creature);
    if (tasks.reach === 0) {
      if (c && tookTalk(c)) {
        tasks.reach = 1;
        return {
          creature: reach.creature, pathTag: reach.pathTag, text: reach.text,
          playerYaw: -1, creatureYaw: 0, slot: -1,
        };
      }
    } else if (tasks.reach === 1 && !world.talking) {
      tasks.reach = 2;
    } else if (tasks.reach === 2) {
      const inside = world.x > reach.xMin && world.x < reach.xMax
        && world.z > reach.zMin && world.z < reach.zMax
        && world.y < reach.yMax;
      if (inside) {
        tasks.reach = 3;
        markSlotDone(tasks, reach.slot);
      }
    }
  }

  // --- a slot that is simply offered: the line reveals its token and
  //     reaching it is the task.
  const offer = level.offer;
  if (offer && !slotDone(tasks, offer.slot)) {
    const c = creatureAt(offer.creature);
    if (c && tookTalk(c)) {
      return {
        creature: offer.creature, pathTag: offer.pathTag, text: offer.text,
        playerYaw: -1, creatureYaw: 0, slot: offer.slot,
      };
    }
  }

  // --- the collect-five challenge, where a level has one instead of a race.
  const challenge = level.challenge;
  if (challenge && !slotDone(tasks, challenge.slot)) {
    const c = creatureAt(challenge.creature);
    if (c && tookTalk(c)) {
      if (tasks.challenge === 0) {
        // Accepting it starts the count from wherever it stands.
        tasks.challenge = 1;
        tasks.challengeFrom = world.items;
        return {
          creature: challenge.creature, pathTag: challenge.pathTag, text: challenge.askText,
          playerYaw: -1, creatureYaw: 0, slot: -1,
        };
      }
      const got = world.items - tasks.challengeFrom;
      if (got < challenge.needed) {
        return {
          creature: challenge.creature, pathTag: challenge.pathTag, text: challenge.hurryText,
          playerYaw: -1, creatureYaw: 0, slot: -1,
        };
      }
      tasks.challenge = 3;
      return {
        creature: challenge.creature, pathTag: challenge.pathTag, text: challenge.doneText,
        playerYaw: -1, creatureYaw: 0, slot: challenge.slot,
      };
    }
  }

  // --- Mr Potato Head: his part, and the power-up he gives back for it.
  const potato = level.potato;
  if (potato) {
    const c = creatureAt(potato.creature);
    if (c) {
      if ((c.flags & CREATURE_FLAGS.near) !== 0 && !world.talking) {
        tasks.potatoChatter -= dt;
        if (tasks.potatoChatter < 0) tasks.potatoChatter = chatter(world.rand);
      }
      if (tookTalk(c)) {
        // Carrying it: hand it over and take the power-up.
        // He moves once he has it back, on the levels that give him a
        // second spot.
        const path = tasks.potatoPart > 0 ? potato.pathTag : (potato.pathTagDone ?? potato.pathTag);
        if (tasks.potatoPart < 0) {
          tasks.powerUps |= POTATO_PARTS[world.level]?.power ?? 0;
          tasks.potatoPart = 0;
          return {
            creature: potato.creature, pathTag: path, text: potato.thanksText,
            playerYaw: potato.playerYaw, creatureYaw: potato.creatureYaw, slot: -1,
          };
        }
        return {
          creature: potato.creature, pathTag: path,
          // Still out there, or already done and he explains what it does.
          text: tasks.potatoPart > 0 ? potato.askText : potato.explainText,
          playerYaw: potato.playerYaw, creatureYaw: potato.creatureYaw, slot: -1,
        };
      }
    }
  }

  // --- a world boss owns the whole level.
  if (level.bossFight) {
    stepBossFight(tasks, level.bossFight, creatureAt, world, dt);
    return null;
  }

  // --- the mini-boss.
  const boss = level.boss;
  if (boss && !slotDone(tasks, boss.slot)) {
    const c = creatureAt(boss.creature);
    const taunt = boss.taunt;
    if (c && taunt && tasks.boss < 2) {
      if (tasks.boss === 0) {
        // Every trigger the level names has to hold. Between them the nine
        // levels use a height band, an x/z box, a radius around the boss and
        // the camera's zone; what they have in common is keeping the taunt
        // from firing through a wall or a ceiling.
        const dx = (world.x - c.x) >> 8, dy = (world.y - c.y) >> 8, dz = (world.z - c.z) >> 8;
        const holds = (taunt.grounded !== true || world.onGround)
          && (taunt.yMin === undefined || world.y > taunt.yMin)
          && (taunt.yMax === undefined || world.y < taunt.yMax)
          && (taunt.zone === undefined || world.cameraZone === taunt.zone)
          && (taunt.box === undefined
            || (world.x > taunt.box.xMin && world.x < taunt.box.xMax
              && world.z > taunt.box.zMin && world.z < taunt.box.zMax))
          && (taunt.nearBoss === undefined
            || dx * dx + dy * dy + dz * dz < taunt.nearBoss * taunt.nearBoss);
        if (holds && (c.flags & CREATURE_FLAGS.near) !== 0 && c.animState !== 7) {
          tasks.boss = 1;
          return {
            creature: boss.creature, pathTag: taunt.pathTag, text: taunt.text,
            playerYaw: taunt.playerYaw, creatureYaw: taunt.creatureYaw, slot: -1,
          };
        }
      } else if (!world.talking) {
        // The taunt is over: kick its script out of the idle loop it starts
        // in and let it come after Buzz.
        tasks.boss = 2;
        c.pc = taunt.wakeWord;
        c.wait = 0;
        c.flags |= CREATURE_FLAGS.chase;
      }
    }
    // Gone for good — its type is zeroed when it is removed and does not
    // respawn — so run the level scripts' delay and hand the token over.
    // A boss slot that is not in the level's list at all awards nothing:
    // that would be a token for a fight that never happened.
    if (c && c.type === 0) {
      tasks.bossGone += dt;
      if (tasks.bossGone >= boss.delay) markSlotDone(tasks, boss.slot);
    }
  }

  // --- the race: accept it, then count laps round the box.
  const race = level.race;
  if (race && !slotDone(tasks, race.slot)) {
    if (tasks.race === RaceState.Idle) {
      const car = creatureAt(race.creature);
      if (car && tookTalk(car)) {
        tasks.race = RaceState.Accepted;
        tasks.laps = 0;
        tasks.raceQuadrant = 0;
        tasks.checkpoint = 0;
        tasks.raceBlocked = true;
        // The car is put on script velocity, which is what lets the mover
        // steer it, and made always-awake so it keeps driving out of sight.
        tasks.carNode = 0;
        tasks.carLaps = 0;
        car.flags |= CREATURE_FLAGS.scriptVelocity;
        car.health = CREATURE_HEALTH.alwaysAwake;
        return {
          creature: race.creature, pathTag: race.pathTag, text: race.text,
          playerYaw: 0, creatureYaw: 0, slot: -1,
        };
      }
    } else if (tasks.race === RaceState.Accepted) {
      // The engine waits for the talk box to shut before the flag drops.
      if (!world.talking) tasks.race = RaceState.Running;
    } else if (tasks.race === RaceState.Running && race.style === 'lap') {
      // One bit per side of the box; 0xf is inside it.
      let bits = world.z < race.zMax ? 1 : 0;
      if (world.x > race.xMin) bits |= 2;
      if (world.x < race.xMax) bits |= 4;
      if (world.z > race.zMin) bits |= 8;
      if (bits === 0xe) {
        if (tasks.raceQuadrant === 0xf) {
          if (!tasks.raceBlocked) tasks.laps += 1;
          tasks.raceBlocked = false;
        }
      } else if (bits === 0xf && tasks.raceQuadrant === 0xe) {
        tasks.raceBlocked = true;
      }
      tasks.raceQuadrant = bits;
      if (tasks.laps >= race.laps) {
        tasks.race = RaceState.Done;
        markSlotDone(tasks, race.slot);
      }
    } else if (tasks.race === RaceState.Running && race.style === 'checkpoints') {
      // Each gate is a two-bit quadrant code, and they have to come in the
      // table's order. The first half is measured against one pair of
      // thresholds, the second half against another.
      const half = tasks.checkpoint < race.codes.length / 2 ? race.first : race.second;
      if (tasks.checkpoint < race.codes.length) {
        let code = world.x > half.x ? 1 : 0;
        if (world.z > half.z) code += 2;
        if (code === race.codes[tasks.checkpoint]) tasks.checkpoint += 1;
      }
      if (tasks.checkpoint === race.codes.length && world.z > race.finishZ) {
        tasks.checkpoint = 0;
        tasks.laps += 1;
      }
      if (tasks.laps >= race.laps) {
        tasks.race = RaceState.Done;
        markSlotDone(tasks, race.slot);
      }
    }
  }

  // --- the car itself, from the moment the box has closed until it parks.
  if (race && tasks.race >= RaceState.Running) driveCar(tasks, race, creatureAt, world);

  // --- Hamm: fifty coins for his token.
  const hamm = level.hamm;
  if (hamm) {
    const c = creatureAt(hamm.creature);
    if (c) {
      if (!slotDone(tasks, hamm.slot) && (c.flags & CREATURE_FLAGS.near) !== 0 && !world.talking) {
        tasks.hammChatter -= dt;
        if (tasks.hammChatter < 0) tasks.hammChatter = chatter(world.rand);
      }
      if (tookTalk(c) && !slotDone(tasks, hamm.slot)) {
        const enough = world.coins >= HAMM_COINS;
        return {
          creature: hamm.creature, pathTag: hamm.pathTag,
          text: enough ? TASK_TEXT.hammGive : TASK_TEXT.hammAsk,
          playerYaw: hamm.playerYaw, creatureYaw: hamm.creatureYaw,
          slot: enough ? hamm.slot : -1,
        };
      }
    }
  }

  // --- the find-five owner: their five lost things.
  const five = level.findFive;
  if (five) {
    const c = creatureAt(five.creature);
    if (c && tookTalk(c) && !slotDone(tasks, five.slot)) {
      const complete = world.found >= five.needed;
      return {
        creature: five.creature, pathTag: five.pathTag,
        text: complete ? five.doneText : five.askText,
        playerYaw: -1, creatureYaw: 0,
        slot: complete ? five.slot : -1,
      };
    }
  }

  // --- the hint NPC: what is still to do, one slot at a time.
  const hint = level.hintNpc;
  if (hint) {
    const c = creatureAt(hint.creature);
    if (c) {
      if (tasks.hintIndex === -1 && (c.flags & CREATURE_FLAGS.awake) !== 0) {
        tasks.hintIndex = world.rand.byte() & 3;
      }
      if ((c.flags & CREATURE_FLAGS.near) !== 0 && !world.talking) {
        tasks.hintChatter -= dt;
        if (tasks.hintChatter < 0) tasks.hintChatter = chatter(world.rand);
      }
      if (tookTalk(c)) {
        if (tasks.hintIndex === -1) tasks.hintIndex = 0;
        let text: number = TASK_TEXT.allTokens;
        if (!allSlotsDone(tasks)) {
          // Step past the slots already earned, then take the next hint.
          let guard = 0;
          while (slotDone(tasks, tasks.hintIndex) && guard++ < 8) {
            tasks.hintIndex += 1;
            if (tasks.hintIndex > 4) tasks.hintIndex = 0;
          }
          text = hint.hints[tasks.hintIndex] ?? TASK_TEXT.allTokens;
          tasks.hintIndex += 1;
          if (tasks.hintIndex > 4) tasks.hintIndex = 0;
        }
        return {
          creature: hint.creature, pathTag: hint.pathTag, text,
          playerYaw: -1, creatureYaw: 0, slot: -1,
        };
      }
    }
  }

  return null;
}
