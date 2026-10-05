import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {readEffectTable,EFFECT_FLAGS} from '../src/formats/effect-table.ts';
import {createEffects,spawnEffect,stepEffects,type EffectWorld} from '../src/sim/effects.ts';
import {RandomStream} from '../src/sim/creatures.ts';
import {createSpaceBuggyModel,stepSpaceBuggyModel} from '../src/sim/space-buggy-model.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level08/level.dat'));
const s=createSpaceBuggyModel(dat),hidden={...s.position},tables=readEffectTable(readFileSync('Toy Story 2/toy2.exe'));
const sim=createEffects(tables.kinds,tables.modes,new RandomStream(new Uint8Array([128])));
const world:EffectWorld={cameraX:0,cameraY:0,cameraZ:0,playerX:50000,playerY:0,playerZ:50000,
  playerYaw:0,playerVx:0,playerVz:0,groundAt:()=>null,waterY:null};
const e=spawnEffect(sim,world,-1000,-9000,1000,-198,0,406,4092*4,0,0,114)!;
assert(e);e.flags&=~EFFECT_FLAGS.homing;e.pitch=1024;e.life=20;
let trails=0;
for(let i=0;i<20;i++){
 stepEffects(sim,world);stepSpaceBuggyModel(s,sim.effects);
 if(e.life>0){assert(s.active);assert.deepEqual(s.position,{x:e.x>>5<<5,y:e.y>>5<<5,z:e.z>>5<<5});assert.deepEqual(s.angles,[0,1020,1024]);}
 for(const child of sim.effects.filter(c=>c.kind===46&&c.life>0)){
  trails++;assert.equal(child.vx,-24);assert.equal(child.vz,50,'trail inherits quarter velocity after both native halves');
 }
}
assert(trails>0);assert(!s.active);assert.deepEqual(s.position,hidden);
// There is one scene model, even if multiple hazard records coexist.
const a=spawnEffect(sim,world,1000,2000,3000,0,0,0,0,0,0,114)!;
const b=spawnEffect(sim,world,-1999,-2999,-3999,0,0,0,400,0,0,114)!;a.pitch=0;b.pitch=300;
stepSpaceBuggyModel(s,sim.effects);assert.deepEqual(s.position,{x:-2016,y:-3008,z:-4000});assert.deepEqual(s.angles,[0,1124,300]);
b.life=0;stepSpaceBuggyModel(s,sim.effects);assert.deepEqual(s.position,{x:992,y:1984,z:2976});
a.life=0;stepSpaceBuggyModel(s,sim.effects);assert.deepEqual(s.position,hidden);assert(!s.active);
assert.deepEqual(createSpaceBuggyModel(dat).position,hidden);
console.log('PASS: installed buggy projectile model, negative coordinate quantization, yaw wrap/pitch, final-pool-slot selection, expiry/idle/reset and native quarter-speed exhaust');
