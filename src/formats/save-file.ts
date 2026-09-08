/**
 * The save file, `Toy2NN.sav` in the install root: slot 0 is the game and
 * slot 99 the options and controls. Decoded 2026-09-07 from `FUN_0048e730`
 * (load), `FUN_0049b830` (save), `FUN_004a2c20` (a fresh record) and
 * `FUN_004a2cc0` (apply a loaded one); docs/FORMATS.md "The save file".
 *
 *     u32  nameLength
 *     u8[] name               "default.cfg" in every file seen; may be empty
 *     u8[0x188] block          copied whole to 0x52ef90 (slot 0) or 0x529b08 (99)
 *
 * The block is 0x138 bytes of controls followed by 0x50 bytes of progress.
 * In the game slot the control half is unused (zero in a file the release
 * build wrote) and the progress half is what matters; the options slot
 * holds the control map and nothing else. The 1999 file that ships in
 * `data/` is 80 bytes shorter and its progress starts 0x50 earlier: an
 * older build with a shorter control half, which the release loader reads
 * misaligned. Everything is relative to the block, and offsets below are
 * from ITS start; add 0x52ef90 for the address in memory.
 */

/** Read a NUL-less string of the given length. */
function ascii(bytes: Uint8Array, at: number, length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += String.fromCharCode(bytes[at + i] ?? 0);
  return s;
}

export const SAVE = {
  blockSize: 0x188,
  /** Where the progress record starts inside the block. */
  progress: 0x138,
  /** Lives, then the level-select cursor, then the power-up bits. */
  lives: 0x138,
  level: 0x139,
  powerUps: 0x13a,
  /** The options word: flags byte (0x40 = active camera), then the two sliders. */
  optionFlags: 0x13c,
  sfx: 0x13d,
  bgm: 0x13e,
  /** Two words the options screen keeps and restores; what they select is unread. */
  optionWordA: 0x140,
  optionWordB: 0x142,
  health: 0x144,
  /**
   * One byte per INTERNAL level number 1..15 at `tokens + n`: bits 0..4 are
   * the five Pizza Planet tokens, and bit 7 is set on every level in the
   * one played file examined and is unread.
   */
  tokens: 0x147,
  /**
   * `FUN_0049eb20(n)`: one byte per MOVIE, at `shown + n` (the engine's
   * `DAT_0052f0e7[n]`, +0x157 from the block), set when movie `n + 10` has
   * been played: n = 1..15 a level's own movie by PLAY position (its
   * intro, or its boss movie on the boss levels), so bytes +0x158..+0x166;
   * 0x11 the secret ending at +0x168, which is also the all-tokens flag;
   * 0x12 the ending at +0x169, also set when level 15 is beaten.
   */
  shown: 0x157,
  /** `shown + 0x11`: all fifty tokens held / the secret ending shown. */
  allTokens: 0x168,
  /** `shown + 0x12`: level 15 beaten / the ending shown. */
  gameBeaten: 0x169,
  /** The record is padded out to this. */
  end: 0x188,
  activeCamera: 0x40,
  freshLives: 5,
  freshHealth: 14,
} as const;

/**
 * `0x50268c`: the level-select order. Index `i` of the select screen (which
 * is what the save's `level` cursor and the music table are indexed by) is
 * internal level `LEVEL_SELECT_ORDER[i]`. The first two worlds' boss levels
 * are swapped: the third level offered is internal level 6 and the sixth is
 * internal level 3.
 */
export const LEVEL_SELECT_ORDER: readonly number[] = [1, 2, 6, 4, 5, 3, 7, 8, 9, 10, 11, 12, 13, 14, 15];

/** The select index an internal level sits at, or -1. */
export function selectIndexOf(level: number): number {
  return LEVEL_SELECT_ORDER.indexOf(level);
}

export interface SaveFile {
  name: string;
  /** Slot 0 has one of these; slot 99 does not. */
  progress: SaveProgress | null;
  /** The raw block, for anything not decoded. */
  block: Uint8Array;
  /** True when the block is the release build's 0x188 bytes. */
  release: boolean;
}

export interface SaveProgress {
  lives: number;
  /** Level-select index 0..14; `LEVEL_SELECT_ORDER[level]` is the internal level. */
  level: number;
  /** Bits for the five power-ups, in the order of the table at 0x503a22. */
  powerUps: number;
  activeCamera: boolean;
  /** 0..10 each. */
  sfx: number;
  bgm: number;
  health: number;
  /** Indexed by INTERNAL level 1..15; index 0 unused. Bits 0..4 are the tokens. */
  tokens: number[];
  /**
   * Indexed by PLAY position 1..15 (index 0 unused): that level's movie has
   * been shown. Index 16 is level 12's own intro, which the flow plays as
   * `FUN_0049eb20(0x10)` before that boss.
   */
  shown: boolean[];
  /** +0x168: all fifty tokens, which is also the secret ending having played. */
  allTokens: boolean;
  /** +0x169: level 15 beaten, which is also the ending having played. */
  gameBeaten: boolean;
}

