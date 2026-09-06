/**
 * Creature placements: record type 0x23 ("CreatListRam") of the level's
 * `gfx/levelNx.raw` packet file.
 *
 * The level loader (`FUN_00452310`) unpacks each RNC record of the `.raw`
 * and looks at its first u32. Type 0x23 is copied straight into a static
 * 2 KB block, `DAT_0052afd8`: **64 slots of 32 bytes**, and the creature
 * constructor `FUN_00406cd0` reads them by offset. An empty slot has type 0.
 *
 *     +0x00 i32 x, y, z     level units; the engine shifts left 5 (game units)
 *     +0x0c u8  type        creatures.cfg index (5 TINMAN, 6 SHEEP, ...)
 *     +0x0d u8  script      index into the 44 behaviour scripts in the exe
 *     +0x0e u8  turnRate    yaw easing per tick; 0 = never turn
 *     +0x0f u8  facing      the heading, in 1/256 turn (<< 4 -> 12-bit). The
 *                           constructor starts the creature at it, and a
 *                           non-zero value re-asserts it every tick
 *     +0x10 u8  health      copied to the entity; anything > 0 is alive
 *     +0x11 u8  respawn     seconds-ish before it comes back; 100 means 0x708
 *     +0x12 i16 flags       the entity's initial flags word (NOT a yaw: the
 *                           constructor writes it straight into entity +0x40,
 *                           and only 31 distinct values occur across the
 *                           install's 373 creatures, every one a combination
 *                           of the documented bits — enemies carry 0x100
 *                           "hurts on touch", the harmless sheep does not,
 *                           the hovering bots carry 0x010 "no gravity")
 *     +0x14 i16 rangeX      half-extent of the home box, in 256-unit steps
 *     +0x16 i16 rangeZ
 *     +0x18 i16 rangeYaw    the box's rotation, in 1/512 turn
 *     +0x1a u8  vulnerable  bit 0 spin, bit 1 body; exactly 4 bounces the
 *                           laser. Script opcode 0x1e writes it
 *     +0x1c u8  accel       walk acceleration (x 2 in the mover)
 *     +0x1d u8  accelSide   and sideways
 *     +0x1e u8  speedMax    top speed / 16; 0xff = reverse
 *     +0x1f u8  speed       current speed / 16; 0 = does not move
 *
 * The record is the creature's *home*: the entity keeps its live position
 * separately and is clamped back into the home box every tick, which is why
 * enemies never wander off their patch. See docs/CREATURES.md.
 */

export interface CreaturePlacement {
  slot: number;
  /** Level units, +Y down. */
  x: number; y: number; z: number;
  type: number;
  script: number;
  turnRate: number;
  facing: number;
  health: number;
  respawn: number;
  /** The entity's initial flags word — see the note above; this is not a yaw. */
  flags: number;
  rangeX: number;
  rangeZ: number;
  rangeYaw: number;
  vulnerable: number;
  accel: number;
  accelSide: number;
  speedMax: number;
  speed: number;
  /** The raw 32 bytes, for the fields not yet named. */
  raw: Uint8Array;
}

export const CREATURE_LIST_TYPE = 0x23;
export const CREATURE_SLOTS = 64;
export const CREATURE_RECORD_SIZE = 32;

/** Parse a type-0x23 record payload (its leading u32 included). */
export function parseCreatureList(data: Uint8Array): CreaturePlacement[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint32(0, true) !== CREATURE_LIST_TYPE) {
    throw new Error(`not a creature list: type 0x${view.getUint32(0, true).toString(16)}`);
  }
  const out: CreaturePlacement[] = [];
  for (let slot = 0; slot < CREATURE_SLOTS; slot++) {
    const p = 4 + slot * CREATURE_RECORD_SIZE;
    if (p + CREATURE_RECORD_SIZE > data.byteLength) break;
    const type = data[p + 0xc]!;
    if (type === 0) continue;
    out.push({
      slot,
      x: view.getInt32(p, true), y: view.getInt32(p + 4, true), z: view.getInt32(p + 8, true),
      type,
      script: data[p + 0xd]!,
      turnRate: data[p + 0xe]!,
      facing: data[p + 0xf]!,
      health: data[p + 0x10]!,
      respawn: data[p + 0x11]!,
      flags: view.getInt16(p + 0x12, true),
      rangeX: view.getInt16(p + 0x14, true),
      rangeZ: view.getInt16(p + 0x16, true),
      rangeYaw: view.getInt16(p + 0x18, true),
      vulnerable: data[p + 0x1a]!,
      accel: data[p + 0x1c]!,
      accelSide: data[p + 0x1d]!,
      speedMax: data[p + 0x1e]!,
      speed: data[p + 0x1f]!,
      raw: data.subarray(p, p + CREATURE_RECORD_SIZE),
    });
  }
  return out;
}

/**
 * Which `gfx/*.raw` a level uses, from the switch in `FUN_004500a0`:
 * levels 1..15 map to level1a..level5c, one per level in order.
 */
export function rawPacketForLevel(level: number): string | null {
  if (level < 1 || level > 15) return null;
  const world = Math.ceil(level / 3);
  const part = 'abc'[(level - 1) % 3]!;
  return `data/gfx/level${world}${part}.raw`;
}

/** `data/creatures.cfg`: `CREATURE <id> <NAME> <dir>` per line, to a name per type. */
export function parseCreatureNames(text: string): Map<number, string> {
  const names = new Map<number, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^CREATURE\s+(\d+)\s+(\S+)/.exec(line);
    if (m) names.set(Number(m[1]), m[2]!);
  }
  return names;
}
