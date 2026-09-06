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

/**
 * The strings the shared task helpers use on every level, by address in
 * toy2.exe. Read them with `exeString`; they are never stored here.
 */
export const TASK_TEXT = {
  /** Hamm, before you have the coins (`FUN_004a1ce0`). */
  hammAsk: 0x5027e0,
  /** Hamm, handing the token over. */
  hammGive: 0x502834,
  /** The hint NPC once every slot is done (`FUN_004a1e60`). */
  allTokens: 0x502868,
  /** What the talk box shows while a page waits (`FUN_00401c30`). */
  pressJump: 0x4df684,
} as const;

/** Who runs which task on a level, from its tick's calls to the helpers. */
export interface LevelTasks {
  /** `FUN_004a1ce0(creature, pathTag, x, y, slot)`: talk to him holding fifty coins. */
  hamm?: { creature: number; pathTag: number; playerYaw: number; creatureYaw: number; slot: number };
  /** `FUN_004a1e60(creature, pathTag, hints)`: says what is still to do. */
  hintNpc?: { creature: number; pathTag: number; hints: readonly number[] };
  /**
   * The level's race (`slot 2`): who offers it, and the box whose edge is the
   * finish line. The engine turns the player's position into four bits, one
   * per side of that box, and counts a lap each time he crosses the first
   * bit's edge outward having crossed it inward (level 1's tick).
   */
  race?: {
    creature: number; pathTag: number; text: number;
    laps: number; slot: number;
  } & ({
    /**
     * Level 1's shape: four bits, one per side of a box, and a lap each time
     * Buzz leaves across the first bit's edge.
     */
    style: 'lap';
    xMin: number; xMax: number; zMin: number; zMax: number;
  } | {
    /**
     * Level 2's shape: eight checkpoints that have to be passed in order,
     * each a two-bit quadrant code. The first four are measured against one
     * pair of thresholds and the last four against another, and the lap
     * lands when the eighth is passed and Buzz is beyond `finishZ`.
     */
    style: 'checkpoints';
    codes: readonly number[];
    first: { x: number; z: number };
    second: { x: number; z: number };
    finishZ: number;
  });
  /**
   * The mini-boss (`slot 4`). It idles in a closed loop until its taunt
   * dialogue has been seen: the handler opens that when Buzz is in its box
   * and within the height band of its platform, and the level's tick then
   * kicks its script to `wakeWord` and gives it the chase flag.
   */
  boss?: {
    /** The creature that has to go: its removal is the win. */
    creature: number;
    slot: number;
    /**
     * Ticks between the boss disappearing and the token appearing. The level
     * scripts run a counter from 3 to 0x78 and award there, then latch at
     * 200; read from level 5 and matched on 13.
     */
    delay: number;
    /**
     * Level 1's boss also has to be woken: its script idles in a closed loop
     * until its taunt has been seen, and the level's tick then kicks the
     * script to `wakeWord`. Only level 1's is read out.
     */
    taunt?: {
      pathTag: number; text: number;
      playerYaw: number; creatureYaw: number;
      /** Buzz has to be between these heights, game units, +Y down. */
      yMin: number; yMax: number;
      wakeWord: number;
    };
  };
  /**
   * Mr Potato Head (`FUN_004a2480`). He has three lines, chosen by whether
   * his missing part is still out there, in Buzz's hands, or already
   * returned, and handing it back grants the level's power-up.
   */
  potato?: {
    creature: number; pathTag: number;
    /**
     * Where he stands once he has his part back. Levels 7 and 10 pass his
     * path in a variable, and that variable is only ever this two-way
     * choice on whether the part is still wanted.
     */
    pathTagDone?: number;
    /** Said while the part is still out there. */
    askText: number;
    /** Said when Buzz brings it. */
    thanksText: number;
    /** Said once it is done: what the power-up is for. */
    explainText: number;
    playerYaw: number; creatureYaw: number;
  };
  /**
   * A slot that is simply offered: talking once reveals its token, and
   * getting to where the token then sits is the whole task. Level 14's
   * "if you can reach the end" is one of these.
   */
  offer?: { creature: number; pathTag: number; text: number; slot: number };
  /**
   * Level 7's egg, a timed run offered twice.
   *
   * Talking to the rooster starts a run against a clock. The FIRST run ends
   * when the chick is gone (the tick reads entity 6's type field), and its
   * reward is not handed over then: it arrives the next time Buzz speaks to
   * him, on the line that offers the SECOND, quicker run. That line is the
   * one carrying the token, so the token appears and the shorter clock is
   * what has to beat it. Talking while a run is going gets the hurry line
   * and nothing else.
   *
   * The clock is the shared counter at `DAT_0052ad64`, which counts down to
   * a floor of 100 and is stepped by the engine's 1-in-64 frame divider
   * (`DAT_0052f1cb`), so a start value of 0x96 is 50 seconds and 0x7e is 26.
   * Standing in `failZone` slams it to 99, which fails the run on the spot.
   */
  fetch?: {
    creature: number; pathTag: number;
    /** First offer, the line while a run is going, and the second offer. */
    askText: number; hurryText: number; againText: number;
    /** The creature whose disappearance ends the first run. */
    watch: number;
    /** Clock start values for the two runs, before the floor of 100. */
    firstClock: number; secondClock: number;
    /** Being in this zone fails a run at once, or -1 for no such zone. */
    failZone: number;
    slot: number;
  };
  /**
   * "Beat me to the top": accept the challenge, then get inside a box. The
   * engine's own test is an axis-aligned box in x and z with a height to be
   * under (`FUN_0049f460`), which is level 8's slot 2.
   */
  reachBox?: {
    creature: number; pathTag: number; text: number;
    xMin: number; xMax: number; zMin: number; zMax: number;
    /** Buzz has to be above this, so smaller: +Y is down. */
    yMax: number;
    slot: number;
  };
  /**
   * The collect-five-objects challenge that earns slot 2 on the levels that
   * have no race. Talking accepts it and zeroes the counter; talking again
   * hurries Buzz along or hands the token over. The count is category-9
   * objects (`DAT_00830d4c`).
   */
  challenge?: {
    creature: number; pathTag: number;
    askText: number; hurryText: number; doneText: number;
    needed: number; slot: number;
  };
  /** The find-five owner: their two lines and the slot the second one reveals. */
  findFive?: {
    creature: number; pathTag: number;
    askText: number; doneText: number; slot: number;
    /** How many of the thing there are. */
    needed: number;
    /**
     * Where the count comes from. On all ten levels the five lost things are
     * creatures, counted into one global (`DAT_0052b7d8`) by whichever type
     * carries the collectable handler there.
     *
     * The other counter, `DAT_00830d4c` over category-9 objects, looked like
     * this task at first and is not: on levels 4, 5, 11 and 13 it gates the
     * SLOT 2 challenge, a collect-five-objects task with its own three lines.
     */
    countedBy: 'creature' | 'pickup';
  };
}

