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
 * that are not implemented yet (poles, zip lines, the grapple, cutscenes), so
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
  HardFall = 0xc,
  Spin = 9,
}

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
  if (p.spin > 0) return AnimState.Spin;
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
): { slotA: number; slotB: number; frame: number } {
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
  return { slotA: entry.slotA, slotB: entry.slotB, frame: play.frame };
}
