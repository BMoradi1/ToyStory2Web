/**
 * Cross-check the level.dat parser against the PC scene inside level.ngn.
 *
 * The scene is pconv's own conversion of level.dat, so it is an oracle for
 * the parts of level.dat that carry no self-description: where the object
 * table's first section ends, the quarter scale of its second section, and
 * which zone each object belongs to. This checks all three on every scene.
 *
 *   npx tsx tools/scene-crosscheck.ts "Toy Story 2"
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { objectFaceCount, parseDat } from '../src/formats/dat.ts';
import { assignZones, parseNgnScene } from '../src/formats/ngnscene.ts';

const root = process.argv[2];
if (!root) { console.error('usage: npx tsx tools/scene-crosscheck.ts <game dir>'); process.exit(1); }

const keyOf = (pts: number[][]) => pts.map((p) => p.map((v) => Math.round(v * 8) / 8).join(',')).sort().join('|');
let bad = 0;
console.log('scene                 objects  sect1  scene  faces matched   zones assigned');
for (const dir of readdirSync(`${root}/data`).filter((d) => /^level\d\d$/.test(d)).sort()) {
  for (const base of ['level', 'level1']) {
    const f = `${root}/data/${dir}/${base}`;
    if (!existsSync(`${f}.dat`) || !existsSync(`${f}.ngn`)) continue;
    let level, scene;
    try { level = parseDat(readFileSync(`${f}.dat`)); scene = parseNgnScene(readFileSync(`${f}.ngn`)); }
    catch (err) { console.log(`${dir}/${base}: skipped (${(err as Error).message})`); continue; }

    const sect1 = level.objects.filter((o) => o.unitScale === 1).length;
    const list1 = scene.instances.filter((i) => i.list === 0).length;

    // Every scene face should exist in level.dat at the object's unit scale.
    const datFaces = new Set<string>();
    for (const o of level.objects) {
      const m = level.meshes.get(o.meshOffset);
      if (!m) continue;
      for (const face of m.faces) datFaces.add(keyOf(face.indices.map((i) => { const v = m.vertices[i]!; return [v.x * o.unitScale, v.y * o.unitScale, v.z * o.unitScale]; })));
    }
    let hit = 0, total = 0;
    for (const g of scene.gobjs) for (const prim of g.prims) {
      const step = prim.type === 4 ? 4 : 3;
      for (let i = 0; i + step <= prim.indices.length; i += step) {
        total++;
        if (datFaces.has(keyOf(prim.indices.slice(i, i + step).map((ix) => { const v = g.vertices[ix]!; return [v.x, v.y, v.z]; })))) hit++;
      }
    }
    const zones = assignZones(level.objects.map((o) => ({ ...o, faceCount: objectFaceCount(level, o) })), scene);
    const assigned = zones.filter((z) => z !== null).length;
    const ok = sect1 === list1 && hit / total > 0.97 && assigned === level.objects.length;
    if (!ok) bad++;
    console.log(`${`${dir}/${base}`.padEnd(20)} ${String(level.objects.length).padStart(8)} ${String(sect1).padStart(6)} ${String(list1).padStart(6)}   ${String(hit).padStart(6)}/${String(total).padEnd(7)} ${String(assigned).padStart(6)}/${level.objects.length}${ok ? '' : '   <-- CHECK'}`);
  }
}
console.log(bad ? `\n${bad} scene(s) need attention` : '\nall scenes consistent');
