/**
 * Parser for the PC `level.dat` — a level's complete visual world geometry.
 *
 * This is the level itself: every static mesh (vertices, faces, per-corner UVs,
 * vertex colours) plus a placement transform for each object in the world.
 * Since `TERRAIN.ALL` turned out to hold collision and nothing else, this file
 * is the other half of a level — geometry here, collision there.
 *
 * It is a **pointer-linked memory image**: 32-bit "address" fields are byte
 * offsets from the start of the file, and the sections are contiguous with no
 * offset table. Layout:
 *
 *     header(8) | markers | paths | zone quads | ref list | objects | mesh pool
 *
 * Section boundaries have to be recovered rather than read, and object records
 * do not store their own size — see `findObjectTable`.
 *
 * Note this is NOT the PlayStation `.dat` that published prior art describes;
 * the PC conversion rewrote it, and these files fail that spec's checks. No
 * public documentation exists for this variant. See docs/FORMATS.md.
 */

/** Model units per world unit, matching the `.all` convention. */
export const WORLD_SCALE = 256;

/** See PSX_NEUTRAL in all.ts: 0x80 is neutral modulation, not 0xFF. */
export const PSX_NEUTRAL = 128;

/** PSX angle units: 4096 == 360 degrees. Also the fixed-point 1.0 for scale. */
const ANGLE_UNITS = 4096;

export interface Vec3 { x: number; y: number; z: number }

/**
 * A pickup point.
 *
 * `kind` is 16 for every marker in every scene that parses cleanly — 743 of
 * them across the game — so it is not a type discriminator; the collectibles
 * these place are all one thing. Two things point at coins rather than Pizza
 * Planet tokens: there are far too many for the five tokens a level holds, and
 * the three scenes with none at all are `level03`, `level06` and `level09`,
 * which are the boss arenas. Whatever distinguishes a token is not in this
 * file — see docs/FORMATS.md.
 */
export interface Marker { position: Vec3; kind: number }

/** Every marker in a correctly-read scene carries this. See `Marker`. */
export const MARKER_KIND = 16;
export interface Path { id: number; points: Vec3[] }
/**
 * A portal: a quad standing in a doorway, joining two zones.
 *
 * Not a trigger volume, as an earlier pass here guessed. The PC engine files
 * every object into a per-zone list and draws only what it can reach: from the
 * zone the camera is in, it draws that zone's objects, then for each portal
 * leading out of it clips the view frustum to the portal's outline and
 * recurses into `to`, never returning through the portal it arrived by. Zone 0
 * is drawn as well from wherever you stand. See docs/FORMATS.md.
 *
 * These quads come in pairs, the same doorway listed from each side. Level 1's
 * 22 are byte-for-byte the same set, in the same order, as the portal chunk of
 * its converted `.ngn` scene, which is what the PC build actually reads.
 */
export interface Zone {
  corners: [Vec3, Vec3, Vec3, Vec3];
  /** Zone this portal leads out of, 0-63. */
  from: number;
  /** Zone it leads into, or `OUTSIDE`. */
  to: number;
}

/** A portal leading nowhere: the walk stops rather than recursing. */
export const OUTSIDE = 15;

export interface DatObject {
  /** Byte offset of this record (its position field) and the size the tiler chose. */
  offset: number;
  size: number;
  /**
   * Model units per stored unit: 1 for the first section of the object table,
   * 4 for the second. The table holds two runs of identically laid-out
   * records, and everything in the second run — its positions and the
   * vertices of the meshes it points at — is stored at a quarter of the
   * scale. Read straight, those objects land in a small box near the origin
   * with meshes a quarter of their size: the "phantom" props that were
   * blamed on the .ngn being a different scene. See docs/FORMATS.md.
   */
  unitScale: 1 | 4;
  /** Byte offset of this object's mesh, stored as the record's final field. */
  meshOffset: number;
  position: Vec3;
  /** Rotation in PSX angle units (4096 == 360 degrees). */
  rotation: Vec3;
  /** Scale in 4.12 fixed point (4096 == 1.0). */
  scale: Vec3;
  flags: number;
}

export interface DatVertex { x: number; y: number; z: number; r: number; g: number; b: number }

export interface DatFace {
  /** Three or four vertex indices — the group's `mode` bit 0 decides which. */
  indices: number[];
  /** Per-corner UVs, empty when the face group is untextured. */
  uvs: { u: number; v: number }[];
  /** Face group mode: texture page / material selector plus flags. */
  mode: number;
  textured: boolean;
}

export interface DatMesh { offset: number; end: number; vertices: DatVertex[]; faces: DatFace[] }

/**
 * One quad of a sprite record: a camera-facing card hung on a node. The
 * corners are 2D offsets from the node in the object's units; `mode` is the
 * same texture page / flag word a face group carries.
 */
export interface DatSpriteFace {
  corners: { x: number; y: number }[];
  /** i16 at +16, added to the card's depth (times the draw scale, 1.0). 0 in every record but one. */
  depthOffset: number;
  /**
   * u16 at +18: bits 0..4 the texture slot, the same per-slot table a face
   * group's mode indexes; bits 5..6 the PSX blend: 0x60 opaque, anything else
   * semi-transparent with mode `(mode >> 5) & 3`.
   */
  mode: number;
  uvs: { u: number; v: number }[];
  colours: { r: number; g: number; b: number; flag: number }[];
}

