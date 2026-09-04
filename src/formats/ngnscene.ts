/**
 * The PC scene inside `level.ngn`.
 *
 * `.ngn` is not just textures. pconv converted each PSX level into the
 * NU-engine's own scene format and appended it to the texture repack, and it
 * is this — not `level.dat` — that toy2.exe draws. The layout below was read
 * out of the executable's loader (world.c: chunk loop at FUN_004c33f0;
 * objload.c: the 0x41–0x44 readers). Every chunk is `u32 type, u32 size`, so
 * unknown ones skip cleanly.
 *
 *     top level      0x100 gobj sets   0x101 instances   0x102 point arrays
 *                    0x103 (idx,a,b)   0x104 textures    0x105 name table
 *                    0x106 creatures   0x10a ?           0 = end
 *     gobj set       u32 count, then count x gobj
 *     gobj           0x40 name  0x41 texture names  0x42 materials
 *                    0x43 vertex array  0x44 primitives  0 = end
 *
 * What matters for rendering is the material record: pconv resolved every
 * PSX face mode into a material whose render-flag word the engine maps onto
 * Direct3D states. Joining these faces back to `level.dat` by vertex position
 * is how the mode bits were decoded (tools/material-table.ts).
 */

export interface NgnMaterial {
  /** Which optional fields the record carries. */
  fieldBits: number;
  /** Render flags: 0x02 alpha blend, 0x04 extra pass, 0x08 no cull, 0x10 additive, 0x20 subtractive. */
  renderFlags: number;
  /** Material alpha byte when present (field bit 0x08), else 0. */
  alpha: number;
  /** Texture slot ids referenced, resolved through the gobj's `texNN` name table. */
  textures: (number | null)[];
}

export interface NgnVertex { x: number; y: number; z: number; r: number; g: number; b: number; a: number }

/** Primitive types as stored: 1 = triangle list, 4 = quad list; 5/6 occur, meaning unverified. */
export interface NgnPrim { type: number; material: number; indices: number[] }

export interface NgnGobj { name: string; materials: NgnMaterial[]; vertices: NgnVertex[]; prims: NgnPrim[] }

export interface NgnInstance {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  gobj: number;
  flags: number;
}

export interface NgnScene { gobjs: NgnGobj[]; instances: NgnInstance[]; chunkTypes: Map<number, number> }

