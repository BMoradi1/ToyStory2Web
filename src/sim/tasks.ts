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

import { CREATURE_FLAGS, type Creature } from './creatures.ts';
import { HAMM_COINS, TASK_TEXT, type LevelTasks } from './level-data.ts';
import type { RandomStream } from './creatures.ts';

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
  /** The race. */
  race: RaceState;
  laps: number;
  /** The four side bits of the lap box, from last tick. */
  raceQuadrant: number;
  /**
   * Blocks the next outward crossing from counting. It starts set, so the
   * lap you are on when the flag drops does not count, and crossing the line
   * back inward sets it again — which is what stops a player scoring laps by
   * stepping over the line and back.
   */
  raceBlocked: boolean;
}

export function createTasks(): TaskState {
  return {
    done: 0, hammChatter: 0, hintChatter: 0, hintIndex: -1,
    boss: 0, race: RaceState.Idle, laps: 0, raceQuadrant: 0, raceBlocked: true,
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
  },
  dt = 1,
): DialogueRequest | null {
  // --- the mini-boss: taunt, then wake it up.
  const boss = level.boss;
  if (boss && tasks.boss < 2) {
    const c = creatureAt(boss.creature);
    if (c) {
      if (tasks.boss === 0) {
        // Its own handler decides it is being looked at; the height band is
        // what keeps it from taunting through the ceiling.
        const inBand = world.y > boss.yMin && world.y < boss.yMax;
        if (inBand && (c.flags & CREATURE_FLAGS.near) !== 0 && c.animState !== 7) {
          tasks.boss = 1;
          return {
            creature: boss.creature, pathTag: boss.pathTag, text: boss.text,
            playerYaw: boss.playerYaw, creatureYaw: boss.creatureYaw, slot: -1,
          };
        }
      } else if (!world.talking) {
        // The taunt is over: kick its script out of the idle loop it starts
        // in and let it come after Buzz.
        tasks.boss = 2;
        c.pc = boss.wakeWord;
        c.wait = 0;
        c.flags |= CREATURE_FLAGS.chase;
      }
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
        tasks.raceBlocked = true;
        return {
          creature: race.creature, pathTag: race.pathTag, text: race.text,
          playerYaw: 0, creatureYaw: 0, slot: -1,
        };
      }
    } else if (tasks.race === RaceState.Accepted) {
      // The engine waits for the talk box to shut before the flag drops.
      if (!world.talking) tasks.race = RaceState.Running;
    } else if (tasks.race === RaceState.Running) {
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
    }
  }

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