/**
 * A sprite record — the other thing an object's "mesh" pointer can name.
 * Which reader an object needs is decided by its placement's flags, not by
 * the record (see `DatPlacement.kind`); the executable's own classifier
 * (`FUN_0043e430`) walks this form as
 *
 *     i32 nodeCount; nodeCount x { i32 x, y, z }
 *     nodeCount x { i32 faceCount; faceCount x face (44 bytes) }
 *     face: 4 x { i16 x, i16 y }; i16 depthOffset; u16 mode; 4 x { u8 u, v }; 4 x { u8 r, g, b, flag }
 *
 * A chandelier is one of these: seven nodes, one flame card each. There are
 * 57 in the install, and every one ends exactly where the next record starts
 * (two are followed by a lone FFFFFFFF, the last sprite of the second
 * section in level01/level and level01/level1). The PC executable never
 * draws them — it renders the .ngn scene, where pconv has turned them into
 * ordinary quads — but it does walk them to count an object's polygons.
 *
 * How the PlayStation build draws them (`FUN_80023730` in psx.exe, chosen by
 * `FUN_8001fc2c`): each node goes through the object's rotation and
 * translation into camera space; each card's corners are then added in a
 * camera-aligned frame at the node's depth, so the cards are billboards.
 * With placement flag bit 0 clear the frame is the screen itself, with the
 * x offsets stretched by 0x1999/0x1000 = 1.6; with it set the frame is
 * turned to the camera's yaw only, so the card stays upright. The corner z
 * is ignored either way (the frame's third column is zero).
 */
export interface DatSprite { offset: number; end: number; nodes: Vec3[]; faces: DatSpriteFace[][] }

/**
 * A placement: one of the 20-byte records the engine's level loader
 * (`FUN_0043e6e0` in toy2.exe) walks to put objects in the world. The object
 * table the renderer reads is what these point at; the engine's own logic —
 * pickups, tokens, camera triggers — never touches an object except through
 * one of these, addressed by its index in `DatLevel.objectIds`.
 */
export interface DatPlacement {
  /** Byte offset of the record. The loader hands these out as object handles. */
  offset: number;
  /**
   * 0 for the first table, 1 for the second. The tables are the two sections
   * of the object table: the first at unit scale, the second at a quarter.
   */
  table: 0 | 1;
  /** Level units, as stored; equal to the placed object's own position. */
  position: Vec3;
  /**
   * i16 at +12. Made positive at load. For a pickup the engine shifts it right
   * by 3 to get the reach code (see src/sim/pickups.ts); what else it means
   * is not known.
   */
  param: number;
  /**
   * Byte at +14. Nonzero on every real record — a zero here ends the table.
   * Bit 0x08 selects the 32-byte object record with the mesh pointer at
   * +0x1c; 0x20 marks an object with a second mesh pointer; 0x80 is rewritten
   * to 0x40 at load. Masked with 0x6f, the loader's classifier
   * (`FUN_0043e430`) reads 1, 4, 0x41, 0x44 (and 9, 0xc, 0x49, 0x4c with the
   * 32-byte record) as a mesh and 2, 3, 0x42, 0x43 (0xa, 0xb, 0x4a, 0x4b) as
   * a sprite record — that is `kind`.
   */
  flags: number;
  /** What the placed object's pointer names, from `flags` (see there). */
  kind: 'mesh' | 'sprite';
  /** Byte at +15. Small integers, purpose unknown. */
  aux: number;
  /** Byte offset of the object record this places, i.e. a `DatObject.offset`. */
  objectOffset: number;
  /** Index into `DatLevel.objects`, or -1 if the pointer resolved to nothing. */
  objectIndex: number;
}

/** Where each section of the file starts, for tools that read what the parser skips. */
export interface DatSections {
  markers: number; paths: number; zones: number;
  /** Section 4: the 20-byte refs the loader indexes objects by. Not parsed. */
  section4: number;
  objectTable: number; meshPool: number;
}

export interface DatLevel {
  sections: DatSections;
  /** Both placement tables, first then second, in file order. */
  placements: DatPlacement[];
  /**
   * The engine's object-id space: `objectIds[id]` is the index of the
   * placement that id names, or -1 for an unused id. Level code refers to
   * objects by these ids — the Pizza Planet token lists in toy2.exe are lists
   * of them — and the pickup scan takes every used id from a per-level
   * starting point (0x30 for most levels) upward.
   */
  objectIds: number[];
  markers: Marker[];
  paths: Path[];
  zones: Zone[];
  objects: DatObject[];
  meshes: Map<number, DatMesh>;
  /** Sprite records by offset, the way `meshes` holds meshes. */
  sprites: Map<number, DatSprite>;
}

const ZONE_SIZE = 64;
const ZONE_MAGIC = 0x0005;
const ZONE_TAG = 0x0041;
const MESH_TERMINATOR = 0xffffffff;
/** `flags & 0x6f` values the loader's classifier treats as a sprite record. */
const SPRITE_FLAG_KINDS = new Set([0x02, 0x03, 0x42, 0x43, 0x0a, 0x0b, 0x4a, 0x4b]);

/** Read one sprite record (see `DatSprite`); null if it cannot be one. */
function readSprite(r: Reader, offset: number): DatSprite | null {
  if (offset + 4 > r.length) return null;
  const nodeCount = r.i32(offset);
  if (nodeCount <= 0 || nodeCount > 256 || offset + 4 + nodeCount * 12 > r.length) return null;
  let pos = offset + 4;
  const nodes: Vec3[] = [];
  for (let i = 0; i < nodeCount; i++) { nodes.push(r.vec3(pos)); pos += 12; }
  const faces: DatSpriteFace[][] = [];
  for (let i = 0; i < nodeCount; i++) {
    if (pos + 4 > r.length) return null;
    const faceCount = r.i32(pos);
    pos += 4;
    if (faceCount < 0 || faceCount > 4096 || pos + faceCount * 44 > r.length) return null;
    const list: DatSpriteFace[] = [];
    for (let k = 0; k < faceCount; k++) {
      const corners = [0, 1, 2, 3].map((c) => ({ x: r.i16(pos + c * 4), y: r.i16(pos + c * 4 + 2) }));
      const uvs = [0, 1, 2, 3].map((c) => ({ u: r.bytes[pos + 20 + c * 2]!, v: r.bytes[pos + 21 + c * 2]! }));
      const colours = [0, 1, 2, 3].map((c) => ({ r: r.bytes[pos + 28 + c * 4]!, g: r.bytes[pos + 29 + c * 4]!, b: r.bytes[pos + 30 + c * 4]!, flag: r.bytes[pos + 31 + c * 4]! }));
      list.push({ corners, depthOffset: r.i16(pos + 16), mode: r.u16(pos + 18), uvs, colours });
      pos += 44;
    }
    faces.push(list);
  }
  return { offset, end: pos, nodes, faces };
}

