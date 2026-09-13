/**
 * The sound EVENT table, read from the user's own toy2.exe.
 *
 * The sim does not name sound effects; the engine's own code does not either.
 * A creature script, a pickup or a level task raises an **event number**, and
 * `FUN_0049e660` looks that number up in a table of 16-byte records at
 * 0x502950 to find which effect to play, how loud, and at what priority
 * (docs/LEVELS.md, "Sound events, resolved").
 *
 * Which effect a record names depends on the level, because the names come
 * from two tables:
 *
 * - effects **1 to 61** are the global set at 0x4fcdc4 — `BUZJMP1`,
 *   `PZZATOKN`, `EXPLOBIG` and so on, the ones every level shares
 * - effects **87 and up** are the level's own, from
 *   `PTR_PTR_004fd140[level * 2]`, whose first entry is index 87
 *   (`DAT_004fd144[level * 2]`). Level 1 has ten of them, from `HOTSPLSH` to
 *   `SPADEFAL`; level 13 has four
 *
 * The gap from 62 to 86 is empty, and events 0xb2..0xb5 name effects 78..81
 * that no table supplies at all: the characters' speech, which the PC build
 * dropped.
 *
 * **The effect word carries two flags** (`FUN_0049e660`). Bit 0x4000 means
 * the effect depends on which level is loaded: the low bits are an index into
 * a list of `(level, effect)` pairs at 0x5028e8, walked until the level
 * matches. That is how one event number is a drill on one level and a
 * cockerel on another. Bit 0x8000 picks the engine's second play path, which
 * takes the record's `volume2` and one of its falloff numbers as well — a
 * sustained sound rather than a one-shot, as far as the call sites go. The
 * index itself is what is left after masking both off, and it is 1-based.
 *
 * Every name resolves to `data/sfx/<name>.wav` on disc. Nothing here is
 * stored in the repo — the tables are read out of the executable the user
 * supplies, like the game's text.
 */

/** One event's record, as the engine stores it. */
export interface SoundEvent {
  /**
   * 1-based index into the name tables, with the two flag bits already
   * resolved for the level this table was read for; 0 means silent.
   */
  effect: number;
  /**
   * The engine plays this one through its second path, which also passes
   * `volume2` and a falloff number. Every call site that sets it is a
   * sustained sound rather than a one-shot.
   */
  sustained: boolean;
  /**
   * A PlayStation SPU pitch, left behind by the port. `FUN_004a3c80` never
   * reads it and the buffer plays at the WAV's own rate, so neither do we.
   */
  pitch: number;
  /** 0..150. What a play that is not positional uses for both ears. */
  volume: number;
  /** A second channel level, zero on all but a handful of records. */
  volume2: number;
  /** 2, 3, 4 or -1. Which sound wins when the voices run out. */
  priority: number;
  /**
   * Three per-record numbers the decode calls falloff, e.g. (10, 10, 120).
   * The attenuation the engine actually applies uses fixed constants and
   * never reads these, so nothing here does either.
   */
  falloff: readonly [number, number, number];
}

const IMAGE_BASE = 0x400000;
/** The 16-byte records. */
const EVENT_TABLE = 0x502950;
/**
 * How many records there are. Past this the bytes belong to another table
 * entirely — its records are eight bytes, so reading them as sixteen gives
 * plausible-looking rubbish with pitch values where the effect should be.
 */
const EVENT_COUNT = 0xda;
/** `(level, effect)` pairs, for the events whose effect depends on the level. */
const LEVEL_EFFECTS = 0x5028e8;
/** Bit set on an effect word that redirects through that table. */
const PER_LEVEL = 0x4000;
/** Bit set on an effect word the engine plays through its second path. */
const SUSTAINED = 0x8000;
const EFFECT_MASK = 0x7fff;
/** The 61 names every level shares. */
const GLOBAL_NAMES = 0x4fcdc4;
const GLOBAL_COUNT = 61;
/** Per level: a pointer to its name list and the effect index that list starts at. */
const LEVEL_NAMES = 0x4fd140;
const LEVEL_STRIDE = 8;
const LEVEL_COUNT = 20;

/** Every level's sounds, resolved: what each event number plays. */
export interface SoundTable {
  events: readonly SoundEvent[];
  /** The effect's file name, or null when nothing supplies it. */
  nameOf(event: number): string | null;
  /** Sequences name an effect directly, not a sound event. */
  nameOfEffect(effect: number): string | null;
}

function readString(exe: Uint8Array, address: number): string | null {
  let p = address - IMAGE_BASE;
  if (p < 0 || p >= exe.length) return null;
  let out = '';
  while (p < exe.length && exe[p] !== 0) {
    const c = exe[p++]!;
    // The tables are followed by unrelated data; anything unprintable means
    // the list has ended rather than that a name is odd.
    if (c < 0x20 || c > 0x7e) return null;
    out += String.fromCharCode(c);
  }
  return out.length > 0 ? out : null;
}

