/**
 * The front end's screens as the game flow runs them, decoded 2026-09-07:
 *
 *   - the title, `FUN_00437fb0`: the Toy Story 2 card with "press jump"
 *     fading on it, which goes to the list menu on jump and to the attract
 *     demo after 900 ticks;
 *   - the list menu, `FUN_00437c40`: five rows on the "Buzz Lightyear to
 *     the Rescue" title, a cursor that slides between them;
 *   - the level select, `FUN_00438a50`: one level at a time by name, with
 *     the tokens it holds, the count you have, and how many the next boss
 *     wants. On the PC it runs over a 3D diorama loaded from directory 16,
 *     which this install does not carry (docs/FRONTEND.md); what is here is
 *     everything the routine draws in its sprite layer, and its every rule.
 *
 * **Two widths.** The sprite helpers divide x by `DAT_004f7414`, which the
 * flow sets to 320 before every picture screen (`FUN_00453cd0`) and the
 * level select sets to 512 (`FUN_00453cf0`); y is always over 256. So the
 * list menu's cursor at x 0x40 and 0xf0 flanks its rows, and the select's
 * arrows at 0x20 and 0x1c0 sit at the screen's edges.
 *
 * Each screen is a plain state stepped once a tick with the pad's word,
 * returning what it drew and what it wants played; nothing here touches the
 * page. The pad's word uses the engine's own bits, and edges are "down now
 * and not before", `(now & bit) && !(was & bit)`, as the engine tests them.
 *
 * The fade (`FUN_004a1bb0` sets a target and a speed, `FUN_004a1be0` moves
 * the screen colour toward it by `speed / 2` a tick) is modelled on one
 * channel, since the front end only ever asks for greys.
 */
import { LEVEL_SELECT_ORDER } from '../formats/save-file.ts';
import { layoutBigText, layoutMenuText, menuTextColour, type BigGlyph, type MenuGlyph } from './text.ts';

/** The pad word's bits, PlayStation order: the front end reads these six. */
export const PAD = {
  up: 0x10, right: 0x20, down: 0x40, left: 0x80,
  /** Triangle: "cancel". */
  cancel: 0x1000,
  /** Cross: "jump". */
  jump: 0x4000,
} as const;

export interface PadWord { now: number; was: number }

const edge = (pad: PadWord, bit: number): boolean => (pad.now & bit) !== 0 && (pad.was & bit) === 0;

/** The three sounds the menus make, `FUN_004a37e0(n)`: effect `n + 1`. */
export const MENU_SOUND = { select: 1, move: 2, cancel: 3 } as const;

/** Where the front end's text is in `toy2.exe`, for `exeString`. */
export const FRONT_TEXT = {
  pressJump: 0x4f67e4,
  startGame: 0x4f5ae8,
  continueGame: 0x4f5afc,
  options: 0x4f5af4,
  loadGame: 0x4f67f0,
  movieViewer: 0x4f5b0c,
  exit: 0x4f67fc,
  jumpToSelect: 0x4f6878,
  cancelToGoBack: 0x4f6888,
  needMoreTokens: 0x4f5c84,
  pressJumpToExit: 0x4f684c,
  pressJumpToSelect: 0x4f6860,
  /** Fifteen pointers to the level names, one per PLAY position 1..15. */
  levelNames: 0x4f6be4,
  /** Sixteen i16s: the tokens the next level wants, by how many are open. */
  tokensWanted: 0x503840,
} as const;

/** The text every screen needs, read from the user's own executable. */
export interface FrontStrings {
  pressJump: string;
  startGame: string;
  continueGame: string;
  options: string;
  loadGame: string;
  movieViewer: string;
  exit: string;
  jumpToSelect: string;
  cancelToGoBack: string;
  needMoreTokens: string;
  pressJumpToExit: string;
  /** Indexed by play position 1..15; index 0 unused. */
  levelNames: string[];
  tokensWanted: number[];
}

