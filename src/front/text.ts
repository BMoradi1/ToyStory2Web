/**
 * The front end's two fonts, decoded 2026-09-07 from `FUN_0049d390` and
 * `FUN_0049b580`. Both read `loadfont.bmp`, which every level's build config
 * puts on texture slot 31 (`BMP_FILE \pcscreens\txtr\loadfont.bmp 31`): a
 * 256 x 256 sheet of 32-pixel cells, eight to a row —
 *
 *     A B C D E F G H
 *     I J K L M N O P
 *     Q R S T U V W X
 *     Y Z 0 1 2 3 4 5
 *     6 7 8 9 . , ; :
 *     \ /   ! ? ( ) '
 *     <>                 (the list menu's cursor, sprite 62)
 *
 * so it is the LOADING font, and the front end draws its text with it
 * rather than with the HUD's small font, whose sheet (slot 32) the front-end
 * bundle does not carry.
 *
 * **The big text** (`FUN_0049d390(text, y, x, r, g, b)`): each character is
 * a quad 16 units square in the screen's space — `DAT_004f7414` wide, 512
 * on the level select and 320 on the picture screens, by 256 — sampling a
 * 31 x 31 texel window at its cell, 13 units apart, the run centred on `x`:
 * the level select's names and prompts, the summary's "press jump to exit".
 * Letters of either case go to cells 0..25 and digits to 26..35
 * (`c - 0x16`); the rest is the table below, and anything else, a space
 * included, draws nothing but still takes its 13 units.
 *
 * **The menu text** (`FUN_0049b580(y, text, brightness)`): sprite 50 — the
 * same sheet as 32 x 32 frames from the top left, 48 to a row-major count —
 * at half scale in the 320 space, 12 apart from `0xa0 - 6 * length`, so
 * centred on x 160. Lower case only (`c - 0x61`); an apostrophe is frame
 * 47, the sheet's last; a space is skipped. Brightness 0x80 draws the
 * frames unmodulated and opaque; any other value draws them WHITE (0xff,
 * which doubles the texel) with alpha `0xff - 2 * brightness` — the title's
 * "press jump" fades that way.
 */

/** `FUN_0049d390`'s constants. */
export const BIG_TEXT = {
  /** The sheet's slot, `FUN_004ce2c0(0x1f)`. */
  sheet: 31,
  /** The cell pitch on the sheet and the window sampled inside it. */
  cell: 32,
  sample: 31,
  /** The quad's size in the screen's space and the advance per character. */
  size: 16,
  advance: 13,
  /** The draw's mode word: normal blending at the engine's half alpha. */
  mode: 0xc40,
} as const;

/** The characters `FUN_0049d390` special-cases, as (column, row) cells. */
const BIG_CELLS: Readonly<Record<number, readonly [number, number]>> = {
  0x21: [3, 5], // !
  0x27: [7, 5], // '
  0x28: [5, 5], // (
  0x29: [6, 5], // )
  0x2c: [5, 4], // ,
  0x2e: [4, 4], // .
  0x2f: [1, 5], // /
  0x3a: [7, 4], // :
  0x3b: [6, 4], // ;
  0x3f: [4, 5], // ?
  0x5c: [0, 5], // \
  // Four superscripts from the Latin-1 range land on half cells of row 2,
  // over the letters there; nothing in the executable's text uses them.
  0xb2: [3, 2], 0xb3: [3.5, 2], 0xb9: [2.5, 2], 0xba: [2, 2],
};

/** The cell a character of the big text samples, in texels, or null for none. */
export function bigCell(ch: string): { u: number; v: number } | null {
  const c = ch.charCodeAt(0);
  let index: number;
  if (c >= 0x61 && c <= 0x7a) index = c - 0x61;
  else if (c >= 0x41 && c <= 0x5a) index = c - 0x41;
  else if (c >= 0x30 && c <= 0x39) index = c - 0x16;
  else {
    const cell = BIG_CELLS[c];
    if (!cell) return null;
    return { u: cell[0] * BIG_TEXT.cell, v: cell[1] * BIG_TEXT.cell };
  }
  return { u: (index & 7) * BIG_TEXT.cell, v: (index >> 3) * BIG_TEXT.cell };
}

/** One big-text quad: where it goes in the screen's space and what it samples. */
export interface BigGlyph { x: number; y: number; u: number; v: number }

/**
 * Lay a run of the big text out, centred on `x` as `FUN_0049d390` centres
 * it: the first character starts at `x - length * 13 / 2` (integer, toward
 * zero, as the engine's division is).
 */
export function layoutBigText(text: string, x: number, y: number): BigGlyph[] {
  const out: BigGlyph[] = [];
  let at = x - Math.trunc((text.length * BIG_TEXT.advance) / 2);
  for (const ch of text) {
    const cell = bigCell(ch);
    if (cell) out.push({ x: at, y, u: cell.u, v: cell.v });
    at += BIG_TEXT.advance;
  }
  return out;
}

/** `FUN_0049b580`'s constants. */
export const MENU_TEXT_DRAW = {
  /** Sprite 50 of the front end's table: the sheet as 32 x 32 frames. */
  sprite: 50,
  /** Half scale, in the 320 space. */
  scale: 0x800,
  centre: 0xa0,
  halfAdvance: 6,
  advance: 12,
  /** The frame an apostrophe draws. */
  apostrophe: 47,
  /** The brightness that means "as it is": grey 0x80, opaque. */
  steady: 0x80,
} as const;

/** The frame of sprite 50 a character of the menu text draws, or null to skip. */
export function menuFrame(ch: string): number | null {
  if (ch === ' ') return null;
  if (ch === "'") return MENU_TEXT_DRAW.apostrophe;
  const c = ch.charCodeAt(0);
  return (c - 0x61) & 0xff;
}

export interface MenuGlyph { x: number; frame: number }

/** Lay a line of menu text out, centred on x 160 of the 320 space. */
export function layoutMenuText(text: string): MenuGlyph[] {
  const out: MenuGlyph[] = [];
  let x = MENU_TEXT_DRAW.centre - text.length * MENU_TEXT_DRAW.halfAdvance;
  for (const ch of text) {
    const frame = menuFrame(ch);
    if (frame !== null) out.push({ x, frame });
    x += MENU_TEXT_DRAW.advance;
  }
  return out;
}

/**
 * The colour and alpha a brightness draws the menu text at: 0x80 is the
 * texels as they are, anything else is white at `0xff - 2 * brightness`
 * (the engine packs `brightness * 0x200 + 0x60` into the mode word, whose
 * high byte is taken off 0xff for the alpha).
 */
export function menuTextColour(brightness: number): { grey: number; alpha: number } {
  if (brightness === MENU_TEXT_DRAW.steady) return { grey: 0x80, alpha: 1 };
  return { grey: 0xff, alpha: Math.max(0, 0xff - 2 * brightness) / 0xff };
}
