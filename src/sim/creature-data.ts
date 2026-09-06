/**
 * Creature behaviour data, read out of toy2.exe.
 *
 * GENERATED from the 44-entry script table at 0x4e02c4, the 25-entry
 * animation-script table at 0x4e058c, the damage table at 0x4e066c, the
 * ground-probe table at 0x4e05ee and the constructor's per-type switch
 * (`FUN_00406cd0`). Do not hand-edit; docs/CREATURES.md explains every
 * field and how it was found, tools/ghidra/README.md how to rebuild the
 * decompile.
 *
 * A creature placement names one of AI_SCRIPTS by index (record byte +0x0d).
 * The script is a list of signed 16-bit words: an opcode, then that opcode's
 * operands (CREATURE_OPS gives the count). The interpreter in the engine runs
 * opcodes back to back until one blocks (`yield`, the two jumps, `facePlayer`
 * or anything unknown), and resumes on a later tick once the wait timer has
 * run out. See docs/CREATURES.md, "The script interpreter".
 */

/** Opcode -> [operand count, name]. Anything absent is a one-word blocking opcode. */
export const CREATURE_OPS: Readonly<Record<number, readonly [number, string]>> = {
  0: [0, 'end'],
  1: [1, 'wait'],
  2: [2, 'waitRandom'],
  3: [1, 'targetRandomDir'],
  4: [0, 'yield'],
  5: [1, 'targetRandomInBox'],
  6: [0, 'jumpToTarget'],
  7: [0, 'jumpToTargetStop'],
  8: [1, 'ifSkip'],
  0xb: [1, 'nop'],
  0xc: [2, 'flags'],
  0xd: [2, 'anim'],
  0xe: [1, 'testRandom'],
  0xf: [1, 'setSpeed'],
  0x10: [1, 'testPlayerNear'],
  0x11: [0, 'testPlayerInBox'],
  0x12: [1, 'testTargetNear'],
  0x13: [1, 'nop'],
  0x14: [1, 'setSpeedMax'],
  0x15: [0, 'resetFloor'],
  0x16: [2, 'colour'],
  0x17: [1, 'sound'],
  0x18: [1, 'velocityToTarget'],
  0x19: [1, 'face'],
  0x1a: [2, 'velocity'],
  0x1b: [0, 'targetPlayer'],
  0x1c: [1, 'velocityY'],
  0x1d: [1, 'setTurnRate'],
  0x1e: [1, 'setRecord1a'],
  0x1f: [1, 'targetPastPlayer'],
  0x20: [0, 'facePlayer'],
  0x21: [1, 'setTimer8a'],
  0x22: [0, 'testGlobalC620'],
  0x23: [1, 'targetAwayFromPlayer'],
  [-1]: [1, 'loopBack'],
};

