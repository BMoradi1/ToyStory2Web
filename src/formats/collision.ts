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
  /**
   * Three or four vertices in model space, in PERIMETER order. PSX axes: +Y
   * is down. The file stores a quad's four vertices in triangle-strip order,
   * (a, b, c, d) meaning triangles (a, b, c) and (d, c, b); read as a
   * perimeter that is a bow-tie, and a point-in-polygon test on a bow-tie
   * calls the left and right lobes outside. 1,189 of level 1's 1,904 quads
   * are laid out that way, and walking into one of those lobes was how Buzz
   * fell through solid floor. Here they are reordered to (a, b, d, c).
   */
  vertices: { x: number; y: number; z: number }[];
  /** Unit normal of the first triangle (a, b, c). */
  normal: { x: number; y: number; z: number };
  /**
   * Unit normal of the second triangle (d, c, b), which the file stores
   * separately because a quad need not be planar. Null on triangles. The
   * original's sweep tests the two triangles independently, each against
   * its own normal.
   */
  normal2: { x: number; y: number; z: number } | null;
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

  const a = { x: w(4), y: w(5), z: w(6) };
  const b = { x: a.x + w(7), y: a.y + w(8), z: a.z + w(9) };
  const c = { x: a.x + w(10), y: a.y + w(11), z: a.z + w(12) };
  // Strip order in the file; perimeter order here (see the interface).
  // On a triangle the fourth vertex is uninitialised — it sits well off the
  // plane, so reading it produces stray geometry.
  const vertices = triangle
    ? [a, b, c]
    : [a, b, { x: a.x + w(13), y: a.y + w(14), z: a.z + w(15) }, c];

  const unit = (k: number) => {
    const n = { x: w(k) / NORMAL_SCALE, y: w(k + 1) / NORMAL_SCALE, z: w(k + 2) / NORMAL_SCALE };
    return Math.abs(Math.hypot(n.x, n.y, n.z) - 1) > 0.05 ? null : n;
  };
  const normal = unit(16);
  if (!normal) return null;
  // Words 19-21 are the second triangle's normal on a quad (word 20 is the
  // triangle sentinel, which is why it cannot be a normal there).
  const normal2 = triangle ? null : unit(19);

  return { vertices, normal, normal2, triangle };
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

/**
 * Flatten collision groups into a world-space hull with an X/Z lookup grid.
 *
 * Quads are split into their two triangles here, each with its own normal,
 * because that is what the file describes and what the original tests: a
 * quad need not be planar, and a height solved against the first triangle's
 * plane is wrong over the second.
 */