export function readFrontStrings(exe: Uint8Array, exeString: (exe: Uint8Array, address: number) => string): FrontStrings {
  const u32 = (address: number): number => {
    const o = address - 0x400000;
    return (exe[o]! | (exe[o + 1]! << 8) | (exe[o + 2]! << 16) | (exe[o + 3]! << 24)) >>> 0;
  };
  const i16 = (address: number): number => {
    const o = address - 0x400000;
    return ((exe[o]! | (exe[o + 1]! << 8)) << 16) >> 16;
  };
  const levelNames = [''];
  for (let n = 1; n <= 15; n++) levelNames.push(exeString(exe, u32(FRONT_TEXT.levelNames + n * 4)));
  const tokensWanted: number[] = [];
  for (let n = 0; n < 16; n++) tokensWanted.push(i16(FRONT_TEXT.tokensWanted + n * 2));
  return {
    pressJump: exeString(exe, FRONT_TEXT.pressJump),
    startGame: exeString(exe, FRONT_TEXT.startGame),
    continueGame: exeString(exe, FRONT_TEXT.continueGame),
    options: exeString(exe, FRONT_TEXT.options),
    loadGame: exeString(exe, FRONT_TEXT.loadGame),
    movieViewer: exeString(exe, FRONT_TEXT.movieViewer),
    exit: exeString(exe, FRONT_TEXT.exit),
    jumpToSelect: exeString(exe, FRONT_TEXT.jumpToSelect),
    cancelToGoBack: exeString(exe, FRONT_TEXT.cancelToGoBack),
    needMoreTokens: exeString(exe, FRONT_TEXT.needMoreTokens),
    pressJumpToExit: exeString(exe, FRONT_TEXT.pressJumpToExit),
    levelNames,
    tokensWanted,
  };
}

// ---------------------------------------------------------------------------
// The fade

export interface Fade {
  /** The screen's grey now (`DAT_0054de9c`), 0 black to 0x80 as drawn. */
  level: number;
  /** Where it is going (`DAT_0052adb8`) and by how much a tick, halved. */
  target: number;
  speed: number;
}

/** `FUN_004a1bb0(g, g, g, speed)`. */
export function setFade(fade: Fade, target: number, speed: number): void {
  fade.target = target;
  fade.speed = speed;
}

/** `FUN_004a1be0`: move toward the target by `speed * dt / 2`. */
export function stepFade(fade: Fade, dt = 1): void {
  const step = Math.trunc((fade.speed * dt) / 2);
  if (step === 0) { fade.speed = 0; return; }
  if (fade.level < fade.target) fade.level = Math.min(fade.target, fade.level + step);
  else if (fade.level > fade.target) fade.level = Math.max(fade.target, fade.level - step);
  else fade.speed = 0;
}

/** Full brightness, and the two speeds the front end fades at. */
export const FADE = { full: 0x80, quick: 0xc, slow: 6 } as const;

/** How long a screen keeps drawing after a choice before it acts, `DAT_0053ca60`. */
const CHOICE_TICKS = 0x17;

/** The triangle wave every blink rides, `t & 0x3f` folded: 0..0x1f..0. */
export function fold64(t: number): number {
  const v = t & 0x3f;
  return v > 0x1f ? 0x3f - v : v;
}

// ---------------------------------------------------------------------------
// What a screen draws

/** A colour for the modulate: one grey, or a red/green/blue triple. */
export type Grey = number | readonly [number, number, number];

export type FrontItem =
  | {
    kind: 'sprite'; index: number; frame: number; x: number; y: number;
    /** Which virtual width the x is over, 512 or 320. */
    space: 512 | 320; scaleX: number; scaleY: number; colour: Grey; alpha: number;
  }
  | { kind: 'big'; glyphs: BigGlyph[]; space: 512 | 320; colour: readonly [number, number, number] }
  | { kind: 'menu'; glyphs: MenuGlyph[]; y: number; grey: number; alpha: number };

export interface FrontFrame {
  /** The picture under everything, by `FUN_00438520` argument, or none. */
  picture: number | null;
  /** Credits select backdrop slots directly and fade them beneath the text. */
  pictureSlot?: number;
  pictureAlpha?: number;
  /** In the engine's call order: later ones land BEHIND earlier ones. */
  items: FrontItem[];
  /** The screen's grey, 0..0x80. */
  fade: number;
  /** Drawn over the 3D scene rather than on black: the level select. */
  transparent?: boolean;
}

