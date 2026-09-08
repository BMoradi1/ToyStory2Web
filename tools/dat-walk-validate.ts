/**
 * npx tsx tools/dat-walk-validate.ts "Toy Story 2"
 *
 * The level.dat layout the ENGINE walks (`FUN_0043e6e0`, the loader called
 * from `FUN_00452fc0` once the file is in memory), checked against every
 * scene in the install and against what src/formats/dat.ts recovers by
 * heuristics. docs/FORMATS.md "level.dat, from the loader".
 *
 *   u32 n                          how many tagged records follow
 *   n x { i16 count; i16 tag; ... }
 *       tag 0x3f   count x (i32 x, y, z, kind)    the markers
 *       tag < 0x40 count x (i32 x, y, z)          a path, in slot `tag`
 *       tag 0x40   count x (i32 x, y, z)          a box (not seen in the install)
 *       tag > 0x40 count x (i32 x, y, z), then i32 from, i32 to   a portal
 *       tag < 0    count x 3 i16, 4 dwords of header      (not seen)
 *   u32 m; m x 0x80 bytes         a block table the loader skips over
 *   objects, 20 bytes each, until the byte at +0xe is 0   list 0
 *   u32 c; c + 1 dwords           an index list
 *   objects, 20 bytes each, until the byte at +0xe is 0   list 1
 *   ... the mesh pool, reached only through the +0x10 pointers
 *
 * An object: i32 x, y, z; i16 at +0xc; u8 flags at +0xe (0 ends the list);
 * u32 at +0x10, the file offset of its mesh header.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseDat } from '../src/formats/dat.ts';

const root = process.argv[2] ?? 'Toy Story 2';
let failures = 0;
for (const dir of readdirSync(join(root, 'data')).filter((d) => /^level\d\d$/.test(d)).sort()) {
  for (const stem of ['level', 'level1', 'level2', 'level3']) {
    const path = join(root, 'data', dir, `${stem}.dat`);
    if (!existsSync(path)) continue;
    const d = readFileSync(path);
    const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
    const u32 = (o: number) => v.getUint32(o, true);
    const i16 = (o: number) => v.getInt16(o, true);
    let pos = 0;
    const n = u32(pos); pos += 4;
    let markers = 0, paths = 0, portals = 0, boxes = 0, other = 0;
    let ok = n < 4096;
    for (let i = 0; i < n && ok; i++) {
      const count = i16(pos), tag = i16(pos + 2);
      if (tag === 0x3f) { markers += count; pos += 4 + count * 16; }
      else if (tag < 0 ) { other++; pos += 4 + Math.floor((count * 3 + 1) / 2) * 4 + 12; }
      else if (tag === 0x40) { boxes++; pos += 4 + count * 12; }
      else if (tag < 0x40) { paths++; pos += 4 + count * 12; }
      else { portals++; pos += 4 + count * 12; }
      if (pos > d.length) ok = false;
    }
    const blocks = ok ? u32(pos) : -1;
    if (ok) pos += 4 + blocks * 0x80;
    const list0 = pos;
    let objects0 = 0, objects1 = 0, meshBad = 0;
    const walk = (): number => {
      let k = 0;
      while (pos + 20 <= d.length && d[pos + 0xe] !== 0) {
        const mesh = u32(pos + 0x10);
        if (mesh >= d.length || mesh < list0) meshBad++;
        pos += 20; k++;
      }
      pos += 20; // the terminator
      return k;
    };
    if (ok) {
      objects0 = walk();
      const c = u32(pos); pos += 4 + (c + 1) * 4;
      objects1 = walk();
    }
    let ported = -1;
    try { ported = parseDat(d).objects.length; } catch { ported = -1; }
    const total = objects0 + objects1;
    const agree = ported === total;
    if (!ok || meshBad > 0 || (ported >= 0 && !agree)) failures++;
    console.log(
      `${(dir + '/' + stem).padEnd(16)} records ${String(n).padStart(3)}: ${String(markers).padStart(3)} markers ${String(paths).padStart(3)} paths ${String(portals).padStart(3)} portals`
      + `${boxes ? ` ${boxes} boxes` : ''}${other ? ` ${other} other` : ''}  blocks ${blocks}  objects ${objects0} + ${objects1} = ${total}`
      + `  port says ${ported < 0 ? 'FAILS' : ported}${ported >= 0 && !agree ? '  MISMATCH' : ''}${meshBad ? `  ${meshBad} bad mesh pointers` : ''}${ok ? '' : '  WALK BROKE'}`,
    );
  }
}
console.log(failures === 0 ? '\nevery scene walks, every mesh pointer lands, and the object counts match the port where it parses' : `\n${failures} scenes disagree`);
process.exit(failures === 0 ? 0 : 1);
