/** Exercise death hooks using the local executable's templates and spawn modes. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readEffectTable,EFFECT_FLAGS} from '../src/formats/effect-table.ts';
import {createEffects,spawnEffect,stepEffects,type EffectWorld} from '../src/sim/effects.ts';
import {RandomStream} from '../src/sim/creatures.ts';
import {createPointLights,addPointLight,stepPointLights} from '../src/sim/point-light.ts';
const {kinds,modes}=readEffectTable(readFileSync(`${process.argv[2]??'Toy Story 2'}/toy2.exe`));
const world:EffectWorld={cameraX:0,cameraY:0,cameraZ:0,playerX:0,playerY:8192,playerZ:0,
 playerYaw:0,playerVx:0,playerVz:0,groundAt:()=>null,waterY:null};
for(const code of [3,5,8]){
 const sim=createEffects(kinds,modes,new RandomStream(new Uint8Array([0])));
 const kind=kinds.findIndex(t=>t?.death===(code===5?3:code));assert(kind>=0);
 const e=spawnEffect(sim,world,512,-4096,8192,0,0,0,0,0,0,kind)!;assert(e);
 const slot=sim.effects.indexOf(e),height=e.height;
 // Isolate the hook; code 5 has no authored template and is exercised explicitly.
 Object.assign(e,{life:1,death:code,mode:0,flags:EFFECT_FLAGS.keep,frames:1});
 stepEffects(sim,world);
 const requests=sim.pointLights.splice(0);assert.equal(requests.length,1);
 const red=code!==5,life=red?24:16;
 assert.deepEqual(requests[0],{x:512,y:red?-4096+height*32:-4096,z:8192,
  r:red?160:96,g:red?0:64,b:0,life,owner:red?0x529e58+slot*60:512});
 const pool=createPointLights();addPointLight(pool,requests[0]!);
 const buzz={x:512,y:requests[0]!.y+8192,z:0};
 const lit=stepPointLights(pool,buzz)!;assert(lit.colour[0]>0);
 assert.equal(lit.colour[1]>0,!red);assert.equal(pool.remaining,0);
 for(let i=1;i<life;i++)stepPointLights(pool,buzz);
 assert.equal(pool.slots[0]!.life,0);assert.equal(pool.remaining,63);
 for(let i=0;i<64;i++)stepPointLights(pool,buzz);
 assert.equal(stepPointLights(pool,buzz),null);
 stepEffects(sim,world);assert.equal(sim.pointLights.length,0,'request is emitted once');
 assert.equal(createEffects(kinds,modes,sim.rand).pointLights.length,0);
}
// Range removal suppresses the death hook rather than flashing at a culled effect.
const culled=createEffects(kinds,modes,new RandomStream(new Uint8Array([0])));
const e=spawnEffect(culled,world,0,0,0,0,0,0,0,0,0,kinds.findIndex(t=>t?.death===3))!;
e.x=10000000;stepEffects(culled,world);assert.equal(culled.pointLights.length,0);
console.log('PASS: death 3/5/8 positions, RGB, lifetime, record/X owners, one-shot emission, cull suppression and light return.');