export function parseNgnScene(buffer: ArrayBuffer | Uint8Array): NgnScene {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u8 = (o: number) => bytes[o]!;
  const u16 = (o: number) => dv.getUint16(o, true);
  const i16 = (o: number) => dv.getInt16(o, true);
  const u32 = (o: number) => dv.getUint32(o, true);
  const f32 = (o: number) => dv.getFloat32(o, true);
  const ascii = (o: number, n: number) => String.fromCharCode(...bytes.subarray(o, o + n));

  function readGobj(p: number, end: number): [NgnGobj, number] {
    const g: NgnGobj = { name: '', materials: [], vertices: [], prims: [] };
    const names: string[] = [];
    let texSlots: (number | null)[] = [];
    while (p + 8 <= end) {
      const type = u32(p), size = u32(p + 4);
      p += 8;
      const body = p, next = p + size;
      if (type === 0) return [g, next];
      if (type === 0x40) {
        g.name = ascii(body + 1, u8(body));
      } else if (type === 0x41) {
        // u16 nameCount, u16 textureCount, u8 ?, u8 textureRecordSize
        const nameCount = u16(body), texCount = u16(body + 2), recSize = u8(body + 5);
        let q = body + 6;
        for (let i = 0; i < nameCount; i++) { const n = u8(q); names.push(ascii(q + 1, n)); q += 1 + n; }
        texSlots = [];
        for (let i = 0; i < texCount; i++) {
          const name = names[i16(q)] ?? '';
          const slot = /^tex(\d+)$/.exec(name);
          texSlots.push(slot ? Number(slot[1]) : null);
          q += recSize;
        }
      } else if (type === 0x42) {
        // u32 count; per material: u32 fieldBits, u32 size, optional fields.
        // Bits 0/1/2: three rgb triples; 3: alpha byte; 4, 5: one byte each;
        // 6: u32 render flags; bits 7-10: texture count, i16 index each.
        const count = u32(body);
        let q = body + 4;
        for (let i = 0; i < count; i++) {
          const fieldBits = u32(q), size = u32(q + 4);
          let r = q + 8;
          const start = r;
          if (fieldBits & 1) r += 3;
          if (fieldBits & 2) r += 3;
          if (fieldBits & 4) r += 3;
          let alpha = 0;
          if (fieldBits & 8) { alpha = u8(r); r += 1; }
          if (fieldBits & 0x10) r += 1;
          if (fieldBits & 0x20) r += 1;
          let renderFlags = 0;
          if (fieldBits & 0x40) { renderFlags = u32(r); r += 4; }
          const textures: (number | null)[] = [];
          for (let t = 0, n = (fieldBits >> 7) & 0xf; t < n; t++) {
            const ti = i16(r); r += 2;
            textures.push(ti >= 0 ? (texSlots[ti] ?? null) : null);
          }
          g.materials.push({ fieldBits: fieldBits & 0x7f, renderFlags, alpha, textures });
          q = start + size;
        }
      } else if (type === 0x43) {
        // u32 flags, u32 stride, u32 count. Bit 0 position (3 f32), bit 1
        // normal (3 f32), bit 2 colour as A,R,G,B bytes, bit 3 second colour,
        // bits 4-7 UV set count. Rows are `stride` bytes apart.
        const flags = u32(body), stride = u32(body + 4), count = u32(body + 8);
        let q = body + 12;
        for (let i = 0; i < count; i++) {
          let r = q;
          const v: NgnVertex = { x: 0, y: 0, z: 0, r: 255, g: 255, b: 255, a: 255 };
          if (flags & 1) { v.x = f32(r); v.y = f32(r + 4); v.z = f32(r + 8); r += 12; }
          if (flags & 2) r += 12;
          if (flags & 4) { v.a = u8(r); v.r = u8(r + 1); v.g = u8(r + 2); v.b = u8(r + 3); r += 4; }
          g.vertices.push(v);
          q += stride;
        }
      } else if (type === 0x44) {
        // u32 count; per primitive: u32 type, u16 material, u16 indexCount, u16[] indices
        const count = u32(body);
        let q = body + 4;
        for (let i = 0; i < count; i++) {
          const ptype = u32(q), material = u16(q + 4), n = u16(q + 6);
          q += 8;
          const indices: number[] = [];
          for (let k = 0; k < n; k++) indices.push(u16(q + k * 2));
          q += n * 2;
          g.prims.push({ type: ptype, material, indices });
        }
      }
      p = next;
    }
    return [g, p];
  }

  const scene: NgnScene = { gobjs: [], instances: [], chunkTypes: new Map() };
  let p = 0;
  while (p + 8 <= bytes.length) {
    const type = u32(p), size = u32(p + 4);
    p += 8;
    scene.chunkTypes.set(type, (scene.chunkTypes.get(type) ?? 0) + 1);
    if (type === 0) break;
    if (type === 0x100) {
      const count = u32(p);
      let q = p + 4;
      for (let i = 0; i < count; i++) {
        const [g, next] = readGobj(q, p + size);
        scene.gobjs.push(g);
        q = next;
      }
    } else if (type === 0x101) {
      // u32 count, u32 recordSize; per instance: position, rotation, scale
      // (3 f32 each), u32 gobj index, then a u32 flags word if the record is
      // longer than 0x28 bytes.
      const count = u32(p), rec = u32(p + 4);
      let q = p + 8;
      for (let i = 0; i < count; i++) {
        scene.instances.push({
          position: [f32(q), f32(q + 4), f32(q + 8)],
          rotation: [f32(q + 12), f32(q + 16), f32(q + 20)],
          scale: [f32(q + 24), f32(q + 28), f32(q + 32)],
          gobj: u32(q + 36),
          flags: rec > 0x28 ? u32(q + 40) : 0,
        });
        q += rec;
      }
    }
    p += size;
  }
  return scene;
}
