/**
 * Buzz's animation states, read out of toy2.exe.
 *
 * GENERATED from the 28-entry table at 0x4df3f0 (20 bytes each: script
 * pointer, animation slot A, animation slot B, playback rate, flag) and the
 * byte scripts it points at. Do not hand-edit; see docs/PLAYER.md for how it
 * was found and tools/ghidra/README.md for how to rebuild the decompile.
 *
 * A state names TWO animation slots because Buzz's animations are layered:
 * slot A is the primary and slot B supplies the bones whose tracks are absent
 * from it (the `-3` track offsets described in docs/FORMATS.md). When the two
 * are equal there is only one layer.
 *
 * `script` is a list of frame numbers within the animation, with opcodes:
 *   0x81, 0x82   footfall, left and right (the engine spawns a step effect)
 *   0x83..0x86   fire sound events 0x30, 0x10, 0x17, 0x43
 *   0xfe         end: fall back to the idle state
 *   0xff n       loop back to script index n
 *
 * `rate` advances a 16.16 cursor through that list, so 0x10000 is one script
 * entry per tick and 0x4000 is one every four. A NEGATIVE rate means the step
 * is the player's horizontal speed multiplied by its magnitude, which is how
 * the walk cycle stays in step with the ground.
 */

export interface AnimationState {
  /** Primary animation slot in the character's `.anm`. */
  slotA: number;
  /** Secondary layer, supplying bones missing from the primary. Equal to slotA when unlayered. */
  slotB: number;
  /** 16.16 cursor step per tick; negative means speed-driven. */
  rate: number;
  flag: number;
  script: number[];
}

/** Script opcodes. Values below 0x80 are frame numbers. */
export const ANIM_OP = {
  footfallLeft: 0x81,
  footfallRight: 0x82,
  sound30: 0x83,
  sound10: 0x84,
  sound17: 0x85,
  sound43: 0x86,
  end: 0xfe,
  loop: 0xff,
} as const;

export const ANIMATION_STATES: AnimationState[] = [
  { slotA: 0, slotB: 1, rate: -48, flag: 0, script: [0, 1, 2, 3, 4, 5, 6, 130, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 129, 19, 20, 21, 22, 23, 255, 26] }, // 0
  { slotA: 2, slotB: 3, rate: 16384, flag: 1, script: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 255, 16] }, // 1
  { slotA: 4, slotB: 5, rate: 16384, flag: 0, script: [0, 1, 2, 3, 4, 5, 255, 1] }, // 2
  { slotA: 4, slotB: 5, rate: 16384, flag: 0, script: [6, 7, 8, 9, 10, 11, 255, 1] }, // 3
  { slotA: 4, slotB: 5, rate: 32768, flag: 0, script: [12, 13, 14, 15, 254] }, // 4
  { slotA: 6, slotB: 6, rate: 32768, flag: 0, script: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 255, 1] }, // 5
  { slotA: 24, slotB: 25, rate: -48, flag: 0, script: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 255, 24] }, // 6
  { slotA: 8, slotB: 8, rate: 16384, flag: 0, script: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 255, 1] }, // 7
  { slotA: 22, slotB: 27, rate: 32768, flag: 0, script: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 255, 1] }, // 8
  { slotA: 10, slotB: 10, rate: 32768, flag: 0, script: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 255, 1] }, // 9
  { slotA: 17, slotB: 17, rate: 32768, flag: 0, script: [0, 1, 2, 3, 131, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 255, 10] }, // 10
  { slotA: 18, slotB: 18, rate: 32768, flag: 0, script: [0, 1, 2, 3, 4, 5, 6, 131, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 255, 11] }, // 11
  { slotA: 15, slotB: 15, rate: 32768, flag: 0, script: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 255, 12] }, // 12
  { slotA: 16, slotB: 16, rate: 32768, flag: 0, script: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 254] }, // 13
  { slotA: 19, slotB: 19, rate: 32768, flag: 0, script: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 134, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 134, 255, 26] }, // 14
  { slotA: 20, slotB: 20, rate: 32768, flag: 0, script: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 255, 24] }, // 15
  { slotA: 21, slotB: 21, rate: 32768, flag: 0, script: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 255, 12] }, // 16
  { slotA: 14, slotB: 14, rate: 32768, flag: 0, script: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 255, 12] }, // 17
  { slotA: 23, slotB: 23, rate: 32768, flag: 0, script: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 255, 1] }, // 18
  { slotA: 11, slotB: 11, rate: 32768, flag: 0, script: [0, 1, 2, 3, 4, 5, 6, 7, 255, 8] }, // 19
  { slotA: 7, slotB: 7, rate: 32768, flag: 0, script: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 255, 24] }, // 20
  { slotA: 9, slotB: 9, rate: 32768, flag: 0, script: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 255, 24] }, // 21
  { slotA: 26, slotB: 26, rate: 32768, flag: 0, script: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 5, 6, 7, 8, 9, 10, 11, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 255, 1] }, // 22
  { slotA: 12, slotB: 12, rate: 32768, flag: 0, script: [0, 1, 2, 3, 4, 5, 6, 7, 8, 255, 1] }, // 23
  { slotA: 12, slotB: 12, rate: 32768, flag: 0, script: [9, 10, 11, 12, 13, 14, 15, 16, 17, 255, 1] }, // 24
  { slotA: 13, slotB: 13, rate: -100, flag: 0, script: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 255, 30] }, // 25
  { slotA: 28, slotB: 28, rate: 21845, flag: 0, script: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 255, 1] }, // 26
  { slotA: 31, slotB: 31, rate: 16384, flag: 0, script: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 255, 1] }, // 27
];
