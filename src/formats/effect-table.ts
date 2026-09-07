/**
 * The effect (particle) templates and spawn modes, read out of the user's
 * own `toy2.exe` at run time, the way sprite-table.ts reads the sprite
 * headers. Nothing from the executable is stored in the repository.
 *
 * An effect is one of 64 records of 0x3c bytes (`DAT_00529e58`): a moving,
 * spinning, fading sprite card with a behaviour byte that a 54-case switch
 * in the updater (`FUN_00410f40`) acts on every tick. The spawner
 * (`FUN_0040fae0(x, y, z, vx, vy, vz, gravity, rotation, spin, kind)`) fills
 * a record from one of 128 sixteen-byte templates at 0x4ec160, and the
 * child spawner (`FUN_0040fdf0(x, y, z, kind, mode)`) draws the velocity out
 * of one of 29 spawn modes at 0x4ec948 first. Buzz's laser bolt, the hover
 * bot's shots, a dead creature's coins, hit sparks, dust, smoke, the
 * sparkles over secrets and the stomp's shockwave are all effects.
 *
 * docs/EFFECTS.md is the decode; tools/effect-table.ts checks the tables.
 */

export const EFFECT_TEMPLATES = 0x4ec160;
export const EFFECT_KINDS = 128;
export const TEMPLATE_SIZE = 16;
export const SPAWN_MODES = 0x4ec948;
/** Entries 0..28; the bytes after run into string data. Mode 0 is never used. */
export const SPAWN_MODE_COUNT = 29;
export const SPAWN_MODE_SIZE = 0x18;

const IMAGE_BASE = 0x400000;

/** The template's flag word (entry +0xa), which the record keeps at +0x32. */
export const EFFECT_FLAGS = {
  /** Test the ground each tick: die on landing and leave a ground mark. */
  ground: 0x0001,
  /** Can hit Buzz (`FUN_004100f0`): what happens then depends on the sprite. */
  hurts: 0x0002,
  /** Homing: the record's velocity words hold a target, a yaw and a pitch instead. */
  homing: 0x0008,
  /** Draw as a flat card on the ground rather than a billboard. */
  flat: 0x0010,
  /** Blend, two bits: 0 translucent (alpha 0x40), 0x20 additive, 0x40 subtractive, 0x60 opaque. */
  blendMask: 0x0060,
  blendAdd: 0x0020,
  blendSubtract: 0x0040,
  blendOpaque: 0x0060,
  /** Protected: the spawner will not overwrite this record while it lives. */
  protect: 0x0080,
  /** Keep the record even when the drawer skips it (emitters, invisible ones). */
  keep: 0x0100,
  /** Set by the spawner and the drawer each frame; a record with neither this nor `keep` dies. */
  drawn: 0x0200,
} as const;

export interface EffectTemplate {
  kind: number;
  /** Sprite table index (docs/HUD.md); 50 and up are the level's own sprites. */
  sprite: number;
  /**
   * Ticks per animation frame, doubled at spawn. Read as a signed byte: a
   * negative value would pick a random period, but no shipped template is
   * negative. The updater also reads it as a behaviour selector for a few
   * kinds (0xc4 marks the fast homing missiles, 0x76 and 0x65 special cases).
   */
  period: number;
  /** Life in ticks, doubled at spawn. */
  life: number;
  /** Animation frames; 1 means no animation. */
  frames: number;
  /**
   * What happens when the effect dies (`FUN_00410b80`): 0 nothing, 1..11 a
   * burst from a fixed list (sparks, smoke, sound), negative spawns the kind
   * `-death` in spawn mode 2.
   */
  death: number;
  /** Card size in level units, width and height. */
  width: number;
  height: number;
  flags: number;
  /** The behaviour byte the updater switches on, 0..0x35 (docs/EFFECTS.md). */
  mode: number;
  /** Colour, 0x80 neutral, faded by the fade code the mode selects. */
  colour: [number, number, number];
}

/**
 * How one spawn-mode component is randomised. `how` is 0 for "use `value`
 * as is", else one of six rules over the next byte `r` of the random stream
 * (`randomised`).
 */
export interface SpawnComponent { how: number; value: number }

export interface SpawnMode {
  index: number;
  velocity: [SpawnComponent, SpawnComponent, SpawnComponent];
  gravity: SpawnComponent;
  /** Passed straight to the spawner as its rotation and spin arguments. */
  rotation: number;
  spin: number;
}

