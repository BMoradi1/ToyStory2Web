/**
 * Parser for `.anm` skeletal animation.
 *
 * Characters are **rigid parented parts**, not skinned meshes: each bone drives
 * one graphics-mesh group of the matching `.all`, 1:1 by index. `boneCount`
 * equals the number of type-0x0001 groups in that model on all 66 characters,
 * which settles the mapping.
 *
 *     u16 0, u16 slotCount, u32 0, u32 x slotCount   byte offset per slot, 0 = empty
 *
 *     per animation (16-byte header):
 *       u16 0xFFF0    magic ("new engine"; 0xFFF2 is the older one)
 *       u16 3
 *       u16 frameCount
 *       u16 boneCount
 *       u16 frameStride   in words
 *       u16 boneCount     repeated, an integrity check
 *       u16 flagBytes
 *       u16 tail
 *       i16 x boneCount   each bone's word offset into a frame; negative = none
 *       u8  x flagBytes   per-bone bitmask, little-endian
 *       frameCount * frameStride * 2 bytes of frame data
 *
 * Two corrections to the published spec, both of which break a parser written
 * to it:
 *
 *   - What that spec calls `loopFrames` is the **frame count**. The identity
 *     `payloadBytes == frameCount * frameStride * 2` holds exactly on all 170
 *     animations, with no padding anywhere.
 *   - What it calls `hideFlagBytes` is **not a hide mask** — it selects which
 *     bones carry a scale channel, making those entries 16 bytes instead of 10.
 *     A parser expecting a hide mask desynchronises on the first one. Hiding is
 *     expressed by the sign of a bone's offset instead.
 */

import {
  GroupType, MODEL_SCALE, PSX_NEUTRAL, characterTexturePage, parseGfxMesh,
  type AllFile, type MeshData, type MeshGroup, type MeshVertex,
} from './all.ts';

const MAGIC_NEW = 0xfff0;
const MAGIC_OLD = 0xfff2;
const HEADER_SIZE = 16;

/** PSX angle unit: 1024 steps per revolution, so PI/512 per step. */
const ANGLE_STEP = Math.PI / 512;
/**
 * Translations are stored pre-multiplied by 4, so recovering them divides.
 * Fitted against an oracle rather than assumed: a bone's frame-0 translation
 * must reproduce its mesh group's rest position, and this factor lands a median
 * 13 units off where multiplying instead misses by ~4145.
 */
const TRANSLATION_SCALE = 1 / 4;
/** Scale is 4.12 fixed point. */
const SCALE_ONE = 4096;

export interface BonePose {
  /** Translation. This **is** the part's pivot, not an offset from one. */
  translation: { x: number; y: number; z: number };
  /** Euler rotation in radians, composed as Rx * Ry * Rz. */
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

export interface Animation {
  slot: number;
  /** Byte offset of this animation's header within the file. */
  offset: number;
  frameCount: number;
  boneCount: number;
  /** Word offset of each bone's track within a frame; negative means no track. */
  trackOffsets: number[];
  /** Bit b set means bone b carries a scale channel. */
  scaleMask: Uint8Array;
  frameStride: number;
  /** Byte offset of the frame data within the file. */
  dataStart: number;
  oldEngine: boolean;
}

export interface AnmFile {
  /** Sparse: a slot with no animation is null. */
  animations: (Animation | null)[];
  bytes: Uint8Array;
}

export function parseAnm(buffer: ArrayBuffer | Uint8Array): AnmFile {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 8) throw new Error('.anm: too short');

  const slotCount = view.getUint16(2, true);
  const animations: (Animation | null)[] = [];

