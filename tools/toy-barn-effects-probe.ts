import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {readEffectTable} from '../src/formats/effect-table.ts';
import {createEffects,spawnChild,stepEffects,stepEffectGates,type EffectWorld} from '../src/sim/effects.ts';
import {RandomStream} from '../src/sim/creatures.ts';
import {createToyBarnEffects,stepToyBarnEffects} from '../src/sim/toy-barn-effects.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level07/level.dat')),s=createToyBarnEffects(dat);
const shots:any[]=[],sounds:number[]=[];let bytes=0,value=0;
const w={gate64:true,randomByte:()=>{bytes++;return value;},effect:(at:any,kind:number,mode:number)=>{const e={...at,kind,mode,floor:null,rotation:0};shots.push(e);return e;},sound:(id:number)=>sounds.push(id)};
const ball={x:-300000,y:0,z:160000},puff={x:-150000,y:-70000,z:200000};
for(let i=0;i<8;i++){stepToyBarnEffects(s,ball,w as any);assert.equal(s.node,(i+1)%8);assert.deepEqual([shots[i].x,shots[i].y,shots[i].z],Object.values(s.balls[(i+1)%8]!));assert.equal(shots[i].floor,0);assert.equal(shots[i].kind,86);assert.equal(shots[i].mode,25);}
assert.equal(bytes,0);assert.equal(sounds.length,8);assert(sounds.every(n=>n===0x74));
for(value=0;value<8;value++){stepToyBarnEffects(s,puff,w as any);const e=shots.at(-1);assert.deepEqual([e.x,e.y,e.z],Object.values(s.puffs[value%6]!));assert.equal(e.kind,80);assert.equal(e.mode,24);assert.equal(e.rotation,(value&3)*1024);}
assert.equal(bytes,16);
const count=shots.length;w.gate64=false;stepToyBarnEffects(s,ball,w as any);stepToyBarnEffects(s,puff,w as any);assert.equal(shots.length,count);
w.gate64=true;for(const p of [{...ball,x:-0x5cf57},{...puff,x:-0x1b73a},{x:0,y:0,z:0}])stepToyBarnEffects(s,p,w as any);assert.equal(shots.length,count);
// Spawn culling must still consume the caller's rotation byte.
const before=bytes;stepToyBarnEffects(s,puff,{...w,effect:()=>null});assert.equal(bytes,before+2);
const {kinds,modes}=readEffectTable(readFileSync('Toy Story 2/toy2.exe'));
const sim=createEffects(kinds,modes,new RandomStream(new Uint8Array([128,64,192,32])));
let gates=0;for(let t=1;t<=256;t++){stepEffectGates(sim);assert.equal(sim.gate.sixtyFour,t%64===0);if(sim.gate.sixtyFour)gates++;}assert.equal(gates,4);
for(const [kind,mode,at] of [[86,25,s.balls[0]!],[80,24,s.puffs[0]!]] as const){
 const world:EffectWorld={cameraX:at.x,cameraY:at.y,cameraZ:at.z,playerX:at.x,playerY:at.y,playerZ:at.z,playerYaw:0,playerVx:0,playerVz:0,groundAt:()=>0,waterY:null};
 const e=spawnChild(sim,world,at.x,at.y,at.z,kind,mode)!;assert(e);if(kind===86)e.floor=0;
 const start={y:e.y,width:e.width};for(let t=0;t<10;t++)stepEffects(sim,world);
 assert(kind===86?e.y!==start.y:e.width<start.width,'installed effect did not animate');
}
console.log('PASS both installed emitter paths, wrap/random/strict bounds, 64-tick gate, culled RNG, floor/sound/rotation and actual effect motion');
