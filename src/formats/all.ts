/**
 * Parser for the `.all` / `.ALL` container.
 *
 * Despite the character files being where you find Buzz and Woody, this is
 * **not a model format**. It is Traveller's Tales' generic container of typed
 * data groups, shared across their PlayStation catalogue. What a file holds
 * depends on the file: character files carry graphics meshes and joints and no
 * collision at all, while `TERRAIN.ALL` carries collision and no meshes. Level
 * *visual* geometry lives in neither — see docs/FORMATS.md.
 *
 * Layout:
 *
 *     +0x00  u32   metadata offset, in 16-BIT WORDS (byte offset = value * 2)
 *     +0x04  ...   group payloads, packed back to back
 *     @meta  u32   group count N, then N x 0x4C-byte entries, ending at EOF
 *
 * The word-vs-byte distinction is the trap in this format: reading that first
 * u32 as a byte offset lands you in the middle of the payload region, where the
 * data looks structured enough to draw wrong conclusions from.
 *
 * Verified against all 78 `.all`/`.ALL` files in a retail PC install: both
 * `meta + 4 + N*0x4C == fileSize` and `4 + sum(sizeWords*2) == meta` hold
 * exactly, and every one of the 694 mesh groups consumes precisely its
 * declared size.
 */

export const GROUP_ENTRY_SIZE = 0x4c;

export enum GroupType {
  GfxMesh = 0x0001,
  Collision = 0x0006,
  DynamicCollision = 0x0008,
  TargetPosition = 0x0009,
  InfiniteWall = 0x0101,
  CollisionFooter = 0x0104,
  GfxJoint = 0x011f,
}

export interface AllGroup {
  index: number;
  type: GroupType;
  /** Model-space offset applied to every vertex in this group. */
  position: { x: number; y: number; z: number };
  payload: Uint8Array;
}

export interface AllFile {
  groups: AllGroup[];
}

export function parseAll(buffer: ArrayBuffer | Uint8Array): AllFile {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const metaOffset = view.getUint32(0, true) * 2;
  if (metaOffset + 4 > bytes.length) {
    throw new Error(`.all: metadata offset ${metaOffset} outside file (${bytes.length})`);
  }

  const count = view.getUint32(metaOffset, true);
  const expectedEnd = metaOffset + 4 + count * GROUP_ENTRY_SIZE;
  if (expectedEnd !== bytes.length) {
    throw new Error(`.all: group table ends at ${expectedEnd}, file is ${bytes.length}`);
  }

  // Each entry states its own payload offset at +0x48, in 16-bit words from
  // byte 4. **The group table is not in payload order** — 433 of 1229 sized
  // character entries disagree with a sequential walk — so assigning payloads
  // sequentially pairs the right mesh with the wrong group position. Every
  // size check still passes when that happens, because the totals are
  // unaffected; the model simply comes apart.
  //
  // That field does not carry this meaning in TERRAIN.ALL, where runs of
  // groups share one value, so it is used only when it demonstrably tiles the
  // data region exactly. Otherwise fall back to packing in order.
  const sizes: number[] = [];
  const stated: number[] = [];
  for (let i = 0; i < count; i++) {
    const entry = metaOffset + 4 + i * GROUP_ENTRY_SIZE;
    sizes.push(view.getUint32(entry, true));
    stated.push(4 + view.getUint32(entry + 0x48, true) * 2);
  }

  const useStated = (() => {
    const spans: [number, number][] = [];
    for (let i = 0; i < count; i++) {
      if (sizes[i] === 0) continue;
      const start = stated[i]!;
      const end = start + sizes[i]! * 2;
      if (start < 4 || end > metaOffset) return false;
      spans.push([start, end]);
    }
    if (spans.length === 0) return false;
    // The spans must tile [4, metaOffset) exactly: no gaps, no overlaps.
    spans.sort((a, b) => a[0] - b[0]);
    let cursor = 4;
    for (const [start, end] of spans) {
      if (start !== cursor) return false;
      cursor = end;
    }
    return cursor === metaOffset;
  })();

  const groups: AllGroup[] = [];
  let payloadPos = 4;
  let previous: Uint8Array = new Uint8Array(0);

  for (let i = 0; i < count; i++) {
    const entry = metaOffset + 4 + i * GROUP_ENTRY_SIZE;
    const sizeWords = sizes[i]!;

    let payload: Uint8Array;
    if (sizeWords === 0) {
      // A size of 0 means the group reuses the previous group's payload.
      payload = previous;
    } else {
      const size = sizeWords * 2;
      const start = useStated ? stated[i]! : payloadPos;
      payload = bytes.subarray(start, start + size);
      payloadPos = start + size;
      previous = payload;
    }

    groups.push({
      index: i,
      type: view.getUint32(entry + 0x10, true) as GroupType,
      position: {
        x: view.getInt32(entry + 0x04, true),
        y: view.getInt32(entry + 0x08, true),
        z: view.getInt32(entry + 0x0c, true),
      },
      payload,
    });
  }

  return { groups };
}