  for (let slot = 0; slot < slotCount; slot++) {
    const tableEntry = 8 + slot * 4;
    if (tableEntry + 4 > bytes.length) { animations.push(null); continue; }

    const offset = view.getUint32(tableEntry, true);
    if (offset === 0 || offset + HEADER_SIZE > bytes.length) { animations.push(null); continue; }

    const magic = view.getUint16(offset, true);
    if (magic !== MAGIC_NEW && magic !== MAGIC_OLD) { animations.push(null); continue; }

    const frameCount = view.getUint16(offset + 4, true);
    const boneCount = view.getUint16(offset + 6, true);
    const frameStride = view.getUint16(offset + 8, true);
    const check = view.getUint16(offset + 10, true);
    const flagBytes = view.getUint16(offset + 12, true);
    if (check !== boneCount) { animations.push(null); continue; }

    const trackOffsets: number[] = [];
    for (let b = 0; b < boneCount; b++) {
      trackOffsets.push(view.getInt16(offset + HEADER_SIZE + b * 2, true));
    }
    const maskStart = offset + HEADER_SIZE + boneCount * 2;
    const scaleMask = bytes.subarray(maskStart, maskStart + flagBytes);

    animations.push({
      slot, offset, frameCount, boneCount, trackOffsets, scaleMask, frameStride,
      dataStart: maskStart + flagBytes,
      oldEngine: magic === MAGIC_OLD,
    });
  }

  return { animations, bytes };
}

/** Does this bone carry a scale channel? The mask is little-endian. */
export function hasScale(animation: Animation, bone: number): boolean {
  const byte = animation.scaleMask[bone >> 3];
  return byte !== undefined && (byte & (1 << (bone & 7))) !== 0;
}

/**
 * Pose one bone on one frame, or null if the bone has no track.
 *
 * A negative track offset means no track. Two distinct values occur: -2 for
 * bones absent from every animation in the file (the seam-bridge meshes), and
 * -3 for bones whose track lives in a different animation — Buzz and the slime
 * are **layered**, pairing full-body animations with upper-body-only and
 * legs-only ones.
 */
export function poseBone(file: AnmFile, animation: Animation, frame: number, bone: number): BonePose | null {
  const trackOffset = animation.trackOffsets[bone];
  if (trackOffset === undefined || trackOffset < 0) return null;
  if (frame < 0 || frame >= animation.frameCount) return null;

  const view = new DataView(file.bytes.buffer, file.bytes.byteOffset, file.bytes.byteLength);
  const base = animation.dataStart + frame * animation.frameStride * 2 + trackOffset * 2;
  if (base + 10 > file.bytes.length) return null;

  const translation = {
    x: view.getInt16(base, true) * TRANSLATION_SCALE,
    y: view.getInt16(base + 2, true) * TRANSLATION_SCALE,
    z: view.getInt16(base + 4, true) * TRANSLATION_SCALE,
  };

  // A 30-bit rotation packed across two u16, ten bits per axis.
  const packed = view.getUint16(base + 6, true) | (view.getUint16(base + 8, true) << 16);
  const rotation = {
    x: ((packed >>> 20) & 0x3ff) * ANGLE_STEP,
    y: ((packed >>> 10) & 0x3ff) * ANGLE_STEP,
    z: (packed & 0x3ff) * ANGLE_STEP,
  };

  let scale = { x: 1, y: 1, z: 1 };
  if (hasScale(animation, bone) && base + 16 <= file.bytes.length) {
    scale = {
      x: view.getUint16(base + 10, true) / SCALE_ONE,
      y: view.getUint16(base + 12, true) / SCALE_ONE,
      z: view.getUint16(base + 14, true) / SCALE_ONE,
    };
  }

  return { translation, rotation, scale };
}

/**
 * Row-major 3x3 for a bone pose, composed Rx * Ry * Rz with scale folded in.
 *
 * Transforms are **flat and absolute** — there is no parent hierarchy, and the
 * translation is the part's own pivot. The `.all` group position at +0x04 is
 * that same pivot at rest, so an animated renderer must NOT also add the group
 * position the way the static one does. Doing both tears apart exactly the
 * characters whose group positions are non-zero.
 */
