/**
 * The HUD's own state: which of the ten elements is showing, and how far it
 * has slid in. From `FUN_0049fc60` (one element) and the top of
 * `FUN_0049fd40` (which sets the timers each tick), decoded in docs/HUD.md.
 *
 * Every element has a **show timer** and a **slide phase**. Something that
 * happens — a coin taken, health lost, a boss waking — sets the timer, and
 * for as long as it is nonzero the phase eases up to `PHASE_MAX` and the
 * timer counts down. A timer of `PERMANENT` or more never counts down, which
 * is how the front end pins a counter open. When the timer reaches zero the
 * phase eases back and the element slides off the edge it came from.
 *
 * `offsetOf` turns a phase into the offset the draw adds, `-SLIDE .. 0`
 * virtual pixels, using the engine's own sine table so the ease matches. A
 * hidden element returns `HIDDEN` (1), which the draw tests for and which the
 * stacking maths treats as `-SLIDE`, so a hidden neighbour takes no room.
 */
import { sin } from './trig.ts';

/** The ten elements, in the order their timers sit in memory. */
export enum HudElement {
  Lives = 0,
  Health = 1,
  Coins = 2,
  Spin = 3,
  Laser = 4,
  FindFive = 5,
  TimedRun = 6,
  Boss = 7,
  PotatoHead = 8,
  Hamm = 9,
}

export const HUD = {
  count: 10,
  /** Fully slid in. The sine table's quarter turn. */
  phaseMax: 0x400,
  /** Phase per tick, in and out. */
  phaseRate: 32,
  /** A timer at least this big never counts down. */
  permanent: 1000,
  /** How far off the edge a hidden element sits, in virtual pixels. */
  slide: 0x40,
  /** What `offsetOf` returns for an element that is not showing at all. */
  hidden: 1,
  /** The timer a change to one of the three counters sets. */
  counterTicks: 0xb4,
  /** The timer the spin bar holds while the charge runs. */
  spinTicks: 0x78,
  /** The timer the laser bar and ammo hold. */
  laserTicks: 0x3c,
  /** The timer a boss sets every tick it lives. */
  bossTicks: 0x5a,
  /** The timer the always-on-while-true elements set. */
  liveTicks: 5,
} as const;

export interface HudState {
  /** `DAT_0052c824[n]`: ticks left showing. */
  timer: number[];
  /** `DAT_0052f2e0[n]`: 0 to `phaseMax`. */
  phase: number[];
  /**
   * The engine's frame dividers, `DAT_0052ad60..63`: counters that wrap at
   * 8, 16, 32 and 64. Blink and pulse are read off them, and the 64 one is
   * what steps a timed task's clock (src/sim/tasks.ts keeps its own).
   */
  div8: number; div16: number; div32: number; div64: number;
  /** `DAT_00830ca0`: the coin's spin, 0..23, two ticks a frame. */
  coinSpin: number;
}

export function createHud(): HudState {
  return {
    timer: new Array(HUD.count).fill(0),
    phase: new Array(HUD.count).fill(0),
    div8: 0, div16: 0, div32: 0, div64: 0,
    coinSpin: 0,
  };
}

/** Level start: the three counters show themselves, lives already in. */
export function startHud(hud: HudState): void {
  hud.timer[HudElement.Lives] = HUD.counterTicks;
  hud.timer[HudElement.Health] = HUD.counterTicks;
  hud.timer[HudElement.Coins] = HUD.counterTicks;
  hud.phase[HudElement.Lives] = HUD.phaseMax;
}

/** Show an element for this many ticks, keeping the longer of the two. */
export function showHud(hud: HudState, element: HudElement, ticks: number): void {
  if (ticks > hud.timer[element]!) hud.timer[element] = ticks;
}

/**
 * Advance the timers and phases one tick. `talking` freezes an element the
 * way the box does (`DAT_0052b816 & 1`): the phase falls, so the HUD gets
 * out of the way of a dialogue. `paused` stops the whole thing.
 */
export function stepHud(hud: HudState, talking: boolean, paused = false, dt = 1): void {
  hud.div8 = (hud.div8 + dt) % 8;
  hud.div16 = (hud.div16 + dt) % 16;
  hud.div32 = (hud.div32 + dt) % 32;
  hud.div64 = (hud.div64 + dt) % 64;
  if (paused) return;
  for (let n = 0; n < HUD.count; n++) {
    const timer = hud.timer[n]!;
    if (timer === 0 || talking) {
      if (hud.phase[n]! > 0) {
        hud.phase[n] = Math.max(0, hud.phase[n]! - dt * HUD.phaseRate);
      }
      continue;
    }
    if (hud.phase[n]! < HUD.phaseMax) {
      hud.phase[n] = Math.min(HUD.phaseMax, hud.phase[n]! + dt * HUD.phaseRate);
    }
    if (timer < HUD.permanent) hud.timer[n] = Math.max(0, timer - dt);
  }
}

/**
 * Where an element sits this tick: 0 when fully in, down to `-HUD.slide`
 * while sliding, and `HUD.hidden` when it is not showing at all. Top-edge
 * elements add this to y and left-edge ones to x, so a sliding element
 * walks off its own edge.
 */
export function offsetOf(hud: HudState, element: HudElement): number {
  const phase = hud.phase[element]!;
  if (phase === 0) return HUD.hidden;
  return (sin(phase) >> 8) - HUD.slide;
}

/**
 * How far the element to the right of this one pushes its neighbours along.
 * A hidden element pushes nothing, a fully shown one half its slide.
 */
export function stackShift(offset: number): number {
  return ((offset === HUD.hidden ? -HUD.slide : offset) + HUD.slide) / 2;
}

/** The on half of the 16-tick blink (`DAT_0052ad61 < 8`). */
export function blinkOn(hud: HudState): boolean {
  return hud.div16 < 8;
}

/**
 * The pulse the icons ride, `0x50` to `0x8c`: a 32-tick counter folded into
 * a triangle. `bias` is the offset the different icons use so they do not
 * all pulse together.
 */
export function pulse(hud: HudState, bias = 0): number {
  const t = (hud.div32 + bias) & 0x1f;
  return (t > 0xf ? 0x1f - t : t) * 4 + 0x50;
}

/** Advance the coin's spin, which only runs while the counter is showing. */
export function stepCoinSpin(hud: HudState, dt = 1): void {
  hud.coinSpin += dt;
  if (hud.coinSpin > 0x17) hud.coinSpin = 0;
}