class Reader {
  readonly view: DataView;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  get length() { return this.bytes.length; }
  u16(o: number) { return this.view.getUint16(o, true); }
  u32(o: number) { return this.view.getUint32(o, true); }
  i32(o: number) { return this.view.getInt32(o, true); }
  i16(o: number) { return this.view.getInt16(o, true); }
  vec3(o: number): Vec3 { return { x: this.i32(o), y: this.i32(o + 4), z: this.i32(o + 8) }; }
}

/**
 * Read one mesh, or null if the bytes don't form a valid one.
 *
 * Validity is the parser's main structural check, and it is what makes the
 * boundary search below tractable: a run of bytes either walks cleanly to a
 * terminator with every face index in range, or it does not.
 */
function readMesh(r: Reader, offset: number): DatMesh | null {
  if (offset + 8 > r.length) return null;

  const rawCount = r.i32(offset);
  const vertexCount = Math.abs(rawCount);
  if (vertexCount === 0 || vertexCount > 4096) return null;

  let pos = offset + 4;
  if (pos + vertexCount * 8 > r.length) return null;

  const vertices: DatVertex[] = [];
  for (let i = 0; i < vertexCount; i++) {
    // The 16-bit colour is PSX 5:5:5:1 BGR vertex lighting.
    const packed = r.u16(pos + 6);
    vertices.push({
      x: r.i16(pos), y: r.i16(pos + 2), z: r.i16(pos + 4),
      r: ((packed & 0x1f) * 255) / 31,
      g: (((packed >> 5) & 0x1f) * 255) / 31,
      b: (((packed >> 10) & 0x1f) * 255) / 31,
    });
    pos += 8;
  }

  // A negative vertex count means an extra block follows the vertices. Its
  // purpose is unknown; the size rule is verified.
  if (rawCount < 0) {
    pos += (vertexCount + 1) * 4;
    if (pos > r.length) return null;
  }

  const faces: DatFace[] = [];
  for (;;) {
    if (pos + 4 > r.length) return null;
    if (r.u32(pos) === MESH_TERMINATOR) { pos += 4; break; }

    const mode = r.u16(pos);
    const count = r.u16(pos + 2);
    pos += 4;
    if (count === 0 || count > 4096) return null;

    // Bit 0x10 SET means untextured (4-byte faces); clear means textured (12).
    const textured = (mode & 0x10) === 0;
    const faceSize = textured ? 12 : 4;
    if (pos + count * faceSize > r.length) return null;

    // Bit 0x01 SET means the group holds TRIANGLES, clear means quads. Both
    // face sizes stay the same; a triangle stores only three indices and (when
    // textured) three UV pairs, shifted two bytes right of where a quad keeps
    // them:
    //
    //     quad     v0 v1 v2 v3 | u0 v0 u1 v1 u2 v2 u3 v3
    //     triangle v0 v1 v2 NN | 00 00 u0 v0 u1 v1 u2 v2
    //
    // NN is the group's face count repeated in every face (12,650 of 12,650
    // faces across the install; likewise the two zero bytes). Reading a
    // triangle as a quad both invents a 4th vertex — the stray sliver
    // triangles — and shifts every UV one slot, which is why those faces also
    // rendered with the wrong part of the texture.
    const triangles = (mode & 0x01) !== 0;

    for (let i = 0; i < count; i++) {
      const v = triangles
        ? [r.bytes[pos]!, r.bytes[pos + 1]!, r.bytes[pos + 2]!]
        : [r.bytes[pos]!, r.bytes[pos + 1]!, r.bytes[pos + 2]!, r.bytes[pos + 3]!];
      for (const idx of v) if (idx >= vertexCount) return null;
      // Structural checks that make the boundary search stronger: a triangle's
      // 4th byte echoes the group's face count, and its UV slot 0 is padding.
      if (triangles && r.bytes[pos + 3] !== (count & 0xff)) return null;
      if (triangles && textured && (r.bytes[pos + 4] !== 0 || r.bytes[pos + 5] !== 0)) return null;

      const uvs: DatFace['uvs'] = [];
      if (textured) {
        const uvBase = triangles ? pos + 6 : pos + 4;
        for (let k = 0; k < v.length; k++) {
          uvs.push({ u: r.bytes[uvBase + k * 2]!, v: r.bytes[uvBase + k * 2 + 1]! });
        }
      }
      faces.push({ indices: v, uvs, mode, textured });
      pos += faceSize;
    }
  }

  return { offset, end: pos, vertices, faces };
}

/** Could the bytes at `offset` be an object record? */
function objectPlausible(r: Reader, offset: number, meshStart: number | null): boolean {
  if (offset < 0 || offset + 24 > r.length) return false;
  const ptr = r.u32(offset);
  if (ptr !== 0) {
    if (ptr >= r.length) return false;
    if (meshStart !== null && ptr < meshStart) return false;
    if (meshStart === null && readMesh(r, ptr) === null) return false;
  }
  // Rotations are angle units, so all three must be below a full turn.
  for (let k = 0; k < 3; k++) if (r.u16(offset + 16 + k * 2) >= ANGLE_UNITS) return false;
  // Positions well outside any level's extent mean this isn't an object.
  const p = r.vec3(offset + 4);
  return Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)) <= 1 << 22;
}

/**
 * The mesh pool starts at the lowest mesh pointer held by any object record.
 * Section 4's entries point at object records (at `+4`), which gives us a way
 * in without knowing where the object table begins.
 */
