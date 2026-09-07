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
import { parseDat, buildLevelGeometry, type GeometryGroup } from '../src/formats/dat.ts';
import { parseAll, buildMeshData } from '../src/formats/all.ts';

let W = 900, H = 700;

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

const argv = process.argv.slice(2);
const flag = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const positional = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] ?? '').startsWith('--'));
const [root, sceneId, outPath = 'level.png', texScene = 'level01/level'] = positional;
const view = argv.find((a) => a === '--top' || a === '--inside' || a === '--viewer') ?? '';
if (!root || !sceneId) {
  console.error('usage: npx tsx tools/render-level.ts <game dir> <levelNN/base|charsN/name> <out.png>\n' +
    '         [--top|--inside|--viewer] [texScene] [--eye x,y,z --target x,y,z] [--size WxH] [--fovy deg]');
  process.exit(1);
}
// An explicit camera, so a shot can be reproduced exactly in the browser and
// diffed against it. Geometry alone is not proof: the parsers have hard
// oracles, but a material or a blend mode can only be checked by looking.
const eyeArg = flag('--eye')?.split(',').map(Number);
const targetArg = flag('--target')?.split(',').map(Number);
const sizeArg = flag('--size')?.split('x').map(Number);
if (sizeArg && sizeArg.length === 2) { W = sizeArg[0]!; H = sizeArg[1]!; }
const fovY = Number(flag('--fovy') ?? 60);

// A character model, or a level scene. Characters take their textures from a
// level's .ngn, since chars* ships none of its own.
const isModel = /^chars/.test(sceneId);
const base = isModel ? `${root}/data/${texScene}` : `${root}/data/${sceneId}`;
const geo = isModel
  ? buildMeshData(parseAll(readFileSync(`${root}/data/${sceneId}.all`)))
  : buildLevelGeometry(parseDat(readFileSync(`${base}.dat`)));

// Character meshes carry no decoded material bits yet, so they fall back to
// opaque and double-sided — the same treatment the viewer gives them, and the
// reason this tool can render both kinds through one path.
const groups: GeometryGroup[] = geo.groups.map((g) => {
  const level = g as Partial<GeometryGroup>;
  return {
    start: g.start,
    count: g.count,
    page: g.page,
    list: level.list ?? 0,
    blend: level.blend ?? 'opaque',
    doubleSided: level.doubleSided ?? true,
    alpha: level.alpha ?? 1,
    zone: level.zone ?? null,
    reflect: level.reflect ?? false,
    object: level.object ?? null,
    origin: level.origin ?? null,
    rotation: level.rotation ?? null,
  };
});

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
const eye = eyeArg && eyeArg.length === 3 ? eyeArg
  : viewerCam
    ? [sphereC[0]! + viewerD * 0.6, sphereC[1]! + viewerD * 0.5, sphereC[2]! + viewerD * 0.8]
    : topDown
      ? [centre[0]!, centre[1]! + radius * 2.4, centre[2]! + 0.001]
      : inside
        ? [centre[0]!, lo[1]! + radius * 0.12, centre[2]!]
        : [centre[0]! + radius * 1.5, centre[1]! + radius * 1.1, centre[2]! + radius * 1.5];
const target = targetArg && targetArg.length === 3 ? targetArg
  : inside ? [centre[0]! + radius, lo[1]! + radius * 0.12, centre[2]!] : centre;

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

// three.js takes a VERTICAL field of view, so the focal length comes from the
// height. Deriving it from the width instead silently widens the shot and
// makes every comparison against the browser meaningless.
const focal = H / 2 / Math.tan((fovY * Math.PI) / 180 / 2);

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
// The viewer's own clear colour, so a diff against a browser screenshot shows
// only real disagreement instead of a constant offset everywhere.
const CLEAR = [0x14, 0x16, 0x1a];
const colour = new Uint8Array(W * H * 3);
for (let i = 0; i < colour.length; i++) colour[i] = CLEAR[i % 3]!;
const depth = new Float32Array(W * H).fill(Infinity);

