import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {readEffectTable} from '../src/formats/effect-table.ts';
import {createEffects,spawnEffect,stepEffects,touchPlayer,type EffectWorld} from '../src/sim/effects.ts';
import {RandomStream} from '../src/sim/creatures.ts';
import {createSpaceProjectiles,stepSpaceProjectiles,spaceProjectileVelocity} from '../src/sim/space-projectiles.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level08/level.dat'));
const s=createSpaceProjectiles(dat),shots:any[]=[],sounds:number[]=[];
const p={x:80000,y:-90000,z:-210000};
const host={zone:2,gateSixteen:true,projectile:(at:any,v:any,gravity:number,kind:number)=>shots.push({at,v,gravity,kind}),sound:(id:number)=>sounds.push(id)};
host.zone=1;for(let i=0;i<250;i++)stepSpaceProjectiles(s,p,host);assert.equal(s.clock,0);
host.zone=2;stepSpaceProjectiles(s,{...p,x:0x1b467},host);assert.equal(s.clock,0);
for(let i=0;i<200;i++)stepSpaceProjectiles(s,p,host);assert.equal(shots.length,0);
host.gateSixteen=false;for(let i=0;i<20;i++)stepSpaceProjectiles(s,p,host);assert.equal(shots.length,0);
host.gateSixteen=true;
for(let i=0;i<s.points.length;i++){
 stepSpaceProjectiles(s,p,host);assert.equal(shots.length,i+1);const shot=shots[i];
 assert.deepEqual(shot.at,s.points[i]);assert.equal(shot.kind,96);assert.equal(shot.gravity,128);
 assert(shot.v.x*(p.x-shot.at.x)+shot.v.z*(p.z-shot.at.z)>0);
}
assert.equal(s.node,0);assert.equal(s.clock,0);assert(sounds.every(n=>n===13));
for(let i=0;i<200;i++)stepSpaceProjectiles(s,p,host);assert.equal(shots.length,s.points.length);
// Out-of-range emitters are still consumed and the volley still resets.
for(let i=0;i<s.points.length;i++)stepSpaceProjectiles(s,{...p,y:1e7},host);
assert.equal(s.node,0);assert.equal(s.clock,0);assert.equal(shots.length,s.points.length);
const {kinds,modes}=readEffectTable(readFileSync('Toy Story 2/toy2.exe'));
for(const shot of shots){
 const sim=createEffects(kinds,modes,new RandomStream(new Uint8Array([0])));
 const world:EffectWorld={cameraX:p.x,cameraY:p.y,cameraZ:p.z,playerX:p.x,playerY:p.y+8192,playerZ:p.z,
  playerYaw:0,playerVx:0,playerVz:0,groundAt:()=>null,waterY:null};
 const e=spawnEffect(sim,world,shot.at.x,shot.at.y,shot.at.z,shot.v.x,shot.v.y,shot.v.z,shot.gravity,0,0,shot.kind)!;
 assert(e);let near=Infinity,hurt=false;
 for(let i=0;i<110&&e.life>0;i++){
  stepEffects(sim,world);touchPlayer(sim,world);near=Math.min(near,Math.hypot(e.x-p.x,e.y-p.y,e.z-p.z));hurt ||= sim.hurt!==null;
 }
 assert(near<12000,`installed projectile missed its target by ${near}`);assert(hurt,'installed hurt flag must damage Buzz');
}
assert.equal(spaceProjectileVelocity(p,p),null,'coincident shot cannot divide by zero');
assert.equal(createSpaceProjectiles(dat).clock,0);
console.log('PASS: nine installed emitters, room/X/range gates, 200-tick volley delay, cadence gate and wrap, real effect trajectories/damage, coincident-target guard and reset');
