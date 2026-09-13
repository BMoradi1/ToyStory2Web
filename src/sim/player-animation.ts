/**
 * The animation state machine, ported from `FUN_004011d0` in toy2.exe.
 *
 * Buzz's animation is not "pick a clip and play it". Each state names a pair
 * of animation slots and a **byte script**: a list of frame numbers to step
 * through, with opcodes for footfalls, sound events, looping and ending. A
 * 16.16 cursor walks that list, and its step per tick comes from the state's
 * rate — or, when the rate is negative, from how fast the player is actually
 * moving, which is what keeps the walk cycle in step with the ground rather
 * than sliding.
 *
 * The table itself is in player-animation-data.ts, generated from the
 * executable. This module is the interpreter and the state selection.
 *
 * Scope: the states below are the locomotion set, which is what the controller
 * can currently reach. The table has 28 entries and the rest belong to moves
 * that are not implemented yet (the grapple, cutscenes), so
 * they are listed but never selected. Nothing here is guessed: an unmapped
 * state stays unmapped.
 */
import { ANIMATION_STATES, ANIM_OP, type AnimationState } from './player-animation-data.ts';
import { JumpState, type PlayerState } from './player.ts';

/**
 * Named states, from what the controller writes to the player's `+0x90` and
 * what `FUN_004011d0` does with it.
 *
 * Walk and idle are the two ground states: walk carries the two footfall
 * opcodes and a speed-driven rate, idle a plain 16-frame loop. Jump, fall and
 * land share one animation pair and differ only in which stretch of the script
 * they run.
 */
export enum AnimState {
  Walk = 0,
  Idle = 1,
  JumpRising = 2,
  Falling = 3,
  Landing = 4,
  /** Knocked back: the first stretch of the hit timer, before it goes to flashing. */
  Hit = 5,
  /** Out of health. Buzz's own animation slot, and it does not loop back. */
  Dying = 7,
  DoubleJump = 8,
  Climb = 9,
  HardFall = 0xc,
  /** The charged spin, whirling. */
  ChargedSpin = 0x13,
  /** ...and the dizziness after it, the last 0x78 ticks. */
  Dizzy = 0x14,
}

/**
 * The plain spin's animation SLOT — not a state.
 *
 * `FUN_004011d0` runs its state machine first and then, if the spin timer is
 * up, replaces the resolved primary slot with 9 and drives the cursor
 * straight off the timer, bypassing the state's script. There IS a state 9,
 * and it is the ledge climb: selecting it for a spin plays a climb, which is what
 * this module used to do.
 *
 * A state whose two slots are equal cannot carry the override — it is one of
 * the special moves — and the original cancels the spin rather than play it
 * wrong.
 */
export const SPIN_SLOT = 9;

/**
 * The laser's animation slot, and the frames it steps through.
 *
 * The same shape as the spin: `FUN_004011d0` swaps the primary slot for 0x1a
 * and takes the frame from the byte table at 0x4df294, indexed by half the
 * laser phase — `((phase & 1) + table[phase >> 1] * 2) * 0x8000` as a 16.16
 * cursor. The table runs 0..11 for the wind-up and then cycles 5..11 twice
 * while the shot is held, which is the arm holding its aim. It is terminated
 * by 0xff.
 *
 * The laser is applied AFTER the spin, so a laser fired out of a spin wins.
 *
 * Approximated: the odd half-step. The original's cursor interpolates between
 * two frames and the pose call here takes a whole one.
 */
export const LASER_SLOT = 0x1a;
export const LASER_FRAMES: readonly number[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
  5, 6, 7, 8, 9, 10, 11,
  5, 6, 7, 8, 9, 10, 11,
  12, 13, 14, 15, 16, 17,
];

/**
 * How much of the hit timer plays the knocked-back animation.
 *
 * A hit sets the timer to 90 and it counts down. Above 0x44 the original runs
 * animation state 5; below it, it stops animating the hit and sets a flag on
 * the player's word instead — the invulnerability flash, which is not ported —
 * so the reaction is the first 22 ticks and the remaining 68 are recovery.
 */
export const HIT_ANIMATION_ABOVE = 0x44;

/** One entry of the cursor: 0x10000 is a whole script step. */
const CURSOR_ONE = 0x10000;

/** What the spin timer starts at, which the override counts down from. */
const ATTACK_SPIN_TICKS = 0x30;

export interface AnimationPlayback {
  /** Which entry of ANIMATION_STATES is running. */
  state: number;
  /** 16.16 position within that state's script. */
  cursor: number;
  /** Frame number resolved this tick, for the primary slot. */
  frame: number;
  /** Events the script fired this tick. */
  footfalls: number;
  sounds: number[];
}

export function createAnimation(): AnimationPlayback {
  return { state: AnimState.Idle, cursor: 0, frame: 0, footfalls: 0, sounds: [] };
}

/** The sound event each script opcode fires, from the original's switch. */
const OPCODE_SOUND: Record<number, number> = {
  [ANIM_OP.sound30]: 0x30,
  [ANIM_OP.sound10]: 0x10,
  [ANIM_OP.sound17]: 0x17,
  [ANIM_OP.sound43]: 0x43,
};

/**
 * Read the script from the cursor, running opcodes until a frame number turns
 * up. Mirrors `FUN_00401000`, which walks forward over every byte >= 0x80.
 * Returns the frame, or null when the script ended.
 */
