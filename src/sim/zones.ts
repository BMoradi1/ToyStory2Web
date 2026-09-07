/**
 * Which room Buzz is in — the two globals every level's tick is written
 * against. Decode: docs/LEVELS.md "Zones", from `FUN_00440f70`,
 * `FUN_004402b0` and `FUN_0043fef0`.
 *
 * The level scripts do NOT read the renderer's zones. They read two numbers
 * that the render pass sets each frame from the ZONE FLOORS in
 * `TERRAIN.ALL`: coarse slabs, one or more per room, at a quarter of the
 * level's scale, that nothing collides with. `zoneAt` in
 * src/formats/collision.ts finds the one under a point.
 *
 *   - `camera` (`DAT_0054dea0`) is the zone under the render camera, held to
 *     the player's own zone or one of its portal neighbours. Most levels test
 *     this one, and the portal walk starts here.
 *   - `player` (`DAT_005d2a8c`) is the same lookup with Buzz's raised
 *     position as the fallback, plus a correction on the tick he walks
 *     through a doorway. Levels 7, 8, 10, 11 and 13 test it.
 *
 * Everything here is in game units except where a comment says otherwise;
 * the engine does the portal test in QUARTER LEVEL UNITS (game >> 7, and the
 * `level.dat` portal corners >> 2), and so does `crossedPortal`.
 */
import { zoneAt, type CollisionGroup } from '../formats/collision.ts';
import { OUTSIDE, type Zone } from '../formats/dat.ts';
import { GAME_UNITS_PER_LEVEL_UNIT } from './player-constants.ts';

const S = GAME_UNITS_PER_LEVEL_UNIT;
/** Game units per quarter level unit: the space the portal test works in. */
const QUARTER = S * 4;

export const ZONES = {
  /**
   * Buzz's zone is read this far above his origin (`DAT_0052f304 - 0x2000`),
   * 256 level units up his body — so standing on a step does not read the
   * floor he is about to leave.
   */
  raise: 0x2000,
  /**
   * A portal is only tested when Buzz is within this of one of its corners
   * on every axis, quarter level units. The engine's own number; at 65,536
   * level units it never actually rejects anything in a shipped level.
   */
  near: 0x4000,
  /**
   * How far outside a portal's triangles the crossing point may be, as a
   * squared distance in quarter level units. `FUN_00480ae0(..., 400)` works
   * out to `(400 / 0x1f)^2 * 2`.
   */
  slackSq: Math.floor(400 / 0x1f) ** 2 * 2,
  /** A zone byte of 0xff means "no room": the engine calls it zone 1. */
  fallback: 1,
} as const;

export interface ZoneState {
  /** `DAT_0054dea0`. -1 before the first tick, or over a hole. */
  camera: number;
  /** `DAT_005d2a8c`. */
  player: number;
  /** Last tick's raised player position, quarter level units. */
  prev: { x: number; y: number; z: number } | null;
}

export function createZones(): ZoneState {
  return { camera: -1, player: -1, prev: null };
}

type Vec = { x: number; y: number; z: number };

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec, b: Vec): Vec => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/** Squared distance from `p` to the segment `a`-`b`. */
function distanceToEdgeSq(p: Vec, a: Vec, b: Vec): number {
  const ab = sub(b, a);
  const len = dot(ab, ab);
  const t = len > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / len)) : 0;
  const near = { x: a.x + ab.x * t, y: a.y + ab.y * t, z: a.z + ab.z * t };
  return dot(sub(p, near), sub(p, near));
}

/** Is `p` inside the triangle, or within the engine's slack of one of its edges? */
function inTriangle(p: Vec, a: Vec, b: Vec, c: Vec): boolean {
  const n = cross(sub(b, a), sub(c, a));
  const inside = dot(cross(sub(b, a), sub(p, a)), n) >= 0
    && dot(cross(sub(c, b), sub(p, b)), n) >= 0
    && dot(cross(sub(a, c), sub(p, c)), n) >= 0;
  if (inside) return true;
  return distanceToEdgeSq(p, a, b) < ZONES.slackSq
    || distanceToEdgeSq(p, b, c) < ZONES.slackSq
    || distanceToEdgeSq(p, c, a) < ZONES.slackSq;
}

