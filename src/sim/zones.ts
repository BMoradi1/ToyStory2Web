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

/**
 * The render pass's per-level corrections (`FUN_00440f70`, right after both
 * zones are set), for two doorways the floors get wrong. The camera is the
 * Direct3D one, in LEVEL units (game / 32, +Y down), which is what the
 * floats at 0x4dc03c..0x4dc050 are in.
 */
export const ZONE_OVERRIDES = {
  /** Level 4: Buzz in zone 2 with the camera higher than -7,900 puts everyone in zone 1. */
  level4: { playerZone: 2, cameraAbove: -7900, becomes: 1 },
  /**
   * Level 10: the camera in zone 4 and inside this box is called zone 5
   * (the camera's zone only; Buzz's is left alone).
   */
  level10: { cameraZone: 4, xMin: -800, xMax: 800, yBelow: -40800, zMin: -5500, zMax: -3900, becomes: 5 },
} as const;

export interface ZoneState {
  /** `DAT_0054dea0`. -1 before the first tick, or over a hole. */
  camera: number;
  /** `DAT_005d2a8c`. */
  player: number;
  /** Last tick's raised player position, quarter level units. */
  prev: { x: number; y: number; z: number } | null;
  /**
   * The zone floor Buzz is actually standing over, which is NOT one of the
   * engine's two globals — nothing in the game reads it. The portal walk
   * uses it so the room he is in is never culled.
   */
  floor: number;
}

export function createZones(): ZoneState {
  return { camera: -1, player: -1, prev: null, floor: -1 };
}

/**
 * Forget where Buzz was. The doorway test compares this tick's position with
 * last tick's, so anything that MOVES him without walking — a level load, a
 * respawn, a talk script putting him on a path node — would look like a walk
 * across half the level and could register a crossing he never made. The
 * engine has no such call; this is the port's own safeguard.
 */
export function resetZones(state: ZoneState): void {
  state.camera = -1;
  state.player = -1;
  state.prev = null;
  state.floor = -1;
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
  options: { blending?: boolean; level?: number } = {},
): void {
  // Whether zone 15 is a room here or means "outside". The engine asks
  // whether the level loaded a backdrop sheet; the scene says the same thing,
  // and level 10 is the one that has a room there.
  const outsideIsRoom = groups.some((g) => g.zone === OUTSIDE);

  const raised = { x: player.x, y: player.y - ZONES.raise, z: player.z };
  const fromCamera = zoneAt(groups, camera, S);

  // --- Buzz's own zone. The render pass seeds it from the CAMERA's floor
  //     every frame (`FUN_00440f70` writes all three globals from one
  //     lookup) and `FUN_004402b0` then either re-derives it from his own
  //     raised position — only when the camera was over nothing, or always
  //     on level 2 — or lets `FUN_0043fef0` nudge it by one doorway he
  //     crossed this tick. So it follows the camera, not his feet. Every
  //     write to `DAT_005d2a8c` in the executable was checked for this.
  const now = { x: raised.x / QUARTER, y: raised.y / QUARTER, z: raised.z / QUARTER };
  if (fromCamera < 0 || options.level === 2) {
    state.player = zoneAt(groups, raised, S);
  } else {
    state.player = fromCamera;
    const before = state.prev ?? now;
    for (const portal of portals) {
      if (portal.from !== state.player) continue;
      if (portal.to === OUTSIDE && !outsideIsRoom) continue;
      if (crossedPortal(portal, before, now)) { state.player = portal.to; break; }
    }
  }
  state.prev = now;
  // The room his feet are actually over. NOT an engine global: the renderer
  // uses it to keep the room he is standing in on screen when the camera
  // has drifted over a neighbour's floor (src/sim/portal-walk.ts).
  state.floor = zoneAt(groups, raised, S);

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

  if (options.level !== undefined) overrideZones(state, options.level, camera);
}

/** The two per-level corrections. `camera` is in game units. */
export function overrideZones(state: ZoneState, level: number, camera: Vec): void {
  const cx = camera.x / S, cy = camera.y / S, cz = camera.z / S;
  if (level === 4) {
    const o = ZONE_OVERRIDES.level4;
    if (state.player === o.playerZone && cy < o.cameraAbove) {
      state.player = o.becomes;
      state.camera = o.becomes;
    }
  } else if (level === 10) {
    const o = ZONE_OVERRIDES.level10;
    if (state.camera === o.cameraZone && cy < o.yBelow
      && cx > o.xMin && cx < o.xMax && cz > o.zMin && cz < o.zMax) {
      state.camera = o.becomes;
    }
  }
}

/**
 * Which detail row the render pass draws with (`FUN_00440f70` again): the
 * option's row, except where a level asks for the far view, which forces
 * row 2. Levels 3 and 9 always; level 4 with Buzz in zone 2 or within 250
 * steps of 256 game units of a point on it; level 11 with the camera in
 * zone 5 or 7. Positions in game units.
 */
export function detailRowFor(
  option: number,
  level: number,
  state: ZoneState,
  player: Vec,
): number {
  if (level === 3 || level === 9) return 2;
  if (level === 4) {
    if (state.player === 2) return 2;
    const dx = (player.x - 0x51b97) >> 8, dy = (player.y - -0x104fd) >> 8, dz = (player.z - 0x5e58e) >> 8;
    if (dx * dx + dy * dy + dz * dz < 250 * 250) return 2;
  }
  if (level === 11 && (state.camera === 5 || state.camera === 7)) return 2;
  return option;
}