/**
 * Read the table for one level. `level` is the loader's number: 0 is the
 * global set, 1 to 15 the levels, 16 the front end.
 */
export function readSoundTable(exe: Uint8Array, level: number): SoundTable {
  const view = new DataView(exe.buffer, exe.byteOffset, exe.byteLength);
  const u32 = (a: number) => view.getUint32(a - IMAGE_BASE, true);
  const i16 = (a: number) => view.getInt16(a - IMAGE_BASE, true);

  const global: string[] = [];
  for (let i = 0; i < GLOBAL_COUNT; i++) {
    global.push(readString(exe, u32(GLOBAL_NAMES + i * 4)) ?? '');
  }

  const own: string[] = [];
  let base = GLOBAL_COUNT + 1;
  if (level >= 0 && level < LEVEL_COUNT) {
    const list = u32(LEVEL_NAMES + level * LEVEL_STRIDE);
    base = u32(LEVEL_NAMES + level * LEVEL_STRIDE + 4);
    if (list >= IMAGE_BASE && list < IMAGE_BASE + exe.length) {
      for (let i = 0; i < 64; i++) {
        const name = readString(exe, u32(list + i * 4));
        if (name === null) break;
        own.push(name);
      }
    }
  }

  const u16 = (a: number) => view.getUint16(a - IMAGE_BASE, true);
  /**
   * Resolve the effect word: follow the per-level redirect if it is set, and
   * report whichever flags survive. The redirect's list is walked until the
   * level matches, exactly as the engine does; a list that does not mention
   * this level would run off the end there, so it is bounded here.
   */
  const resolve = (word: number): { effect: number; sustained: boolean } => {
    let value = word;
    if ((value & PER_LEVEL) !== 0) {
      let p = LEVEL_EFFECTS + (value & 0x3fff) * 2;
      value = 0;
      for (let step = 0; step < 64; step++, p += 4) {
        if (i16(p) === level) { value = u16(p + 2); break; }
      }
    }
    return { effect: value & EFFECT_MASK, sustained: (value & SUSTAINED) !== 0 };
  };

  const events: SoundEvent[] = [];
  for (let e = 0; e < EVENT_COUNT; e++) {
    const o = EVENT_TABLE + e * 16;
    const { effect, sustained } = resolve(u16(o));
    events.push({
      effect, sustained,
      pitch: i16(o + 2), volume: i16(o + 4), volume2: i16(o + 6),
      priority: i16(o + 8),
      falloff: [i16(o + 10), i16(o + 12), i16(o + 14)] as const,
    });
  }

  const nameOfEffect = (effect: number): string | null => {
    if (effect < 1) return null;
    if (effect <= GLOBAL_COUNT) return global[effect - 1] || null;
    return own[effect - base] ?? null;
  };
  return {
    events, nameOfEffect,
    nameOf(event: number): string | null {
      const record = events[event];
      if (!record || record.effect < 1) return null;
      return nameOfEffect(record.effect);
    },
  };
}

/**
 * How loud a sound is in each ear, 0 to 150, from where it is relative to
 * the camera (`FUN_004a3c80`). Offsets are in game units; the engine works
 * in 512-unit steps, puts the two ears 0x40 steps either side of the camera
 * and fades a sound out over 0xc0 of them, which is 3,072 level units.
 * Depth counts half, so a sound ahead carries about twice as far as one the
 * same distance to the side.
 *
 * It is two point sources, one per ear, rather than a level and a pan, which
 * has a consequence worth knowing before calling it a bug: a sound a little
 * way to one side is LOUDER than the same sound at the camera, because it is
 * closer to that ear than either ear is to the middle.
 *
 * **Which of the two is the left ear is a choice, not a finding.** The engine
 * takes its sideways axis from row 0 of the render camera's matrix, and
 * nothing established whether that row points left or right; the one thing
 * that cannot be got wrong is putting a sound on the player's left into the
 * left speaker, so that is what this does.
 */
export function earLevels(
  offset: { x: number; y: number; z: number },
  cameraYaw: { sin: number; cos: number },
): { left: number; right: number } {
  const STEP = 512, EAR = 0x40, REACH = 0xc0;
  const dx = offset.x / STEP, dz = offset.z / STEP;
  // Camera space: sideways along the camera's right, depth along its facing.
  const x = cameraYaw.cos * dx - cameraYaw.sin * dz;
  const z = (cameraYaw.sin * dx + cameraYaw.cos * dz) / 2;
  const ear = (side: number) => {
    const level = ((REACH - Math.hypot(z, x + side)) * 16) / 24;
    return Math.max(0, Math.min(150, level));
  };
  return { left: ear(EAR), right: ear(-EAR) };
}

/** The loudest an ear level ever gets, so callers can normalise against it. */
export const EAR_MAX = ((0xc0 * 16) / 24);
