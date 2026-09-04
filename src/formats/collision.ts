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
 * Is this surface standable?
 *
 * PSX +Y points down, so a floor's normal points along -Y. `maxSlope` is in
 * degrees. Across the game roughly a quarter of collision faces are flat floor
 * and only a fifth are sloped at all, so Buzz will be on `y = -1` almost
 * always.
 */
export function isWalkable(poly: CollisionPoly, maxSlopeDegrees = 45): boolean {
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
}

/** Flatten collision groups into a world-space hull with an X/Z lookup grid. */
export function buildCollisionWorld(groups: CollisionGroup[], cellSize = 1024): CollisionWorld {
  const world: CollisionWorld = { polys: [], cells: new Map(), cellSize };
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
