/**
 * Parser for the PC `level.dat` — a level's complete visual world geometry.
 *
 * This is the level itself: every static mesh (vertices, faces, per-corner UVs,
 * vertex colours) plus a placement transform for each object in the world.
 * Since `TERRAIN.ALL` turned out to hold collision and nothing else, this file
 * is the other half of a level — geometry here, collision there.
 *
 * It is a **pointer-linked memory image**: 32-bit "address" fields are byte
 * offsets from the start of the file. There is no header beyond a record
 * count, and the file is read the way the LOADER reads it (`FUN_0043e6e0`;
 * docs/FORMATS.md "level.dat, from the loader"):
 *
 *     u32 n; n tagged records     the markers, paths and portal quads
 *     u32 m; m x 0x80 bytes       a block table (m is 0 in every shipped file)
 *     20-byte entries, 0 ends     object list 0, drawn at unit scale
 *     u32 c; (c + 1) x u32        the object-id index
 *     20-byte entries, 0 ends     object list 1, the quarter-scale copy
 *     the mesh pool               reached only through each object's pointer
 *
 * Each list entry points at a 24- or 32-byte TRANSFORM record, which is what
 * `DatObject` is. An earlier pass here recovered all of that by heuristics —
 * a scan for the mesh pool, a tiler over the transform records and a guess at
 * where the first list ended — which mis-sized two records on level 4,
 * invented one on level 10, put 19 at the wrong scale, and could not read
 * `level02/level1` at all. `walkObjectLists` replaced it 2026-09-07.
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
  /** Byte offset of this record's position field, which its list entry points at. */
  offset: number;
  /** 24, or 32 when the entry's flag 8 says the record carries scales. */
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
  /**
   * The visibility zone, straight from the file: the loader's object list
   * (`FUN_0043e6e0`, "level.dat, from the loader" in docs/FORMATS.md) is
   * 20-byte entries whose byte at +0xf is the room and whose pointer at
   * +0x10 is this record. Null only if the walk could not reach this record.
   */
  zone: number | null;
  /** Which of the loader's two object lists named it: 0 near, 1 far. */
  datList: 0 | 1 | null;
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