/**
 * Level 1's, read from `FUN_00417680`: Hamm on the sofa is creature 0x1e,
 * Rex is the hint NPC at 0x23 with the five-string table at 0x4f0f7c, and Bo
 * Peep at creature 1 wants her five sheep back.
 *
 * The other levels' tables are the same shape and are not read out yet.
 */
/**
 * Every level's talkers, read from the `FUN_004a1ce0` / `FUN_004a1e60` calls
 * in its tick and the find-five owner's pair of lines. The five boss arenas
 * (3, 6, 9, 12, 15) have no tasks of their own.
 *
 * The find-five counter is per level and lives in that level's creature
 * handler: only level 1's sheep are counted so far, so the other owners keep
 * asking. Everything else works on all ten.
 */
export const LEVEL_TASKS: Readonly<Record<number, LevelTasks>> = {
  1: {
    potato: { creature: 0x1f, pathTag: 0x19, askText: 0x4f0adc, thanksText: 0x4f0b60, explainText: 0x4f0c10, playerYaw: 0x200, creatureYaw: 0xa00 },
    hamm: { creature: 0x1e, pathTag: 0x1d, playerYaw: 0xe10, creatureYaw: 0x6e0, slot: 0 },
    boss: {
      creature: 8, slot: 4, delay: 0x78,
      taunt: {
        pathTag: 0x1a, text: 0x4f0330,
        playerYaw: 0xe23, creatureYaw: 0x700,
        yMin: -205114, yMax: -179566,
        wakeWord: 10,
      },
    },
    race: {
      style: 'lap',
      creature: 0x1d, pathTag: 0x1b, text: 0x4f042c,
      xMin: 0x2900, xMax: 0x21000, zMin: -0x1e000, zMax: -0x1a000,
      laps: 3, slot: 2,
    },
    hintNpc: {
      creature: 0x23, pathTag: 0x27,
      hints: [0x4f0c78, 0x4f0cac, 0x4f0cf0, 0x4f0d54, 0x4f0e18],
    },
    findFive: {
      creature: 0x1, pathTag: 0x1c,
      askText: 0x4f036c, doneText: 0x4f03e0, slot: 1, needed: 5, countedBy: 'creature',
    },
  },
  2: {
    boss: { creature: 0x1a, slot: 4, delay: 0x78 },
    race: {
      style: 'checkpoints',
      creature: 0x1d, pathTag: 5, text: 0x4f10f8,
      codes: [0, 1, 3, 2, 3, 1, 0, 2],
      first: { x: 0x25342, z: 0x3cc17 },
      second: { x: 0xb9c2, z: -0x42069 },
      finishZ: -0x24269,
      laps: 3, slot: 2,
    },
    hamm: { creature: 0xf, pathTag: 0x8, playerYaw: 0xc00, creatureYaw: 0x400, slot: 0 },
    hintNpc: {
      creature: 0x1b, pathTag: 0xb,
      hints: [0x4f11a0, 0x4f11f4, 0x4f126c, 0x4f1358, 0x4f13a8],
    },
    findFive: {
      creature: 0x6, pathTag: 0x7,
      askText: 0x4f0fc0, doneText: 0x4f1078, slot: 1, needed: 5, countedBy: 'creature',
    },
  },
  4: {
    boss: { creature: 0x18, slot: 4, delay: 0x78 },
    challenge: { creature: 0x1a, pathTag: 0x1f, askText: 0x4f1710, hurryText: 0x4f178c, doneText: 0x4f17c0, needed: 5, slot: 2 },
    potato: { creature: 0x15, pathTag: 0x1e, askText: 0x4f1818, thanksText: 0x4f18a0, explainText: 0x4f192c, playerYaw: 0x440, creatureYaw: 0xc40 },
    hamm: { creature: 0x14, pathTag: 0x1d, playerYaw: 0xe10, creatureYaw: 0x6e0, slot: 0 },
    hintNpc: {
      creature: 0x11, pathTag: 0x23,
      hints: [0x4f196c, 0x4f199c, 0x4f19ec, 0x4f1a30, 0x4f1a6c],
    },
    findFive: {
      creature: 0x12, pathTag: 0x20,
      askText: 0x4f15d4, doneText: 0x4f1650, slot: 1, needed: 5, countedBy: 'creature',
    },
  },
  5: {
    boss: { creature: 0x3, slot: 4, delay: 0x78 },
    challenge: { creature: 0x12, pathTag: 0x0e, askText: 0x4f1e3c, hurryText: 0x4f1eb0, doneText: 0x4f1ed4, needed: 5, slot: 2 },
    hamm: { creature: 0x14, pathTag: 0xf, playerYaw: -1, creatureYaw: 0x0, slot: 0 },
    hintNpc: {
      creature: 0x22, pathTag: 0x14,
      hints: [0x4f1f20, 0x4f1f58, 0x4f1fa4, 0x4f200c, 0x4f2070],
    },
    findFive: {
      creature: 0x13, pathTag: 0x10,
      askText: 0x4f1d5c, doneText: 0x4f1dec, slot: 1, needed: 5, countedBy: 'creature',
    },
  },
  7: {
    potato: { creature: 0x0e, pathTag: 2, pathTagDone: 10, askText: 0x4f21b8, thanksText: 0x4f223c, explainText: 0x4f22ec, playerYaw: 0x600, creatureYaw: 0xe00 },
    fetch: {
      creature: 0x0d, pathTag: 8, watch: 6, slot: 2,
      askText: 0x4f2460, hurryText: 0x4f24f0, againText: 0x4f2520,
      firstClock: 0x96, secondClock: 0x7e, failZone: 4,
    },
    boss: { creature: 0x0, slot: 4, delay: 0x78 },
    hamm: { creature: 0x1, pathTag: 0x3, playerYaw: 0xe10, creatureYaw: 0x6e0, slot: 0 },
    hintNpc: {
      creature: 0x1f, pathTag: 0xb,
      hints: [0x4f2598, 0x4f25c4, 0x4f26bc, 0x4f2718, 0x4f2804],
    },
    findFive: {
      creature: 0xc, pathTag: 0x4,
      askText: 0x4f23a4, doneText: 0x4f2418, slot: 1, needed: 5, countedBy: 'creature',
    },
  },
  8: {
    reachBox: { creature: 1, pathTag: 0x0c, text: 0x4f2ba0, xMin: -468572, xMax: -393436, zMin: 76232, zMax: 102728, yMax: -0x1419a, slot: 2 },
    hamm: { creature: 0x0, pathTag: 0xa, playerYaw: -1, creatureYaw: 0x0, slot: 0 },
    hintNpc: {
      creature: 0x29, pathTag: 0x5,
      hints: [0x4f2c08, 0x4f2c3c, 0x4f2c94, 0x4f2d0c, 0x4f2d68],
    },
    findFive: {
      creature: 0x2, pathTag: 0xb,
      askText: 0x4f2ae4, doneText: 0x4f2b58, slot: 1, needed: 5, countedBy: 'creature',
    },
  },
  10: {
    potato: { creature: 7, pathTag: 0x25, pathTagDone: 0x20, askText: 0x4f30a0, thanksText: 0x4f3120, explainText: 0x4f31ec, playerYaw: -1, creatureYaw: 0xe00 },
    offer: { creature: 0x16, pathTag: 0x21, text: 0x4f3284, slot: 2 },
    boss: { creature: 0x8, slot: 4, delay: 0x78 },
    hamm: { creature: 0x6, pathTag: 0x1d, playerYaw: -1, creatureYaw: 0x0, slot: 0 },
    hintNpc: {
      creature: 0x17, pathTag: 0x26,
      hints: [0x4f33fc, 0x4f3464, 0x4f34cc, 0x4f3520, 0x4f3574],
    },
    findFive: {
      creature: 0x0, pathTag: 0x1e,
      askText: 0x4f2fe0, doneText: 0x4f3058, slot: 1, needed: 5, countedBy: 'creature',
    },
  },
  11: {
    boss: { creature: 0xb, slot: 4, delay: 0x78 },
    challenge: { creature: 2, pathTag: 0x12, askText: 0x4f3948, hurryText: 0x4f39c0, doneText: 0x4f39ec, needed: 5, slot: 2 },
    hamm: { creature: 0x0, pathTag: 0xf, playerYaw: -1, creatureYaw: 0x0, slot: 0 },
    hintNpc: {
      creature: 0xc, pathTag: 0x14,
      hints: [0x4f3a3c, 0x4f3abc, 0x4f3afc, 0x4f3b40, 0x4f3c08],
    },
    findFive: {
      creature: 0x1, pathTag: 0x11,
      askText: 0x4f3874, doneText: 0x4f3900, slot: 1, needed: 5, countedBy: 'creature',
    },
  },
  13: {
    boss: { creature: 0x20, slot: 4, delay: 0x78 },
    challenge: { creature: 5, pathTag: 0x1e, askText: 0x4f40b4, hurryText: 0x4f4124, doneText: 0x4f414c, needed: 5, slot: 2 },
    potato: { creature: 8, pathTag: 0x1f, askText: 0x4f4268, thanksText: 0x4f42b8, explainText: 0x4f4384, playerYaw: -1, creatureYaw: 0xe00 },
    hamm: { creature: 0x6, pathTag: 0x1d, playerYaw: -1, creatureYaw: 0x0, slot: 0 },
    hintNpc: {
      creature: 0x21, pathTag: 0x22,
      hints: [0x4f4410, 0x4f4448, 0x4f4498, 0x4f44f4, 0x4f4578],
    },
    findFive: {
      creature: 0x7, pathTag: 0x21,
      askText: 0x4f419c, doneText: 0x4f4210, slot: 1, needed: 5, countedBy: 'creature',
    },
  },
  14: {
    offer: { creature: 0x26, pathTag: 4, text: 0x4f471c, slot: 2 },
    boss: { creature: 0x2e, slot: 4, delay: 0x78 },
    hamm: { creature: 0x27, pathTag: 0x2, playerYaw: -1, creatureYaw: 0x0, slot: 0 },
    hintNpc: {
      creature: 0x2f, pathTag: 0xa,
      hints: [0x4f488c, 0x4f48b0, 0x4f48f8, 0x4f4998, 0x4f4a6c],
    },
    findFive: {
      creature: 0x28, pathTag: 0x3,
      askText: 0x4f47cc, doneText: 0x4f4844, slot: 1, needed: 5, countedBy: 'creature',
    },
  },
};

/**
 * Mr Potato Head's five power-ups, by the bit the hand-over ORs into the
 * player's set (`DAT_00503a23[level * 2]`, granted in `FUN_004a2480`). The
 * fifth was open in CLAUDE.md: it is the hover boots.
 */
export const POWER_UP = {
  cosmicShield: 0x01,
  rocketBoots: 0x02,
  diskLauncher: 0x04,
  hoverBoots: 0x08,
  grapplingHook: 0x10,
} as const;

/**
 * Which part he is missing on each level and which power-up he gives back,
 * from the two-byte-per-level table at 0x503a22. Only five levels have one.
 */
export const POTATO_PARTS: Readonly<Record<number, { part: number; power: number }>> = {
  1: { part: 8, power: POWER_UP.cosmicShield },
  4: { part: 9, power: POWER_UP.diskLauncher },
  7: { part: 1, power: POWER_UP.rocketBoots },
  10: { part: 4, power: POWER_UP.grapplingHook },
  13: { part: 5, power: POWER_UP.hoverBoots },
};

/** Coins Hamm wants before he hands over his token (`0x31 <` in the original). */
export const HAMM_COINS = 50;
