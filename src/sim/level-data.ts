/**
 * Per-level tables read out of toy2.exe. Nothing here is derived from the
 * level files; it is what the executable itself knows about each level.
 * Levels are numbered 1..15 as the game numbers them (world x 3 + level),
 * with every third one a boss.
 */

/** Game units (32 per level unit), +Y down, 12-bit yaw. */
export interface SpawnPoint { x: number; y: number; z: number; yaw: number }

/**
 * Where the player starts, from the table at `0x4f59a4`: sixteen bytes per
 * level — `i32 x, y, z; i16 yaw` — indexed by level id, with an unused entry
 * 0. The y is a seed rather than a resting height: the engine drops a ground
 * ray from 0x400 above it (docs/PLAYER.md), so put the player on whatever
 * floor is under the point rather than at the y itself. Checked for levels
 * 1..9: every one has floor within a few units of its seed.
 */
export const SPAWN_TABLE: readonly (SpawnPoint | null)[] = [
  null,
  { x: 194774, y: 60044, z: -361401, yaw: 0 },
  { x: -466652, y: 433, z: -32144, yaw: 1280 },
  { x: -47074, y: 97, z: -185901, yaw: 0 },
  { x: 411295, y: 11, z: 30702, yaw: 3154 },
  { x: 204615, y: 75, z: 114100, yaw: 2946 },
  { x: 264357, y: -1082, z: 2748, yaw: 3072 },
  { x: -128033, y: 76, z: -332419, yaw: 0 },
  { x: -4082, y: 40, z: 315274, yaw: 2047 },
  { x: 16532, y: 70, z: -141912, yaw: 4066 },
  { x: -291, y: -32978, z: -646, yaw: 1024 },
  { x: -262581, y: 174040, z: 253369, yaw: 1751 },
  { x: -121468, y: -76752, z: 63129, yaw: 1048 },
  { x: 27126, y: -94, z: 240599, yaw: 3068 },
  { x: -320338, y: 76, z: 983296, yaw: 1937 },
  { x: -36601, y: 69, z: -5416, yaw: 3066 },
];

/**
 * The five Pizza Planet tokens of a level, as object ids (`DatLevel.objectIds`).
 *
 * Each level's init function calls `FUN_004a0c80(list, spare)` with a
 * five-entry list of ids and the first of five consecutive spare ids. The
 * list order is the task order — slot 0 is the first mission on the level's
 * status screen — and at level start every listed token is hidden and its
 * pickup disabled; a task reveals its slot through `FUN_004a0db0`. The five
 * spares (`spare .. spare+4`) are copies of the token that are hidden
 * outright — in level 1 they stand in a row at the level's edge — and a
 * slot whose saved bit is already set swaps in one of them
 * (`FUN_004cd0c0`). Boss levels pass no list.
 *
 * Read from the call sites: level 1 at 0x4171d8 pushes 0x48 and the list at
 * 0x4f0edc, and so on in level order through 0x42faac.
 */
export const TOKEN_LISTS: Readonly<Record<number, { ids: readonly number[]; spare: number }>> = {
  1: { ids: [0x39, 0x3a, 0x3b, 0x3c, 0x30], spare: 0x48 },
  2: { ids: [0x33, 0x31, 0x32, 0x30, 0x34], spare: 0x41 },
  4: { ids: [0x60, 0x62, 0x64, 0x61, 0x63], spare: 0x75 },
  5: { ids: [0x59, 0x57, 0x56, 0x58, 0x55], spare: 0x41 },
  7: { ids: [0x31, 0x33, 0x34, 0x32, 0x30], spare: 0x41 },
  8: { ids: [0x31, 0x33, 0x32, 0x35, 0x34], spare: 0x41 },
  10: { ids: [0x6b, 0x6c, 0x6e, 0x6a, 0x6d], spare: 0x73 },
  11: { ids: [0x60, 0x62, 0x63, 0x64, 0x61], spare: 0x71 },
  13: { ids: [0x31, 0x32, 0x34, 0x30, 0x33], spare: 0x40 },
  14: { ids: [0x77, 0x76, 0x75, 0x74, 0x73], spare: 0x78 },
};

/**
 * What each token slot is, on every level (docs/LEVELS.md). The list order in
 * `TOKEN_LISTS` is this order.
 */
export enum TokenSlot {
  /** Talk to Hamm holding fifty coins. */
  HammCoins = 0,
  /** Return five lost things to their owner. */
  FindFive = 1,
  /** A race or timed challenge set by a character. */
  Challenge = 2,
  /** A token placed behind a puzzle or obstacle. */
  Puzzle = 3,
  Boss = 4,
}

