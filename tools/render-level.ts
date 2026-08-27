/**
 * Headless renderer for the browser pipeline's own output.
 *
 * This exists to give the renderer an oracle. The parsers have hard ones —
 * bytes that must tile, normals that must be unit length — but geometry that
 * is subtly wrong still draws something plausible, so "it rendered" proves
 * nothing. This consumes exactly what `buildLevelGeometry` hands the browser
 * and rasterises it to a PNG, so the output can be looked at.
 *
 *   npx tsx tools/render-level.ts "Toy Story 2" level01/level out.png [--top]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { parseNgn, type NgnTexture } from '../src/formats/ngn.ts';
import { parseDat, buildLevelGeometry } from '../src/formats/dat.ts';
import { parseAll, buildMeshData } from '../src/formats/all.ts';

const W = 900, H = 700;

/** Decode a 24bpp Windows BMP into RGB rows ordered top-down. */
function decodeBmp(bmp: Uint8Array): { w: number; h: number; px: Uint8Array } | null {
  const dv = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);
  if (dv.getUint16(0, true) !== 0x4d42) return null;
  const dataOffset = dv.getUint32(10, true);
  const w = dv.getInt32(18, true);
  const rawH = dv.getInt32(22, true);
  const bpp = dv.getUint16(28, true);
  if (bpp !== 24) return null;
  const h = Math.abs(rawH);
  const bottomUp = rawH > 0;
  const stride = (w * 3 + 3) & ~3;
  const px = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const srcY = bottomUp ? h - 1 - y : y;
    let src = dataOffset + srcY * stride;
    let dst = y * w * 3;
    for (let x = 0; x < w; x++) {
      px[dst] = bmp[src + 2]!; px[dst + 1] = bmp[src + 1]!; px[dst + 2] = bmp[src]!;
      src += 3; dst += 3;
    }
  }
  return { w, h, px };
}

function writePng(path: string, w: number, h: number, rgb: Uint8Array): void {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3)
      .copy(raw, y * (w * 3 + 1) + 1);
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crcTable: number[] = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
    let crc = 0xffffffff;
    for (const b of body) crc = crcTable[(crc ^ b) & 0xff]! ^ (crc >>> 8);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, body, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]));
}

const [, , root, sceneId, outPath = 'level.png', view = '', texScene = 'level01/level'] = process.argv;
if (!root || !sceneId) {
  console.error('usage: npx tsx tools/render-level.ts <game dir> <levelNN/base|charsN/name> <out.png> [--top] [texScene]');
  process.exit(1);
}

// A character model, or a level scene. Characters take their textures from a
// level's .ngn, since chars* ships none of its own.
const isModel = /^chars/.test(sceneId);
const base = isModel ? `${root}/data/${texScene}` : `${root}/data/${sceneId}`;
const geo = isModel
  ? buildMeshData(parseAll(readFileSync(`${root}/data/${sceneId}.all`)))
  : buildLevelGeometry(parseDat(readFileSync(`${base}.dat`)));

// Decode the same textures the browser binds, keyed by slot.
const textures = new Map<number, { w: number; h: number; px: Uint8Array }>();
let ngnTextures: NgnTexture[] = [];
try { ngnTextures = parseNgn(readFileSync(`${base}.ngn`)); } catch { /* untextured scene */ }
for (const t of ngnTextures) {
  if (t.slot === null) continue;
  const img = decodeBmp(t.bmp);
  if (img) textures.set(t.slot, img);
}

// Frame the whole scene.
const p = geo.positions;
const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < p.length; i += 3)
  for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a]!, p[i + a]!); hi[a] = Math.max(hi[a]!, p[i + a]!); }
const centre = [0, 1, 2].map((a) => (lo[a]! + hi[a]!) / 2);
const radius = Math.max(...[0, 1, 2].map((a) => hi[a]! - lo[a]!)) / 2 || 1;

