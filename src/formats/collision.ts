/**
 * Collision geometry from `.ALL` group types 0x0006 and 0x0008.
 *
 * Collision lives in each level's `TERRAIN.ALL` (paired with `level.dat`) and
 * `TERR1.ALL` (paired with `level1.dat`). Character `.all` files carry none.
 *
 * A group's payload is one or more meshes packed back to back with no
 * separator, closed by a `u32` terminator belonging to the group:
 *
 *     payload : mesh+ , u32 0xFFFFFFFF
 *     mesh    : i16 enabled(=1), i16 polyCount, i16 xMin, xExt, zMin, zExt
 *               polyCount x 44-byte poly
 *
 * The header is 12 bytes. Measuring it as 16 (by folding the group terminator
 * into the last mesh) makes single-mesh groups tile and multi-mesh groups fail,
 * which reads convincingly like "there are no multi-mesh groups" — there are
 * 418 of them.
 *
 * Verified: all 1,855 collision groups in a retail install parse, 23,394 polys.
 */

import { GroupType, type AllFile, type AllGroup } from './all.ts';

const POLY_SIZE = 44;
const MESH_HEADER = 12;
const GROUP_TERMINATOR = 0xffffffff;
const TRIANGLE_SENTINEL = 0x7fff;

/** Fixed-point scale for the stored face normals (2.14). */
const NORMAL_SCALE = 16384;

export interface CollisionPoly {
  /** Three or four vertices in model space. PSX axes: +Y is down. */
  vertices: { x: number; y: number; z: number }[];
  /** Unit face normal. Antiparallel to the winding's geometric normal. */
  normal: { x: number; y: number; z: number };
  triangle: boolean;
}

export interface CollisionMesh {
  polys: CollisionPoly[];
  bounds: { xMin: number; xExt: number; zMin: number; zExt: number };
}

export interface CollisionGroup {
  meshes: CollisionMesh[];
  /** Group origin; collision is instanced, so the same payload recurs here. */
  position: { x: number; y: number; z: number };
  /** Type 0x0008 marks movers — crane arms, platform decks, vehicles. */
  dynamic: boolean;
}

/**
 * Read one 44-byte poly.
 *
 * Layout as 22 `i16`: two bounds words, two partly-understood extent words,
 * an absolute first vertex, three vertices stored as deltas from it, then the
 * face normal.
 *
 * The prior-art spec describes the words after the normal as `inclination` and
 * `bouncing` pairs. They are neither: word 16-18 is a unit normal, and what
 * that spec calls `bouncing1` is simply its Y component. There is no
 * restitution or material term in the record at all.
 */
function readPoly(view: DataView, offset: number): CollisionPoly | null {
  const w = (k: number) => view.getInt16(offset + k * 2, true);

  // Word 20 is the only place 0x7FFF appears, and it appears exactly as often
  // as there are triangles.
  const triangle = w(20) === TRIANGLE_SENTINEL;

  const p1 = { x: w(4), y: w(5), z: w(6) };
  const vertices = [
    p1,
    { x: p1.x + w(7), y: p1.y + w(8), z: p1.z + w(9) },
    { x: p1.x + w(10), y: p1.y + w(11), z: p1.z + w(12) },
  ];
  // On a triangle the fourth vertex is uninitialised — it sits well off the
  // plane, so reading it produces stray geometry.
  if (!triangle) {
    vertices.push({ x: p1.x + w(13), y: p1.y + w(14), z: p1.z + w(15) });
  }

  const normal = {
    x: w(16) / NORMAL_SCALE,
    y: w(17) / NORMAL_SCALE,
    z: w(18) / NORMAL_SCALE,
  };
  const magnitude = Math.hypot(normal.x, normal.y, normal.z);
  if (Math.abs(magnitude - 1) > 0.05) return null;

  return { vertices, normal, triangle };
}

