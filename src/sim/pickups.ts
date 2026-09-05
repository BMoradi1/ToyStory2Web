/**
 * Collectibles, from the proximity test in `FUN_004100f0`.
 *
 * `level.dat`'s markers are pickup points — all one kind, seventy or so a
 * level, none at all in the boss arenas (see docs/FORMATS.md). This spawns one
 * collectible at each and collects it when Buzz gets close enough.
 *
 * The test is the original's, and it is not a plain sphere:
 *
 *     dx = (player.x - object.x) / 32
 *     dy = (player.y - 0x1cc0 - object.y) / 64
 *     dz = (player.z - object.z) / 32
 *     collected when dx^2 + dy^2 + dz^2 < (radius + 100)^2
 *
 * Two things to notice. It measures from a point `0x1cc0` above the player's
 * origin — his middle, not his feet — and the vertical delta is divided by 64
 * where the horizontal ones are divided by 32, so the reach is twice as tall
 * as it is wide. That is why you can collect something above your head but
 * have to be nearly on top of it to get one beside you.
 *
 * Game units, +Y down.
 */
import { GAME_UNITS_PER_LEVEL_UNIT } from './player-constants.ts';
import type { PlayerState } from './player.ts';

const S = GAME_UNITS_PER_LEVEL_UNIT;

export const PICKUP = {
  /** The test measures from here, above the player's origin. */
  centreAbove: 0x1cc0,
  /** Base reach in level units; the original adds each object's own radius. */
  reach: 100,
  /** Horizontal deltas are divided by this before the comparison. */
  horizontalScale: 32,
  /** Vertical is divided by this instead, so the reach is twice as tall as wide. */
  verticalScale: 64,
} as const;

export interface Pickup {
  /** Game units, +Y down. */
  x: number; y: number; z: number;
  collected: boolean;
}

export interface PickupState {
  items: Pickup[];
  /** How many have been taken, for the counter. */
  taken: number;
}

/** Place one collectible at each marker. Marker positions are in LEVEL units. */
export function createPickups(
  markers: readonly { position: { x: number; y: number; z: number } }[],
): PickupState {
  return {
    items: markers.map((m) => ({
      x: m.position.x * S, y: m.position.y * S, z: m.position.z * S, collected: false,
    })),
    taken: 0,
  };
}

/**
 * Collect anything within reach. Returns the indices taken this tick, so the
 * caller can play a sound and stop drawing them.
 */
export function stepPickups(state: PickupState, p: PlayerState): number[] {
  const cx = p.x, cy = p.y - PICKUP.centreAbove, cz = p.z;
  const limit = PICKUP.reach * PICKUP.reach;
  const taken: number[] = [];

  for (let i = 0; i < state.items.length; i++) {
    const item = state.items[i]!;
    if (item.collected) continue;
    const dx = (cx - item.x) / PICKUP.horizontalScale;
    const dy = (cy - item.y) / PICKUP.verticalScale;
    const dz = (cz - item.z) / PICKUP.horizontalScale;
    if (dx * dx + dy * dy + dz * dz >= limit) continue;
    item.collected = true;
    state.taken++;
    taken.push(i);
  }
  return taken;
}
