/** Native 0040fae0 uses squared 640000 / 0x190000; 00410f40 culls above 0x190000. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readEffectTable} from '../src/formats/effect-table.ts';
import {createEffects,spawnEffect,stepEffects,type EffectWorld} from '../src/sim/effects.ts';
import {RandomStream} from '../src/sim/creatures.ts';
import {createAimMarker,stepAimMarker} from '../src/sim/aim-marker.ts';
const {kinds,modes}=readEffectTable(readFileSync('Toy Story 2/toy2.exe'));
const world:EffectWorld={cameraX:0,cameraY:0,cameraZ:0,playerX:0,playerY:0,playerZ:0,playerYaw:0,playerVx:0,playerVz:0,groundAt:()=>null,waterY:null};
const fresh=()=>createEffects(kinds,modes,new RandomStream(new Uint8Array([128])));
for(const kind of [0x30,0x37,0x43,0x50])for(const axis of ['x','y','z'] as const){
 const limit=kind===0x30?800:1280;
 for(const distance of [400,799,800,1279,1280]){
  const at={x:0,y:0,z:0};at[axis]=-distance*256;
  const e=spawnEffect(fresh(),world,at.x,at.y,at.z,0,0,0,0,0,0,kind);
  assert.equal(!!e,distance<limit,`kind ${kind} ${axis} spawn at ${distance}`);
 }
}
for(const axis of ['x','y','z'] as const)for(const distance of [400,401,800,1279,1280,1281]){
 const sim=fresh(),e=spawnEffect(sim,world,0,0,0,0,0,0,0,0,0,0x30)!;e[axis]=-distance*256;e.life=10000;
 stepEffects(sim,world);assert.equal(e.life>0,distance<=1280,`${axis} live cull at ${distance}`);
 if(distance>1280){assert.equal(e.death,0);assert.equal(e.sprite,0);}
}
// A valid lock target beyond the old 400-step removal radius must remain visible.
const sim=fresh(),marker=createAimMarker(),target={id:15,x:120000,y:-10000,z:0};
for(let t=0;t<40;t++){stepAimMarker(marker,sim,world,target,true);stepEffects(sim,world);assert(marker.effect&&marker.effect.life>0);assert.equal(marker.effect.sprite,23);}
assert.equal(marker.effect!.width,320);assert.equal(sim.effects.filter(e=>e.kind===0x30&&e.life>0).length,1);
console.log('PASS effect ranges: ordinary/extended kinds, all-axis strict spawn and inclusive live boundary, no out-of-range death hook, persistent distant aim marker');