/** Parse one collision group, or null if the payload isn't this format. */
export function parseCollisionGroup(group: AllGroup): CollisionGroup | null {
  if (group.type !== GroupType.Collision && group.type !== GroupType.DynamicCollision) {
    return null;
  }
  const p = group.payload;
  const view = new DataView(p.buffer, p.byteOffset, p.byteLength);
  const meshes: CollisionMesh[] = [];
  let pos = 0;

  for (;;) {
    if (pos + 4 > p.length) return null;
    if (view.getUint32(pos, true) === GROUP_TERMINATOR) {
      // The terminator must close the payload exactly.
      return pos + 4 === p.length
        ? { meshes, position: group.position, dynamic: group.type === GroupType.DynamicCollision }
        : null;
    }
    if (pos + MESH_HEADER > p.length) return null;
    if (view.getInt16(pos, true) !== 1) return null;

    const count = view.getInt16(pos + 2, true);
    if (count < 0 || pos + MESH_HEADER + count * POLY_SIZE > p.length) return null;

    const bounds = {
      xMin: view.getInt16(pos + 4, true),
      xExt: view.getInt16(pos + 6, true),
      zMin: view.getInt16(pos + 8, true),
      zExt: view.getInt16(pos + 10, true),
    };

    const polys: CollisionPoly[] = [];
    for (let i = 0; i < count; i++) {
      const poly = readPoly(view, pos + MESH_HEADER + i * POLY_SIZE);
      if (!poly) return null;
      polys.push(poly);
    }
    meshes.push({ polys, bounds });
    pos += MESH_HEADER + count * POLY_SIZE;
  }
}

/**
 * Parse every collision group in a `TERRAIN.ALL` / `TERR1.ALL`.
 *
 * Groups that don't parse are skipped rather than thrown: `level07`-`level10`
 * each hold a copy of one stale 1998 `TERR1.ALL` using the older 32-byte poly
 * record from A Bug's Life. One artefact, not a format gap.
 */
export function parseCollision(file: AllFile): { groups: CollisionGroup[]; skipped: number } {
  const groups: CollisionGroup[] = [];
  let skipped = 0;
  for (const group of file.groups) {
    if (group.type !== GroupType.Collision && group.type !== GroupType.DynamicCollision) continue;
    const parsed = parseCollisionGroup(group);
    if (parsed) groups.push(parsed); else skipped++;
  }
  return { groups, skipped };
}

/**
 * Is this surface ground rather than wall?
 *
 * PSX +Y points down, so a floor's normal points along -Y. The threshold is
 * the original's: its contact response treats a normal with y below -0x2000
 * in 2.14 (cos 60 degrees) as ground and anything steeper as a wall
 * (docs/PLAYER.md, "Collision"). An earlier version guessed 45 degrees; the
 * difference is 69 polys in level 1 and 0.1% of its floor coverage, but the
 * value is now read rather than assumed. Between 42.9 and 60 degrees the
 * original still counts you as standing but pushes you down the slope.
 */
export function isWalkable(poly: CollisionPoly, maxSlopeDegrees = 60): boolean {
  return poly.normal.y <= -Math.cos((maxSlopeDegrees * Math.PI) / 180);
}

/**
 * A collision hull prepared for queries.
 *
 * The stored polys are per-group and in model space, which is the wrong shape
 * for asking "what is under this point". This flattens them into world space
 * once and buckets them into a grid on the X/Z plane, so a query touches a
 * handful of polys instead of all 23,000.
 *
 * Everything here stays in the file's own PlayStation axes: units are 1/256 of
 * a world unit and **+Y is down**, so "below" means a larger Y. Converting to
 * the renderer's axes is the caller's job, and doing it here would mean two
 * conventions in one module.
 */
export interface CollisionWorld {
  polys: { vertices: { x: number; y: number; z: number }[]; normal: { x: number; y: number; z: number }; walkable: boolean }[];
  /** Poly indices by grid cell, keyed `gx,gz`. */
  cells: Map<string, number[]>;
  cellSize: number;
  /**
   * The lowest point of the hull. +Y is down, so this is the largest Y.
   *
   * The original computes the same value at level load and uses it as a death
   * plane: fall far enough past it and you are put back. Without that a player
   * who leaves the collision never lands, because outside it there is nothing
   * to land on.
   */
  lowestY: number;
}