function readScript(play: AnimationPlayback, entry: AnimationState): number | null {
  for (let guard = 0; guard < 256; guard++) {
    let index = play.cursor >> 16;
    if (index >= entry.script.length) { index = 0; play.cursor = 0; }
    const byte = entry.script[index]!;
    if (byte < 0x80) return byte;

    if (byte === ANIM_OP.end) return null;
    if (byte === ANIM_OP.loop) {
      // The operand is where to resume, counted in script entries.
      const target = entry.script[index + 1] ?? 0;
      play.cursor = (play.cursor & 0xffff) + target * CURSOR_ONE;
      continue;
    }
    if (byte === ANIM_OP.footfallLeft || byte === ANIM_OP.footfallRight) play.footfalls++;
    else if (byte in OPCODE_SOUND) play.sounds.push(OPCODE_SOUND[byte]!);
    play.cursor += CURSOR_ONE;
  }
  return null;
}

/**
 * Choose this tick's state from the player.
 *
 * The order is the original's: airborne states resolve first, then landing,
 * then the ground choice between idle and walk. The idle test is on speed and
 * input together — under 0x200 in both components AND nothing held — so
 * coasting to a stop keeps the walk cycle running until it really stops.
 */
export function selectState(p: PlayerState, hasInput: boolean): number {
  // Dying and being hit come last in the original's chain of overrides, so
  // they beat everything below.
  if (p.dying) return AnimState.Dying;
  if (p.hitStun > HIT_ANIMATION_ABOVE) return AnimState.Hit;
  if (p.climb > 0) return AnimState.Climb;
  if (p.zipPhase === 2) return 17;
  if (p.pole >= 0) return p.poleMotion === 2 ? 14 : p.poleMotion === 4 ? 16 : 15;
  // The charged spin IS a state, and a different one once he is dizzy. The
  // plain spin is not; it is the slot override at the bottom of stepAnimation.
  if (p.spinCharge < 0) {
    return p.spinCharge > -0x78 ? AnimState.Dizzy : AnimState.ChargedSpin;
  }
  if (p.fallTimer === 0x50) return AnimState.HardFall;

  if (p.coyote === 0) {
    if (p.jumpState === JumpState.DoubleJump || p.jumpState === JumpState.DoubleJumpReleased) {
      return AnimState.DoubleJump;
    }
    // Rising becomes falling the moment the velocity turns over. +Y is down.
    return p.vy > 0 ? AnimState.Falling : AnimState.JumpRising;
  }

  const slow = Math.abs(p.forwardSpeed) < 0x200 && Math.abs(p.lateralSpeed) < 0x200;
  if (slow && !hasInput) return AnimState.Idle;
  return AnimState.Walk;
}

/**
 * Advance one tick.
 *
 * `speed` is the player's horizontal speed, used only by the speed-driven
 * states. Returns the slots and frames to pose with; `slotB` is the second
 * layer and equals `slotA` when the state is not layered.
 */
export function stepAnimation(
  play: AnimationPlayback, p: PlayerState, hasInput: boolean, speed: number,
): { slotA: number; slotB: number; frame: number; frameB: number } {
  play.footfalls = 0;
  play.sounds.length = 0;

  const wanted = selectState(p, hasInput);
  if (wanted !== play.state) { play.state = wanted; play.cursor = 0; }

  const entry = ANIMATION_STATES[play.state] ?? ANIMATION_STATES[AnimState.Idle]!;

  // A negative rate is multiplied by the player's speed instead of standing
  // for a fixed step, so a walk plays as fast as the legs are actually moving.
  const step = entry.rate >= 0 ? entry.rate : -entry.rate * speed;
  play.cursor += Math.max(0, Math.round(step));

  const frame = readScript(play, entry);
  if (frame === null) {
    // The script ended. The original drops back to the resting state.
    play.state = AnimState.Idle;
    play.cursor = 0;
    play.frame = readScript(play, ANIMATION_STATES[AnimState.Idle]!) ?? 0;
  } else {
    play.frame = frame;
  }
  // The spin and then the laser, over the top of whatever the state machine
  // chose. Neither is a state; both replace the resolved slot and drive the
  // frame themselves. A state whose two slots are equal is one of the special
  // moves and cannot carry either, so the original cancels instead.
  let slot = -1;
  let posed = play.frame;
  if (p.spin > 0) {
    if (entry.slotA === entry.slotB) {
      p.spin = 0;
    } else {
      // `(0x30 - spin) * 0x8000` is a 16.16 cursor, so the frame is half the
      // ticks elapsed: 24 frames over the spin's 48.
      slot = SPIN_SLOT;
      posed = (ATTACK_SPIN_TICKS - p.spin) >> 1;
    }
  }
  if (p.laser > 0) {
    if (entry.slotA === entry.slotB) {
      p.laser = 0;
    } else {
      slot = LASER_SLOT;
      posed = LASER_FRAMES[Math.min(LASER_FRAMES.length - 1, p.laser >> 1)] ?? 0;
    }
  }
  // The override replaces only the primary layer. The base layer keeps its
  // own cursor; slot 26 (laser) and slot 9 (spin) omit its seven bones.
  if (slot >= 0) return { slotA: slot, slotB: entry.slotB, frame: posed, frameB: play.frame };
  return { slotA: entry.slotA, slotB: entry.slotB, frame: play.frame, frameB: play.frame };
}
