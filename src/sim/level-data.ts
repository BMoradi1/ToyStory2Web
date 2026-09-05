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