export interface StepResult<T extends string> {
  frame: FrontFrame;
  /** Effects to play this tick, 1-based ids for `FUN_0047de50`. */
  sounds: number[];
  /** Set on the tick the screen is done. */
  done: T | null;
}

const bigText = (text: string, x: number, y: number, space: 512 | 320, colour: readonly [number, number, number] = [0xff, 0xff, 0xff]): FrontItem =>
  ({ kind: 'big', glyphs: layoutBigText(text, x, y), space, colour });

const menuText = (text: string, y: number, brightness: number): FrontItem => {
  const { grey, alpha } = menuTextColour(brightness);
  return { kind: 'menu', glyphs: layoutMenuText(text), y, grey, alpha };
};

// ---------------------------------------------------------------------------
// The title, FUN_00437fb0

export const TITLE = {
  /** The Toy Story 2 card, `FUN_0048f1b0(0)`. */
  picture: 0,
  /** "press jump" sits here, in the 320 space. */
  promptY: 0xcc,
  /** Ticks before the attract demo, and the shorter hold after one. */
  timeout: 900,
  attractTimeout: 300,
  /** Jump is ignored for this long after the card comes up. */
  armAfter: 0x1e,
  /** The title's music, `titlescr`. */
  music: 0x14,
} as const;

export interface TitleState {
  ticks: number;
  /** `DAT_0053e4a8`: 0 live, 1 timed out, 2 jump pressed. */
  phase: 0 | 1 | 2;
  /** `DAT_0053ca60`: ticks left before the choice is acted on. */
  wait: number;
  fade: Fade;
  /** After an attract demo the card shows without its prompt, briefly. */
  attract: boolean;
}

export function createTitle(attract = false): TitleState {
  return { ticks: 0, phase: 0, wait: 0, fade: { level: 0, target: FADE.full, speed: FADE.quick }, attract };
}

export function stepTitle(s: TitleState, pad: PadWord, strings: FrontStrings, dt = 1): StepResult<'menu' | 'timeout'> {
  const sounds: number[] = [];
  const items: FrontItem[] = [];
  if (s.phase !== 0 && s.wait === 0) {
    return { frame: { picture: TITLE.picture, items, fade: s.fade.level }, sounds, done: s.phase === 2 ? 'menu' : 'timeout' };
  }
  stepFade(s.fade, dt);
  if (s.wait > 0) s.wait = Math.max(0, s.wait - dt);
  s.ticks += dt;
  if (!s.attract) items.push(menuText(strings.pressJump, TITLE.promptY, fold64(s.ticks) * 4));
  const timeout = s.attract ? TITLE.attractTimeout : TITLE.timeout;
  if (s.ticks > timeout && s.phase === 0) {
    s.phase = 1;
    s.wait = CHOICE_TICKS;
    setFade(s.fade, 0, FADE.quick);
  }
  if (edge(pad, PAD.jump) && s.phase === 0 && !s.attract && s.ticks > TITLE.armAfter) {
    s.phase = 2;
    s.wait = CHOICE_TICKS;
    setFade(s.fade, 0, FADE.quick);
    sounds.push(MENU_SOUND.select);
  }
  return { frame: { picture: TITLE.picture, items, fade: s.fade.level }, sounds, done: null };
}

// ---------------------------------------------------------------------------
// The list menu, FUN_00437c40

export const LIST_MENU = {
  /** The "Buzz Lightyear to the Rescue" title, `FUN_0048f1b0(4)`. */
  picture: 4,
  /** The rows' y in the 320 space (and the 512 space, for the cursor). */
  firstRow: 0x78,
  rowStep: 0x14,
  rows: 5,
  /** The cursor: sprite 62's two frames at these x, half scale, in the 320 space. */
  cursor: 62,
  cursorLeft: 0x40,
  cursorRight: 0xf0,
  cursorSpeed: 2,
  /** Jump is ignored for this long after the menu comes up. */
  armAfter: 0x1f,
  /** The menu's music, `ygafim`. */
  music: 0x13,
} as const;

export type ListChoice = 'start' | 'options' | 'load' | 'movies' | 'exit';
const LIST_CHOICES: readonly ListChoice[] = ['start', 'options', 'load', 'movies', 'exit'];

