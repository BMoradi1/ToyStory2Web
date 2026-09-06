/**
 * Pickups, from `FUN_00447db0` (building the list) and `FUN_004a0f80`
 * (touching one) in toy2.exe.
 *
 * The engine keeps one flat list of everything collectable, sixteen bytes a
 * record: position in level units, an object id, a reach code and the floor
 * height under it. Two things feed the list:
 *
 * - **Coins** are `level.dat`'s markers — seventy or so a level, none in the
 *   boss arenas. They get id 0x10 and reach code 0x11.
 * - **Class objects** are every used object id from the level's starting id
 *   (0x30 for most levels, `firstPickupId`) upward. Their reach code is the
 *   placement's `param >> 3`, and what they *are* is decided by the polygon
 *   count of their mesh — there is no type field. `FUN_0044e520` switches on
 *   the count: 36 or 72 polygons is a Pizza Planet token, 32 a health pickup,
 *   18 an extra life, 6 a camera trigger, 39 the rocket boots, 20 the hover
 *   boots. Anything else is category -1 and does nothing when touched.
 *
 * The touch test is a plain sphere, in level units shifted right by three:
 *
 *     dx = (player.x/32 - x) >> 3
 *     dy = (player.y/32 - 230 - y) >> 3     player.y - 0xe6: his middle
 *     dz = (player.z/32 - z) >> 3
 *     hit when dx^2 + dy^2 + dz^2 < ((code & 0x7f) + 14)^2
 *
 * so a coin (code 0x11) is taken from 31 * 8 = 248 level units, and a token
 * with param 216 (code 27) from 328. The high bit of the code is set each
 * frame by the drawing code for pickups near enough to draw and cleared
 * otherwise, which only gates the test on distance; it is not modelled.
 *
 * **Tokens start hidden.** `FUN_004a0c80` disables every token in the level's
 * list (src/sim/level-data.ts) at load and its five spares outright; each is
 * revealed by its task through `FUN_004a0db0`. The tasks are not implemented,
 * so the caller reveals them itself (`revealToken`).
 *
 * Positions here are LEVEL units, as the engine stores them; the player is
 * in game units and is converted at the test.
 */
import { objectPolyCount, type DatLevel } from '../formats/dat.ts';
import { firstPickupId, TOKEN_LISTS } from './level-data.ts';
import { GAME_UNITS_PER_LEVEL_UNIT } from './player-constants.ts';
import type { PlayerState } from './player.ts';

const S = GAME_UNITS_PER_LEVEL_UNIT;

export const PICKUP = {
  /** The test measures from this far above the player's origin, level units. */
  centreAbove: 0xe6,
  /** Deltas are shifted right by this before squaring. */
  shift: 3,
  /** Added to the reach code to get the radius, in shifted units. */
  reachBase: 14,
  /** The reach code every coin gets. */
  coinReach: 0x11,
  /** The object id every coin gets; class objects keep their own. */
  coinId: 0x10,
  /** Health per health pickup, and the cap. */
  healthGain: 4, healthMax: 14,
  livesMax: 9,
  coinsMax: 99,
  /** Coins that earn the coin token — the original fires event 0x4f here. */
  coinsForToken: 50,
} as const;

/** The categories `FUN_0044e520` returns, plus coin and none. */
export enum PickupKind {
  None = -1,
  Health = 0,
  Kind1 = 1,
  Token = 2,
  Life = 3,
  /** A tutorial signpost: touching it opens the talk box (docs/LEVELS.md). */
  HintSign = 4,
  RocketBoots = 5,
  Kind6 = 6,
  Kind7 = 7,
  HoverBoots = 8,
  Kind9 = 9,
  Kind10 = 10,
  Coin = 0x10,
}

/** The polygon-count switch in `FUN_0044e520`, verbatim. */
export function kindOfPolyCount(count: number): PickupKind {
  switch (count) {
    case 6: return PickupKind.HintSign;
    case 0x12: return PickupKind.Life;
    case 0x13: return PickupKind.Kind10;
    case 0x14: return PickupKind.HoverBoots;
    case 0x1e: return PickupKind.Kind7;
    case 0x1f: case 0x32: case 0x50: return PickupKind.Kind9;
    case 0x20: return PickupKind.Health;
    case 0x24: case 0x48: return PickupKind.Token;
    case 0x27: return PickupKind.RocketBoots;
    case 0x3c: return PickupKind.Kind1;
    case 100: return PickupKind.Kind6;
    default: return PickupKind.None;
  }
}

