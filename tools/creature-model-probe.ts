import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseAll, GroupType } from '../src/formats/all.ts';
import { parseCreatureModels, parseCreatureList } from '../src/formats/creatures.ts';
import { unpackRaw } from '../src/formats/rnc.ts';
import { sceneForLevel } from '../src/sim/level-data.ts';
import { creatureModelGeometry } from '../src/sim/creature-model.ts';
import { createCreatureSim, setCreatureModels, contactCreatures, CREATURE_FLAGS, RandomStream } from '../src/sim/creatures.ts';
const paths = parseCreatureModels(readFileSync('Toy Story 2/data/creatures.cfg', 'utf8'));
const models = new Map([...paths].filter(([, entry])=>existsSync('Toy Story 2/'+entry.path)).map(([type, entry]) => {
  const art = parseAll(readFileSync('Toy Story 2/' + entry.path));
  const geometry = creatureModelGeometry(art);
  assert(geometry.shapes.length > 0);
  if (!art.groups.some(g => g.type === GroupType.HitShapes)) {
    assert.deepEqual(geometry, { offsetX:0, offsetY:500, offsetZ:0, hitRadius:500,
      shapes:[{offset:{x:0,y:-250,z:0},scale:{x:512,y:256,z:512},radius:250}] });
  }
  return [type, geometry];
}));
let count = 0;
for (let level=1;level<=15;level++) {
  const raw = unpackRaw(readFileSync(`Toy Story 2/data/${sceneForLevel(level)}.raw`));
  const records = parseCreatureList(raw.find(r=>r.type===35)!.data);
  const sim = createCreatureSim(records,{groundY:()=>null},new RandomStream(new Uint8Array([0])),level);
  setCreatureModels(sim,models);
  for (const c of sim.creatures) if (c.type>0 && models.has(c.type)) {
    assert.equal(c.flags & CREATURE_FLAGS.noModel,0,`level ${level} type ${c.type}`);count++;
  }
  if (level===4) for (const c of sim.creatures.filter(c=>c.type===19&&c.health===102)) {
    c.flags |= CREATURE_FLAGS.drawn;sim.near=[c.slot];
    contactCreatures(sim,{x:c.x,y:c.y-250+0x1cc0,z:c.z},{kind:0,reach:0});
    assert(c.flags & CREATURE_FLAGS.touched,'Construction rescue must accept contact');
  }
}
console.log(`PASS ${models.size} installed creature models and ${count} placements across 15 levels; default hit geometry and Construction rescue contact`);