// `--viewer` reproduces the camera Viewer.frameObject() picks on load, so the
// headless output can be compared against what the browser actually shows.
const viewerCam = view === '--viewer';
let sphereC = centre, sphereR = radius;
if (viewerCam) {
  // three.js computeBoundingSphere: centre of the bounding box, radius = max
  // distance from it to any vertex.
  let r2 = 0;
  for (let i = 0; i < p.length; i += 3) {
    const dx = p[i]! - centre[0]!, dy = p[i + 1]! - centre[1]!, dz2 = p[i + 2]! - centre[2]!;
    r2 = Math.max(r2, dx * dx + dy * dy + dz2 * dz2);
  }
  sphereR = Math.sqrt(r2);
  sphereC = centre;
}

const topDown = view === '--top';
const inside = view === '--inside';
// `--inside` stands the camera in the middle of the level at roughly Buzz's
// eye height, which is the view the game actually plays from and the one
// exterior shots never reveal.
// ZOOM pulls the viewer camera in toward the target, so an interior view can
// be reproduced without hand-picking coordinates.
const zoom = Number(process.env.ZOOM ?? 1);
const viewerD = Math.max(sphereR * 2.2, 1) / zoom;
const eye = viewerCam
  ? [sphereC[0]! + viewerD * 0.6, sphereC[1]! + viewerD * 0.5, sphereC[2]! + viewerD * 0.8]
  : topDown
    ? [centre[0]!, centre[1]! + radius * 2.4, centre[2]! + 0.001]
    : inside
      ? [centre[0]!, lo[1]! + radius * 0.12, centre[2]!]
      : [centre[0]! + radius * 1.5, centre[1]! + radius * 1.1, centre[2]! + radius * 1.5];
const target = inside ? [centre[0]! + radius, lo[1]! + radius * 0.12, centre[2]! + radius] : centre;

// Basis looking from eye at centre.
const fwd = [0, 1, 2].map((a) => target[a]! - eye[a]!);
const fl = Math.hypot(...fwd); fwd.forEach((_, i) => (fwd[i]! /= fl));
const upHint = topDown ? [0, 0, -1] : [0, 1, 0];
const right = [
  fwd[1]! * upHint[2]! - fwd[2]! * upHint[1]!,
  fwd[2]! * upHint[0]! - fwd[0]! * upHint[2]!,
  fwd[0]! * upHint[1]! - fwd[1]! * upHint[0]!,
];
const rl = Math.hypot(...right); right.forEach((_, i) => (right[i]! /= rl));
const up = [
  right[1]! * fwd[2]! - right[2]! * fwd[1]!,
  right[2]! * fwd[0]! - right[0]! * fwd[2]!,
  right[0]! * fwd[1]! - right[1]! * fwd[0]!,
];

const focal = W / 2 / Math.tan((60 * Math.PI) / 180 / 2);

// Optional: emulate a real GPU depth buffer. WebGL stores a hyperbolic,
// quantised depth value, so precision collapses as the near/far ratio grows.
// A float z-buffer hides that entirely, which is exactly why this renderer can
// look correct while the browser shatters.
const cullMode = process.env.CULL ?? '';
const emulateDepth = process.env.ZNEAR !== undefined;
const zNear = Number(process.env.ZNEAR ?? 0.1);
const zFar = Number(process.env.ZFAR ?? 10000);
const DEPTH_BITS = 16777216; // 24-bit
const encodeDepth = (z: number): number => {
  if (!emulateDepth) return z;
  // Standard perspective depth, mapped to [0,1] then quantised.
  const ndc = (zFar + zNear) / (zFar - zNear) + (2 * zFar * zNear) / ((zFar - zNear) * -z);
  // Map to [0,1] so it INCREASES with distance, matching the depth test below.
  return Math.round(((ndc + 1) / 2) * DEPTH_BITS);
};
const colour = new Uint8Array(W * H * 3).fill(20);
const depth = new Float32Array(W * H).fill(Infinity);

function project(i: number) {
  const v = [p[i * 3]! - eye[0]!, p[i * 3 + 1]! - eye[1]!, p[i * 3 + 2]! - eye[2]!];
  const z = v[0]! * fwd[0]! + v[1]! * fwd[1]! + v[2]! * fwd[2]!;
  const x = v[0]! * right[0]! + v[1]! * right[1]! + v[2]! * right[2]!;
  const y = v[0]! * up[0]! + v[1]! * up[1]! + v[2]! * up[2]!;
  return { x: W / 2 + (x / z) * focal, y: H / 2 - (y / z) * focal, z };
}

