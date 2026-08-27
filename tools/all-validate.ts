/**
 * Validate the TypeScript `.all` parser against a game install.
 *
 * Checks the two container invariants and confirms every graphics-mesh group
 * consumes exactly its declared byte size, then reports aggregate counts so
 * they can be compared against an independent implementation.
 *
 *   npx tsx tools/all-validate.ts "Toy Story 2"
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseAll, parseGfxMesh, parseGfxJoint, buildMeshData, GroupType } from '../src/formats/all.ts';

const root = process.argv[2];
if (!root) { console.error('usage: npx tsx tools/all-validate.ts <game dir>'); process.exit(1); }

const files: string[] = [];
const data = join(root, 'data');
for (const dir of readdirSync(data)) {
  const full = join(data, dir);
  if (!existsSync(full)) continue;
  let entries: string[];
  try { entries = readdirSync(full); } catch { continue; }
  for (const name of entries) {
    if (/\.all$/i.test(name)) files.push(join(full, name));
  }
}
files.sort();

let totals = { files: 0, errors: 0, meshGroups: 0, joints: 0, faces: 0, tris: 0, quads: 0, verts: 0 };
const detail: string[] = [];

for (const path of files) {
  totals.files++;
  try {
    const file = parseAll(readFileSync(path));
    let meshGroups = 0, joints = 0, faces = 0, tris = 0, quads = 0, verts = 0;

    for (const group of file.groups) {
      if (group.type === GroupType.GfxMesh) {
        meshGroups++;
        for (const face of parseGfxMesh(group)) {
          faces++;
          verts += face.vertices.length;
          if (face.vertices.length === 4) quads++; else tris++;
        }
      } else if (group.type === GroupType.GfxJoint) {
        joints++;
        parseGfxJoint(group); // throws if the magic is wrong
      }
    }

    const mesh = buildMeshData(file);
    totals.meshGroups += meshGroups; totals.joints += joints; totals.faces += faces;
    totals.tris += tris; totals.quads += quads; totals.verts += verts;

    if (/woody|hamm|buzz\.all/i.test(path)) {
      detail.push(
        `  ${path.split('/').pop()!.padEnd(12)} grp=${String(file.groups.length).padStart(3)} ` +
        `mesh=${String(meshGroups).padStart(2)} joint=${String(joints).padStart(2)} ` +
        `face=${String(faces).padStart(4)}(${tris}t/${quads}q) v=${verts} ` +
        `tris_out=${mesh.triangleCount}`,
      );
    }
  } catch (err) {
    totals.errors++;
    console.log(`  FAIL ${path}: ${(err as Error).message}`);
  }
}

console.log('sample files:');
for (const line of detail) console.log(line);
console.log(`\nfiles ${totals.files}, errors ${totals.errors}`);
console.log(`mesh groups ${totals.meshGroups}, joints ${totals.joints}`);
console.log(`faces ${totals.faces} (${totals.tris} tri / ${totals.quads} quad), vertices ${totals.verts}`);
