/**
 * The original's angle system.
 *
 * Angles are 12-bit: 4096 to the revolution, always masked to `0..4095`. Yaw 0
 * faces +Z and increases toward +X, so a facing is `(sin yaw, cos yaw)` in
 * `(x, z)`. Sines are 16-bit fixed point with `0x4000` standing for 1.0.
 *
 * The table is not shipped with this project — it is generated. That is safe
 * because it was checked against the one in `toy2.exe` (4096 entries at
 * 0x4fe788) and all 4096 agree exactly with
 * `round(sin(i * 2pi / 4096) * 0x4000)`, so the arithmetic below is
 * bit-identical to the original's rather than merely close.
 */

export const YAW_FULL = 4096;
export const YAW_MASK = 0xfff;
export const YAW_HALF = 2048;
/** Fixed-point 1.0 in the sine table. */
export const SIN_ONE = 0x4000;

const SIN = new Int16Array(YAW_FULL);
for (let i = 0; i < YAW_FULL; i++) {
  SIN[i] = Math.round(Math.sin((i * 2 * Math.PI) / YAW_FULL) * SIN_ONE);
}

export function sin(yaw: number): number {
  return SIN[yaw & YAW_MASK]!;
}

export function cos(yaw: number): number {
  return SIN[(yaw + YAW_FULL / 4) & YAW_MASK]!;
}

/** The yaw whose facing is `(x, z)`. Mirrors the engine's `atan2` helper. */
export function yawOf(x: number, z: number): number {
  return Math.round((Math.atan2(x, z) * YAW_FULL) / (2 * Math.PI)) & YAW_MASK;
}

/** Signed difference `a - b`, in `-2048..2047`. */
export function yawDelta(a: number, b: number): number {
  const d = (a - b) & YAW_MASK;
  return d > YAW_HALF ? d - YAW_FULL : d;
}

export function toRadians(yaw: number): number {
  return (yaw * 2 * Math.PI) / YAW_FULL;
}

/**
 * Integer divide that truncates toward zero, which is what C does and what the
 * original's `(x + (x >> 31 & mask)) >> shift` idiom reproduces for shifts.
 * Plain `>>` in either language rounds toward negative infinity instead, which
 * drifts by one unit per tick on anything moving in -X or -Z.
 */
export function idiv(a: number, b: number): number {
  return Math.trunc(a / b);
}