let drawn = 0;
for (const group of geo.groups) {
  const tex = group.page === null ? undefined : textures.get(group.page);
  for (let t = group.start; t + 2 < group.start + group.count; t += 3) {
    const a = project(t), b = project(t + 1), c = project(t + 2);
    // Reject triangles crossing the near plane rather than projecting them.
    // A vertex barely in front of the camera projects to an enormous screen
    // coordinate, drawing a long thin spike — an artefact of this rasteriser,
    // not of the data. Real clipping would split the triangle; rejecting it is
    // enough to stop this tool inventing slivers the browser never draws.
    const near = Number(process.env.NEAR ?? 0.01);
    if (a.z <= near || b.z <= near || c.z <= near) continue;
    const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
    const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
    const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
    if (Math.abs(area) < 1e-9) continue;
    // Backface culling by winding sign. CULL=front keeps counter-clockwise
    // triangles, CULL=back keeps clockwise; unset draws everything, which is
    // what `side: DoubleSide` does in the viewer today.
    if (cullMode === 'front' && area > 0) continue;
    if (cullMode === 'back' && area < 0) continue;
    drawn++;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w0 = ((b.x - a.x) * (y + 0.5 - a.y) - (y === -1 ? 0 : 0) - (x + 0.5 - a.x) * (b.y - a.y)) / area;
        const w1 = ((x + 0.5 - a.x) * (c.y - a.y) - (y + 0.5 - a.y) * (c.x - a.x)) / area;
        const u2 = w1, v2 = w0, u0 = 1 - u2 - v2;
        if (u0 < 0 || u2 < 0 || v2 < 0) continue;
        const z = 1 / (u0 / a.z + u2 / b.z + v2 / c.z);
        const idx = y * W + x;
        const dz = encodeDepth(z);
        if (dz >= depth[idx]!) continue;
        depth[idx] = dz;
        const pick = (arr: Float32Array, off: number) =>
          (u0 * arr[t * 3 + off]! / a.z + u2 * arr[(t + 1) * 3 + off]! / b.z + v2 * arr[(t + 2) * 3 + off]! / c.z) * z;
        let r: number, g: number, bl: number;
        if (tex) {
          const pickUv = (off: number) =>
            (u0 * geo.uvs[t * 2 + off]! / a.z + u2 * geo.uvs[(t + 1) * 2 + off]! / b.z + v2 * geo.uvs[(t + 2) * 2 + off]! / c.z) * z;
          const tx = Math.max(0, Math.min(tex.w - 1, Math.floor(pickUv(0) * tex.w)));
          const ty = Math.max(0, Math.min(tex.h - 1, Math.floor(pickUv(1) * tex.h)));
          const o = (ty * tex.w + tx) * 3;
          // Pure green is the transparency key. Test the RAW texel, before
          // vertex-colour modulation — the browser keys on the stored texel
          // (alpha punched out at decode), so testing the modulated colour
          // would keep keyed texels whenever the vertex colour isn't exactly
          // neutral.
          if (tex.px[o] === 0 && tex.px[o + 1] === 255 && tex.px[o + 2] === 0) continue;
          // three.js multiplies map by vertex colour; match that so this
          // renderer is a faithful oracle rather than merely a similar one.
          // Vertex colours already carry the 0x80-neutral scaling.
          r = tex.px[o]! * pick(geo.colors, 0);
          g = tex.px[o + 1]! * pick(geo.colors, 1);
          bl = tex.px[o + 2]! * pick(geo.colors, 2);
        } else {
          r = pick(geo.colors, 0) * 255; g = pick(geo.colors, 1) * 255; bl = pick(geo.colors, 2) * 255;
        }
        colour[idx * 3] = Math.max(0, Math.min(255, r));
        colour[idx * 3 + 1] = Math.max(0, Math.min(255, g));
        colour[idx * 3 + 2] = Math.max(0, Math.min(255, bl));
      }
    }
  }
}
writePng(outPath, W, H, colour);
console.log(`${sceneId}: cull=${cullMode || 'none'}, ${geo.triangleCount} tris, ${geo.groups.length} groups ` +
  `(pages ${geo.groups.map((g) => g.page ?? 'none').join(',')}), ` +
  `${textures.size} textures, ${drawn} rasterised -> ${outPath}`);
