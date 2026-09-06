/**
 * List a scene's placements by object id with the category the engine would
 * give each as a pickup, and check the level's tables from the executable
 * against the scene: the token list resolves to tokens, every hint sign is
 * a sign, every push block's path and object exist, and the sparkle path's
 * push points count the push blocks.
 *
 *     npx tsx tools/level-objects.ts "Toy Story 2" [level] [scene]
 *
 * e.g. `... 1 level` for level01/level.dat. Without a directory number, summarises
 * every scene. Level numbers follow the game: `level04/level1` is level 14.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { meshPolyCount, parseDat } from '../src/formats/dat.ts';
import { GroupType, parseAll } from '../src/formats/all.ts';
import { kindOfPolyCount, PickupKind } from '../src/sim/pickups.ts';
import { firstPickupId, HINT_SIGNS, levelNumber, PUSH_BLOCKS, SPARKLE_PATH_TAG, TOKEN_LISTS } from '../src/sim/level-data.ts';

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

    const kindOf = (id: number): PickupKind => {
      const p = dat.placements[dat.objectIds[id] ?? -1];
      const object = p ? dat.objects[p.objectIndex] : undefined;
      const mesh = object ? dat.meshes.get(object.meshOffset) : undefined;
      return mesh ? kindOfPolyCount(meshPolyCount(mesh)) : PickupKind.None;
    };
    const notes: string[] = [];
    const signs = HINT_SIGNS[level];
    if (signs) {
      const bad = signs.filter((h) => kindOf(h.objectId) !== PickupKind.HintSign || !dat.paths.some((p) => p.id === h.pathTag && p.points.length >= 3));
      const signIds = new Set(signs.map((h) => h.objectId));
      let unlisted = 0;
      for (let id = first; id < dat.objectIds.length; id++) if (kindOf(id) === PickupKind.HintSign && !signIds.has(id)) unlisted++;
      if (bad.length) failures++;
      notes.push(`hint signs ${bad.length ? 'MISMATCH: ' + bad.map((h) => h.objectId).join(',') : `${signs.length} OK`}${unlisted ? `, ${unlisted} sign(s) not in the table` : ''}`);
    }
    const blocks = PUSH_BLOCKS[level];
    if (blocks) {
      // The collision object is a numbered dynamic group in the scene's terrain file.
      const terrainPath = join(root, 'data', `level${String(dir).padStart(2, '0')}`, scene === 'level1' ? 'TERR1.ALL' : 'TERRAIN.ALL');
      const numbers = new Set(existsSync(terrainPath)
        ? parseAll(readFileSync(terrainPath)).groups.filter((g) => g.type === GroupType.DynamicCollision).map((g) => g.objectNumber)
        : []);
      const bad = blocks.filter((b) => !dat.paths.some((p) => p.id === b.pathTag && p.points.length >= 2) || !numbers.has(b.collisionObject));
      const sparkle = dat.paths.find((p) => p.id === SPARKLE_PATH_TAG);
      const split = sparkle ? sparkle.points.findIndex((v) => v.x === 0 && v.y === 0 && v.z === 0) : -1;
      // One sparkle point per block, except that level 8 has two for three (docs/LEVELS.md).
      const splitOk = split >= 0 && split <= blocks.length;
      if (bad.length || !splitOk) failures++;
      notes.push(`push blocks ${bad.length ? 'MISMATCH: ' + bad.map((b) => `${b.collisionObject}/${b.pathTag}`).join(',') : `${blocks.length} OK`}, ` +
        `sparkle points ${split}${splitOk ? (split < blocks.length ? ' (fewer than blocks)' : ' OK') : ' MISMATCH'}`);
    }

    const parts = [...summary].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ');
    console.log(`${dir}/${scene}${level ? ` (level ${level})` : ''}: ${dat.placements.length} placements, ids 0..${dat.objectIds.length - 1}, ` +
      `pickups from 0x${first.toString(16)}: ${parts || 'none'}${tokenNote}${notes.map((n) => '; ' + n).join('')}`);
    if (levelArg) for (const row of rows) console.log(row);
  }
}
if (failures) { console.log(`${failures} table(s) did not match the scene`); process.exit(1); }