export interface ListMenuState {
  ticks: number;
  /** The row the cursor is going to, as a y, and where it is drawn. */
  target: number;
  cursorY: number;
  /** `DAT_0053e4a8`: 0 live, else the chosen row + 2 (the engine's codes). */
  phase: number;
  wait: number;
  fade: Fade;
}

export function createListMenu(): ListMenuState {
  return {
    ticks: 0, target: LIST_MENU.firstRow, cursorY: LIST_MENU.firstRow,
    phase: 0, wait: 0, fade: { level: 0, target: FADE.full, speed: FADE.quick },
  };
}

/**
 * `inGame` picks "continue game" over "start game" (`DAT_00830d58`, set
 * once the level select has been reached).
 */
export function stepListMenu(s: ListMenuState, pad: PadWord, strings: FrontStrings, inGame: boolean, dt = 1): StepResult<ListChoice> {
  const sounds: number[] = [];
  const items: FrontItem[] = [];
  const frame = (): FrontFrame => ({ picture: LIST_MENU.picture, items, fade: s.fade.level });
  if (s.phase !== 0 && s.wait === 0) {
    return { frame: frame(), sounds, done: LIST_CHOICES[s.phase - 2] ?? 'exit' };
  }
  stepFade(s.fade, dt);
  if (s.wait > 0) s.wait = Math.max(0, s.wait - dt);
  s.ticks += dt;

  let settled = false;
  if (s.phase === 0 && s.cursorY === s.target) {
    settled = true;
    if (edge(pad, PAD.jump) && s.ticks >= LIST_MENU.armAfter) {
      const row = Math.round((s.target - LIST_MENU.firstRow) / LIST_MENU.rowStep);
      // The last row leaves the program outright; there is no fade first.
      if (row === LIST_MENU.rows - 1) {
        return { frame: frame(), sounds, done: 'exit' };
      }
      s.phase = row + 2;
      s.wait = CHOICE_TICKS;
      setFade(s.fade, 0, FADE.quick);
      sounds.push(MENU_SOUND.select);
    } else {
      const last = LIST_MENU.firstRow + (LIST_MENU.rows - 1) * LIST_MENU.rowStep;
      if (edge(pad, PAD.down) && s.target < last) {
        s.target += LIST_MENU.rowStep;
        sounds.push(MENU_SOUND.move);
      }
      if (edge(pad, PAD.up) && s.target > LIST_MENU.firstRow) {
        s.target -= LIST_MENU.rowStep;
        sounds.push(MENU_SOUND.move);
      }
    }
  } else if (s.phase !== 0) {
    settled = s.cursorY === s.target;
  }
  // The cursor slides two a tick and stops on the row.
  if (s.cursorY < s.target) {
    s.cursorY = Math.min(s.target, s.cursorY + dt * LIST_MENU.cursorSpeed);
  } else if (!settled && s.cursorY > s.target) {
    s.cursorY = Math.max(s.target, s.cursorY - dt * LIST_MENU.cursorSpeed);
  }

  const pulse = fold64(s.ticks) * 4;
  const cursor = (x: number, f: number): FrontItem => ({
    kind: 'sprite', index: LIST_MENU.cursor, frame: f, x, y: s.cursorY, space: 320,
    scaleX: 0x800, scaleY: 0x800, colour: [pulse, pulse, 0x80], alpha: 1,
  });
  items.push(cursor(LIST_MENU.cursorLeft, 0), cursor(LIST_MENU.cursorRight, 1));
  const labels = [
    inGame ? strings.continueGame : strings.startGame,
    strings.options, strings.loadGame, strings.movieViewer, strings.exit,
  ];
  labels.forEach((text, i) => items.push(menuText(text, LIST_MENU.firstRow + i * LIST_MENU.rowStep, 0x80)));
  return { frame: frame(), sounds, done: null };
}

// ---------------------------------------------------------------------------
// The level select, FUN_00438a50

/**
 * `FUN_0049eb50`: how far the game is open. Walk the select order counting
 * levels whose token byte is non-zero, stopping at the first that is zero,
 * and count the token bits on the way. `wanted` is the executable's table
 * at that count, non-zero only where the next level is a boss.
 */