// --- Graphics meshes (type 0x0001) ------------------------------------------

export interface MeshVertex {
  x: number; y: number; z: number;
  u: number; v: number;
  r: number; g: number; b: number;
}

export interface MeshFace {
  vertices: MeshVertex[];
  /** PSX GPU polygon command byte. Only 0x34/0x36/0x3C/0x3E occur here. */
  code: number;
  /** Semi-transparency (ABE) bit of the command byte. */
  translucent: boolean;
  /** Trailing byte that appears to select texture page + material bits. */
  material: number;
}

/** Faces run flat while the 4th byte of the header looks like a polygon opcode. */
function isFaceHeader(payload: Uint8Array, pos: number): boolean {
  return pos + 4 <= payload.length && (payload[pos + 3]! & 0xf0) === 0x30;
}

/**
 * Read the meshes out of a `GfxMesh` group.
 *
 * A group holds one or more meshes, each a run of faces closed by a `u32`
 * terminator. Prior art documents terminator `2` as "another mesh follows",
 * but no `2` occurs anywhere in this build — multi-mesh groups are separated
 * by `0` like everything else, so we continue while payload bytes remain
 * rather than stopping at the first terminator.
 *
 * Some groups carry a trailing block of 4.12 fixed-point unit vectors after
 * the last mesh (see docs/FORMATS.md). Its length can't be derived from the
 * byte stream, which is precisely why this format can't be parsed without the
 * group table. We stop at the first non-face bytes and ignore the remainder.
 */
export function parseGfxMesh(group: AllGroup): MeshFace[] {
  const payload = group.payload;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const faces: MeshFace[] = [];
  let pos = 0;

  while (pos + 4 <= payload.length) {
    if (!isFaceHeader(payload, pos)) {
      // Either a terminator between meshes, or the start of a trailing block.
      const terminator = view.getUint32(pos, true);
      pos += 4;
      if (terminator === 0 || terminator === 2) continue;
      break;
    }

    const r0 = payload[pos]!, g0 = payload[pos + 1]!, b0 = payload[pos + 2]!;
    const code = payload[pos + 3]!;
    pos += 4;

    // Bit 0x08 selects a quad. Note this build stores 3 vertices for a
    // triangle — the PSX-derived spec says 4 with one unused, which is true of
    // other titles on this engine but desynchronises immediately here.
    const n = code & 0x08 ? 4 : 3;
    if (pos + n * 8 + (n - 1) * 4 > payload.length) break;

    const vertices: MeshVertex[] = [];
    for (let i = 0; i < n; i++) {
      vertices.push({
        x: view.getInt16(pos, true),
        y: view.getInt16(pos + 2, true),
        z: view.getInt16(pos + 4, true),
        u: payload[pos + 6]!,
        v: payload[pos + 7]!,
        r: r0, g: g0, b: b0, // overwritten below for vertices 1..n-1
      });
      pos += 8;
    }

    // Colours for vertices 1..n-1, each followed by a flag byte. The last flag
    // in the run carries the material/texture-page bits.
    let material = 0;
    for (let i = 1; i < n; i++) {
      vertices[i]!.r = payload[pos]!;
      vertices[i]!.g = payload[pos + 1]!;
      vertices[i]!.b = payload[pos + 2]!;
      material = payload[pos + 3]!;
      pos += 4;
    }

    faces.push({ vertices, code, translucent: (code & 0x02) !== 0, material });
  }

  return faces;
}

// --- Joints (type 0x011F) ---------------------------------------------------

const JOINT_MAGIC = 0x12345678;

export interface JointRing {
  /** `side` selects which of the two bridged parts a point belongs to. */
  points: { x: number; y: number; z: number; side: number }[];
  closed: boolean;
}

/**
 * Read a `GfxJoint` group.
 *
 * These appear to be the seam-bridging rings TT used between rigid parts:
 * a ring of points alternating between two parts, skinned at runtime to hide
 * the gap as the joint rotates. Most are closed loops.
 */
