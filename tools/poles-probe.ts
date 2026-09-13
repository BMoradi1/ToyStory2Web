/** Run with tsx tools/poles-probe.ts "Toy Story 2". Install stays read-only. */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseDat } from '../src/formats/dat.ts';
import { parseAll } from '../src/formats/all.ts';
import { buildCollisionWorld, parseCollision } from '../src/formats/collision.ts';
import { levelNumber } from '../src/sim/level-data.ts';
import { readPoles } from '../src/sim/poles.ts';
import { createPlayer, createRuntime, stepPlayer, NO_INPUT, NO_GROUND, groundFromCollision } from '../src/sim/player.ts';
import { selectState } from '../src/sim/player-animation.ts';
const root = process.argv[2] ?? 'Toy Story 2';
let count = 0;
for (let dir = 1; dir <= 10; dir++) for (const name of ['level', 'level1']) {
  const file = join(root, 'data', `level${String(dir).padStart(2,'0')}`, name + '.dat');
  if (!existsSync(file) || !levelNumber(`level${String(dir).padStart(2,'0')}/${name}`) || levelNumber(`level${String(dir).padStart(2,'0')}/${name}`)! > 15) continue;
  const poles = readPoles(parseDat(readFileSync(file)).paths.find(p => p.id === 61)?.points ?? []);
  for (const pole of poles) {
    assert(pole.bottom > pole.top); assert(pole.type >= 0 && pole.type <= 3);
    if (pole.type === 3 || pole.bottom - pole.top < 0x3600) continue;
    const p = createPlayer(pole.x + 2000, (pole.bottom + pole.top + 0x3600) / 2, pole.z, 0);
    const rt = createRuntime(), ground = { ...NO_GROUND, poles: [pole] };
    stepPlayer(p, NO_INPUT, rt, ground, 0);
    assert.equal(p.pole, 0); const y = p.y;
    for (let i = 0; i < 12; i++) stepPlayer(p, {...NO_INPUT, moveY: 1}, rt, ground, 0);
    assert(pole.type === 2 ? p.y > y : p.y < y);
    assert.equal(selectState(p, true), pole.type === 2 ? 16 : 14);
    stepPlayer(p, {...NO_INPUT, jump: true}, rt, ground, 0);
    assert.equal(p.pole, -1); assert(p.vy < 0);
    stepPlayer(p, NO_INPUT, rt, ground, 0); assert.equal(p.pole, -1, 'no immediate regrab');
    count++;
  }
}
// Real collision: ropes must not be blocked by the normal gravity/ledge path.
const dir = join(root, 'data/level01');
const poles = readPoles(parseDat(readFileSync(join(dir, 'level.dat'))).paths.find(p => p.id === 61)!.points);
const world = buildCollisionWorld(parseCollision(parseAll(readFileSync(join(dir, 'TERRAIN.ALL')))).groups);
const q = poles[0]!, p = createPlayer(q.x, (q.top + q.bottom + 0x3600)/2, q.z, 0), rt = createRuntime();
const g = groundFromCollision(world, poles), y = p.y;
for (let i=0;i<60;i++) stepPlayer(p, {...NO_INPUT,moveY:1}, rt, g, 0);
assert.equal(p.pole, 0); assert(p.y < y - 10000, 'climbs real rope through collision world');
for (let i=0;i<500;i++) stepPlayer(p, {...NO_INPUT,moveY:1}, rt, g, 0);
assert(p.y >= q.top+0x3600 && p.y < q.top+0x3600+4000, 'reaches top or its collision clearance');
stepPlayer(p,{...NO_INPUT,jump:true},rt,g,0); assert.equal(p.pole,-1); assert(p.vy<0);
const grouped=readPoles([{x:50,y:-50,z:-50},{x:10,y:1000,z:20},{x:10,y:0,z:20},{x:100,y:-100,z:100},{x:30,y:1000,z:40},{x:30,y:0,z:40}]);
assert.deepEqual(grouped.map(p=>p.type),[1,2]);
console.log(`PASS: ${count} climbable poles across shipped scenes; real rope climb/top/jump; sentinel types`);
