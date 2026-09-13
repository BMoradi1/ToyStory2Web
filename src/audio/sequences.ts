/** Global sound sequences, FUN_0049e910 / FUN_0049e9d0. Read from the user's exe. */
export interface SoundSequences { words: readonly number[]; starts: readonly number[] }
export interface SequenceVoice {
  id: number; pc: number; delay: number; x: number; y: number; z: number;
}
export interface SequenceNote { effect: number; pitch: number; volume: number }

export function readSoundSequences(exe: Uint8Array): SoundSequences {
  const view = new DataView(exe.buffer, exe.byteOffset, exe.byteLength);
  const base = 0x5036f0, end = 0x503828, image = 0x400000;
  if (exe.length < end - image + 24) throw new Error('Sound sequences: truncated executable');
  const words = Array.from({ length: (end - base) / 2 }, (_, i) => view.getInt16(base - image + i * 2, true));
  const starts = Array.from({ length: 6 }, (_, i) => {
    const address = view.getUint32(end - image + i * 4, true);
    if (address < base || address + 6 >= end || (address - base) % 2) throw new Error('Sound sequences: invalid pointer');
    // Three rumble-header words precede the sound script. PC has no rumble.
    return (address - base) / 2 + 3;
  });
  return { words, starts };
}

/** One shared global slot: a new cue replaces the previous cue. */
export function startSequence(table: SoundSequences, id: number, at: { x: number; y: number; z: number }): SequenceVoice | null {
  const pc = table.starts[-id - 1];
  return Number.isInteger(id) && id < 0 && pc !== undefined ? { id, pc, delay: 0, x: at.x, y: at.y, z: at.z } : null;
}

/** One note at most per game tick; a delay of 5 means the next note is six ticks later. */
export function stepSequence(table: SoundSequences, voice: SequenceVoice): SequenceNote | null {
  if (voice.pc < 0 || --voice.delay >= 0) return null;
  // A jump may enter another sequence's tail: -6 shares the fade at the end of -5.
  for (let guard = 0; guard < table.words.length; guard++) {
    const effect = table.words[voice.pc];
    if (effect === -2) {
      const back = table.words[voice.pc + 1];
      if (back === undefined || back <= 0 || voice.pc - back < 0) break;
      voice.pc -= back;
      continue;
    }
    if (effect === undefined || effect < 0 || voice.pc + 3 >= table.words.length) break;
    const pitch = table.words[voice.pc + 1]!, volume = table.words[voice.pc + 2]!;
    voice.delay = table.words[voice.pc + 3]!;
    voice.pc += 4;
    return { effect, pitch, volume };
  }
  voice.pc = -1;
  return null;
}
