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
import { HAMM_COINS, POTATO_PARTS, TASK_TEXT, type LevelTasks } from './level-data.ts';
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
  /** Counts up once the boss is gone, to the delay before its token. */
  bossGone: number;
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

/** Set the level's starting state: which part Mr Potato Head is missing. */
export function startLevelTasks(tasks: TaskState, level: number): void {
  tasks.potatoPart = POTATO_PARTS[level]?.part ?? 0;
}

export function createTasks(): TaskState {
  return {
    done: 0, hammChatter: 0, hintChatter: 0, hintIndex: -1,
    boss: 0, bossGone: 0, potatoPart: 0, powerUps: 0, potatoChatter: 0, challenge: 0, challengeFrom: 0,
    race: RaceState.Idle, laps: 0, raceQuadrant: 0, checkpoint: 0, raceBlocked: true,
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
    /** The game's level number, for the per-level power-up. */
    level: number;
    /** Category-9 objects collected, for the challenge. */
    items: number;
  },
  dt = 1,
): DialogueRequest | null {
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
        if (tasks.potatoPart < 0) {
          tasks.powerUps |= POTATO_PARTS[world.level]?.power ?? 0;
          tasks.potatoPart = 0;
          return {
            creature: potato.creature, pathTag: potato.pathTag, text: potato.thanksText,
            playerYaw: potato.playerYaw, creatureYaw: potato.creatureYaw, slot: -1,
          };
        }
        return {
          creature: potato.creature, pathTag: potato.pathTag,
          // Still out there, or already done and he explains what it does.
          text: tasks.potatoPart > 0 ? potato.askText : potato.explainText,
          playerYaw: potato.playerYaw, creatureYaw: potato.creatureYaw, slot: -1,
        };
      }
    }
  }

  // --- the mini-boss.
  const boss = level.boss;
  if (boss && !slotDone(tasks, boss.slot)) {
    const c = creatureAt(boss.creature);
    const taunt = boss.taunt;
    if (c && taunt && tasks.boss < 2) {
      if (tasks.boss === 0) {
        // The height band is what keeps it from taunting through the ceiling.
        const inBand = world.y > taunt.yMin && world.y < taunt.yMax;
        if (inBand && (c.flags & CREATURE_FLAGS.near) !== 0 && c.animState !== 7) {
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