/** Flatten collision groups into a world-space hull with an X/Z lookup grid. */
export function buildCollisionWorld(groups: CollisionGroup[], cellSize = 1024): CollisionWorld {
  const world: CollisionWorld = { polys: [], cells: new Map(), cellSize, lowestY: -Infinity };
  for (const group of groups) {
    for (const mesh of group.meshes) {
      for (const poly of mesh.polys) {
        const vertices = poly.vertices.map((v) => ({
          x: v.x + group.position.x,
          y: v.y + group.position.y,
          z: v.z + group.position.z,
        }));
        const index = world.polys.length;
        world.polys.push({ vertices, normal: poly.normal, walkable: isWalkable(poly) });
        for (const v of vertices) if (v.y > world.lowestY) world.lowestY = v.y;
        const xs = vertices.map((v) => v.x), zs = vertices.map((v) => v.z);
        const x0 = Math.floor(Math.min(...xs) / cellSize), x1 = Math.floor(Math.max(...xs) / cellSize);
        const z0 = Math.floor(Math.min(...zs) / cellSize), z1 = Math.floor(Math.max(...zs) / cellSize);
        for (let gx = x0; gx <= x1; gx++) {
          for (let gz = z0; gz <= z1; gz++) {
            const key = `${gx},${gz}`;
            const cell = world.cells.get(key);
            if (cell) cell.push(index); else world.cells.set(key, [index]);
          }
        }
      }
    }
  }
  return world;
}

/** Does the X/Z point fall inside the polygon, projected onto the X/Z plane? */
function containsXZ(vertices: { x: number; z: number }[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i]!, b = vertices[j]!;
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * The nearest walkable surface at or below a point, or null if there is none.
 *
 * "Below" is +Y, the PlayStation convention the file uses. `tolerance` allows
 * for standing slightly inside a surface, which happens when a controller
 * steps and then queries from its new position.
 */
export function groundBelow(
  world: CollisionWorld,
  x: number,
  y: number,
  z: number,
  tolerance = 64,
): { y: number; normal: { x: number; y: number; z: number } } | null {
  const cell = world.cells.get(`${Math.floor(x / world.cellSize)},${Math.floor(z / world.cellSize)}`);
  if (!cell) return null;
  let best: { y: number; normal: { x: number; y: number; z: number } } | null = null;
  for (const index of cell) {
    const poly = world.polys[index]!;
    if (!poly.walkable) continue;
    if (!containsXZ(poly.vertices, x, z)) continue;
    // Plane through the first vertex: n . (p - v0) = 0, solved for y.
    const v0 = poly.vertices[0]!, n = poly.normal;
    if (Math.abs(n.y) < 1e-6) continue;
    const surfaceY = v0.y - (n.x * (x - v0.x) + n.z * (z - v0.z)) / n.y;
    if (surfaceY < y - tolerance) continue;
    if (!best || surfaceY < best.y) best = { y: surfaceY, normal: n };
  }
  return best;
}

/** Every poly whose cell the segment from one X/Z point to another touches. */
function polysAlong(
  world: CollisionWorld, x0: number, z0: number, x1: number, z1: number,
): number[] {
  const cell = world.cellSize;
  const gx0 = Math.floor(Math.min(x0, x1) / cell), gx1 = Math.floor(Math.max(x0, x1) / cell);
  const gz0 = Math.floor(Math.min(z0, z1) / cell), gz1 = Math.floor(Math.max(z0, z1) / cell);
  const out = new Set<number>();
  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gz = gz0; gz <= gz1; gz++) {
      for (const i of world.cells.get(`${gx},${gz}`) ?? []) out.add(i);
    }
  }
  return [...out];
}