export function parseDat(buffer: ArrayBuffer | Uint8Array): DatLevel {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const r = new Reader(bytes);
  if (bytes.length < 8) throw new Error('level.dat: too short');

  // --- the tagged records, read as the loader reads them (`FUN_0043e6e0`):
  //     `u32 n`, then n records of `u16 count, i16 tag`. Tag 0x3f is the
  //     markers (16 bytes each); 1..0x3e a path and 0x40 a floor list
  //     (12-byte points, which the level code reaches BY TAG — the level
  //     select's camera rides paths 1 and 2 of its scene); 0x41 and above a
  //     portal (count 5: four corners and the two rooms); a negative tag a
  //     path of i16 points behind a 16-byte header. An earlier reading here
  //     took the first record for the markers and scanned for the rest by
  //     shape, which read the level select's scene — whose first record is
  //     path 1 — as one 504-point path and cost the three scenes that open
  //     with something other than markers theirs.
  const recordCount = r.i32(0);
  const markers: Marker[] = [];
  const paths: Path[] = [];
  const zones: Zone[] = [];
  const sections: DatSections = { markers: 4, paths: 4, zones: 4, section4: 0, objectTable: 0, meshPool: 0 };
  let pos = 4;
  let seenPath = false, seenZone = false;
  for (let i = 0; i < recordCount && pos + 4 <= r.length; i++) {
    const count = r.u16(pos), tag = r.i16(pos + 2);
    if (tag < 0) { pos += (Math.trunc((count * 3 + 1) / 2) + 4) * 4; continue; }
    if (tag === 0x3f) {
      sections.markers = pos;
      for (let m = 0; m < count && pos + 4 + m * 16 + 16 <= r.length; m++) {
        markers.push({ position: r.vec3(pos + 4 + m * 16), kind: r.i32(pos + 16 + m * 16) });
      }
      pos += 4 + count * 16;
      continue;
    }
    if (tag >= 0x41) {
      if (!seenZone) { sections.zones = pos; seenZone = true; }
      if (count === 5 && pos + ZONE_SIZE <= r.length) {
        zones.push({
          corners: [r.vec3(pos + 4), r.vec3(pos + 16), r.vec3(pos + 28), r.vec3(pos + 40)],
          from: r.i32(pos + 52), to: r.i32(pos + 56),
        });
      }
    } else {
      if (!seenPath) { sections.paths = pos; seenPath = true; }
      const points: Vec3[] = [];
      for (let k = 0; k < count && pos + 4 + k * 12 + 12 <= r.length; k++) points.push(r.vec3(pos + 4 + k * 12));
      paths.push({ id: tag, points });
    }
    pos += 4 + count * 12;
  }
  // A real marker always carries kind 16; anything else is a misread.
  if (!markers.every((m) => m.kind === MARKER_KIND)) markers.length = 0;

  // --- the object lists and the mesh pool, walked the way the LOADER does
  //     (`FUN_0043e6e0`; docs/FORMATS.md "level.dat, from the loader").
  //     Everything below used to be recovered by heuristics — a scan for the
  //     mesh pool, a tiler over the object records, and a guess at where the
  //     first section ended. The loader reads all three outright.
  sections.section4 = walkRecordStream(r) ?? pos;
  const lists = walkObjectLists(r, sections.section4);
  if (!lists) throw new Error('level.dat: could not walk the object lists');
  sections.objectTable = lists.start;
  sections.meshPool = lists.meshPool;
  const { placements, objectIds } = readPlacements(r, sections.section4);

  // An entry names its object's TRANSFORM record, whose position field is
  // what the pointer points at, so the record's frame starts four bytes
  // earlier — the u32 there is the previous record's mesh pointer. Flag 8
  // picks the record's shape: with it, three scales at +0x12 and the mesh
  // pointer at +0x1c; without, no scales and the mesh pointer at +0x14.
  const objects: DatObject[] = lists.entries.map((e) => {
    const size = (e.flags & OBJECT_SCALED) !== 0 ? 32 : 24;
    const offset = e.record - 4;
    return {
      offset: e.record, size, unitScale: e.list === 0 ? 1 : 4,
      meshOffset: r.u32(offset + size),
      zone: e.zone, datList: e.list,
      position: r.vec3(offset + 4),
      rotation: { x: r.u16(offset + 16), y: r.u16(offset + 18), z: r.u16(offset + 20) },
      scale: size === 32
        ? { x: r.u16(offset + 22), y: r.u16(offset + 24), z: r.u16(offset + 26) }
        : { x: ANGLE_UNITS, y: ANGLE_UNITS, z: ANGLE_UNITS },
      flags: r.u16(offset + (size === 32 ? 28 : 22)),
    };
  });

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
  for (let o = sections.meshPool; o < r.length - 8;) {
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

/** An entry's flag bit 3: the record carries scales and is four bytes longer. */
const OBJECT_SCALED = 0x08;

/**
 * The loader's two object lists (`FUN_0043e6e0`), which begin where the
 * tagged-record stream ends:
 *
 *     u32 m; m x 0x80 bytes            a block table (m is 0 in every file)
 *     20-byte entries until +0xe is 0  list 0, drawn at unit scale
 *     u32 c; (c + 1) x u32             the object-id index
 *     20-byte entries until +0xe is 0  list 1, the quarter-scale copy
 *     the mesh pool
 *
 * An entry is `i32 x, y, z; i16; u8 flags; u8 zone; u32 record`. Its own
 * position is a copy the loader keeps; the RECORD's is what everything here
 * reads, since that is the transform the engine builds its matrix from.
 */
function walkObjectLists(r: Reader, at: number): {
  start: number;
  meshPool: number;
  entries: { record: number; flags: number; zone: number; list: 0 | 1 }[];
} | null {
  if (at <= 0 || at + 4 > r.length) return null;
  let pos = at + 4 + r.u32(at) * 0x80;
  const start = pos;
  const entries: { record: number; flags: number; zone: number; list: 0 | 1 }[] = [];
  const walk = (list: 0 | 1): boolean => {
    while (pos + 20 <= r.length) {
      // +0xe is the flags byte and +0xf the zone: one little-endian u16.
      const both = r.u16(pos + 0xe);
      if ((both & 0xff) === 0) { pos += 20; return true; }
      const record = r.u32(pos + 0x10);
      if (record < 20 || record + 4 > r.length) return false;
      entries.push({ record, flags: both & 0xff, zone: both >> 8, list });
      pos += 20;
    }
    return false;
  };
  if (!walk(0)) return null;
  if (pos + 4 > r.length) return null;
  pos += 4 + (r.u32(pos) + 1) * 4;
  if (!walk(1)) return null;
  return { start, meshPool: pos, entries };
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