/** The 44 behaviour scripts, signed 16-bit words. Index = placement byte +0x0d. */
export const AI_SCRIPTS: readonly (readonly number[])[] = [
  // 0: 0x4df728, 10 words
  [
    13, 0, 2, 22, -32, -32, 4, -1, 1, 0,
  ],
  // 1: 0x4df73c, 70 words
  [
    22, -32, -32, 13, 0, 2, 17, 8, 33, 1, 60, 4, 5, 0, 25, 1,
    1, 10, 4, 13, 1, 4, 1, 22, 4, 13, 1, 5, 24, -2048, 23, 14,
    7, 13, 1, 6, 1, 12, 4, -1, 37, 27, 25, 1, 1, 10, 4, 13,
    1, 4, 1, 22, 4, 13, 1, 1, 24, -2048, 23, 14, 7, 13, 1, 6,
    1, 12, 4, -1, 65, 0,
  ],
  // 2: 0x4df7c8, 6 words
  [
    22, -32, -32, 4, -1, 1,
  ],
  // 3: 0x4df7d4, 14 words
  [
    22, -64, -64, 13, 0, 7, 5, 256, 2, 31, 32, 4, -1, 6,
  ],
  // 4: 0x4df7f0, 16 words
  [
    13, 0, 2, 22, -32, -32, 28, -1024, 23, 32, 2, 63, 128, 4, -1, 8,
  ],
  // 5: 0x4df810, 110 words
  [
    13, 0, 1, 22, -32, -32, 17, 4, -1, 2, 13, 0, 1, 22, -32, -32,
    17, 8, 4, 4, -1, 4, 22, -64, -64, 13, 1, 9, 1, 44, 4, 13,
    2, 1, 1, 381, 4, 12, -265, 0, 13, 3, 9, 1, 64, 4, 22, -32,
    -32, 13, 5, 10, 23, 34, 1, 32, 4, 13, 5, 10, 23, 34, 1, 32,
    4, 13, 5, 10, 23, 34, 1, 32, 4, 12, -257, 256, 22, -64, -64, 13,
    4, 9, 1, 44, 4, 12, -9, 8, -1, 78, 22, -32, -32, 13, 6, 4,
    1, 32, 4, -1, 26, 22, -32, -32, 13, 7, 11, 4, -1, 1,
  ],
  // 6: 0x4df8ec, 10 words
  [
    13, 0, 1, 22, -32, -32, 4, -1, 1, 0,
  ],
  // 7: 0x4df900, 10 words
  [
    13, 0, 7, 22, -32, -32, 4, -1, 1, 0,
  ],
  // 8: 0x4df914, 10 words
  [
    13, 0, 13, 22, -32, -32, 4, -1, 1, 0,
  ],
  // 9: 0x4df928, 14 words
  [
    13, 0, 14, 22, -16, -16, 5, 1024, 2, 63, 64, 4, -1, 6,
  ],
  // 10: 0x4df944, 14 words
  [
    13, 4, 7, 22, -64, -64, 5, 128, 2, 63, 64, 4, -1, 6,
  ],
  // 11: 0x4df960, 50 words
  [
    22, -16, -16, 13, 0, 7, 1, 128, 4, 14, 3, 8, 3, -1, 10, 22,
    -32, -32, 13, 1, 4, 1, 24, 4, 22, -16, -16, 13, 3, 7, 1, 128,
    4, 14, 3, 8, 3, -1, 10, 22, -32, -32, 13, 2, 4, 1, 24, 4,
    -1, 48,
  ],
  // 12: 0x4df9c4, 82 words
  [
    13, 0, 14, 30, 7, 22, -32, -32, 17, 8, 5, 5, 1024, -1, -3, 27,
    12, -5, 4, 20, 96, 29, 10, 4, 18, 256, 8, 3, -1, 5, 12, -5,
    0, 1, 60, 4, 12, -5, 4, 20, 255, 29, 2, 17, 8, 5, 5, 1024,
    -1, -3, 27, 1, 60, 4, 12, -5, 0, 1, 30, 4, -1, 52, 30, 4,
    22, -64, -64, 13, 1, 7, 12, -261, 0, 1, 28, 4, 12, -257, 256, -1,
    79, 0,
  ],
  // 13: 0x4dfa68, 32 words
  [
    22, -32, -32, 12, -13, 0, 30, 4, 13, 0, 2, 4, -1, 1, 30, 7,
    12, -13, 12, 1, 768, 4, 30, 4, 12, -9, 0, 1, 256, 4, -1, 16,
  ],
  // 14: 0x4dfaa8, 108 words
  [
    22, -64, -64, 13, 1, 1, 4, -1, 1, 22, -64, -64, 13, 1, 1, 1,
    1, 4, 16, 1600, 8, 37, 22, -24, -24, 31, 6, 1, 15, 4, 13, 3,
    4, 1, 33, 4, 13, 3, 5, 24, -2048, 23, 211, 25, 2, 7, 23, 59,
    33, 3, 13, 3, 6, 1, 38, 4, -1, 47, 4, 4, 4, 22, -32, -32,
    13, 7, 1, 33, 2, 1, 40, 32, 33, 1, 1, 40, 32, -1, 68, 22,
    -19, -19, 30, 4, 13, 5, 1, 1, 150, 4, 30, 7, -1, 83, 22, -64,
    -64, 30, 4, 13, 1, 1, 1, 180, 4, -1, 3, 0,
  ],
  // 15: 0x4dfb80, 14 words
  [
    13, 0, 2, 22, -48, -48, 5, 128, 2, 63, 64, 4, -1, 6,
  ],
  // 16: 0x4dfb9c, 14 words
  [
    22, -64, -64, 13, 0, 2, 5, 256, 2, 31, 32, 4, -1, 6,
  ],
  // 17: 0x4dfbb8, 78 words
  [
    12, -5, 4, 22, 127, -64, 13, 0, 1, 15, 384, 5, 128, 4, 17, 8,
    12, 34, 8, 29, 14, 15, 8, 3, -1, 11, -1, 15, 22, 64, -64, 13,
    1, 20, 15, 1024, 17, 8, 3, -1, 36, 27, 4, 34, 8, 3, -1, 10,
    22, -32, -32, 13, 2, 10, 12, -5, 0, 1, 60, 32, 34, 8, 12, 13,
    3, 10, 1, 18, 4, 12, -5, 4, -1, 44, 32, -1, 15, 0,
  ],
  // 18: 0x4dfc54, 18 words
  [
    22, -64, -64, 13, 0, 2, 12, -13, 0, 4, -1, 1, 12, -13, 12, 4,
    -1, 1,
  ],
  // 19: 0x4dfc78, 24 words
  [
    13, 0, 2, 22, -48, -48, 5, 128, 12, -5, 4, 2, 63, 64, 4, 12,
    -5, 0, 2, 63, 64, 4, -1, 16,
  ],
  // 20: 0x4dfca8, 10 words
  [
    13, 1, 2, 22, -48, -48, 4, -1, 1, 0,
  ],
  // 21: 0x4dfcbc, 68 words
  [
    22, -32, -32, 13, 0, 2, 1, 30, 16, 3000, 8, 37, 16, 2000, 8, 4,
    4, -1, 9, 35, 2, 25, 1, 1, 10, 4, 13, 2, 4, 1, 22, 4,
    13, 2, 5, 24, -1280, 23, 14, 7, 13, 2, 6, 1, 12, 4, -1, 43,
    33, 1, 4, -1, 1, 13, 1, 1, 1, 92, 4, 13, 0, 2, 1, 92,
    4, -1, 53, 0,
  ],
  // 22: 0x4dfd44, 52 words
  [
    33, 1, 22, -32, -32, 13, 1, 9, 12, -13, 0, 30, 0, 1, 60, 4,
    12, -5, 4, 20, 254, 29, 0, 1, 24, 4, 22, -64, -64, 13, 0, 2,
    1, 10, 4, 30, 7, 12, -9, 8, 20, 64, 29, 5, 5, 512, 2, 63,
    64, 4, -1, 7,
  ],
  // 23: 0x4dfdac, 28 words
  [
    22, -32, -32, 13, 1, 14, 12, -5, 4, 5, 2048, 2, 63, 112, 4, 13,
    0, 2, 12, -5, 0, 2, 31, 32, 4, -1, 22, 0,
  ],
  // 24: 0x4dfde4, 70 words
  [
    22, -32, -32, 12, -5, 0, 13, 0, 2, 30, 4, 4, -1, 1, 30, 7,
    13, 0, 2, 1, 60, 32, 16, 1000, 8, 17, 12, -5, 4, 13, 1, 1,
    27, 1, 10, 4, 16, 1000, 8, 3, -1, 8, 12, -5, 0, 13, 3, 9,
    1, 32, 32, 33, 30, 1, 56, 32, -1, 40, 12, -5, 0, 22, -32, -32,
    13, 2, 12, 4, -1, 1,
  ],
  // 25: 0x4dfe70, 10 words
  [
    13, 0, 15, 22, -16, -16, 4, -1, 1, 0,
  ],
  // 26: 0x4dfe84, 18 words
  [
    13, 0, 16, 22, -16, -16, 26, 1024, 0, 1, 20, 4, 33, 10, 4, -1,
    1, 0,
  ],
  // 27: 0x4dfea8, 38 words
  [
    22, -32, -32, 12, -5, 0, 13, 0, 2, 30, 4, 4, -1, 1, 30, 7,
    13, 0, 2, 1, 60, 32, 12, -5, 4, 13, 1, 1, 22, -64, -64, 27,
    1, 10, 4, -1, 4, 0,
  ],
  // 28: 0x4dfef4, 22 words
  [
    22, -32, -32, 12, -13, 0, 13, 0, 2, 30, 4, 4, -1, 1, 30, 7,
    12, -13, 12, 4, -1, 1,
  ],
  // 29: 0x4dff20, 62 words
  [
    22, -32, -32, 13, 1, 1, 17, 8, 4, 4, -1, 4, 31, 0, 25, 1,
    13, 0, 4, 1, 22, 4, 13, 0, 5, 24, -1536, 23, 90, 7, 13, 0,
    6, 1, 22, 4, 31, -256, 25, 1, 13, 0, 4, 1, 22, 4, 13, 0,
    5, 24, -1536, 23, 90, 7, 13, 0, 6, 1, 22, 4, -1, 57,
  ],
  // 30: 0x4dff9c, 10 words
  [
    13, 0, 2, 22, -64, -64, 4, -1, 1, 0,
  ],
  // 31: 0x4dffb0, 10 words
  [
    13, 2, 2, 22, -48, -48, 4, -1, 1, 0,
  ],
  // 32: 0x4dffc4, 14 words
  [
    22, -64, -64, 13, 0, 2, 5, 1024, 2, 63, 64, 4, -1, 6,
  ],
  // 33: 0x4dffe0, 64 words
  [
    22, -48, -48, 12, -13, 0, 13, 3, 2, 30, 4, 4, -1, 1, 30, 7,
    12, -5, 4, 13, 0, 1, 27, 1, 33, 4, 27, 1, 33, 4, 16, 4000,
    8, 3, -1, 15, 12, -5, 0, 13, 1, 8, 1, 21, 32, 33, 30, 1,
    51, 32, -1, 34, 12, -5, 0, 22, -32, -32, 13, 2, 21, 4, -1, 1,
  ],
  // 34: 0x4e0060, 38 words
  [
    22, -48, -48, 13, 0, 1, 12, -5, 4, 5, 512, 2, 63, 128, 4, 12,
    -5, 0, 27, 13, 1, 22, 1, 39, 32, 33, 1, 1, 63, 32, 17, 8,
    3, -1, 30, -1, 17, 0,
  ],
  // 35: 0x4e00ac, 46 words
  [
    22, -64, -64, 12, -13, 0, 13, 1, 1, 30, 4, 4, -1, 1, 1, 60,
    4, 30, 7, 12, -5, 4, 22, 64, -64, 13, 0, 2, 27, 1, 66, 4,
    -1, 4, 12, -5, 0, 22, -32, -32, 13, 2, 2, 4, -1, 1,
  ],
  // 36: 0x4e0108, 14 words
  [
    13, 0, 15, 22, -32, -32, 5, 128, 2, 63, 64, 4, -1, 6,
  ],
  // 37: 0x4e0124, 28 words
  [
    22, -32, -32, 5, 0, 13, 0, 4, 1, 22, 4, 13, 0, 5, 24, -1536,
    23, 14, 7, 13, 0, 6, 1, 20, 4, -1, 22, 0,
  ],
  // 38: 0x4e015c, 14 words
  [
    22, -32, -32, 12, -13, 0, 13, 1, 2, 30, 4, 4, -1, 1,
  ],
  // 39: 0x4e0178, 58 words
  [
    22, -32, -32, 12, -13, 0, 13, 0, 1, 30, 4, 4, -1, 1, 30, 6,
    22, -32, -32, 12, -13, 0, 13, 0, 1, 1, 144, 4, 22, -64, -64, 12,
    -13, 12, 13, 1, 1, 5, 128, 2, 63, 64, 4, -1, 6, 12, -13, 0,
    22, -32, -32, 13, 2, 9, 4, -1, 1, 0,
  ],
  // 40: 0x4e01ec, 30 words
  [
    22, -32, -32, 5, 0, 25, 1, 13, 0, 4, 1, 22, 4, 13, 0, 5,
    24, -1280, 23, 14, 7, 13, 0, 6, 1, 20, 4, -1, 24, 0,
  ],
  // 41: 0x4e0228, 58 words
  [
    22, -32, -32, 12, -13, 0, 13, 0, 2, 30, 4, 4, -1, 1, 30, 6,
    22, -32, -32, 12, -13, 0, 13, 0, 2, 1, 24, 4, 22, -64, -64, 12,
    -13, 12, 13, 4, 1, 5, 128, 2, 63, 64, 4, -1, 6, 12, -13, 0,
    22, -32, -32, 13, 1, 21, 4, -1, 1, 0,
  ],
  // 42: 0x4e029c, 10 words
  [
    13, 0, 16, 22, -32, -32, 4, -1, 1, 0,
  ],
  // 43: 0x4e02b0, 10 words
  [
    13, 0, 1, 22, -64, -64, 4, -1, 1, 0,
  ],
];

