/**
 * Recover the level material table by joining the PC scene against level.dat.
 *
 * The PC build never reads level.dat's face groups: pconv converted every
 * level into the NU-engine scene inside level.ngn, resolving each PSX face
 * mode into a material with a render-flag word that toy2.exe maps straight
 * onto Direct3D states (see docs/FORMATS.md, "Material system"). This tool
 * parses that scene, matches its faces to level.dat faces by vertex
 * position, and prints, per mode low byte, which material flags and vertex
 * alphas pconv assigned. It is how the mode bits were decoded, and rerunning
 * it is how a change to that reading gets checked.
 *
 *   npx tsx tools/material-table.ts "Toy Story 2" [levelNN/base ...]
 *
 * Material render flags (material record field 0x40, toy2.exe FUN_004b6760):
 *   0x02 alpha blend SRCALPHA/INVSRCALPHA, no z-write   0x08 no culling
 *   0x10 additive SRCALPHA/ONE, no z-write               0x04 extra pass
 *   0x20 ZERO/INVSRCCOLOR (subtractive stand-in), no z-write
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { parseDat, texturePage } from '../src/formats/dat.ts';
import { parseNgnScene } from '../src/formats/ngnscene.ts';

const [, , root, ...only] = process.argv;
if (!root) { console.error('usage: npx tsx tools/material-table.ts <game dir> [levelNN/base ...]'); process.exit(1); }

const scenes: string[] = only.length ? only.map((s) => `${root}/data/${s}`) : [];
if (!scenes.length) {
  for (const dir of readdirSync(`${root}/data`).filter((d) => /^level\d\d$/.test(d)).sort()) {
    for (const base of ['level', 'level1']) {
      const f = `${root}/data/${dir}/${base}`;
      if (existsSync(`${f}.ngn`) && existsSync(`${f}.dat`)) scenes.push(f);
    }
  }
}

interface Agg { faces: number; flags: Map<number, number>; alpha: Map<number, number>; pageOk: number; pageBad: number; untextured: number; ratios: number[] }
const byLow = new Map<number, Agg>();
const keyOf = (pts: number[][]) => pts.map((p) => p.map((v) => Math.round(v * 8) / 8).join(',')).sort().join('|');

for (const base of scenes) {
  let scene, level;
  try { scene = parseNgnScene(readFileSync(`${base}.ngn`)); level = parseDat(readFileSync(`${base}.dat`)); }
  catch (err) { console.log(`${base}: skipped (${(err as Error).message})`); continue; }

  const datFaces = new Map<string, { mode: number; red: number }>();
  for (const m of level.meshes.values()) {
    for (const f of m.faces) {
      const k = keyOf(f.indices.map((i) => { const v = m.vertices[i]!; return [v.x, v.y, v.z]; }));
      datFaces.set(k, { mode: f.mode, red: m.vertices[f.indices[0]!]!.r });
    }
  }

  let joined = 0, unjoined = 0;
  for (const g of scene.gobjs) {
    for (const prim of g.prims) {
      const material = g.materials[prim.material];
      if (!material) continue;
      const step = prim.type === 4 ? 4 : 3;
      for (let i = 0; i + step <= prim.indices.length; i += step) {
        const vs = prim.indices.slice(i, i + step).map((ix) => g.vertices[ix]!);
        const hit = datFaces.get(keyOf(vs.map((v) => [v.x, v.y, v.z])));
        if (!hit) { unjoined++; continue; }
        joined++;
        const low = hit.mode & 0xff;
        const a = byLow.get(low) ?? { faces: 0, flags: new Map(), alpha: new Map(), pageOk: 0, pageBad: 0, untextured: 0, ratios: [] as number[] };
        byLow.set(low, a);
        a.faces++;
        a.flags.set(material.renderFlags, (a.flags.get(material.renderFlags) ?? 0) + 1);
        for (const v of vs) a.alpha.set(v.a, (a.alpha.get(v.a) ?? 0) + 1);
        const page = material.textures[0] === undefined ? null : material.textures[0];
        if (page === null) a.untextured++; else if (page === texturePage(hit.mode)) a.pageOk++; else a.pageBad++;
        if (hit.red > 16) a.ratios.push(vs[0]!.r / hit.red);
      }
    }
  }
  console.log(`${base}: ${scene.gobjs.length} gobjs, ${scene.instances.length} instances, ${joined} faces joined, ${unjoined} not in level.dat`);
}

console.log('\nlow   faces  material flags (count)              vertex alpha (count)     page ok/bad/untextured  ngn/dat colour');
for (const [low, a] of [...byLow.entries()].sort((x, y) => y[1].faces - x[1].faces)) {
  const flags = [...a.flags.entries()].sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k.toString(16)}:${n}`).join(' ');
  const alpha = [...a.alpha.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, n]) => `${k}:${n}`).join(' ');
  const sorted = a.ratios.sort((x, y) => x - y);
  const median = sorted.length ? sorted[sorted.length >> 1]!.toFixed(2) : '-';
  console.log(low.toString(16).padStart(2, '0').padEnd(5), String(a.faces).padStart(6), flags.padEnd(36), alpha.padEnd(24), `${a.pageOk}/${a.pageBad}/${a.untextured}`.padEnd(23), median);
}