export interface Pickup {
  /** Level units, +Y down. */
  x: number; y: number; z: number;
  /** 0x10 for a coin, the object id otherwise. */
  id: number;
  kind: PickupKind;
  /** Reach code; radius is `((reach & 0x7f) + 14) << 3` level units. */
  reach: number;
  /** Index into `DatLevel.objects` for a class object, so it can be hidden; -1 for a coin. */
  objectIndex: number;
  /** Which token slot (0..4) this is, or -1. */
  tokenSlot: number;
  /** Disabled pickups are not tested: hidden tokens and the spares. */
  enabled: boolean;
  collected: boolean;
}

export interface PickupState {
  items: Pickup[];
  /** Counters the original keeps in the player block (+0x9e, +0x96, +0x9a). */
  coins: number;
  health: number;
  lives: number;
  /** Bit per token slot, as `(&DAT_0052f0d7)[level]` stores it. */
  tokens: number;
  /** How many have been taken, for the counter. */
  taken: number;
}

export interface PickupEvent { index: number; kind: PickupKind }

/**
 * Build the list for a scene: coins from its markers, class objects from its
 * id list. `level` is the game's level number, which picks the starting id
 * and the token list; pass 0 for a scene with no level code.
 */
export function createPickups(dat: DatLevel, level: number): PickupState {
  const items: Pickup[] = [];
  for (const m of dat.markers) {
    items.push({
      x: m.position.x, y: m.position.y, z: m.position.z,
      id: PICKUP.coinId, kind: PickupKind.Coin, reach: PICKUP.coinReach,
      objectIndex: -1, tokenSlot: -1, enabled: true, collected: false,
    });
  }

  const tokens = TOKEN_LISTS[level];
  const first = firstPickupId(level);
  for (let id = first; id < dat.objectIds.length; id++) {
    const placement = dat.placements[dat.objectIds[id]!];
    if (!placement) continue;
    const object = dat.objects[placement.objectIndex];
    const polys = objectPolyCount(dat, object);
    const kind = polys >= 0 ? kindOfPolyCount(polys) : PickupKind.None;
    const slot = tokens ? tokens.ids.indexOf(id) : -1;
    const spare = tokens !== undefined && id >= tokens.spare && id < tokens.spare + 5;
    items.push({
      x: placement.position.x, y: placement.position.y, z: placement.position.z,
      id, kind, reach: placement.param >> 3,
      objectIndex: placement.objectIndex, tokenSlot: slot,
      enabled: slot < 0 && !spare, collected: false,
    });
  }

  return { items, coins: 0, health: PICKUP.healthMax, lives: 0, tokens: 0, taken: 0 };
}

/** Make a token slot collectable, as its task would. */
export function revealToken(state: PickupState, slot: number): void {
  for (const item of state.items) if (item.tokenSlot === slot) item.enabled = true;
}

/**
 * Collect anything within reach. Returns what was taken this tick, so the
 * caller can play a sound and stop drawing it.
 */
export function stepPickups(state: PickupState, p: PlayerState): PickupEvent[] {
  // The original shifts the player into level units first, then subtracts.
  const px = p.x >> 5, py = (p.y >> 5) - PICKUP.centreAbove, pz = p.z >> 5;
  const taken: PickupEvent[] = [];

  for (let i = 0; i < state.items.length; i++) {
    const item = state.items[i]!;
    if (!item.enabled || item.collected) continue;
    const dx = (px - item.x) >> PICKUP.shift;
    const dy = (py - item.y) >> PICKUP.shift;
    const dz = (pz - item.z) >> PICKUP.shift;
    const reach = (item.reach & 0x7f) + PICKUP.reachBase;
    if (reach * reach <= dx * dx + dy * dy + dz * dz) continue;

    switch (item.kind) {
      case PickupKind.Coin:
        if (state.coins < PICKUP.coinsMax) state.coins++;
        break;
      case PickupKind.Health:
        state.health = Math.min(PICKUP.healthMax, state.health + PICKUP.healthGain);
        break;
      case PickupKind.Life:
        if (state.lives < PICKUP.livesMax) state.lives++;
        break;
      case PickupKind.Token:
        if (item.tokenSlot >= 0) state.tokens |= 1 << item.tokenSlot;
        break;
      case PickupKind.HintSign:
        // A trigger, not a collectable: the original opens the hint's talk
        // box (`FUN_00402610`, docs/LEVELS.md) and leaves the record live.
        // The talk box is not ported, so it is skipped rather than consumed.
        continue;
      default:
        // Power-ups and the unknown kinds: consumed, effect not ported.
        break;
    }
    item.collected = true;
    state.taken++;
    taken.push({ index: i, kind: item.kind });
  }
  return taken;
}

/** Player-space centre of the reach sphere, for tools and debugging. Game units. */
export function pickupCentre(p: PlayerState): { x: number; y: number; z: number } {
  return { x: p.x, y: p.y - PICKUP.centreAbove * S, z: p.z };
}
