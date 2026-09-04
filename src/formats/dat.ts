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

export interface Marker { position: Vec3; flag: number }
export interface Path { id: number; points: Vec3[] }
export interface Zone { corners: [Vec3, Vec3, Vec3, Vec3]; a: number; b: number }

export interface DatObject {
  /** Byte offset of this record (its position field) and the size the tiler chose. */
  offset: number;
  size: number;
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

export interface DatLevel {
  markers: Marker[];
  paths: Path[];
  zones: Zone[];
  objects: DatObject[];
  meshes: Map<number, DatMesh>;
}

const ZONE_SIZE = 64;
const ZONE_MAGIC = 0x0005;
const ZONE_TAG = 0x0041;
const MESH_TERMINATOR = 0xffffffff;

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

  // --- markers: evenly spread over walkable floor, almost certainly pickups
  const markers: Marker[] = [];
  let pos = 8;
  for (let i = 0; i < markerCount && pos + 16 <= r.length; i++) {
    markers.push({ position: r.vec3(pos), flag: r.i32(pos + 12) });
    pos += 16;
  }

  // --- paths: polylines, read until the zone signature appears
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

  // --- zones: planar quads sitting in doorways; triggers or portals
  const zones: Zone[] = [];
  while (pos + ZONE_SIZE <= r.length && r.u16(pos) === ZONE_MAGIC && r.u16(pos + 2) === ZONE_TAG) {
    zones.push({
      corners: [r.vec3(pos + 4), r.vec3(pos + 16), r.vec3(pos + 28), r.vec3(pos + 40)],
      a: r.i32(pos + 52), b: r.i32(pos + 56),
    });
    pos += ZONE_SIZE;
  }

  // --- section 4 (20-byte refs) is skipped; its meaning is unknown and it
  //     isn't needed to render. We search forward from here for the rest.
  const meshStart = findMeshStart(r, pos);
  if (meshStart === null) throw new Error('level.dat: could not locate the mesh pool');

  const table = findObjectTable(r, pos, meshStart);
  if (!table) throw new Error('level.dat: could not tile the object table');

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
    offset: offset + 4, size,
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

  // --- mesh pool: meshes are stored back to back, but resolve them from the
  //     object pointers rather than only by walking forwards. The pool ends in
  //     a 2D sprite pool we can't parse yet, so a contiguous walk stops early
  //     and would silently drop every object pointing past that point.
  const meshes = new Map<number, DatMesh>();
  for (let o = meshStart; o < r.length - 8;) {
    const mesh = readMesh(r, o);
    if (!mesh) break;
    meshes.set(o, mesh);
    o = mesh.end;
  }
  for (const object of objects) {
    if (object.meshOffset === 0 || meshes.has(object.meshOffset)) continue;
    const mesh = readMesh(r, object.meshOffset);
    if (mesh) meshes.set(object.meshOffset, mesh);
  }

  return { markers, paths, zones, objects, meshes };
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
  /** Constant vertex alpha: 1 for opaque faces, 0.5 for the PSX half-blend. */
  alpha: number;
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

export function buildLevelGeometry(level: DatLevel): LevelGeometry {
  // Bucket triangles by everything that has to be one draw call: texture page,
  // blend mode and cull mode. A page alone is not enough — a wall and the
  // glass in front of it can share a texture and still need different states.
  // `null` collects untextured faces.
  interface Bucket { pos: number[]; col: number[]; uv: number[]; group: Omit<GeometryGroup, 'start' | 'count'> }
  const buckets = new Map<string, Bucket>();
  const bucketFor = (group: Omit<GeometryGroup, 'start' | 'count'>) => {
    const key = `${group.page}|${group.blend}|${group.doubleSided}`;
    let bucket = buckets.get(key);
    if (!bucket) { bucket = { pos: [], col: [], uv: [], group }; buckets.set(key, bucket); }
    return bucket;
  };

  let objectCount = 0;

  for (const object of level.objects) {
    const mesh = level.meshes.get(object.meshOffset);
    if (!mesh) continue;
    objectCount++;

    const m = rotationMatrix(object.rotation);
    const sc = {
      x: object.scale.x / ANGLE_UNITS,
      y: object.scale.y / ANGLE_UNITS,
      z: object.scale.z / ANGLE_UNITS,
    };

    for (const face of mesh.faces) {
      const bucket = bucketFor({
        page: face.textured ? texturePage(face.mode) : null,
        blend: blendMode(face.mode),
        doubleSided: isDoubleSided(face.mode),
        alpha: faceAlpha(face.mode),
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
            (m[0]! * x + m[1]! * y + m[2]! * z + object.position.x) / WORLD_SCALE,
            -(m[3]! * x + m[4]! * y + m[5]! * z + object.position.y) / WORLD_SCALE,
            -(m[6]! * x + m[7]! * y + m[8]! * z + object.position.z) / WORLD_SCALE,
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