/**
 * Parse a `Toy2NN.sav`. `slot` says which kind it is; the progress record is
 * only read for slot 0 and only when the block is the release size, since
 * the older layout puts it 0x50 earlier and the loader itself misreads it.
 */
export function parseSaveFile(buffer: ArrayBuffer | Uint8Array, slot: number): SaveFile {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 4) throw new Error('save file: shorter than its name length');
  const nameLength = view.getUint32(0, true);
  if (4 + nameLength > bytes.length) throw new Error('save file: name runs past the end');
  const name = ascii(bytes, 4, nameLength);
  const block = bytes.subarray(4 + nameLength);
  const release = block.length === SAVE.blockSize;
  let progress: SaveProgress | null = null;
  if (slot !== 99 && release) {
    const b = block;
    const bv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const tokens: number[] = [0];
    for (let n = 1; n <= 15; n++) tokens.push(b[SAVE.tokens + n]!);
    const shown: boolean[] = [false];
    for (let n = 1; n <= 16; n++) shown.push(b[SAVE.shown + n] !== 0);
    progress = {
      lives: b[SAVE.lives]!,
      level: b[SAVE.level]!,
      powerUps: b[SAVE.powerUps]!,
      activeCamera: (b[SAVE.optionFlags]! & SAVE.activeCamera) !== 0,
      sfx: b[SAVE.sfx]!,
      bgm: b[SAVE.bgm]!,
      health: bv.getUint16(SAVE.health, true),
      tokens,
      shown,
      allTokens: b[SAVE.allTokens] !== 0,
      gameBeaten: b[SAVE.gameBeaten] !== 0,
    };
  }
  return { name, progress, block, release };
}

/** The number of tokens a progress record holds, out of fifty. */
export function tokenCount(p: SaveProgress): number {
  let n = 0;
  for (let level = 1; level <= 15; level++) {
    const bits = p.tokens[level]! & 0x1f;
    n += (bits & 1) + ((bits >> 1) & 1) + ((bits >> 2) & 1) + ((bits >> 3) & 1) + ((bits >> 4) & 1);
  }
  return n;
}

/**
 * A fresh game block, as `FUN_004a2c20` makes one: five lives, full health,
 * the cursor on the first level and every token and completed byte clear.
 * The engine's reset does NOT touch the option bytes, which survive a new
 * game; the port starts them at its own menu defaults, an active camera and
 * the sliders at 7 and 6.
 */
export function freshBlock(): Uint8Array {
  const block = new Uint8Array(SAVE.blockSize);
  block[SAVE.lives] = SAVE.freshLives;
  block[SAVE.health] = SAVE.freshHealth;
  block[SAVE.optionFlags] = 0xc0;
  block[SAVE.sfx] = 7;
  block[SAVE.bgm] = 6;
  return block;
}

/** Write a progress record's fields into a release-size block, in place. */
export function writeProgress(block: Uint8Array, p: SaveProgress): void {
  if (block.length !== SAVE.blockSize) throw new Error('save file: not a release-size block');
  block[SAVE.lives] = p.lives & 0xff;
  block[SAVE.level] = Math.min(14, p.level) & 0xff;
  block[SAVE.powerUps] = p.powerUps & 0xff;
  block[SAVE.optionFlags] = (block[SAVE.optionFlags]! & ~SAVE.activeCamera)
    | (p.activeCamera ? SAVE.activeCamera : 0);
  block[SAVE.sfx] = p.sfx & 0xff;
  block[SAVE.bgm] = p.bgm & 0xff;
  block[SAVE.health] = p.health & 0xff;
  block[SAVE.health + 1] = (p.health >> 8) & 0xff;
  for (let n = 1; n <= 15; n++) block[SAVE.tokens + n] = (p.tokens[n] ?? 0) & 0xff;
  for (let n = 1; n <= 16; n++) block[SAVE.shown + n] = p.shown[n] ? 1 : 0;
  block[SAVE.allTokens] = p.allTokens ? 1 : 0;
  block[SAVE.gameBeaten] = p.gameBeaten ? 1 : 0;
}

/** The whole file: the length-prefixed name and then the block. */
export function encodeSaveFile(name: string, block: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + name.length + block.length);
  new DataView(out.buffer).setUint32(0, name.length, true);
  for (let i = 0; i < name.length; i++) out[4 + i] = name.charCodeAt(i) & 0xff;
  out.set(block, 4 + name.length);
  return out;
}
