/**
 * The executable's own 2D sprite table: what the HUD, the coins, the text
 * box and the effects are drawn with. Read from the user's toy2.exe at
 * runtime, like the game text; nothing from it is stored here.
 *
 * `FUN_00447d40` builds a 128-entry pointer table at `DAT_00557500` when a
 * level loads: entries 0..49 are the fifty global headers pointed to from
 * `PTR_DAT_004ec0a4` (ten of them null), and entries 50 onward are the
 * level's own, copied from the -1 terminated pointer list at
 * `PTR_PTR_004f7284[level]`. The level-ID is the loader's (`DAT_0088278c`):
 * 0 is the front end, with 34 headers, 1..15 the levels, with 0 to 6 each.
 * A negative sprite number in a draw call means the default header at
 * 0x4f7268, which is a 1 x 1 pixel of texture -1: nothing.
 *
 * A header is
 *
 *     i16 texture      the texture SLOT, 0..63 (`FUN_004ce2c0` looks it up
 *                      in the loaded set at `(slot + 0x28) * 16`); these are
 *                      the same sparse slot numbers the .ngn texture sets
 *                      carry, and every levelNN/level.ngn holds 31 (the HUD
 *                      and effects sheet) and 32 (the font sheet, with the
 *                      power-up icons)
 *     u8  width, height  of one frame, in texels
 *     u16 x2           unused, always zero
 *     (u8 u, u8 v) x N the top-left texel of each frame
 *
 * Nothing records N: a draw passes the frame it wants and the code that
 * calls it knows how many there are. `frameCapacity` here is only how many
 * pairs fit before the next header starts, which bounds N from above (the
 * last header of a run reads into whatever follows it, so it can overshoot).
 *
 * The draw (`FUN_00493f40` and its siblings) takes the frame's texel rect
 * `(u, v) .. (u + width, v + height)` divided by the texture's size as UVs,
 * so a frame is exactly `width x height` texels and never scaled by the
 * table. See docs/HUD.md.
 */

/** `PTR_DAT_004ec0a4`: the fifty global header pointers. */
const GLOBAL_TABLE = 0x4ec0a4;
const GLOBAL_COUNT = 50;
/** `PTR_PTR_004f7284`: one -1 terminated pointer list per level ID. */
const LEVEL_TABLE = 0x4f7284;
/** Entries per level-ID list that the loader will read. */
const LEVEL_TABLE_SIZE = 20;
/** The header a negative sprite number draws: 1 x 1 of texture -1. */
const DEFAULT_HEADER = 0x4f7268;
/** `DAT_00557500` holds 128 pointers; the level's headers start at 50. */
export const LEVEL_SPRITE_BASE = 50;
const TABLE_CAPACITY = 128;

/** Every section of toy2.exe is mapped at its file offset plus this. */
const IMAGE_BASE = 0x400000;

export interface SpriteHeader {
  /** Address of the header in toy2.exe. */
  address: number;
  /** Texture slot, 0..63; -1 on the default header. */
  texture: number;
  /** Frame size, texels. */
  width: number;
  height: number;
  /** Top-left texel of each frame, as many as fit before the next header. */
  frames: { u: number; v: number }[];
}

/**
 * The 128-entry table for a level ID, with `null` where the executable has
 * a null pointer or nothing at all. Indices 0..49 are global and identical
 * for every level; `LEVEL_SPRITE_BASE` onward are the level's own.
 */
export function readSpriteTable(exe: Uint8Array, levelId: number): (SpriteHeader | null)[] {
  const view = new DataView(exe.buffer, exe.byteOffset, exe.byteLength);
  const u32 = (address: number) => view.getUint32(address - IMAGE_BASE, true);
  const i32 = (address: number) => view.getInt32(address - IMAGE_BASE, true);

  const pointers: number[] = [];
  for (let i = 0; i < GLOBAL_COUNT; i++) pointers.push(u32(GLOBAL_TABLE + 4 * i));
  if (levelId < 0 || levelId >= LEVEL_TABLE_SIZE) {
    throw new RangeError(`level ID ${levelId} has no sprite list`);
  }
  let p = u32(LEVEL_TABLE + 4 * levelId);
  while (pointers.length < TABLE_CAPACITY) {
    const h = i32(p);
    if (h === -1) break;
    pointers.push(h);
    p += 4;
  }

  // Frame capacity is bounded by the next header in memory, so gather every
  // header address the executable knows about first.
  const known = new Set<number>([DEFAULT_HEADER]);
  for (let lv = 0; lv < LEVEL_TABLE_SIZE; lv++) {
    let q = u32(LEVEL_TABLE + 4 * lv);
    for (let n = 0; n < TABLE_CAPACITY; n++) {
      const h = i32(q);
      if (h === -1) break;
      known.add(h);
      q += 4;
    }
  }
  for (const h of pointers) if (h) known.add(h);
  const sorted = [...known].sort((a, b) => a - b);

  const table: (SpriteHeader | null)[] = [];
  for (const h of pointers) table.push(h ? readHeader(exe, h, sorted) : null);
  while (table.length < TABLE_CAPACITY) table.push(null);
  return table;
}

