/**
 * Validate the TypeScript `level.dat` parser against a game install.
 *
 *   npx tsx tools/dat-validate.ts "Toy Story 2"
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseDat, buildLevelGeometry } from '../src/formats/dat.ts';

const root = process.argv[2];
if (!root) { console.error('usage: npx tsx tools/dat-validate.ts <game dir>'); process.exit(1); }

const data = join(root, 'data');
const files: string[] = [];
for (const dir of readdirSync(data).filter((d) => /^level\d+$/.test(d))) {
  for (const name of readdirSync(join(data, dir))) {
    if (/\.dat$/i.test(name)) files.push(join(data, dir, name));
  }
}
files.sort();

let okCount = 0, failCount = 0, totalTris = 0;
for (const path of files) {
  const label = path.split('/').slice(-2).join('/');
  try {
    const level = parseDat(readFileSync(path));
    const geo = buildLevelGeometry(level);
    totalTris += geo.triangleCount;
    okCount++;
    console.log(
      `${label.padEnd(20)} markers=${String(level.markers.length).padStart(3)} ` +
      `paths=${String(level.paths.length).padStart(3)} zones=${String(level.zones.length).padStart(3)} ` +
      `objects=${String(level.objects.length).padStart(4)} meshes=${String(level.meshes.size).padStart(4)} ` +
      `drawn=${String(geo.objectCount).padStart(4)} tris=${geo.triangleCount}`,
    );
  } catch (err) {
    failCount++;
    console.log(`${label.padEnd(20)} FAILED: ${(err as Error).message}`);
  }
}
console.log(`\nparsed ${okCount}/${okCount + failCount}, ${totalTris} triangles total`);