function findMeshStart(r: Reader, searchFrom: number): number | null {
  const seen = new Set<number>();
  let best: number | null = null;
  for (let p = searchFrom; p < r.length - 20; p += 4) {
    const v = r.u32(p + 16);
    if (v <= 0x100 || v >= r.length || seen.has(v)) continue;
    seen.add(v);
    if (!objectPlausible(r, v - 4, null)) continue;
    const meshPtr = r.u32(v - 4);
    if (meshPtr && (best === null || meshPtr < best)) best = meshPtr;
  }
  return best;
}

/**
 * Recover the object table by tiling it exactly.
 *
 * Records are 20, 24 or 32 bytes and **do not store their own size**. We work
 * backwards from the end of the table marking every offset from which some
 * sequence of valid records reaches the end, then walk forwards choosing sizes.
 * In practice this resolves uniquely — the identity-scale signature at +22
 * disambiguates 24 from 32 whenever both would tile.
 */
function findObjectTable(
  r: Reader, searchFrom: number, meshStart: number,
): { start: number; end: number; records: { offset: number; size: number }[] } | null {
  const ok = (o: number): boolean => {
    const v = r.u32(o);
    if (!(v === 0 || (v % 4 === 0 && v >= meshStart && v < r.length))) return false;
    for (let k = 0; k < 3; k++) if (r.u16(o + 16 + k * 2) >= ANGLE_UNITS) return false;
    return true;
  };

  // The table ends at or just before the mesh pool.
  for (let end = meshStart; end > meshStart - 68; end -= 4) {
    if (end <= searchFrom) continue;

    const can = new Map<number, boolean>([[end, true]]);
    for (let o = end - 4; o >= searchFrom; o -= 4) {
      can.set(o, ok(o) && (can.get(o + 24) === true || can.get(o + 32) === true ||
                           can.get(o + 20) === true));
    }

    let start: number | null = null;
    for (let o = searchFrom; o < end; o += 4) {
      if (can.get(o) === true) { start = o; break; }
    }
    if (start === null) continue;

    const records: { offset: number; size: number }[] = [];
    for (let o = start; o < end;) {
      const c24 = can.get(o + 24) === true;
      const c32 = can.get(o + 32) === true;
      let size: number;
      if (c24 && c32) {
        // Identity scale (0x1000 on all three axes) marks the 32-byte form.
        size = r.u16(o + 22) === 0x1000 && r.u16(o + 24) === 0x1000 &&
               r.u16(o + 26) === 0x1000 ? 32 : 24;
      } else if (c32) size = 32;
      else if (c24) size = 24;
      else size = 20;
      records.push({ offset: o, size });
      o += size;
    }
    return { start, end, records };
  }
  return null;
}

