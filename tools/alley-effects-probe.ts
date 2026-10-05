import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {createAlleyEffects,stepAlleyEffects,alleyWaterY,type AlleyEffectWorld} from '../src/sim/alley-effects.ts';
import {createPlayer,createRuntime,stepPlayer,NO_INPUT,NO_GROUND} from '../src/sim/player.ts';
import {readEffectTable} from '../src/formats/effect-table.ts';
import {createEffects,spawnEffect,spawnChild,type EffectWorld} from '../src/sim/effects.ts';
import {RandomStream} from '../src/sim/creatures.ts';
import {createWaterEffects,stepWaterEffects} from '../src/sim/water-effects.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level05/level.dat')),s=createAlleyEffects(dat);
const table=readEffectTable(readFileSync('Toy Story 2/toy2.exe')),fx=createEffects(table.kinds,table.modes,new RandomStream(new Uint8Array([128])));
const world:EffectWorld={cameraX:0,cameraY:0,cameraZ:0,playerX:0,playerY:0,playerZ:0,playerYaw:0,playerVx:0,playerVz:0,groundAt:()=>null,waterY:65536,waterKind:1};
let projectiles=0,vents=0,sounds=0;const nodes:number[]=[];
const host:AlleyEffectWorld={zone:0,gate32:false,playerZ:0,cameraY:65536,
 projectile:(at,v,kind)=>{projectiles++;nodes.push(s.node);Object.assign(world,{cameraX:at.x,cameraY:at.y,cameraZ:at.z});const e=spawnEffect(fx,world,at.x,at.y,at.z,v.x,v.y,v.z,0,0,0,kind);assert(e);assert.equal(e.kind,76);return e;},
 child:(at,kind,mode)=>{vents++;Object.assign(world,{cameraX:at.x,cameraY:at.y,cameraZ:at.z});return spawnChild(fx,world,at.x,at.y,at.z,kind,mode);},sound:()=>{sounds++;}};
for(let i=0;i<189;i++)stepAlleyEffects(s,host);
assert.equal(projectiles,9);assert.deepEqual(nodes,[2,4,6,8,10,12,14,16,0]);assert.equal(sounds,9);assert(fx.effects.filter(e=>e.kind===76).every(e=>e.life===128));
host.zone=2;host.gate32=true;for(let i=0;i<11;i++)stepAlleyEffects(s,host);assert.equal(vents,5);const paused=s.vent;host.zone=1;for(let i=0;i<40;i++)stepAlleyEffects(s,host);assert.equal(s.vent,paused);
for(const z of [0,0xf329f,0xf32a0]){
 const water=alleyWaterY(z);assert.equal(water,z>0xf329f?458752:65536);
 for(const below of [false,true]){const p=createPlayer(0,water+(below?8193:8192),z);stepPlayer(p,NO_INPUT,createRuntime(),{...NO_GROUND,waterY:water},0);assert.equal(p.inWater,below);assert.equal(p.vy,below?16:64);}
 host.playerZ=z;host.cameraY=water;stepAlleyEffects(s,host);assert(s.objects.every(o=>o.scale.every(v=>v===1)));
 host.cameraY=water+1;stepAlleyEffects(s,host);assert(s.objects.every(o=>o.scale.every(v=>v===0)));
 const p=createPlayer(0,water+1,z),wet=createWaterEffects(water);Object.assign(world,{cameraX:0,cameraY:water,cameraZ:z,playerX:0,playerY:p.y,playerZ:z,waterY:water});let splash=false;
 stepWaterEffects(wet,fx,world,p,0,-1,water,id=>{splash ||= id===0x3a;});assert(splash,'Alley water must enter the shared splash path');
}
const misses=createAlleyEffects(dat);let missSounds=0;stepAlleyEffects(misses,{...host,projectile:()=>null,child:()=>null,sound:()=>missSounds++});assert.equal(missSounds,0);
console.log('PASS Alley 21-tick paired projectile cycle, room-2 5/11 gate cadence, sound-on-success, both water heights/strict boundaries, swimming gravity, splash integration and underwater artwork');