/** The header a negative sprite number resolves to. */
export function defaultSpriteHeader(exe: Uint8Array): SpriteHeader {
  return readHeader(exe, DEFAULT_HEADER, [DEFAULT_HEADER, DEFAULT_HEADER + 8]);
}

function readHeader(exe: Uint8Array, address: number, sorted: number[]): SpriteHeader {
  const view = new DataView(exe.buffer, exe.byteOffset, exe.byteLength);
  const at = address - IMAGE_BASE;
  const texture = view.getInt16(at, true);
  const width = exe[at + 2]!;
  const height = exe[at + 3]!;
  // The last header in memory has nothing after it to bound it; allow the
  // cap's worth of frames there.
  let next = address + 8 + 128;
  for (const h of sorted) { if (h > address) { next = h; break; } }
  const capacity = Math.max(0, Math.min(64, (next - address - 8) >> 1));
  const frames: { u: number; v: number }[] = [];
  for (let i = 0; i < capacity; i++) frames.push({ u: exe[at + 8 + 2 * i]!, v: exe[at + 9 + 2 * i]! });
  return { address, texture, width, height, frames };
}

/**
 * The global sprites the HUD, the pickups and the text box draw, by table
 * index, named from the sheets they land on (docs/HUD.md). The level's own
 * icons start at `LEVEL_SPRITE_BASE`.
 */
export const SPRITE = {
  /** Sheet 31: the big brown digits, frames 0..9, then '/' and a '?'. */
  bigDigits: 3,
  /** Sheet 31 (96,96): the soft round shadow under every pickup. */
  shadow: 4,
  /** Sheet 31: a single solid texel; every bar and the text box are this, scaled. */
  pixel: 6,
  /** Sheet 32: the Buzz figure beside the lives count. */
  lives: 10,
  /** Sheet 32: the battery the health bar fills. */
  battery: 11,
  /** Sheet 31: the battery's 7 x 32 glass column drawn over the fill. */
  batteryGlass: 12,
  /** Sheet 31: the 31 x 7 frame around a horizontal bar. */
  barFrame: 13,
  /** Sheet 32: the wings, beside the spin-charge bar. */
  wings: 14,
  /** Sheet 32: the laser arm, beside the laser bar. */
  laserArm: 15,
  /** Sheet 31: the coin, ten frames of spin (twelve in the table). */
  coin: 16,
  /** Sheet 32: the font; a..z are frames 0..25, digits 0x1a..0x23. */
  font: 20,
  /** Sheet 31: the chequered flag, beside a timed challenge. */
  flag: 26,
  /** Sheet 31: Mr Potato Head, shown while his part is carried. */
  potatoHead: 27,
  /** Sheet 31: the grey disc, beside the disc count. */
  disc: 28,
  /** Sheet 31: the signpost the second marker list stands on the floor. */
  signpost: 30,
  /** Sheet 31: Hamm, shown once fifty coins are held and his token is not. */
  hamm: 32,
  /** Sheet 31: the small brown piece beside the other ammo count. */
  ammoPiece: 33,
  /** The level's find-five thing, e.g. level 1's sheep. */
  levelFindIcon: LEVEL_SPRITE_BASE,
  /** The level's collect-five thing. */
  levelCollectIcon: LEVEL_SPRITE_BASE + 1,
} as const;

/** How many font frames past 0x1a a digit sits: frame = 0x1a + digit. */
export const FONT_DIGIT_BASE = 0x1a;