export function parseDat(buffer: ArrayBuffer | Uint8Array): DatLevel {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const r = new Reader(bytes);
  if (bytes.length < 8) throw new Error('level.dat: too short');

  const markerCount = r.u16(4);

  // --- markers: pickup points, evenly spread over walkable floor
  //
  // The count at +4 is not always the marker count. Three of the game's twenty
  // scenes (level02/level1, level05/level1, level06/level1) have something
  // else there, and reading it as markers yields positions scattered outside
  // the level. They are caught by their `kind`: a real marker always carries
  // 16, so a scene that produces anything else has been misread and is treated
  // as having none. That matters beyond tidiness — the viewer picks a spawn
  // point from this list, and a garbage marker puts Buzz outside the world.
  const markers: Marker[] = [];
  let pos = 8;
  const sections: DatSections = { markers: 8, paths: 0, zones: 0, section4: 0, objectTable: 0, meshPool: 0 };
  for (let i = 0; i < markerCount && pos + 16 <= r.length; i++) {
    markers.push({ position: r.vec3(pos), kind: r.i32(pos + 12) });
    pos += 16;
  }
  const markersValid = markers.every((m) => m.kind === MARKER_KIND);
  if (!markersValid) {
    markers.length = 0;
    pos = 8;
  }

  // --- paths: polylines, read until the zone signature appears
  sections.paths = pos;
  const paths: Path[] = [];
  while (pos + 4 <= r.length) {
    if (r.u16(pos) === ZONE_MAGIC && r.u16(pos + 2) === ZONE_TAG) break;
    const count = r.u16(pos);
    const id = r.u16(pos + 2);
    if (count === 0 || count > 512 || pos + 4 + count * 12 > r.length) break;
    const points: Vec3[] = [];
    for (let i = 0; i < count; i++) points.push(r.vec3(pos + 4 + i * 12));
    paths.push({ id, points });
    pos += 4 + count * 12;
  }

  // --- portals: planar quads standing in doorways, listed from both sides
  sections.zones = pos;
  const zones: Zone[] = [];
  while (pos + ZONE_SIZE <= r.length && r.u16(pos) === ZONE_MAGIC && r.u16(pos + 2) === ZONE_TAG) {
    zones.push({
      corners: [r.vec3(pos + 4), r.vec3(pos + 16), r.vec3(pos + 28), r.vec3(pos + 40)],
      from: r.i32(pos + 52), to: r.i32(pos + 56),
    });
    pos += ZONE_SIZE;
  }

  // --- section 4: the placement tables and the object-id list. Not needed to
  //     render, so a file this cannot be read from still parses; see
  //     readPlacements for the layout.
  sections.section4 = walkRecordStream(r) ?? pos;
  const { placements, objectIds } = readPlacements(r, sections.section4);
  const meshStart = findMeshStart(r, pos);
  if (meshStart === null) throw new Error('level.dat: could not locate the mesh pool');
  sections.meshPool = meshStart;

  const table = findObjectTable(r, pos, meshStart);
  if (!table) throw new Error('level.dat: could not tile the object table');
  sections.objectTable = table.start;

  // The mesh pointer is the LAST field of a record, not the first. The tiler
  // frames records as [u32][x y z][rot][scale][flags] because that is how the
  // pointer/rotation validity checks fall out, but the u32 at the head of a
  // frame belongs to the PREVIOUS record. Reading it as this record's mesh
  // pairs every mesh with the transform of the object before it — which is
  // invisible when neighbours share a transform (most do: multi-part props
  // are consecutive records) and shows up as a stray part wherever they do
  // not. Level 1's garage car lost a quarter to the next object's transform
  // that way. Under the head-pointer reading 8 of 15 clean scene files place
  // the same mesh twice at an identical transform; under this one, none do,
  // and the table ends exactly at the mesh pool instead of 4 bytes short.
  const objects: DatObject[] = table.records.map(({ offset, size }) => ({
    offset: offset + 4, size, unitScale: 1,
    meshOffset: r.u32(offset + size),
    position: r.vec3(offset + 4),
    rotation: size >= 24
      ? { x: r.u16(offset + 16), y: r.u16(offset + 18), z: r.u16(offset + 20) }
      : { x: 0, y: 0, z: 0 },
    scale: size === 32
      ? { x: r.u16(offset + 22), y: r.u16(offset + 24), z: r.u16(offset + 26) }
      : { x: ANGLE_UNITS, y: ANGLE_UNITS, z: ANGLE_UNITS },
    flags: r.u16(offset + (size === 32 ? 28 : Math.min(size - 2, 22))),
  }));

  // --- where the first section of the object table ends.
  //
  // Nothing in the record says which section it is in, and no count was found
  // in the header. What does mark it is section 4, the 20-byte list between
  // the portals and the objects: records of `x y z, u32, pointer` (pointer
  // last, like the objects themselves), and its leading run points at
  // exactly the first-section objects, one each — verified against the PC
  // scene's own two instance lists in every scene file that has one. The
  // list is preceded by up to a few words of lead-in — a u32 0 after a path
  // or portal section, two after a marker section, none when nothing precedes
  // it — so the start is found by trying each. A scene where no lead-in works
  // keeps every object at unit scale, which is the old behaviour.
  const byOffset = new Map(objects.map((o, i) => [o.offset, i]));
  const resolves = (q: number) => q + 20 <= table.start && byOffset.has(r.u32(q + 16));
  let q = pos;
  for (let lead = 0; lead <= 16 && !resolves(q); lead += 4) q = pos + lead;
  let firstSection = 0;
  for (; resolves(q); q += 20) firstSection++;
  if (firstSection > 0) for (let i = firstSection; i < objects.length; i++) objects[i]!.unitScale = 4;

  // Placements point at object records by the offset of their position field,
  // which is exactly what `DatObject.offset` records.
  const objectAt = new Map(objects.map((o, i) => [o.offset, i]));
  for (const p of placements) p.objectIndex = objectAt.get(p.objectOffset) ?? -1;

  // --- mesh pool: meshes and sprite records stored back to back. Which is
  //     which is the placement's say (`kind`), never the record's: a sprite
  //     record can pass the mesh reader by accident (16 do across the install),
  //     so resolve every placed object by its own pointer with the right
  //     reader first, and only then walk the pool for whatever is left, taking
  //     each record with the reader its pointer chose.
  const meshes = new Map<number, DatMesh>();
  const sprites = new Map<number, DatSprite>();
  const spriteOffsets = new Set<number>();
  for (const p of placements) {
    const object = objects[p.objectIndex];
    if (object && object.meshOffset !== 0 && p.kind === 'sprite') spriteOffsets.add(object.meshOffset);
  }
  for (const object of objects) {
    const o = object.meshOffset;
    if (o === 0 || meshes.has(o) || sprites.has(o)) continue;
    if (spriteOffsets.has(o)) { const sprite = readSprite(r, o); if (sprite) sprites.set(o, sprite); continue; }
    const mesh = readMesh(r, o);
    if (mesh) meshes.set(o, mesh);
  }
  for (let o = meshStart; o < r.length - 8;) {
    if (meshes.has(o)) { o = meshes.get(o)!.end; continue; }
    if (sprites.has(o)) { o = sprites.get(o)!.end; continue; }
    if (r.u32(o) === MESH_TERMINATOR) { o += 4; continue; }  // the lone word after a section's last sprite
    const mesh = readMesh(r, o);
    if (!mesh) break;
    meshes.set(o, mesh);
    o = mesh.end;
  }

  return { sections, placements, objectIds, markers, paths, zones, objects, meshes, sprites };
}

/**
 * Where the record stream ends, the way the loader finds it.
 *
 * `FUN_0043e6e0` does not know about markers, paths and portals as such. It
 * reads the header u32 as a record count and walks that many records from
 * offset 4, each `i16 n, i16 tag` and a body whose size the tag decides:
 *
 *     tag <  0      ((3n + 1) / 2 + 4) x u32     never seen in a file
 *     tag == 0x3f   4n + 1 x u32                  the marker block: n x 16 bytes
 *     otherwise     3n + 1 x u32                  paths (tag < 0x40) and portals (>= 0x41)
 *
 * So the marker block is just the first record, and the loader divides every
 * portal's coordinates by four as it goes. This is the only reliable way to
 * find what follows: a boss arena has no markers and no paths, and one scene
 * (`level05/level1`) opens with two paths that read as a marker count. Null
 * if the walk leaves the file.
 */
function walkRecordStream(r: Reader): number | null {
  const count = r.i32(0);
  if (count < 0 || count > 4096) return null;
  let pos = 4;
  for (let i = 0; i < count; i++) {
    if (pos + 4 > r.length) return null;
    const n = r.i16(pos), tag = r.i16(pos + 2);
    if (n < 0) return null;
    const words = tag < 0 ? Math.trunc((n * 3 + 1) / 2) + 4 : tag === 0x3f ? n * 4 + 1 : n * 3 + 1;
    pos += words * 4;
  }
  return pos <= r.length ? pos : null;
}