/**
 * Animation frame scripts, indexed as the `anim` opcode's second operand
 * indexes them (entry 0 is unused). Bytes are frame numbers; 0xff n is a
 * marker: n = 1 holds the last frame, otherwise the script jumps back n
 * bytes. A script whose third byte is 0xff and fourth 0 is a single held
 * frame. See docs/CREATURES.md, "Animation scripts".
 */
export const ANIM_SCRIPTS: readonly (readonly number[])[] = [
  [],
  // 1: 0x4e0374
  [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    255, 24, 0, 0,
  ],
  // 2: 0x4e0390
  [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 255, 12, 0, 0,
  ],
  // 3: 0x4e03a0
  [
    0, 0, 255, 0,
  ],
  // 4: 0x4e03a4
  [
    0, 1, 2, 3, 4, 5, 6, 7, 255, 1, 0, 0,
  ],
  // 5: 0x4e03b0
  [
    8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 255, 1,
  ],
  // 6: 0x4e03bc
  [
    18, 19, 20, 21, 22, 23, 255, 1,
  ],
  // 7: 0x4e03c4
  [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 255, 16, 0, 0,
  ],
  // 8: 0x4e03d8
  [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    24, 25, 26, 27, 28, 29, 30, 31, 255, 32, 0, 0,
  ],
  // 9: 0x4e03fc
  [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    255, 0, 0, 0,
  ],
  // 10: 0x4e0418
  [
    0, 1, 2, 3, 4, 5, 255, 0,
  ],
  // 11: 0x4e0420
  [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 255, 0, 0, 0,
  ],
  // 12: 0x4e0434
  [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 255, 0, 0, 0,
  ],
  // 13: 0x4e0444
  [
    0, 0, 0, 0, 0, 255, 5, 0,
  ],
  // 14: 0x4e044c
  [
    0, 1, 2, 3, 4, 5, 255, 6,
  ],
  // 15: 0x4e0454
  [
    0, 1, 2, 3, 4, 5, 6, 7, 255, 8, 0, 0,
  ],
  // 16: 0x4e0460
  [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 255, 16, 0, 0,
  ],
  // 17: 0x4e0474
  [
    0, 1, 2, 3, 4, 5, 6, 255, 1, 0, 0, 0,
  ],
  // 18: 0x4e0480
  [
    7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 255, 1, 0, 0, 0,
  ],
  // 19: 0x4e0494
  [
    22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 255, 1,
  ],
  // 20: 0x4e04a0
  [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 255, 18,
  ],
  // 21: 0x4e04b4
  [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 255, 0,
  ],
  // 22: 0x4e04c8
  [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 255, 1,
  ],
  // 23: 0x4e04f0
  [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47,
    48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 255,
    1, 0, 0, 0,
  ],
  // 24: 0x4e053c
  [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47,
    255, 1, 0, 0,
  ],
  // 25: 0x4e0570
  [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 22,
    255, 11, 0, 0,
  ],
];

