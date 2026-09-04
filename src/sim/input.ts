/**
 * Keyboard and gamepad, reduced to the four things the controller wants: a
 * stick and three buttons.
 *
 * The original polled a 16-bit button word once per tick and kept the previous
 * one for edge detection; that lives in the controller's runtime, so this only
 * has to produce the current frame's state. Bindings are data so they can be
 * remapped, and both devices are read every frame with the gamepad winning
 * when it is actually being touched — that way a pad can be picked up mid-play
 * without a mode switch.
 */
import type { PlayerInput } from './player.ts';

/** What a binding can drive. */
export type Action = 'up' | 'down' | 'left' | 'right' | 'jump' | 'spin' | 'fire';

/** `KeyboardEvent.code` values per action. Codes, not keys, so layout does not matter. */
export type KeyBindings = Record<Action, string[]>;

export const DEFAULT_KEYS: KeyBindings = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  spin: ['KeyJ', 'ShiftLeft'],
  fire: ['KeyK', 'ControlLeft'],
};

/**
 * Standard-mapping gamepad button indices.
 *
 * The original's own layout is in the pause menu as "2 jump, 3 spin", which on
 * a PlayStation pad is cross and square. On the web's standard mapping those
 * are 0 and 2, with fire on circle.
 */
export type PadBindings = { jump: number[]; spin: number[]; fire: number[] };

export const DEFAULT_PAD: PadBindings = { jump: [0], spin: [2], fire: [1] };

/** Below this the stick is treated as centred, before the engine's own dead zone. */
const PAD_NOISE = 0.06;

export class InputSource {
  keys: KeyBindings;
  pad: PadBindings;
  /** Which gamepad index to read, or null for the first connected one. */
  padIndex: number | null = null;

  private held = new Set<string>();
  private attached: HTMLElement | Window | null = null;
  private readonly onDown = (ev: KeyboardEvent) => {
    if (this.owns(ev.code)) {
      this.held.add(ev.code);
      // Space and the arrows scroll the page otherwise, which fights the game.
      ev.preventDefault();
    }
  };
  private readonly onUp = (ev: KeyboardEvent) => { this.held.delete(ev.code); };
  // A tab switch loses the keyup, which would leave the player running forever.
  private readonly onBlur = () => this.held.clear();

  constructor(keys: KeyBindings = DEFAULT_KEYS, pad: PadBindings = DEFAULT_PAD) {
    this.keys = keys;
    this.pad = pad;
  }

  private owns(code: string): boolean {
    for (const codes of Object.values(this.keys)) if (codes.includes(code)) return true;
    return false;
  }

  attach(target: HTMLElement | Window = window): void {
    this.detach();
    this.attached = target;
    target.addEventListener('keydown', this.onDown as EventListener);
    target.addEventListener('keyup', this.onUp as EventListener);
    window.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached.removeEventListener('keydown', this.onDown as EventListener);
    this.attached.removeEventListener('keyup', this.onUp as EventListener);
    window.removeEventListener('blur', this.onBlur);
    this.attached = null;
    this.held.clear();
  }

  private keyDown(action: Action): boolean {
    return this.keys[action].some((code) => this.held.has(code));
  }

  private gamepad(): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    if (this.padIndex !== null) return pads[this.padIndex] ?? null;
    for (const pad of pads) if (pad && pad.connected) return pad;
    return null;
  }

  /** Read the current frame. Call once per tick. */
  read(): PlayerInput {
    let moveX = (this.keyDown('right') ? 1 : 0) - (this.keyDown('left') ? 1 : 0);
    let moveY = (this.keyDown('up') ? 1 : 0) - (this.keyDown('down') ? 1 : 0);
    let jump = this.keyDown('jump');
    let spin = this.keyDown('spin');
    let fire = this.keyDown('fire');

    const pad = this.gamepad();
    if (pad) {
      const ax = pad.axes[0] ?? 0;
      // Pad Y is negative upward; the controller wants +1 away from the camera.
      const ay = -(pad.axes[1] ?? 0);
      if (Math.hypot(ax, ay) > PAD_NOISE) { moveX = ax; moveY = ay; }
      // The d-pad on a standard mapping, so either stick or pad works.
      if (pad.buttons[12]?.pressed) moveY = 1;
      if (pad.buttons[13]?.pressed) moveY = -1;
      if (pad.buttons[14]?.pressed) moveX = -1;
      if (pad.buttons[15]?.pressed) moveX = 1;
      const anyOf = (indices: number[]) => indices.some((i) => pad.buttons[i]?.pressed ?? false);
      jump ||= anyOf(this.pad.jump);
      spin ||= anyOf(this.pad.spin);
      fire ||= anyOf(this.pad.fire);
    }

    // A diagonal on the keyboard would otherwise be 1.41 long and read as
    // beyond full deflection; the engine clamps magnitude, so normalise here.
    const size = Math.hypot(moveX, moveY);
    if (size > 1) { moveX /= size; moveY /= size; }

    return { moveX, moveY, jump, spin, fire };
  }
}