function project(i: number) {
  const v = [p[i * 3]! - eye[0]!, p[i * 3 + 1]! - eye[1]!, p[i * 3 + 2]! - eye[2]!];
  const z = v[0]! * fwd[0]! + v[1]! * fwd[1]! + v[2]! * fwd[2]!;
  const x = v[0]! * right[0]! + v[1]! * right[1]! + v[2]! * right[2]!;
  const y = v[0]! * up[0]! + v[1]! * up[1]! + v[2]! * up[2]!;
  return { x: W / 2 + (x / z) * focal, y: H / 2 - (y / z) * focal, z };
}

let drawn = 0;
// Opaque groups first with depth writes, then the blended ones back to front
// with depth writes off — the same two queues three.js keeps, so the two
// renderers can be compared pixel for pixel.
const passes: GeometryGroup[][] = [
  groups.filter((g) => g.blend === 'opaque'),
  groups.filter((g) => g.blend !== 'opaque'),
];

for (const [pass, groups] of passes.entries()) {
  const blendedPass = pass === 1;
  // Back to front within the blended pass, by triangle depth.
  const work: { group: GeometryGroup; t: number; z: number }[] = [];
  for (const group of groups) {
    for (let t = group.start; t + 2 < group.start + group.count; t += 3) {
      let z = 0;
      if (blendedPass) {
        for (let k = 0; k < 3; k++) {
          const v = [p[(t + k) * 3]! - eye[0]!, p[(t + k) * 3 + 1]! - eye[1]!, p[(t + k) * 3 + 2]! - eye[2]!];
          z += (v[0]! * fwd[0]! + v[1]! * fwd[1]! + v[2]! * fwd[2]!) / 3;
        }
      }
      work.push({ group, t, z });
    }
  }
  if (blendedPass) work.sort((a, b) => b.z - a.z);

  for (const { group, t } of work) {
    const tex = group.page === null ? undefined : textures.get(group.page);
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
    // Back-face culling. This rasteriser measures y downward while WebGL
    // measures it up, which flips the sign of the signed area, so a triangle
    // that WebGL calls front-facing lands here with a NEGATIVE area. CULL
    // overrides the per-face rule for diagnosis, matching Viewer.cycleSide.
    const side = cullMode || (group.doubleSided ? 'none' : 'front');
    if (side === 'front' && area > 0) continue;
    if (side === 'back' && area < 0) continue;
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
        // Blended faces test depth but do not write it, so one translucent
        // surface never hides another.
        if (!blendedPass) depth[idx] = dz;
        const pick = (arr: Float32Array, off: number) =>
          (u0 * arr[t * 3 + off]! / a.z + u2 * arr[(t + 1) * 3 + off]! / b.z + v2 * arr[(t + 2) * 3 + off]! / c.z) * z;
        let r: number, g: number, bl: number;
        let alpha = group.alpha;
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
        if (blendedPass) {
          const dr = colour[idx * 3]!, dg = colour[idx * 3 + 1]!, db = colour[idx * 3 + 2]!;
          if (group.blend === 'additive') {
            r = dr + r * alpha; g = dg + g * alpha; bl = db + bl * alpha;
          } else if (group.blend === 'subtractive') {
            r = dr * (1 - r / 255); g = dg * (1 - g / 255); bl = db * (1 - bl / 255);
          } else {
            r = dr * (1 - alpha) + r * alpha; g = dg * (1 - alpha) + g * alpha; bl = db * (1 - alpha) + bl * alpha;
          }
        }
        colour[idx * 3] = Math.max(0, Math.min(255, r));
        colour[idx * 3 + 1] = Math.max(0, Math.min(255, g));
        colour[idx * 3 + 2] = Math.max(0, Math.min(255, bl));
      }
    }
  }
}
writePng(outPath, W, H, colour);
console.log(`${sceneId}: cull=${cullMode || 'per face'}, ${geo.triangleCount} tris, ${groups.length} groups ` +
  `(pages ${groups.map((g) => g.page ?? 'none').join(',')}), ` +
  `${textures.size} textures, ${drawn} rasterised -> ${outPath}`);