export function poseMatrix(pose: BonePose): number[] {
  const { x: rx, y: ry, z: rz } = pose.rotation;
  const [sx, cx] = [Math.sin(rx), Math.cos(rx)];
  const [sy, cy] = [Math.sin(ry), Math.cos(ry)];
  const [sz, cz] = [Math.sin(rz), Math.cos(rz)];

  // Rx * Ry * Rz
  const m = [
    cy * cz, -cy * sz, sy,
    sx * sy * cz + cx * sz, -sx * sy * sz + cx * cz, -sx * cy,
    -cx * sy * cz + sx * sz, cx * sy * sz + sx * cz, cx * cy,
  ];
  // Fold per-axis scale into the columns.
  const s = [pose.scale.x, pose.scale.y, pose.scale.z];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) m[row * 3 + col]! *= s[col]!;
  }
  return m;
}

/**
 * Build renderable geometry for a model posed on one animation frame.
 *
 * Bone `i` drives the `i`-th graphics-mesh group of the model — a rigid part,
 * not a skinned influence. The bone's translation is the part's pivot, so the
 * group's own rest position is deliberately NOT added here; the static path in
 * `buildMeshData` adds it, and doing both tears apart every character whose
 * group positions are non-zero.
 *
 * Bones with no track are skipped. Two cases produce that: seam-bridge meshes
 * absent from every animation, which the original skins at runtime from the
 * joint rings, and layered animations where the track lives in a paired
 * animation (Buzz has upper-body-only and legs-only sets).
 */
export function buildPosedMeshData(
  model: AllFile, file: AnmFile, animation: Animation, frame: number,
  /**
   * Second layer. Buzz's animations pair a legs set with an upper-body set,
   * and a bone absent from `animation` (a `-3` track) is posed from here
   * instead. The engine does the same thing by playing both slots, the lower
   * layer first — see the state table in src/sim/player-animation-data.ts.
   * Without it, playing one half of a pair drops the other half's parts
   * entirely rather than leaving them at rest.
   */
  layer?: { animation: Animation; frame: number } | null,
): MeshData {
  const buckets = new Map<number | null, { pos: number[]; col: number[]; uv: number[] }>();
  const bucketFor = (page: number | null) => {
    let bucket = buckets.get(page);
    if (!bucket) { bucket = { pos: [], col: [], uv: [] }; buckets.set(page, bucket); }
    return bucket;
  };

  let bone = -1;
  for (const group of model.groups) {
    if (group.type !== GroupType.GfxMesh) continue;
    bone++;

    const pose = poseBone(file, animation, frame, bone)
      ?? (layer ? poseBone(file, layer.animation, layer.frame, bone) : null);
    if (!pose) continue;
    const m = poseMatrix(pose);
    const t = pose.translation;

    for (const face of parseGfxMesh(group)) {
      const bucket = bucketFor(characterTexturePage(face.material));
      const push = (v: MeshVertex) => {
        const x = m[0]! * v.x + m[1]! * v.y + m[2]! * v.z + t.x;
        const y = m[3]! * v.x + m[4]! * v.y + m[5]! * v.z + t.y;
        const z = m[6]! * v.x + m[7]! * v.y + m[8]! * v.z + t.z;
        // PSX +Y is down and +Z into the screen.
        bucket.pos.push(x / MODEL_SCALE, -y / MODEL_SCALE, -z / MODEL_SCALE);
        bucket.col.push(v.r / PSX_NEUTRAL, v.g / PSX_NEUTRAL, v.b / PSX_NEUTRAL);
        bucket.uv.push(v.u / 255, v.v / 255);
      };

      const v = face.vertices;
      if (v.length === 4) {
        // Plain polygon order, matching buildMeshData — see the note there.
        push(v[0]!); push(v[1]!); push(v[2]!);
        push(v[0]!); push(v[2]!); push(v[3]!);
      } else {
        push(v[0]!); push(v[1]!); push(v[2]!);
      }
    }
  }

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

/**
 * Playback rate.
 *
 * NOT derivable from the files. Prior art states 20 fps and that figure is
 * inherited rather than verified here, so it stays tunable. A supporting hint:
 * 107 of 170 animations have frame counts that are multiples of 12.
 */
export const DEFAULT_ANIMATION_FPS = 20;