/**
 * Section 4, read the way `FUN_0043e6e0` reads it:
 *
 *     i32 extra; extra x 128 bytes        (0 in every file examined)
 *     table A: 20-byte records until one whose byte +14 is zero
 *     i32 count; (count + 1) x u32 offset (the object-id list, ids 0..count)
 *     table B: 20-byte records until one whose byte +14 is zero
 *
 * The u32 list entries are byte offsets of records in either table, or zero for
 * an id nothing uses. The loader turns each into a pointer, and everything the
 * game does to an object by id goes through this list. An earlier reading of
 * this section as "20-byte refs whose leading run maps first-section objects"
 * was the first table seen without its terminator and list.
 *
 * Returns empty results rather than throwing: a scene with no placements is
 * still worth drawing.
 */
function readPlacements(r: Reader, pos: number): { placements: DatPlacement[]; objectIds: number[] } {
  const none = { placements: [] as DatPlacement[], objectIds: [] as number[] };
  if (pos < 0 || pos + 4 > r.length) return none;
  const extra = r.i32(pos);
  if (extra < 0 || extra > 64) return none;
  pos += 4 + extra * 128;

  const placements: DatPlacement[] = [];
  const readTable = (table: 0 | 1): boolean => {
    while (pos + 20 <= r.length) {
      const flags = r.bytes[pos + 14]!;
      if (flags === 0) { pos += 20; return true; }
      placements.push({
        offset: pos, table, position: r.vec3(pos),
        param: r.i16(pos + 12), flags, aux: r.bytes[pos + 15]!,
        kind: SPRITE_FLAG_KINDS.has(flags & 0x6f) ? 'sprite' : 'mesh',
        objectOffset: r.u32(pos + 16), objectIndex: -1,
      });
      pos += 20;
    }
    return false;
  };
  if (!readTable(0) || pos + 4 > r.length) return none;

  const count = r.i32(pos);
  if (count < 0 || count > 4096 || pos + 4 + (count + 1) * 4 > r.length) return none;
  const listAt = pos + 4;
  pos = listAt + (count + 1) * 4;
  readTable(1);

  const byOffset = new Map(placements.map((p, i) => [p.offset, i]));
  const objectIds: number[] = [];
  for (let id = 0; id <= count; id++) {
    const offset = r.u32(listAt + id * 4);
    objectIds.push(offset === 0 ? -1 : (byOffset.get(offset) ?? -1));
  }
  return { placements, objectIds };
}

/**
 * The engine's "class" of a mesh: its polygon count as `FUN_0043e2d0` counts
 * it, which is what `FUN_0044e520` switches on to decide what a pickup is —
 * a 36-polygon mesh is a Pizza Planet token, an 18-polygon one an extra
 * life, and so on (src/sim/pickups.ts). There is no type field anywhere; the
 * count is the type. Face groups whose low mode bits fall in 8..0xe count
 * double, the rest once.
 */
export function meshPolyCount(mesh: DatMesh): number {
  let n = 0;
  for (const face of mesh.faces) {
    const kind = face.mode & 0x1f;
    n += kind >= 8 && kind <= 0xe && kind !== 0xd ? 2 : 1;
  }
  return n;
}

/**
 * The polygon count the engine gives an object (`FUN_0043e430`): the mesh
 * count above, or for a sprite record the number of cards over all its
 * nodes. -1 when the pointer names nothing readable.
 */
export function objectPolyCount(level: DatLevel, object: DatObject | undefined): number {
  if (!object) return -1;
  const mesh = level.meshes.get(object.meshOffset);
  if (mesh) return meshPolyCount(mesh);
  const sprite = level.sprites.get(object.meshOffset);
  if (sprite) return sprite.faces.reduce((n, list) => n + list.length, 0);
  return -1;
}

/** Faces as the scene cross-check counts them: mesh faces, or a sprite's cards. -1 if unreadable. */
export function objectFaceCount(level: DatLevel, object: DatObject | undefined): number {
  if (!object) return -1;
  const mesh = level.meshes.get(object.meshOffset);
  if (mesh) return mesh.faces.length;
  const sprite = level.sprites.get(object.meshOffset);
  if (sprite) return sprite.faces.reduce((n, list) => n + list.length, 0);
  return -1;
}

// --- Renderable output ------------------------------------------------------

/**
 * A run of triangles sharing one texture page, ready to become a draw group.
 * Triangles are bucketed by page so each range can bind a single texture.
 */
export interface GeometryGroup {
  /** First vertex index in the flattened arrays (3 per triangle). */
  start: number;
  /** Vertex count in this run. */
  count: number;
  /** `.ngn` texture slot id, or null for untextured faces. */
  page: number | null;
  /** How these faces combine with the frame buffer. */
  blend: BlendMode;
  /** Drawn from both sides, rather than back-face culled. */
  doubleSided: boolean;
  /**
   * Which of the level's two detail lists these faces are from: 0 the full
   * detail (the object table's first section), 1 the low detail (its
   * quarter-scale second section, a coarser copy of the same scenery). The
   * engine draws list 1 only beyond a distance and list 0 only within one,
   * split by the clip planes; drawn together they z-fight (docs/FORMATS.md,
   * "The two passes are two levels of detail").
   */
  list: 0 | 1;
  /** Constant vertex alpha: 1 for opaque faces, 0.5 for the PSX half-blend. */
  alpha: number;
  /**
   * Mode bit 0x08: the engine draws these faces a second time with a global
   * material, a sphere-mapped environment texture (docs/FORMATS.md, the
   * material table). 120 materials in the install carry it.
   */
  reflect: boolean;
  /**
   * Which zone these faces belong to, or null if the caller supplied no zone
   * for the object. Zones are the unit of visibility: the engine draws the
   * one the camera is in plus whatever it can see through portals.
   */
  zone: number | null;
  /**
   * The single object these faces belong to, when the caller asked for it to
   * be kept separate (`GeometryOptions.separate`), else null. It is what
   * lets a collected pickup or a token that has not been earned yet be
   * taken off the screen without rebuilding the level.
   */
  object: number | null;
  /**
   * Where that object stands, renderer units, and the rotation already baked
   * into these vertices, in the engine's 4,096-per-turn angles. A pickup
   * turns on the spot, and rebuilding its vertices needs both: the spin is
   * applied about the origin, and composed with the rotation that is already
   * there rather than replacing it. Null on a merged group.
   */
  origin: readonly [number, number, number] | null;
  rotation: readonly [number, number, number] | null;
}