/**
 * The six randomisation rules of `FUN_0040fdf0`, with `value` as the mask.
 * Results are in the spawner's units (halved into the record).
 */
export function randomised(how: number, value: number, r: number): number {
  switch (how) {
    case 1: return ((r & value) - (value >> 1)) * 8;
    case 2: return (r & value) * 8;
    case 3: return -(r & value) * 8;
    case 4: return ((r & value) + ((value >> 4) & 0xff0)) * 8;
    case 5: return ((r & value) - ((value >> 4) & 0xff0)) * 8;
    case 6: return ((r & value) - (value >> 1)) * 16;
    default: return value;
  }
}

/** Read the 128 templates (null where all sixteen bytes are zero) and the 29 spawn modes. */
export function readEffectTable(exe: Uint8Array): { kinds: (EffectTemplate | null)[]; modes: SpawnMode[] } {
  const view = new DataView(exe.buffer, exe.byteOffset, exe.byteLength);
  const kinds: (EffectTemplate | null)[] = [];
  for (let k = 0; k < EFFECT_KINDS; k++) {
    const at = EFFECT_TEMPLATES - IMAGE_BASE + k * TEMPLATE_SIZE;
    let empty = true;
    for (let i = 0; i < TEMPLATE_SIZE; i++) if (exe[at + i] !== 0) { empty = false; break; }
    if (empty) { kinds.push(null); continue; }
    kinds.push({
      kind: k,
      sprite: exe[at]!,
      period: view.getInt8(at + 1),
      life: view.getInt16(at + 2, true),
      frames: exe[at + 4]!,
      death: view.getInt8(at + 5),
      width: view.getInt16(at + 6, true),
      height: view.getInt16(at + 8, true),
      flags: view.getUint16(at + 0xa, true),
      mode: exe[at + 0xc]!,
      colour: [exe[at + 0xd]!, exe[at + 0xe]!, exe[at + 0xf]!],
    });
  }
  const modes: SpawnMode[] = [];
  for (let m = 0; m < SPAWN_MODE_COUNT; m++) {
    const at = SPAWN_MODES - IMAGE_BASE + m * SPAWN_MODE_SIZE;
    const packed = view.getUint32(at, true);
    modes.push({
      index: m,
      velocity: [
        { how: (packed >> 12) & 0xf, value: view.getInt32(at + 4, true) },
        { how: (packed >> 8) & 0xf, value: view.getInt32(at + 8, true) },
        { how: (packed >> 4) & 0xf, value: view.getInt32(at + 12, true) },
      ],
      gravity: { how: packed & 0xf, value: view.getInt32(at + 16, true) },
      rotation: view.getInt16(at + 20, true),
      spin: view.getInt16(at + 22, true),
    });
  }
  return { kinds, modes };
}

/** Kinds the code names at its call sites. */
export const EFFECT_KIND = {
  /** Buzz's laser bolt, homing on the creature it was fired at (mode 0x1d). */
  laserBolt: 0x47,
  /** The bolt when nothing was in range, or after bouncing off a laser-proof creature (mode 0x1e). */
  laserStraight: 0x48,
  /** A coin spilled by a dying creature; picked up by touch. */
  coin: 0x3d,
  /** The hover bot's shot, from each gun in turn. */
  hoverShot: 0x26,
  /** The stomp's ring and wave. */
  stompRing: 0x12,
  stompWave: 0x13,
  /** The push block's dust. */
  dust: 2,
  /** The sparkles over an unspent secret (path tag 58), two kinds. */
  sparkleA: 0x71,
  sparkleB: 0x73,
} as const;

/** Numbers from the spawner, updater and drawer (docs/EFFECTS.md). */
export const EFFECT = {
  slots: 64,
  recordSize: 0x3c,
  /** Spawn only within this many 256-game-unit steps of the camera target. */
  spawnRange: 800,
  /** ...except these three kinds, which use the shorter range. */
  nearRange: 400,
  nearKinds: [0x37, 0x43, 0x50] as readonly number[],
  /** A live record further than this from the camera target dies. */
  cullRange: 400,
  /** An effect with `hurts` touches Buzz within its width plus this, in level units. */
  hitSlack: 100,
  /** Buzz's centre for that test is this far above his position, game units. */
  hitAbove: 0x1cc0,
  /** Ground marks the effects leave, at most this many at once. */
  groundMarks: 0x2f,
  /** Screen glows (`FUN_0044f200`) per frame. */
  glows: 8,
} as const;