/**
 * Did the move from `from` to `to` pass through this portal, front to back?
 * Both points and the portal's corners are in quarter level units.
 *
 * The engine's test, in order: within `near` of the quad's first or third
 * corner on every axis; the point moved from the front of the quad's plane
 * (dot with its normal at or above zero) to behind it; and the crossing
 * point lands in one of the quad's two triangles with slack.
 */
export function crossedPortal(portal: Zone, from: Vec, to: Vec): boolean {
  const c = portal.corners;
  const quarter = (v: { x: number; y: number; z: number }): Vec => ({
    x: v.x / 4, y: v.y / 4, z: v.z / 4,
  });
  const p0 = quarter(c[0]), p1 = quarter(c[1]), p2 = quarter(c[2]), p3 = quarter(c[3]);

  const near = (a: Vec, b: Vec) => Math.abs(a.x - b.x) < ZONES.near
    && Math.abs(a.y - b.y) < ZONES.near && Math.abs(a.z - b.z) < ZONES.near;
  if (!near(to, p0) && !near(to, p2)) return false;

  const n = cross(sub(p1, p0), sub(p2, p0));
  if (n.x === 0 && n.y === 0 && n.z === 0) return false;
  const now = dot(sub(to, p0), n);
  if (now >= 0) return false;
  const before = dot(sub(from, p0), n);
  if (before < 0) return false;

  // Where the line met the plane.
  const span = before - now;
  const t = span === 0 ? 0 : before / span;
  const at = {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    z: from.z + (to.z - from.z) * t,
  };
  return inTriangle(at, p0, p1, p2) || inTriangle(at, p2, p3, p0);
}

/**
 * One tick of both zones, run right after the camera has moved.
 *
 * `groups` is the scene's collision straight out of `parseCollision` — the
 * zone floors are the entries with a non-null `zone`, which
 * `buildCollisionWorld` leaves out. `portals` is `level.dat`'s zone quads.
 * `blending` is the engine's camera-blend counter (`DAT_0050a148`), which
 * while it runs lets the camera's zone lead the player's.
 */
export function stepZones(
  state: ZoneState,
  groups: readonly CollisionGroup[],
  portals: readonly Zone[],
  camera: Vec,
  player: Vec,
  options: { blending?: boolean } = {},
): void {
  // Whether zone 15 is a room here or means "outside". The engine asks
  // whether the level loaded a backdrop sheet; the scene says the same thing,
  // and level 10 is the one that has a room there.
  const outsideIsRoom = groups.some((g) => g.zone === OUTSIDE);

  const raised = { x: player.x, y: player.y - ZONES.raise, z: player.z };
  const fromCamera = zoneAt(groups, camera, S);

  // --- Buzz's own zone.
  if (fromCamera < 0 || state.player < 0) {
    state.player = fromCamera < 0 ? zoneAt(groups, raised, S) : fromCamera;
  } else {
    // The correction: the camera's floor says the room, and walking through
    // a doorway this tick overrides it.
    state.player = fromCamera;
    const now = { x: raised.x / QUARTER, y: raised.y / QUARTER, z: raised.z / QUARTER };
    const before = state.prev ?? now;
    for (const portal of portals) {
      if (portal.from !== state.player) continue;
      if (portal.to === OUTSIDE && !outsideIsRoom) continue;
      if (crossedPortal(portal, before, now)) { state.player = portal.to; break; }
    }
  }
  state.prev = { x: raised.x / QUARTER, y: raised.y / QUARTER, z: raised.z / QUARTER };

  // --- the camera's zone: the floor under it, but never further from Buzz
  //     than one doorway.
  let camZone: number;
  if (fromCamera === state.player || options.blending || fromCamera < 0 || state.player < 0) {
    camZone = fromCamera < 0 || state.player < 0 ? state.player : fromCamera;
  } else {
    const neighbours = portals.some((p) => p.from === state.player);
    if (!neighbours) camZone = state.player;
    else camZone = portals.some((p) => p.from === state.player && p.to === fromCamera)
      ? fromCamera
      : state.player;
  }
  state.camera = camZone === 0xff ? ZONES.fallback : camZone;
}