export interface LevelGeometry {
  positions: Float32Array;
  colors: Float32Array;
  uvs: Float32Array;
  groups: GeometryGroup[];
  triangleCount: number;
  objectCount: number;
}

/**
 * Texture page selector for a face group.
 *
 * Verified across the install: in 15 of 16 scene files every page derived this
 * way is a valid texture slot in that scene's own `.ngn`, and UVs (u8 0..255)
 * map 1:1 onto the 256x256 textures. The low byte of `mode` carries material
 * bits rather than page information, and bit `0x10` there marks untextured.
 *
 * The `0x1f` mask matters: a wider mask scores bits 13/14 — which are real
 * flags, not page bits — as part of the page and yields impossible slot ids.
 * With this mask, every page reached by a drawn object resolves in all 16
 * scene files, with no exceptions to special-case.
 */
export function texturePage(mode: number): number {
  return (mode >> 8) & 0x1f;
}

/** How a face combines with what is already in the frame buffer. */
export type BlendMode = 'opaque' | 'normal' | 'additive' | 'subtractive';

/**
 * Blend mode for a face group.
 *
 * Read out of the PC build rather than guessed: pconv turned every face mode
 * into an NU material, and toy2.exe maps that material's flags onto Direct3D
 * states (docs/FORMATS.md, "Material system"). A face is semi-transparent
 * unless bit `0x40` (opaque) or bit `0x08` (extra pass) is set, and the kind
 * of blend is chosen by bit `0x20`. Semi-transparent faces carry vertex alpha
 * 0x80, which is the PSX half-blend.
 *
 * Verified on 129,452 faces across all 16 scene files, where the material
 * these rules predict is the material pconv actually assigned 96% of the
 * time; almost all of the rest are colour-key cutouts, which the original
 * drew through alpha blending and this renderer draws with `alphaTest`.
 *
 * The one real exception is mode low byte `0x40`, which is subtractive
 * despite having the opaque bit set. It occurs on 3 faces in the whole game.
 */
export function blendMode(mode: number): BlendMode {
  if ((mode & 0xff) === 0x40) return 'subtractive';
  if ((mode & 0x48) !== 0) return 'opaque';
  return (mode & 0x20) !== 0 ? 'additive' : 'normal';
}

/**
 * Is this face group drawn from both sides?
 *
 * Everything else is single-sided: the engine's default cull mode is
 * `D3DCULL_CW` and only material flag `0x08` clears it, which is exactly what
 * mode bit `0x02` selects. Exact across the whole game — every mode low byte
 * carrying `0x02` got the no-cull material, and none without it did.
 */
export function isDoubleSided(mode: number): boolean {
  return (mode & 0x02) !== 0;
}

/**
 * Vertex alpha for a face group, as the PSX stored it.
 * Semi-transparent faces are a flat half-blend; everything else is solid.
 */
export function faceAlpha(mode: number): number {
  return blendMode(mode) === 'opaque' ? 1 : 0.5;
}

/**
 * Build a rotation matrix from PSX angle units.
 * Composition order is assumed Ry * Rx * Rz and is unverified — though the
 * large majority of objects rotate on a single axis, where order can't matter.
 */
/** The 4,096 steps a full turn is divided into, for both angles and yaw. */
export const OBJECT_ANGLE_UNITS = ANGLE_UNITS;

/**
 * The rotation an object's vertices were baked with, as a row-major 3x3.
 * Exported so a caller that wants to turn one object can undo the baked
 * rotation and apply another in its place.
 */
export function objectRotationMatrix(x: number, y: number, z: number): number[] {
  return rotationMatrix({ x, y, z });
}

function rotationMatrix(rot: Vec3): number[] {
  const a = (u: number) => (u / ANGLE_UNITS) * Math.PI * 2;
  const [sx, cx] = [Math.sin(a(rot.x)), Math.cos(a(rot.x))];
  const [sy, cy] = [Math.sin(a(rot.y)), Math.cos(a(rot.y))];
  const [sz, cz] = [Math.sin(a(rot.z)), Math.cos(a(rot.z))];
  // Multiply three axis matrices in a configurable order so the convention can
  // be tested rather than assumed.
  const RX = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const RY = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const RZ = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  const mul = (A: number[], B: number[]) => {
    const out = new Array(9).fill(0);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        for (let k = 0; k < 3; k++) out[i * 3 + j] += A[i * 3 + k]! * B[k * 3 + j]!;
    return out as number[];
  };
  // Order barely matters in practice: all six permutations agree on level 1's
  // bounding box to within 1.5 units out of 224, even though 281 objects
  // rotate on more than one axis. Ry * Rx * Rz is kept as the documented
  // assumption.
  return mul(mul(RY, RX), RZ);
}

/**
 * Zones reachable from `from` without leaving the level.
 *
 * One step of the engine's portal walk, minus the frustum clipping: the zone
 * itself, whatever its portals lead to, and zone 0, which the engine draws
 * from wherever you stand. `depth` widens it; the real renderer recurses until
 * the clipped frustum goes empty, which needs a camera, so a fixed depth
 * stands in until there is a player to stand somewhere.
 */
export function reachableZones(portals: Zone[], from: number, depth = 1): Set<number> {
  const seen = new Set<number>([from, 0]);
  let frontier = [from];
  for (let step = 0; step < depth; step++) {
    const next: number[] = [];
    for (const zone of frontier) {
      for (const portal of portals) {
        if (portal.from !== zone || portal.to === OUTSIDE) continue;
        if (seen.has(portal.to)) continue;
        seen.add(portal.to);
        next.push(portal.to);
      }
    }
    frontier = next;
  }
  return seen;
}