/**
 * Slots a level's init reveals before play starts, quietly
 * (`FUN_004a0db0(slot, 1)`): the puzzle token on every non-boss level but 4,
 * whose paint-mixing puzzle reveals it from the tick instead. The other four
 * are revealed by their tasks, which are level script and not ported.
 */
export function tokenSlotsAtStart(level: number): readonly TokenSlot[] {
  if (!(level in TOKEN_LISTS) || level === 4) return [];
  return [TokenSlot.Puzzle];
}

/**
 * The first object id the pickup scan (`FUN_00447db0`) considers. Every used
 * id from here up is a pickup or trigger; ids below are scenery the level
 * code drives by hand. 0x30 unless the level says otherwise.
 */
export function firstPickupId(level: number): number {
  switch (level) {
    case 4: case 10: case 11: case 14: return 0x60;
    case 5: return 0x50;
    case 16: return 400;
    default: return 0x30;
  }
}

/**
 * Which scene a level number plays in, from `InitLevelPlay` (`FUN_00452fc0`):
 * the directory is `level%02d` of the level number, except that numbers above
 * ten subtract ten and set a flag that selects `level1.*` instead of
 * `level.*`. So levels 1..10 are `level01/level` .. `level10/level`, and
 * 11..15 are `level01/level1` .. `level05/level1`. The token lists agree:
 * level 11's five ids are tokens in `level01/level1.dat` and nowhere else.
 */
export function sceneForLevel(level: number): string | null {
  if (level < 1 || level > 15) return null;
  return level <= 10
    ? `level${String(level).padStart(2, '0')}/level`
    : `level${String(level - 10).padStart(2, '0')}/level1`;
}

/** The inverse: `level01/level` -> 1, `level03/level1` -> 13. Null for any other scene. */
export function levelNumber(sceneId: string): number | null {
  const m = /^level(\d+)\/level(1?)$/.exec(sceneId);
  if (!m) return null;
  const dir = Number(m[1]);
  if (m[2] === '') return dir >= 1 && dir <= 10 ? dir : null;
  return dir >= 1 && dir <= 5 ? dir + 10 : null;
}

/**
 * A hint sign (docs/LEVELS.md, "Hint signs and the talk box"): the
 * six-polygon signpost `objectId`, the path whose node 0 is where Buzz is
 * stood and whose nodes 2.. the camera flies along, the address of the hint
 * text in toy2.exe (a C string; read it with `exeString`), and the heading
 * Buzz is turned to while the box is up.
 */
export interface HintSign { objectId: number; pathTag: number; text: number; playerYaw: number }

/**
 * Each level's hint-sign table, from the `FUN_004025c0(table)` call in its
 * init: ten 16-byte records at most, ended by a negative id. Level 1's is at
 * 0x4f0ee8. Level 2's table (0x4f153c) has no terminator, so the game reads
 * garbage after its one record; only the record is kept here. Levels not
 * listed have no signs.
 */
export const HINT_SIGNS: Readonly<Record<number, readonly HintSign[]>> = {
  1: [
    { objectId: 67, pathTag: 31, text: 0x4f0638, playerYaw: 2048 },
    { objectId: 62, pathTag: 32, text: 0x4f05bc, playerYaw: 2048 },
    { objectId: 63, pathTag: 33, text: 0x4f0a18, playerYaw: 2435 },
    { objectId: 64, pathTag: 34, text: 0x4f0730, playerYaw: 2048 },
    { objectId: 68, pathTag: 35, text: 0x4f0784, playerYaw: 727 },
    { objectId: 65, pathTag: 36, text: 0x4f07fc, playerYaw: 226 },
    { objectId: 69, pathTag: 37, text: 0x4f08b8, playerYaw: 48 },
    { objectId: 66, pathTag: 38, text: 0x4f090c, playerYaw: 3072 },
    { objectId: 71, pathTag: 40, text: 0x4f04d0, playerYaw: 0 },
  ],
  2: [{ objectId: 70, pathTag: 12, text: 0x4f1460, playerYaw: 2048 }],
  4: [{ objectId: 116, pathTag: 33, text: 0x4f1570, playerYaw: 0 }],
  7: [{ objectId: 70, pathTag: 20, text: 0x4f2844, playerYaw: 1024 }],
  10: [
    { objectId: 112, pathTag: 34, text: 0x4f3314, playerYaw: 0 },
    { objectId: 113, pathTag: 35, text: 0x4f3368, playerYaw: 0 },
    { objectId: 114, pathTag: 36, text: 0x4f33ac, playerYaw: 0 },
  ],
  11: [
    { objectId: 120, pathTag: 22, text: 0x4f3c54, playerYaw: 3072 },
    { objectId: 119, pathTag: 21, text: 0x4f3d04, playerYaw: 3072 },
  ],
  14: [{ objectId: 150, pathTag: 30, text: 0x4f4b08, playerYaw: 2048 }],
};