/**
 * What each attack does to a creature (`FUN_00408a60`'s table at 0x4e066c).
 * `mode` 0 = only shove it, 1 = hurt, 2 = hurt only if the placement's byte
 * +0x1a has bit 0 (spin-vulnerable), 3 = hurt (the laser). `stun` is the
 * hit cooldown in ticks, `damage` what comes off its health.
 *
 * Kind: 1 spin body contact, 2 spin sweep, 3 charged spin sweep, 4 laser
 * bolt, 5 dive impact, 6 instant kill; 0 is a plain touch.
 */
export const DAMAGE_KINDS: readonly { mode: number; stun: number; damage: number }[] = [
  { mode: 0, stun: 0, damage: 0 }, // 0
  { mode: 1, stun: 30, damage: 2 }, // 1
  { mode: 2, stun: 4, damage: 1 }, // 2
  { mode: 2, stun: 4, damage: 4 }, // 3
  { mode: 3, stun: 4, damage: 2 }, // 4
  { mode: 1, stun: 30, damage: 2 }, // 5
  { mode: 1, stun: 0, damage: 128 }, // 6
];

/**
 * Drop-shadow radius per creature type (the table at 0x4e05ee).
 *
 * Named GROUND_PROBE until 2026-09-05, when reading `FUN_00486280` settled
 * what its second argument is: the ray itself always drops a fixed 0x10000
 * and this value is handed to the shadow-drawing call, which is skipped
 * when it is 0. So a 0 here means "casts no shadow", not "no ground check".
 */
