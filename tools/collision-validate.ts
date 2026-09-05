/** npx tsx tools/collision-validate.ts "Toy Story 2" */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseAll } from '../src/formats/all.ts';
import { parseCollision, isWalkable } from '../src/formats/collision.ts';

const root = process.argv[2];
if (!root) { console.error('usage: npx tsx tools/collision-validate.ts <game dir>'); process.exit(1); }
const data = join(root, 'data');

let groups = 0, skipped = 0, meshes = 0, polys = 0, tris = 0, walkable = 0, dynamic = 0;
for (const dir of readdirSync(data).filter((d) => /^level\d+$/.test(d)).sort()) {
  for (const name of readdirSync(join(data, dir)).filter((n) => /\.all$/i.test(n))) {
    const parsed = parseCollision(parseAll(readFileSync(join(data, dir, name))));
    skipped += parsed.skipped;
    for (const g of parsed.groups) {
      groups++; if (g.dynamic) dynamic++;
      for (const m of g.meshes) {
        meshes++;
        for (const p of m.polys) { polys++; if (p.triangle) tris++; if (isWalkable(p)) walkable++; }
      }
    }
  }
}
console.log(`groups parsed ${groups}, skipped ${skipped} (expected 300: one stale 1998 file copied 4x)`);
console.log(`  dynamic (movers): ${dynamic}, meshes: ${meshes}`);
console.log(`polys ${polys} (${tris} triangles, ${polys - tris} quads)`);
console.log(`walkable at 60deg (the original's limit): ${walkable} (${(100 * walkable / polys).toFixed(1)}%)`);
