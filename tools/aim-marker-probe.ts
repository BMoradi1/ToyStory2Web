import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readEffectTable} from '../src/formats/effect-table.ts';
import {RandomStream} from '../src/sim/creatures.ts';
import {createEffects,stepEffects,type EffectWorld} from '../src/sim/effects.ts';
import {createAimMarker,stepAimMarker} from '../src/sim/aim-marker.ts';
const {kinds,modes}=readEffectTable(readFileSync('Toy Story 2/toy2.exe'));
const sim=createEffects(kinds,modes,new RandomStream(new Uint8Array([0])));
const world:EffectWorld={cameraX:0,cameraY:0,cameraZ:0,playerX:0,playerY:0,playerZ:0,
  playerYaw:0,playerVx:0,playerVz:0,groundAt:()=>null,waterY:null};
const state=createAimMarker(),target={id:3,x:2000,y:-1000,z:10000};
stepAimMarker(state,sim,world,target,true);
assert(state.effect);const marker=state.effect;
assert.equal(marker.sprite,23);assert.equal(marker.kind,0x30);
assert.equal(marker.rotation,0x200);assert.equal(marker.r,255);assert.equal(marker.g,0);
for(let i=0;i<40;i++){stepAimMarker(state,sim,world,target,true);stepEffects(sim,world);}
assert.equal(state.effect,marker,'retain one effect, not one per frame');
assert.equal(sim.effects.filter(e=>e.life>0).length,1);
assert.equal(marker.width,320,'installed grow-to-size behavior');
stepAimMarker(state,sim,world,{...target,x:3000},false);
assert.equal(marker.x,3000);assert.equal(marker.g,255);assert.equal(marker.r,0);
stepAimMarker(state,sim,world,{...target,id:4},true);assert.equal(marker.width,8,'new target restarts marker growth');
stepAimMarker(state,sim,world,null,false);assert.equal(marker.life,0);assert.equal(state.effect,null);
const other=createAimMarker();
stepAimMarker(other,sim,world,target,true);assert(other.effect);
other.effect.kind=1;const reused=other.effect;
stepAimMarker(other,sim,world,null,false);assert(reused.life>0,'do not kill a reused unrelated effect');
console.log('PASS: original sprite/template, marker growth, tracking, lock colour, selection reset, cleanup and pool reuse.');