export function openLevels(tokens: readonly number[], tokensWanted: readonly number[]): { count: number; held: number; wanted: number } {
  let count = 0;
  let held = 0;
  for (const level of LEVEL_SELECT_ORDER) {
    let bits = tokens[level] ?? 0;
    if (bits === 0) break;
    for (let i = 0; i < 5; i++) { if (bits & 1) held++; bits >>= 1; }
    count++;
  }
  return { count, held, wanted: tokensWanted[count] ?? 0 };
}

export const SELECT = {
  /** Positions on offer: the open count plus one, at most fifteen. */
  maxOpen: 14,
  /** Jump and cancel are ignored for this long after the screen comes up. */
  armAfter: 0x3c,
  /** The fade-out runs this many ticks before the screen returns. */
  leaveTicks: 0x1b,
  /** "you need more tokens" flashes for this long. */
  flashTicks: 0xc0,
  /** A held direction repeats after 0x20 ticks, then every sixteen. */
  repeatAfter: 0x20,
  /** The sprites, from the level select's own table (level 16's). */
  token: 54,
  sign: 55,
  arrows: 57,
  digits: 58,
  /** The select's music, `ygafim`. */
  music: 0x13,
} as const;

export interface SelectState {
  /** The play position shown, 1-based (`local_148`). */
  pos: number;
  /** How many positions are on offer (`iVar10`). */
  open: number;
  held: number;
  wanted: number;
  ticks: number;
  spin: number;
  /** `local_13c`: 0 live; counts up once a choice is made. */
  phase: number;
  cancelled: boolean;
  /** `local_120`: the "need more tokens" flash, counting down. */
  flash: number;
  /** `local_128`: how long the pad has been unchanged, for the repeat. */
  repeat: number;
  fade: Fade;
  tokens: readonly number[];
}

/**
 * `cursor` is the save's select cursor (`DAT_0052ad8a`, 0-based) and
 * `enteredWith` the token byte the last level was entered with
 * (`DAT_00830ca8`): a level just cleared for the first time moves the
 * cursor on to the next.
 */
export function createSelect(tokens: readonly number[], strings: FrontStrings, cursor: number, enteredWith: number): SelectState {
  const { count, held, wanted } = openLevels(tokens, strings.tokensWanted);
  const open = Math.min(count, SELECT.maxOpen) + 1;
  let pos = cursor + 1;
  if (pos > open) pos = open;
  if (pos < open && enteredWith === 0 && (tokens[LEVEL_SELECT_ORDER[cursor] ?? 0] ?? 0) !== 0) pos++;
  return {
    pos, open, held, wanted, ticks: 0, spin: 0, phase: 0, cancelled: false, flash: 0, repeat: 0,
    fade: { level: 0, target: FADE.full, speed: FADE.slow }, tokens,
  };
}