export function parseGfxJoint(group: AllGroup): JointRing {
  const payload = group.payload;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  if (payload.length < 8 || view.getUint32(0, true) !== JOINT_MAGIC) {
    throw new Error('.all: joint group missing 0x12345678 magic');
  }

  const segments = view.getUint16(4, true);
  const points: JointRing['points'] = [];
  for (let i = 0; i <= segments; i++) {
    const p = 8 + i * 8;
    if (p + 8 > payload.length) break;
    points.push({
      x: view.getInt16(p, true),
      y: view.getInt16(p + 2, true),
      z: view.getInt16(p + 4, true),
      side: view.getUint16(p + 6, true),
    });
  }

  const first = points[0];
  const last = points[points.length - 1];
  const closed =
    points.length > 1 && !!first && !!last &&
    first.x === last.x && first.y === last.y && first.z === last.z;

  return { points, closed };
}

// --- Renderable output ------------------------------------------------------

/**
 * Model units per world unit. The exporter convention that puts Woody at a
 * plausible ~2.1 units tall.
 */
export const MODEL_SCALE = 256;

/** A run of triangles sharing one texture page. */
export interface MeshGroup {
  start: number;
  count: number;
  page: number | null;
}

export interface MeshData {
  /** Triangle soup, GL coordinates, ready for a BufferAttribute. */
  positions: Float32Array;
  /** Per-vertex RGB in 0..1, matching `positions`. */
  colors: Float32Array;
  uvs: Float32Array;
  groups: MeshGroup[];
  triangleCount: number;
}

/**
 * Texture page for a character face, from the last trailing flag byte.
 *
 * Characters carry no texture files of their own — the `chars*` directories
 * hold only models and animations. Their art lives in the level `.ngn` files
 * alongside level textures, at slots 16-24. Verified: all 68 character models
 * use exactly one page each, and 67 of 68 fall in that range.
 */
export function characterTexturePage(material: number): number {
  return material & 0x1f;
}

/** Bit 0x20 of the material byte marks PSX semi-transparency. */
export function isSemiTransparent(material: number): boolean {
  return (material & 0x20) !== 0;
}

/**
 * Flatten a whole `.all` file's meshes into one triangle soup.
 *
 * Two conversions matter here. The PlayStation's axes are +X right, +Y **down**
 * and +Z into the screen, so Y and Z are negated for WebGL. And each group's
 * position must be added to its vertices — without it, several characters'
 * limbs float away from the body.
 */
export function buildMeshData(file: AllFile): MeshData {
  // Bucket by texture page so each page becomes its own draw group.
  const buckets = new Map<number | null, { pos: number[]; col: number[]; uv: number[] }>();
  const bucketFor = (page: number | null) => {
    let bucket = buckets.get(page);
    if (!bucket) { bucket = { pos: [], col: [], uv: [] }; buckets.set(page, bucket); }
    return bucket;
  };

  for (const group of file.groups) {
    if (group.type !== GroupType.GfxMesh) continue;
    const origin = group.position;

    for (const face of parseGfxMesh(group)) {
      const bucket = bucketFor(characterTexturePage(face.material));
      const push = (v: MeshVertex) => {
        bucket.pos.push(
          (v.x + origin.x) / MODEL_SCALE,
          -(v.y + origin.y) / MODEL_SCALE,
          -(v.z + origin.z) / MODEL_SCALE,
        );
        bucket.col.push(v.r / 255, v.g / 255, v.b / 255);
        bucket.uv.push(v.u / 255, v.v / 255);
      };

      const v = face.vertices;
      if (v.length === 4) {
        // PSX quads are in Z-order, not a fan: corners run v0,v1,v3,v2.
        push(v[0]!); push(v[1]!); push(v[2]!);
        push(v[1]!); push(v[3]!); push(v[2]!);
      } else {
        push(v[0]!); push(v[1]!); push(v[2]!);
      }
    }
  }

  // Concatenate through typed arrays — spreading a bucket into push() passes
  // every number as its own argument and overflows the stack on large meshes.
  let total = 0, totalUv = 0;
  for (const b of buckets.values()) { total += b.pos.length; totalUv += b.uv.length; }

  const positions = new Float32Array(total);
  const colors = new Float32Array(total);
  const uvs = new Float32Array(totalUv);
  const groups: MeshGroup[] = [];

  let posOffset = 0, uvOffset = 0;
  for (const [page, bucket] of [...buckets].sort((a, b) =>
    a[0] === null ? 1 : b[0] === null ? -1 : a[0] - b[0])) {
    if (bucket.pos.length === 0) continue;
    positions.set(bucket.pos, posOffset);
    colors.set(bucket.col, posOffset);
    uvs.set(bucket.uv, uvOffset);
    groups.push({ start: posOffset / 3, count: bucket.pos.length / 3, page });
    posOffset += bucket.pos.length;
    uvOffset += bucket.uv.length;
  }

  return { positions, colors, uvs, groups, triangleCount: total / 9 };
}