/** Is a 3D point inside a polygon, projected down the axis its normal points along most? */
function containsProjected(
  vertices: { x: number; y: number; z: number }[],
  n: { x: number; y: number; z: number },
  p: { x: number; y: number; z: number },
): boolean {
  // Drop the axis the polygon is most square-on to; the other two keep its area.
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  const pick: (v: { x: number; y: number; z: number }) => [number, number] =
    ax >= ay && ax >= az ? (v) => [v.y, v.z]
      : ay >= az ? (v) => [v.x, v.z]
        : (v) => [v.x, v.y];
  const [px, py] = pick(p);
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const [ax2, ay2] = pick(vertices[i]!);
    const [bx2, by2] = pick(vertices[j]!);
    if ((ay2 > py) !== (by2 > py) && px < ((bx2 - ax2) * (py - ay2)) / (by2 - ay2) + ax2) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Slide a horizontal step along the walls it runs into.
 *
 * This is the minimum that keeps a level playable: without it the player walks
 * straight through the walls of Andy's room and out of the world, where there
 * is no floor and the fall never ends. It is NOT the original's mover — that
 * lives in `FUN_00484380` and carries a step height and a slope threshold that
 * have not been read yet. Everything here is geometry that follows from the
 * collision data itself, so there are no invented constants: a wall is a poly
 * the hull already marks unwalkable, and the player's height is the height of
 * the model.
 *
 * The player is treated as a vertical segment rather than a point, sampled at
 * a few heights, because a wall that only covers the knees should still stop
 * someone. There is no radius: the body is a line, so it can come to rest
 * visually touching a wall, which is better than passing through one and is
 * the part a real capsule sweep in P2.3 would improve on.
 *
 * All arguments and results are in the file's own units, +Y down.
 */
export function slideAlongWalls(
  world: CollisionWorld,
  from: { x: number; y: number; z: number },
  to: { x: number; z: number },
  height: number,
): { x: number; z: number; hit: boolean } {
  let x = to.x, z = to.z;
  const dx0 = to.x - from.x, dz0 = to.z - from.z;
  if (dx0 === 0 && dz0 === 0) return { x, z, hit: false };

  // Sample up the body. The feet sit a little above the floor so a step the
  // player is standing on does not read as a wall through their soles.
  const levels = [0.15, 0.45, 0.8, 1].map((f) => from.y - height * f);
  let hit = false;

  for (let pass = 0; pass < 2; pass++) {
    const dx = x - from.x, dz = z - from.z;
    if (dx === 0 && dz === 0) break;
    let blocker: { x: number; y: number; z: number } | null = null;
    let nearest = Infinity;

    for (const index of polysAlong(world, from.x, from.z, x, z)) {
      const poly = world.polys[index]!;
      if (poly.walkable) continue;
      const n = poly.normal;
      // A wall's normal is close to horizontal; skip ceilings, which should
      // not stop a walk, and let the floor query own anything floor-like.
      if (Math.abs(n.y) > 0.7) continue;

      const denom = n.x * dx + n.z * dz;
      if (denom >= 0) continue; // moving along or away from the face

      const v0 = poly.vertices[0]!;
      for (const y of levels) {
        const gap = n.x * (v0.x - from.x) + n.y * (v0.y - y) + n.z * (v0.z - from.z);
        const t = gap / denom;
        if (t < 0 || t > 1 || t >= nearest) continue;
        const at = { x: from.x + dx * t, y, z: from.z + dz * t };
        if (!containsProjected(poly.vertices, n, at)) continue;
        nearest = t;
        blocker = n;
      }
    }

    if (!blocker) break;
    hit = true;
    // Stop just short of the face, then carry the rest of the step along it.
    const stopX = from.x + dx * nearest, stopZ = from.z + dz * nearest;
    const restX = x - stopX, restZ = z - stopZ;
    const into = restX * blocker.x + restZ * blocker.z;
    x = stopX + (restX - blocker.x * into);
    z = stopZ + (restZ - blocker.z * into);
  }
  return { x, z, hit };
}