export const SHADOW_RADIUS: readonly number[] = [
    78, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 0, 0, 70, 150, 150,
    150, 0, 150, 150, 150, 150, 150, 0, 150, 150, 150, 150, 50, 0, 0, 150,
    150, 150, 150, 150, 150, 150, 100, 150, 150, 150, 150, 150, 150, 150, 150, 150,
    300, 150, 150, 150, 150, 150, 350, 0, 150, 300, 150, 150, 150, 150, 0, 0,
];

/**
 * Per-type constructor settings: the body radius stored at entity +0x42
 * (0x500 when the type is not listed) and whether a C behaviour function is
 * installed beside the script (the exe address, for docs/CREATURES.md).
 */
export const CREATURE_TYPES: Readonly<Record<number, { radius: number; handler: string | null }>> = {
  1: { radius: 0x708, handler: null },
  4: { radius: 0x500, handler: 'LAB_00406220' },
  5: { radius: 0x708, handler: 'FUN_00416ab0' },
  6: { radius: 0x708, handler: 'FUN_00416a60' },
  8: { radius: 0x708, handler: 'LAB_00406a60' },
  9: { radius: 0x708, handler: null },
  12: { radius: 0x708, handler: 'FUN_00418ce0' },
  13: { radius: 0x500, handler: 'FUN_00418610' },
  14: { radius: 0x708, handler: 'LAB_004064a0' },
  15: { radius: 0x500, handler: 'FUN_004189c0' },
  16: { radius: 0x708, handler: null },
  19: { radius: 0x500, handler: 'FUN_0041bb80' },
  20: { radius: 0x500, handler: 'LAB_00406620' },
  21: { radius: 0x708, handler: null },
  22: { radius: 0x708, handler: 'FUN_0041b780' },
  23: { radius: 0x500, handler: 'FUN_004259b0' },
  24: { radius: 0x500, handler: 'LAB_00406960' },
  25: { radius: 0x500, handler: 'LAB_004068e0' },
  26: { radius: 0x708, handler: 'FUN_00420af0' },
  27: { radius: 0x708, handler: 'FUN_0041df70' },
  28: { radius: 0x500, handler: 'FUN_00420ed0' },
  29: { radius: 0x708, handler: null },
  30: { radius: 0x708, handler: null },
  31: { radius: 0x708, handler: 'FUN_00425700' },
  32: { radius: 0x708, handler: 'FUN_0041ddb0' },
  34: { radius: 0x708, handler: null },
  35: { radius: 0x708, handler: null },
  36: { radius: 0x708, handler: null },
  37: { radius: 0x708, handler: null },
  38: { radius: 0x500, handler: 'FUN_00422c70' },
  39: { radius: 0x708, handler: null },
  40: { radius: 0x500, handler: 'FUN_00428650' },
  41: { radius: 0x500, handler: 'LAB_00406c70' },
  42: { radius: 0x708, handler: null },
  43: { radius: 0x500, handler: 'FUN_0041dec0' },
  45: { radius: 0x708, handler: 'FUN_004282d0' },
  46: { radius: 0x500, handler: 'LAB_00406a90' },
  47: { radius: 0x708, handler: 'FUN_00422660' },
  48: { radius: 0xed8, handler: null },
  49: { radius: 0x708, handler: null },
  50: { radius: 0x500, handler: 'FUN_0042c150' },
  51: { radius: 0x500, handler: 'FUN_0042c150' },
  52: { radius: 0x500, handler: 'FUN_0042c150' },
  53: { radius: 0x500, handler: 'FUN_0042c150' },
  54: { radius: 0x708, handler: null },
  55: { radius: 0x708, handler: null },
  57: { radius: 0x708, handler: null },
  58: { radius: 0x500, handler: 'FUN_0042d3e0' },
  59: { radius: 0x500, handler: 'FUN_0042d620' },
  61: { radius: 0x708, handler: 'FUN_0042be60' },
  62: { radius: 0x708, handler: null },
};
