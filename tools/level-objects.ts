/**
 * List a scene's placements by object id with the category the engine would
 * give each as a pickup, and check the level's token list resolves to tokens.
 *
 *     npx tsx tools/level-objects.ts "Toy Story 2" [level] [scene]
 *
 * e.g. `... 1 level` for level01/level.dat. Without a directory number, summarises
 * every scene. Level numbers follow the game: `level04/level1` is level 14.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { meshPolyCount, parseDat } from '../src/formats/dat.ts';
import { kindOfPolyCount, PickupKind } from '../src/sim/pickups.ts';
import { firstPickupId, levelNumber, TOKEN_LISTS } from '../src/sim/level-data.ts';

const [root, levelArg, sceneArg] = process.argv.slice(2);
if (!root) { console.error('usage: npx tsx tools/level-objects.ts <game dir> [dir number] [scene]'); process.exit(1); }

const dirs = levelArg ? [Number(levelArg)] : Array.from({ length: 10 }, (_, i) => i + 1);
const scenes = sceneArg ? [sceneArg] : ['level', 'level1', 'level2', 'level3'];
let failures = 0;

for (const dir of dirs) {
  for (const scene of scenes) {
    const path = join(root, 'data', `level${String(dir).padStart(2, '0')}`, `${scene}.dat`);
    // The game's level number for this scene: `level04/level1` is level 14.
    const level = levelNumber(`level${String(dir).padStart(2, '0')}/${scene}`) ?? 0;
    if (!existsSync(path)) continue;
    let dat;
    try { dat = parseDat(readFileSync(path)); } catch (e) { console.log(`${dir}/${scene}: ${(e as Error).message}`); continue; }

    const first = firstPickupId(level);
    const summary = new Map<string, number>();
    const rows: string[] = [];
    for (let id = first; id < dat.objectIds.length; id++) {
      const p = dat.placements[dat.objectIds[id]!];
      if (!p) continue;
      const object = dat.objects[p.objectIndex];
      const mesh = object ? dat.meshes.get(object.meshOffset) : undefined;
      const polys = mesh ? meshPolyCount(mesh) : -1;
      const kind = kindOfPolyCount(polys);
      const name = kind === PickupKind.None ? `?${polys}` : PickupKind[kind]!;
      summary.set(name, (summary.get(name) ?? 0) + 1);
      rows.push(`  id ${id.toString(16).padStart(2, '0')}  ${name.padEnd(12)} table ${p.table} ` +
        `(${p.position.x}, ${p.position.y}, ${p.position.z}) param ${p.param} flags 0x${p.flags.toString(16)} ` +
        `reach ${((p.param >> 3) + 14) << 3}`);
    }

    const tokens = TOKEN_LISTS[level];
    let tokenNote = '';
    if (tokens) {
      const kinds = tokens.ids.map((id) => {
        const p = dat.placements[dat.objectIds[id] ?? -1];
        const object = p ? dat.objects[p.objectIndex] : undefined;
        const mesh = object ? dat.meshes.get(object.meshOffset) : undefined;
        return mesh ? kindOfPolyCount(meshPolyCount(mesh)) : PickupKind.None;
      });
      const ok = kinds.every((k) => k === PickupKind.Token);
      if (!ok) failures++;
      tokenNote = ` token list ${ok ? 'OK' : 'MISMATCH: ' + kinds.join(',')}`;
    }

    const parts = [...summary].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ');
    console.log(`${dir}/${scene}${level ? ` (level ${level})` : ''}: ${dat.placements.length} placements, ids 0..${dat.objectIds.length - 1}, ` +
      `pickups from 0x${first.toString(16)}: ${parts || 'none'}${tokenNote}`);
    if (levelArg) for (const row of rows) console.log(row);
  }
}
if (failures) { console.log(`${failures} token list(s) did not resolve to tokens`); process.exit(1); }