export interface GeometryOptions {
  /** Zone per object, parallel to `level.objects`. See `assignZones`. */
  zones?: (number | null)[];
  /**
   * Object indices to keep in draw groups of their own instead of merging
   * them with everything that shares their material. Merging is what makes
   * the level one handful of draw calls, but a pickup has to be taken away
   * when it is collected and a hidden token must not be drawn at all, and
   * an object cannot be hidden while its triangles are mixed in with a
   * wall's. Only the objects that need it should be listed.
   */
  separate?: ReadonlySet<number>;
}

export function buildLevelGeometry(level: DatLevel, options: GeometryOptions = {}): LevelGeometry {
  // Bucket triangles by everything that has to be one draw call: texture page,
  // blend mode and cull mode. A page alone is not enough — a wall and the
  // glass in front of it can share a texture and still need different states.
  // `null` collects untextured faces.
  interface Bucket { pos: number[]; col: number[]; uv: number[]; group: Omit<GeometryGroup, 'start' | 'count'> }
  const buckets = new Map<string, Bucket>();
  const bucketFor = (group: Omit<GeometryGroup, 'start' | 'count'>) => {
    const key = `${group.page}|${group.blend}|${group.doubleSided}|${group.zone}|${group.object}|${group.list}`;
    let bucket = buckets.get(key);
    if (!bucket) { bucket = { pos: [], col: [], uv: [], group }; buckets.set(key, bucket); }
    return bucket;
  };

  let objectCount = 0;

  for (const [index, object] of level.objects.entries()) {
    const mesh = level.meshes.get(object.meshOffset);
    if (!mesh) continue;
    objectCount++;
    const zone = options.zones?.[index] ?? null;

    const m = rotationMatrix(object.rotation);
    // Second-section objects store everything at a quarter scale; the factor
    // applies to their vertices and to their position alike.
    const u = object.unitScale;
    const sc = {
      x: (object.scale.x / ANGLE_UNITS) * u,
      y: (object.scale.y / ANGLE_UNITS) * u,
      z: (object.scale.z / ANGLE_UNITS) * u,
    };
    const px = object.position.x * u, py = object.position.y * u, pz = object.position.z * u;
    const separate = options.separate?.has(index) ?? false;

    for (const face of mesh.faces) {
      const bucket = bucketFor({
        page: face.textured ? texturePage(face.mode) : null,
        blend: blendMode(face.mode),
        doubleSided: isDoubleSided(face.mode),
        list: u === 4 ? 1 : 0,
        alpha: faceAlpha(face.mode),
        reflect: (face.mode & 0x08) !== 0,
        zone,
        object: separate ? index : null,
        origin: separate
          ? [px / WORLD_SCALE, -py / WORLD_SCALE, -pz / WORLD_SCALE] as const
          : null,
        rotation: separate
          ? [object.rotation.x, object.rotation.y, object.rotation.z] as const
          : null,
      });

      // PSX colour scaling differs by primitive kind: textured polys modulate
      // the texel by colour/128 (0x80 neutral, up to 2x brightening), but
      // UNTEXTURED polys draw their colour as-is on a 0-255 scale. Using /128
      // for both clamps bright flat colours into neon — sky-blue window panes
      // come out pure cyan and any channel above 128 saturates.
      const colourScale = face.textured ? PSX_NEUTRAL : 255;

      const corner = (k: number) => {
        const v = mesh.vertices[face.indices[k]!];
        if (v) {
          const x = v.x * sc.x, y = v.y * sc.y, z = v.z * sc.z;
          bucket.pos.push(
            (m[0]! * x + m[1]! * y + m[2]! * z + px) / WORLD_SCALE,
            -(m[3]! * x + m[4]! * y + m[5]! * z + py) / WORLD_SCALE,
            -(m[6]! * x + m[7]! * y + m[8]! * z + pz) / WORLD_SCALE,
          );
          bucket.col.push(v.r / colourScale, v.g / colourScale, v.b / colourScale);
        }
        const t = face.uvs[k];
        bucket.uv.push(t ? t.u / 255 : 0, t ? t.v / 255 : 0);
      };

      if (face.indices.length === 4) {
        corner(0); corner(1); corner(2);
        corner(0); corner(2); corner(3);
      } else {
        corner(0); corner(1); corner(2);
      }
    }
  }

  // Concatenate the buckets, recording each one's range. Copy through typed
  // arrays rather than `push(...bucket)` — spreading a bucket passes every
  // number as a separate argument, which overflows the stack on larger levels.
  // Opaque buckets first, then the blended ones, so a renderer that honours
  // group order draws them in the right sequence without sorting. Within each
  // half, untextured last so textured pages take the low material indices.
  const order = [...buckets.values()].sort((a, b) => {
    const opaque = (g: Bucket) => (g.group.blend === 'opaque' ? 0 : 1);
    if (opaque(a) !== opaque(b)) return opaque(a) - opaque(b);
    if ((a.group.page === null) !== (b.group.page === null)) return a.group.page === null ? 1 : -1;
    return (a.group.page ?? 0) - (b.group.page ?? 0);
  });

  let totalPos = 0, totalUv = 0;
  for (const bucket of buckets.values()) { totalPos += bucket.pos.length; totalUv += bucket.uv.length; }

  const positions = new Float32Array(totalPos);
  const colors = new Float32Array(totalPos);
  const uvs = new Float32Array(totalUv);
  const groups: GeometryGroup[] = [];

  let posOffset = 0, uvOffset = 0;
  for (const bucket of order) {
    if (bucket.pos.length === 0) continue;
    positions.set(bucket.pos, posOffset);
    colors.set(bucket.col, posOffset);
    uvs.set(bucket.uv, uvOffset);
    groups.push({ ...bucket.group, start: posOffset / 3, count: bucket.pos.length / 3 });
    posOffset += bucket.pos.length;
    uvOffset += bucket.uv.length;
  }

  return {
    positions, colors, uvs, groups,
    triangleCount: totalPos / 9,
    objectCount,
  };
}
