/**
 * Which rooms are actually on screen: the engine's portal walk
 * (`FUN_0043f3d0`, called from the render pass `FUN_004402b0`), decoded
 * 2026-09-07. docs/LEVELS.md "The portal walk".
 *
 * The idea is the classic one. Start in the camera's room with the whole
 * screen available, and for each doorway out of it project the doorway's
 * four corners; if the projected quad still overlaps the rectangle you were
 * given, the room beyond is visible, and you recurse into it with the
 * rectangle narrowed to that quad's bounding box. A room nothing projects
 * into is never drawn.
 *
 * Everything happens in the engine's own screen space, which is 512 x 256
 * with the eye at (256, 128) and a focal length of 160 — so the visible
 * picture is only the middle of it, x 96..416 and y 8..248, and the margins
 * are there so a corner behind the camera can be pinned outside the picture
 * without overflowing a signed short. `SCREEN` keeps those numbers.
 *
 * Two consequences of the engine's own shape, both reproduced here:
 *
 *   - A room reached twice keeps the rectangle of the SHORTER path rather
 *     than the union of the two, so a room seen through two doorways is
 *     narrowed by whichever doorway the walk reached first from nearer the
 *     camera. Portal engines usually union; this one does not.
 *   - The near-plane clip counts the corners it had to pin, and a count with
 *     either low bit set makes the room inherit its parent's rectangle
 *     unnarrowed. Four pinned corners come to 4, whose low two bits are
 *     clear, so the widest case narrows where three of them would not. That
 *     is the original's arithmetic, quirk included.
 *
 * The port's camera is NARROWER than the 90 x 74 degrees this projection
 * implies (60 degrees vertical at 4:3), so the walk includes a little more
 * than the frame needs and never culls something that is on screen. Whether
 * the port's field of view should be the engine's is a parity question, not
 * this file's (TODOPLAN P1.6).
 */
import type { Zone } from '../formats/dat.ts';
import { GAME_UNITS_PER_LEVEL_UNIT } from './player-constants.ts';

export const SCREEN = {
  /** The rectangle space. The picture is the middle of it. */
  width: 0x200,
  height: 0x100,
  centreX: 0x100,
  centreY: 0x80,
  /** Screen units per level unit at unit depth (`0xa0`). */
  focal: 0xa0,
  /** Depth at or above which a corner projects normally. */
  near: 11,
  /** A corner behind the camera is pinned to 0 or this. */
  pin: 0x200,
  /** The depth allowance the camera's room starts with. */
  budget: 0xfe,
  /** Corners behind the camera add this; all four (0x20) means invisible. */
  behind: 8,
  /** A pinned corner near the view axis adds this, which stops the narrowing. */
  unreliable: 1,
} as const;

/** A screen rectangle, inclusive, in the space above. */
export interface Rect { x0: number; y0: number; x1: number; y1: number }

/** The whole space: what the camera's own room is given. */
export function fullRect(): Rect {
  return { x0: 0, y0: 0, x1: SCREEN.width, y1: SCREEN.height };
}

/** Is this rectangle the whole space, give or take the engine's slack? */
export function isFullRect(r: Rect): boolean {
  return r.x0 < 3 && r.y0 < 3 && r.x1 > SCREEN.width - 3 && r.y1 > SCREEN.height - 3;
}

interface Vec3 { x: number; y: number; z: number }

/**
 * Where the camera is and which way it faces, in LEVEL units and in the
 * renderer's frame (Y up, Z toward the viewer), which is the frame the
 * portal corners are converted into below.
 */
