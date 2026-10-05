import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unpackRaw} from '../src/formats/rnc.ts';
import {parseCreatureList} from '../src/formats/creatures.ts';
import {sceneForLevel} from '../src/sim/level-data.ts';
import {createCreatureSim,CREATURE_HANDLERS,RandomStream} from '../src/sim/creatures.ts';
const raw=unpackRaw(readFileSync(`Toy Story 2/data/${sceneForLevel(10)}.raw`));
const records=parseCreatureList(raw.find(r=>r.type===35)!.data);
const sim=createCreatureSim(records,{groundY:()=>null},new RandomStream(new Uint8Array([0])),10);
let tilted=0,normal=0;
for(const c of sim.creatures.filter(c=>c.handler==='FUN_004259b0')){
 assert.equal(c.pitch,0);assert.equal(c.hover,0);
 CREATURE_HANDLERS[c.handler!]!(sim,c,{bits:0,chasing:false,fwd:0,side:0,dt:1});
 if(c.record.accel<128){assert.equal(c.pitch,0xc00);assert.equal(c.hover,0x800);tilted++;}
 else{assert.equal(c.pitch,0);assert.equal(c.hover,0);normal++;}
}
assert.equal(tilted,3);assert.equal(normal,4);
console.log('PASS Elevator Hop: three sideways rescue mice, two upright rescues and two upright speakers');
