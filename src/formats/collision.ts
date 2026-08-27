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