export interface ViewBasis {
  eye: Vec3;
  right: Vec3;
  up: Vec3;
  forward: Vec3;
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
function unit(v: Vec3): Vec3 {
  const n = Math.hypot(v.x, v.y, v.z);
  return n > 0 ? { x: v.x / n, y: v.y / n, z: v.z / n } : { x: 0, y: 0, z: 1 };
}

/**
 * Build the basis from a camera position and the point it looks at, both in
 * GAME units and in the sim's frame (+Y down). This is the port's own camera
 * rather than a reconstruction of the engine's, so the walk agrees with what
 * is actually drawn.
 */
export function basisFromCamera(eye: Vec3, look: Vec3): ViewBasis {
  const S = GAME_UNITS_PER_LEVEL_UNIT;
  // Game units, +Y down -> level units, renderer's frame.
  const toView = (p: Vec3): Vec3 => ({ x: p.x / S, y: -p.y / S, z: -p.z / S });
  const e = toView(eye);
  const forward = unit(sub(toView(look), e));
  // The renderer keeps the camera upright, so world up is the reference.
  let right = cross(forward, { x: 0, y: 1, z: 0 });
  if (Math.hypot(right.x, right.y, right.z) < 1e-6) right = { x: 1, y: 0, z: 0 };
  right = unit(right);
  return { eye: e, right, up: cross(right, forward), forward };
}

/** A portal corner, in the sim's frame and level units, put into view space. */
function toViewSpace(basis: ViewBasis, corner: Vec3): Vec3 {
  const d = sub({ x: corner.x, y: -corner.y, z: -corner.z }, basis.eye);
  return { x: dot(d, basis.right), y: dot(d, basis.up), z: dot(d, basis.forward) };
}

/** A view-space point projected into the rectangle space. */
function project(p: Vec3): { x: number; y: number } {
  return {
    x: Math.trunc((p.x * SCREEN.focal) / p.z) + SCREEN.centreX,
    // Screen y counts down; view y counts up.
    y: Math.trunc((-p.y * SCREEN.focal) / p.z) + SCREEN.centreY,
  };
}

/**
 * The engine's winding test (`FUN_00451f80`), kept sign for sign: the walk
 * only steps through a doorway one of whose two triangles comes out
 * non-negative, which is what rejects the doorways facing away.
 */
function edge(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  return (a.y - b.y) * (c.x - b.x) - (c.y - b.y) * (a.x - b.x);
}

/**
 * Project one doorway. Corners come in quad order; a corner nearer than the
 * near plane is clipped along the quad edge to whichever neighbour is
 * further away, then pinned to the left or right of the space.
 *
 * Returns the four screen points in the order the engine keeps them (0, 1,
 * 3, 2) and the count of awkward corners described at the top of the file.
 */
function projectPortal(basis: ViewBasis, corners: readonly Vec3[]): {
  points: { x: number; y: number }[];
  awkward: number;
} | null {
  if (corners.length < 4) return null;
  const v = corners.slice(0, 4).map((c) => toViewSpace(basis, c));
  let awkward = 0;
  const screen: { x: number; y: number }[] = [];

  for (let i = 0; i < 4; i++) {
    const here = v[i]!;
    if (here.z >= SCREEN.near) { screen.push(project(here)); continue; }
    if (here.z < 0) awkward += SCREEN.behind;
    // The two neighbours along the quad, in the engine's order: the one
    // before this corner is tried first when it is the further of the two.
    const prev = v[(i + 3) % 4]!;
    const next = v[(i + 1) % 4]!;
    let cut = here;
    if (next.z < SCREEN.near || next.z <= prev.z) {
      if (prev.z > SCREEN.near - 1) {
        const t = prev.z / (prev.z - here.z);
        cut = { x: (here.x - prev.x) * t + prev.x, y: (here.y - prev.y) * t + prev.y, z: prev.z };
      }
    } else {
      const t = next.z / (next.z - here.z);
      cut = { x: (here.x - next.x) * t + next.x, y: (here.y - next.y) * t + next.y, z: next.z };
    }
    if (Math.abs(cut.x) < SCREEN.pin || Math.abs(cut.y) < SCREEN.pin) awkward += SCREEN.unreliable;
    // Pinned to the side of the space the corner went off. The engine's own
    // view space has +Y DOWN, so its test sends a positive y to the bottom;
    // this one has +Y up, hence the flip on that axis alone.
    screen.push({
      x: cut.x >= 0 ? SCREEN.pin : 0,
      y: cut.y >= 0 ? 0 : SCREEN.pin,
    });
  }

  // The engine keeps them as 0, 1, 3, 2 and splits the quad on that order.
  return { points: [screen[0]!, screen[1]!, screen[3]!, screen[2]!], awkward };
}

/** What the walk decided about one doorway, for a debug read-out. */
export interface PortalTrace {
  from: number; to: number;
  /** 'missed' off the rectangle, 'behind' all four corners behind the eye,
   *  'away' facing away, 'stale' already reached by a shorter path, 'in'. */
  verdict: string;
  points?: { x: number; y: number }[];
  awkward?: number;
  rect?: Rect;
}

export interface WalkOptions {
  /**
   * A zone the walk records but never steps into, the way level 7 holds its
   * zone 0xf out (the engine draws the backdrop through those rectangles
   * instead of the room). Null for none.
   */
  backdropZone?: number | null;
  /**
   * A second room to start from, kept on screen whatever the doorways say.
   *
   * NOT the engine's. The engine starts only from the camera's room, and
   * seeds Buzz's room from the same lookup, so the two agree by
   * construction and the room he stands in is always drawn. In the port the
   * follow camera is its own reconstruction, and where it drifts over a
   * neighbouring room's floor slab the walk would start next door and cull
   * the room Buzz is actually in — measured at up to 80% of the frame on
   * level 1 before this was added. Passing the floor under his feet
   * (`ZoneState.floor`) costs a little over-drawing and cannot hide him.
   */
  alsoFrom?: number | null;
  /** Called for every doorway considered. Debug only; leave unset in play. */
  trace?: (t: PortalTrace) => void;
}

/**
 * Walk the doorways from the camera's room and return every room that ends
 * up on screen, each with the rectangle it is confined to. Zone 0 is always
 * in — the engine spreads its always-drawn objects across the whole level —
 * and so is the camera's own room.
 *
 * `portals` are `level.dat`'s zone quads, corners in level units.
 */
export function walkPortals(
  portals: readonly Zone[],
  cameraZone: number,
  basis: ViewBasis,
  options: WalkOptions = {},
): Map<number, Rect> {
  const visible = new Map<number, Rect>();
  if (cameraZone < 0) return visible;

  // How good a path each room was reached by; the camera's own is unbeatable.
  const reached = new Map<number, number>([[cameraZone, 0xff]]);
  visible.set(cameraZone, fullRect());

  // Doorways out of each room, in the order the file gives them.
  const out = new Map<number, Zone[]>();
  for (const portal of portals) {
    const list = out.get(portal.from);
    if (list) list.push(portal);
    else out.set(portal.from, [portal]);
  }

  /** Put a room back to "not seen", which is also "reachable by any path". */
  const hide = (zone: number): void => {
    if (zone === cameraZone) return;
    reached.set(zone, 0);
    visible.delete(zone);
  };

  const step = (zone: number, rect: Rect, budget: number): void => {
    for (const portal of out.get(zone) ?? []) {
      const to = portal.to;
      const say = (verdict: string, extra: Partial<PortalTrace> = {}) =>
        options.trace?.({ from: zone, to, verdict, ...extra });
      if ((reached.get(to) ?? 0) >= budget) { say('stale'); continue; }

      const shot = projectPortal(basis, portal.corners);
      if (!shot) continue;
      const [p0, p1, p3, p2] = shot.points as [
        { x: number; y: number }, { x: number; y: number },
        { x: number; y: number }, { x: number; y: number },
      ];

      // Off the rectangle on either axis and the doorway cannot be seen.
      // The engine clears the room's flag here rather than leaving it, so a
      // room already made visible by an earlier doorway in this same list is
      // hidden again by a later one that misses. Order-dependent, and its
      // own behaviour.
      const xs = [p0.x, p1.x, p3.x, p2.x];
      const ys = [p0.y, p1.y, p3.y, p2.y];
      const missed = !xs.some((x) => x <= rect.x1) || !xs.some((x) => x >= rect.x0)
        || !ys.some((y) => y <= rect.y1) || !ys.some((y) => y >= rect.y0);
      if (missed) { say('missed', { points: shot.points, awkward: shot.awkward }); hide(to); continue; }

      // Facing away, and not saved by a clipped corner. This one leaves the
      // room's flag alone.
      if (edge(p0, p1, p3) < 0 && edge(p1, p2, p3) < 0 && shot.awkward <= 0) {
        say('away', { points: shot.points, awkward: shot.awkward });
        continue;
      }
      // Every corner behind the camera.
      if (shot.awkward >= 0x20) {
        say('behind', { points: shot.points, awkward: shot.awkward });
        hide(to);
        continue;
      }

      const narrowed: Rect = (shot.awkward & 3) === 0
        ? {
          x0: Math.max(rect.x0, Math.min(...xs)),
          y0: Math.max(rect.y0, Math.min(...ys)),
          x1: Math.min(rect.x1, Math.max(...xs)),
          y1: Math.min(rect.y1, Math.max(...ys)),
        }
        : { ...rect };

      say('in', { points: shot.points, awkward: shot.awkward, rect: narrowed });
      reached.set(to, budget);
      visible.set(to, narrowed);
      // The backdrop room is recorded but not walked through.
      if (to !== options.backdropZone && budget > 0) step(to, narrowed, budget - 1);
    }
  };

  step(cameraZone, fullRect(), SCREEN.budget);

  // The room Buzz is standing in, when the camera has wandered next door.
  const also = options.alsoFrom;
  if (also !== null && also !== undefined && also >= 0 && !visible.has(also)) {
    reached.set(also, 0xff);
    visible.set(also, fullRect());
    step(also, fullRect(), SCREEN.budget);
  }

  // Zone 0's objects are spread over the whole level and always drawn.
  if (!visible.has(0)) visible.set(0, fullRect());
  return visible;
}