/**
 * The two talk scripts (docs/LEVELS.md, "The script"), as the words sit in
 * the executable. The dialogue script has four slots `FUN_004027f0` writes
 * before running it: the path tag (word 1), the creature (words 6 and 12),
 * Buzz's yaw (word 10) and the creature's yaw (word 13).
 */
export const TALK_SCRIPTS = {
  /** 0x4df69c: stand Buzz on node 0, fly from node 2, hold. */
  hint: [1, -1, 0, 4, 2, 3, -1, 10, 7, -1, 8, -1],
  /** 0x4df6cc: select the path, place and face both, fly from node 2, hold. */
  dialogue: [0, 0, 1, -1, 0, 1, 0, 1, 2, -1, 0, 2, 0, 0, 4, 2, 3, -1, 10, 7, -1, 8, -1],
} as const;

/**
 * A push block (docs/LEVELS.md, "Push blocks"): the crate Buzz shoves along
 * `pathTag`. `sceneObject` is the .ngn scene object that moves with it (-2
 * for none) and `collisionObject` the number of the dynamic collision group
 * in TERRAIN.ALL that moves with it (`AllGroup.objectNumber`).
 */
export interface PushBlock { sceneObject: number; collisionObject: number; pathTag: number }

/**
 * Each level's push-block table, from the `FUN_004335d0(table)` call in its
 * init (level 1's is at 0x4f0f90); levels not listed pass 0. Entry order is
 * the order of the sparkle points in path tag 58.
 */
export const PUSH_BLOCKS: Readonly<Record<number, readonly PushBlock[]>> = {
  1: [
    { sceneObject: 1, collisionObject: 5, pathTag: 1 },
    { sceneObject: 2, collisionObject: 6, pathTag: 2 },
    { sceneObject: 3, collisionObject: 7, pathTag: 3 },
    { sceneObject: 4, collisionObject: 1, pathTag: 4 },
    { sceneObject: 7, collisionObject: 3, pathTag: 7 },
    { sceneObject: 8, collisionObject: 4, pathTag: 8 },
    { sceneObject: 0, collisionObject: 0, pathTag: 0 },
  ],
  2: [
    { sceneObject: -2, collisionObject: 2, pathTag: 4 },
    { sceneObject: -2, collisionObject: 11, pathTag: 20 },
  ],
  4: [
    { sceneObject: 32, collisionObject: 0, pathTag: 3 },
    { sceneObject: 12, collisionObject: 18, pathTag: 5 },
  ],
  5: [
    { sceneObject: 14, collisionObject: 0, pathTag: 12 },
    { sceneObject: 0, collisionObject: 17, pathTag: 6 },
    { sceneObject: -2, collisionObject: 18, pathTag: 7 },
    { sceneObject: 51, collisionObject: 26, pathTag: 21 },
  ],
  7: [
    { sceneObject: 8, collisionObject: 5, pathTag: 0 },
    { sceneObject: 9, collisionObject: 6, pathTag: 1 },
  ],
  8: [
    { sceneObject: 0, collisionObject: 0, pathTag: 1 },
    { sceneObject: 15, collisionObject: 3, pathTag: 2 },
    { sceneObject: 19, collisionObject: 4, pathTag: 3 },
  ],
  11: [
    { sceneObject: 30, collisionObject: 19, pathTag: 13 },
    { sceneObject: 29, collisionObject: 20, pathTag: 0 },
    { sceneObject: 81, collisionObject: 21, pathTag: 14 },
  ],
  13: [{ sceneObject: 8, collisionObject: 11, pathTag: 0 }],
};

/** The path tag whose nodes are the sparkle points (docs/LEVELS.md, "Reserved path tags"). */
export const SPARKLE_PATH_TAG = 58;

/**
 * Read a C string out of toy2.exe by its address. Every section of the
 * executable is mapped at its file offset plus 0x400000, so no header
 * parsing is needed. The game's text lives in the user's own copy and is
 * read from there at run time; it is never stored in this repository.
 */
export function exeString(exe: Uint8Array, address: number): string {
  const start = address - 0x400000;
  if (start < 0 || start >= exe.length) throw new RangeError(`address 0x${address.toString(16)} is outside toy2.exe`);
  let end = start;
  while (end < exe.length && exe[end] !== 0) end++;
  let out = '';
  for (let i = start; i < end; i++) out += String.fromCharCode(exe[i]!);
  return out;
}