export function buildCollisionWorld(groups: CollisionGroup[], cellSize = 1024): CollisionWorld {
  const world: CollisionWorld = { polys: [], cells: new Map(), cellSize, lowestY: -Infinity };
  for (const group of groups) {
    for (const mesh of group.meshes) {
      for (const poly of mesh.polys) {
        const place = (v: { x: number; y: number; z: number }) => ({
          x: v.x + group.position.x,
          y: v.y + group.position.y,
          z: v.z + group.position.z,
        });
        const [a, b, d, c] = poly.vertices.map(place);
        const pieces: { vertices: { x: number; y: number; z: number }[]; normal: { x: number; y: number; z: number } }[] =
          poly.triangle
            ? [{ vertices: [a!, b!, d!], normal: poly.normal }]
            : [
              { vertices: [a!, b!, c!], normal: poly.normal },
              { vertices: [d!, c!, b!], normal: poly.normal2 ?? poly.normal },
            ];
        for (const piece of pieces) {
        const { vertices, normal } = piece;
        const index = world.polys.length;
        world.polys.push({ vertices, normal, walkable: normal.y <= -Math.cos((60 * Math.PI) / 180) });
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
 * Sweep a sphere through the hull and slide it along whatever it hits.
 *
 * This is the original's mover, ported from `FUN_00484380` and the response in
 * `FUN_00482a00` — see docs/PLAYER.md, "Collision: the mover", for how it was
 * read and which constant came from where. The shape matters more than any one
 * number: the player is a **sphere**, not a point with a floor query under it,
 * and "on ground" means "touched something flatter than 60 degrees this tick".
 * That single change is what gives ledges, steps and slopes their behaviour —
 * a sphere of this radius rolls over anything shorter than itself, so there is
 * no step height to look for.
 *
 * Positions and velocity are in GAME units (32 per level unit, +Y down), which
 * is what the constants are in; the hull is in level units and is scaled as it
 * is read. `from` is the sphere CENTRE, so the caller lifts and lowers.
 *
 * Faithful to the original: the radius, the 60-degree ground threshold, the
 * contact skin, the pass count, the split step, and the broadphase reach.
 * Approximated: the exact push-out arithmetic. The original nudges out along
 * the normal in two fixed-point steps and damps velocity by 15/16 on the same
 * tick; this uses a plain slide with the same skin, which lands in the same
 * place for everything reachable but will differ when wedged in a corner.
 */
export interface SphereSweep {
  /** Final sphere centre, game units. */
  x: number; y: number; z: number;
  /** Velocity after sliding, game units per tick. */
  vx: number; vy: number; vz: number;
  /** Touched a surface flatter than the ground threshold. */
  onGround: boolean;
  /** Touched anything at all. */
  touched: boolean;
  /** Normal of the flattest ground contact, or null. */
  groundNormal: { x: number; y: number; z: number } | null;
}

/** Smallest root of `a t^2 + b t + c` in `(0, maxT]`, or null. */
function lowestRoot(a: number, b: number, c: number, maxT: number): number | null {
  if (Math.abs(a) < 1e-12) return null;
  const det = b * b - 4 * a * c;
  if (det < 0) return null;
  const root = Math.sqrt(det);
  let t0 = (-b - root) / (2 * a);
  let t1 = (-b + root) / (2 * a);
  if (t0 > t1) { const swap = t0; t0 = t1; t1 = swap; }
  if (t0 >= 0 && t0 <= maxT) return t0;
  if (t1 >= 0 && t1 <= maxT) return t1;
  return null;
}

interface Vec3 { x: number; y: number; z: number }
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const scaled = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const lengthSq = (a: Vec3): number => dot(a, a);

/**
 * Earliest contact of a moving sphere with one triangle.
 *
 * Face first, then the three edges, then the three vertices, which is the
 * standard decomposition and matches what the original does in
 * `FUN_00481fb0`: it tests the face, and when the sweep ends close to the
 * plane it also runs edge and vertex tests so the sphere can catch a corner.
 */
function sweepTriangle(
  from: Vec3, velocity: Vec3, radius: number,
  a: Vec3, b: Vec3, c: Vec3, n: Vec3,
): { t: number; normal: Vec3 } | null {
  const along = dot(velocity, n);
  const startDistance = dot(sub(from, a), n);

  let best: { t: number; normal: Vec3 } | null = null;
  const keep = (t: number, normal: Vec3) => {
    if (t < 0 || t > 1) return;
    if (!best || t < best.t) best = { t, normal };
  };

  // Face. Only surfaces we are in front of and moving toward can be hit;
  // starting behind one means we are already through it and pushing back out
  // would teleport the player to the far side.
  if (along < 0 && startDistance >= 0) {
    const t = (radius - startDistance) / along;
    const at = { x: from.x + velocity.x * t, y: from.y + velocity.y * t, z: from.z + velocity.z * t };
    const touch = sub(at, scaled(n, radius));
    if (containsProjected([a, b, c], n, touch)) keep(Math.max(0, t), n);
  }

  const speedSq = lengthSq(velocity);
  if (speedSq > 1e-12) {
    // Vertices.
    for (const v of [a, b, c]) {
      const d = sub(from, v);
      const t = lowestRoot(speedSq, 2 * dot(velocity, d), lengthSq(d) - radius * radius, 1);
      if (t === null) continue;
      const at = { x: from.x + velocity.x * t, y: from.y + velocity.y * t, z: from.z + velocity.z * t };
      const away = sub(at, v);
      const len = Math.sqrt(lengthSq(away)) || 1;
      keep(t, scaled(away, 1 / len));
    }
    // Edges.
    for (const [p, q] of [[a, b], [b, c], [c, a]] as [Vec3, Vec3][]) {
      const edge = sub(q, p);
      const toStart = sub(from, p);
      const edgeSq = lengthSq(edge);
      if (edgeSq < 1e-12) continue;
      const edgeDotV = dot(edge, velocity);
      const edgeDotS = dot(edge, toStart);
      const qa = edgeSq * -speedSq + edgeDotV * edgeDotV;
      const qb = edgeSq * (2 * dot(velocity, toStart)) - 2 * edgeDotV * edgeDotS;
      const qc = edgeSq * (radius * radius - lengthSq(toStart)) + edgeDotS * edgeDotS;
      const t = lowestRoot(qa, qb, qc, 1);
      if (t === null) continue;
      const f = (edgeDotV * t - edgeDotS) / edgeSq;
      if (f < 0 || f > 1) continue;
      const on = { x: p.x + edge.x * f, y: p.y + edge.y * f, z: p.z + edge.z * f };
      const at = { x: from.x + velocity.x * t, y: from.y + velocity.y * t, z: from.z + velocity.z * t };
      const away = sub(at, on);
      const len = Math.sqrt(lengthSq(away)) || 1;
      keep(t, scaled(away, 1 / len));
    }
  }
  return best;
}

/** Closest point to `p` on triangle `abc`. */
function closestOnTriangle(p: Vec3, a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b);
  const d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return { x: a.x + ab.x * v, y: a.y + ab.y * v, z: a.z + ab.z * v };
  }
  const cp = sub(p, c);
  const d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return { x: a.x + ac.x * w, y: a.y + ac.y * w, z: a.z + ac.z * w };
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return { x: b.x + (c.x - b.x) * w, y: b.y + (c.y - b.y) * w, z: b.z + (c.z - b.z) * w };
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  return { x: a.x + ab.x * v + ac.x * w, y: a.y + ab.y * v + ac.y * w, z: a.z + ab.z * v + ac.z * w };
}

/**
 * Move a sphere by a velocity, resolving contacts. See `SphereSweep`.
 *
 * `scale` is game units per hull unit; the hull is stored in level units and
 * the mover works in game units.
 */
export function sweepSphere(
  world: CollisionWorld,
  from: { x: number; y: number; z: number },
  velocity: { x: number; y: number; z: number },
  radius: number,
  options: { scale?: number; passes?: number; groundNormalY?: number; skin?: number } = {},
): SphereSweep {
  const scale = options.scale ?? 32;
  const groundY = options.groundNormalY ?? -0.5;
  const skin = options.skin ?? 4;

  let position: Vec3 = { x: from.x, y: from.y, z: from.z };
  let remaining: Vec3 = { x: velocity.x, y: velocity.y, z: velocity.z };
  let onGround = false, touched = false;
  let groundNormal: Vec3 | null = null;

  // Broadphase once, over the whole step plus the sphere, in hull units.
  const reach = (radius + Math.sqrt(lengthSq(remaining))) / scale + 2;
  const candidates: number[] = [];
  {
    const x0 = Math.min(position.x, position.x + remaining.x) / scale - reach;
    const x1 = Math.max(position.x, position.x + remaining.x) / scale + reach;
    const z0 = Math.min(position.z, position.z + remaining.z) / scale - reach;
    const z1 = Math.max(position.z, position.z + remaining.z) / scale + reach;
    const gx0 = Math.floor(x0 / world.cellSize), gx1 = Math.floor(x1 / world.cellSize);
    const gz0 = Math.floor(z0 / world.cellSize), gz1 = Math.floor(z1 / world.cellSize);
    const seen = new Set<number>();
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        for (const i of world.cells.get(`${gx},${gz}`) ?? []) {
          if (!seen.has(i)) { seen.add(i); candidates.push(i); }
        }
      }
    }
  }

  const passes = options.passes ?? (candidates.length < 11 ? 4 : 3);
  for (let pass = 0; pass < passes; pass++) {
    if (lengthSq(remaining) < 1e-9) break;

    let hit: { t: number; normal: Vec3 } | null = null;
    for (const index of candidates) {
      const poly = world.polys[index]!;
      const v = poly.vertices;
      const a = scaled(v[0]!, scale), b = scaled(v[1]!, scale), c = scaled(v[2]!, scale);
      const found = sweepTriangle(position, remaining, radius, a, b, c, poly.normal);
      if (found && (!hit || found.t < hit.t)) hit = found;
    }
    if (!hit) break;

    touched = true;
    // Advance to just short of the contact, so the next pass starts outside.
    const travel = Math.max(0, hit.t - skin / (Math.sqrt(lengthSq(remaining)) || 1));
    position = {
      x: position.x + remaining.x * travel,
      y: position.y + remaining.y * travel,
      z: position.z + remaining.z * travel,
    };
    let rest: Vec3 = {
      x: remaining.x * (1 - travel),
      y: remaining.y * (1 - travel),
      z: remaining.z * (1 - travel),
    };
    // Slide: drop the component into the surface, from both what is left of
    // this step and from the velocity the caller gets back.
    const into = dot(rest, hit.normal);
    rest = sub(rest, scaled(hit.normal, into));
    remaining = rest;

    if (hit.normal.y < groundY) {
      onGround = true;
      if (!groundNormal || hit.normal.y < groundNormal.y) groundNormal = hit.normal;
    }
  }

  position = { x: position.x + remaining.x, y: position.y + remaining.y, z: position.z + remaining.z };

  // Resting contact, and pushing back out of anything we have sunk into.
  //
  // A sweep alone cannot hold a player on the floor: standing still there is
  // no velocity, so nothing is swept, nothing is hit, and the player is
  // "airborne" — then gravity pulls them in, they land, and the next tick they
  // are airborne again. Left alone that flickers on and off the ground every
  // other tick. The original avoids it by re-testing the poly it was standing
  // on at the top of every response pass and counting a hit as contact; this
  // is the same idea done against all the candidates, which also covers
  // stepping from one poly to the next.
  for (const index of candidates) {
    const poly = world.polys[index]!;
    const v = poly.vertices;
    const a = scaled(v[0]!, scale), b = scaled(v[1]!, scale), c = scaled(v[2]!, scale);
    const near = closestOnTriangle(position, a, b, c);
    const away = sub(position, near);
    const distance = Math.sqrt(lengthSq(away));
    if (distance > radius + skin) continue;
    // Only count a surface we are on the outside of; the far side of a floor
    // is the underside of a ceiling and must not hold anyone up.
    if (dot(away, poly.normal) <= 0) continue;
    touched = true;
    if (distance < radius && distance > 1e-6) {
      const push = radius - distance;
      position = {
        x: position.x + (away.x / distance) * push,
        y: position.y + (away.y / distance) * push,
        z: position.z + (away.z / distance) * push,
      };
    }
    if (poly.normal.y < groundY) {
      onGround = true;
      if (!groundNormal || poly.normal.y < groundNormal.y) groundNormal = poly.normal;
    }
  }

  // The velocity handed back is the step actually taken, so the next tick does
  // not accelerate into a wall it is already against.
  const moved = sub(position, from);
  return {
    x: position.x, y: position.y, z: position.z,
    vx: moved.x, vy: moved.y, vz: moved.z,
    onGround, touched, groundNormal,
  };
}