export function stepSelect(s: SelectState, pad: PadWord, strings: FrontStrings, dt = 1): StepResult<'pick' | 'cancel'> {
  const sounds: number[] = [];
  const items: FrontItem[] = [];
  stepFade(s.fade, dt);
  s.ticks += dt;
  s.spin += dt;

  // The tokens the level here holds. The engine indexes its token bytes by
  // PLAY POSITION on this screen where everywhere else it goes through the
  // select order, so the third and sixth levels show each other's; kept.
  let bits = s.tokens[s.pos] ?? 0;
  let tokensHere = 0;
  for (let i = 0; i < 5; i++) { if (bits & 1) tokensHere++; bits >>= 1; }

  // A held direction repeats: after 0x20 ticks the previous word is
  // cleared every sixteen, so the edge fires again.
  if (pad.now === pad.was) {
    s.repeat += dt;
    if (s.repeat > SELECT.repeatAfter && (s.repeat & 0xf) < 3) {
      s.repeat |= 3;
      pad.was = 0;
    }
  } else {
    s.repeat = 0;
  }

  if (edge(pad, PAD.jump) && s.phase === 0 && s.ticks > SELECT.armAfter) {
    if (s.pos === s.open && s.held < s.wanted) {
      sounds.push(MENU_SOUND.select);
      s.flash = SELECT.flashTicks;
    } else {
      s.phase = 1;
      setFade(s.fade, 0, FADE.slow);
      sounds.push(MENU_SOUND.select);
    }
  }
  const browse = () => {
    if (edge(pad, PAD.right) && s.pos < s.open) {
      s.pos++;
      sounds.push(MENU_SOUND.move);
    } else if (edge(pad, PAD.left) && s.pos >= 2) {
      s.pos--;
      sounds.push(MENU_SOUND.move);
    }
  };
  if ((pad.now & PAD.cancel) === 0) {
    if (s.phase !== 0) s.phase++;
    else browse();
  } else if (s.phase === 0) {
    if (s.ticks < SELECT.armAfter + 1) browse();
    else {
      setFade(s.fade, 0, FADE.slow);
      sounds.push(MENU_SOUND.cancel);
      s.cancelled = true;
      s.phase = 2;
    }
  } else {
    s.phase++;
  }

  // --- the sprite layer, in the engine's order ---------------------------
  const sprite = (index: number, frame: number, x: number, y: number, space: 512 | 320,
    colour: Grey = 0x80, scaleX = 0x1000, scaleY = 0x1000): FrontItem =>
    ({ kind: 'sprite', index, frame, x, y, space, scaleX, scaleY, colour, alpha: 1 });
  for (let i = 0; i < tokensHere; i++) {
    items.push(sprite(SELECT.token, (i * 4 + 4 + (s.spin >> 1)) & 0x1f,
      (i * 2 - tokensHere) * 0x13 + 0x100, 0x32, 512, 0x80, 0xccc, 0x800));
  }
  // The count held, bottom left, which goes red while the flash is on.
  const red = s.flash > 0 && (s.flash & 0x3f) >= 0x19;
  const counter: Grey = red ? [0x80, 0x20, 0x20] : 0x80;
  items.push(sprite(SELECT.token, (s.spin >> 1) & 0x1f, 0xe, 0xc0, 320, counter));
  items.push(sprite(SELECT.digits, Math.trunc(s.held / 10) % 10, 0x66, 0xd0, 512, counter));
  items.push(sprite(SELECT.digits, s.held % 10, 0x73, 0xd0, 512, counter));
  if (s.flash > 0) s.flash -= dt;

  const blink = (s.ticks & 0x3f) < 0x30;
  if (s.pos === s.open && s.held < s.wanted) {
    if (blink) {
      if (s.wanted < 10) {
        items.push(sprite(SELECT.digits, s.wanted % 10, 0xf4, 0x6d, 512, 0x80, 0x181c, 0x181c));
      } else {
        items.push(sprite(SELECT.digits, Math.trunc(s.wanted / 10) % 10, 0xe8, 0x6d, 512, 0x80, 6000, 0x157c));
        items.push(sprite(SELECT.digits, s.wanted % 10, 0x100, 0x6d, 512, 0x80, 6000, 0x157c));
      }
    }
    items.push(sprite(SELECT.sign, 0, 0x70, 0x58, 320));
  }
  if (s.pos > 1 && blink) items.push(sprite(SELECT.arrows, 0, 0x20, 0x70, 512));
  if (s.pos < s.open && blink) items.push(sprite(SELECT.arrows, 1, 0x1c0, 0x70, 512));

  // --- the text ---------------------------------------------------------
  if (s.flash > 0 && (s.flash & 0x3f) > 0x18) items.push(bigText(strings.needMoreTokens, 0x100, 0x9a, 512));
  items.push(bigText(strings.levelNames[s.pos] ?? '', 0x100, 0x20, 512));
  // The two prompts are centred on `13 * length - 0x1db` with the length of
  // "jump to select" for both — which is -293, off the left of the screen.
  // The PC build never shows them; drawn where it draws them.
  const promptX = strings.jumpToSelect.length * 13 - 0x1db;
  items.push(bigText(strings.jumpToSelect, promptX, 0xbe, 512));
  items.push(bigText(strings.cancelToGoBack, promptX, 0xd0, 512));

  const frame: FrontFrame = { picture: null, items, fade: s.fade.level, transparent: true };
  if (Math.abs(s.phase) > SELECT.leaveTicks) {
    return { frame, sounds, done: s.cancelled ? 'cancel' : 'pick' };
  }
  return { frame, sounds, done: null };
}
