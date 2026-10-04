/** Installed fan paths, physical switches and collision-aware airflow. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision,transformCollisionGroup} from '../src/formats/collision.ts';
import {createLevelPlatforms,stepLevelPlatforms,stepPlatformSwitches,restoreLevelPlatforms} from '../src/sim/level-platforms.ts';
import {createPlayer,createRuntime,groundFromCollision,stepPlayer,NO_INPUT} from '../src/sim/player.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level10/level.dat'));
function fresh(){
 const world=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level10/TERRAIN.ALL'))).groups);
 const s=createLevelPlatforms(10,dat,world)!,p=createPlayer(1e8,0,1e8);return {world,s,p,f:s.fans!};
}
{
 const {world,s,p,f}=fresh();
 stepLevelPlatforms(s,world,p,()=>0,4096);
 assert.equal(f.arena,128);assert.deepEqual(f.angles.get(7),[0,128,0]);assert.equal(f.speed,2);
 assert(!f.angles.has(4));assert(!f.angles.has(5));assert.deepEqual(f.angles.get(6),[0,896,0]);
 for(let i=0;i<63;i++)stepLevelPlatforms(s,world,p);assert.equal(f.speed,128);
 for(let i=0;i<500;i++)stepLevelPlatforms(s,world,p);assert.equal(f.speed,0,'wall fans stop during quiet phase');
 // The boss's spin controls all eight authored updraft columns.
 const arena=f.paths.get(8)!;
 for(let i=0;i<16;i+=2){
  f.paths.set(8,arena.slice(i,i+2));
  const base=arena[i]!;Object.assign(p,{x:base.x,y:base.y-256,z:base.z,vy:0,stomp:1});
  stepLevelPlatforms(s,world,p,()=>0,4096);assert.equal(p.vy,-256);assert.equal(p.stomp,0);assert(!p.onGround);
  p.vy=0;stepLevelPlatforms(s,world,p,()=>0,0);assert.equal(p.vy,0,'inactive boss wind');
  p.x=base.x+160*256;p.vy=0;stepLevelPlatforms(s,world,p,()=>0,4096);assert.equal(p.vy,0,'strict cylinder radius');
 }
 f.paths.set(8,arena.slice(0,2));
 const base=f.paths.get(8)![0]!,top=f.paths.get(8)![1]!;
 Object.assign(p,{x:base.x,y:base.y,z:base.z,vy:0});stepLevelPlatforms(s,world,p,()=>0,4096);assert.equal(p.vy,0,'base excluded');
 p.y=top.y+192*256;stepLevelPlatforms(s,world,p,()=>0,4096);assert.equal(p.vy,0,'top excluded');
 p.y=base.y-256;p.vy=-2048;stepLevelPlatforms(s,world,p,()=>0,4096);assert.equal(p.vy,-2048,'arena velocity limit');
}
for(let which=0;which<2;which++){
 const {world,s,p,f}=fresh(),h=f.hulls[which]!;
 const face=h.polys.filter(q=>q.normal.y<-.8).sort((a,b)=>a.vertices[0]!.y-b.vertices[0]!.y)[0]!;
 assert(face,'switch has a floor');
 const at=face.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});
 Object.assign(p,{...at,y:at.y-20000,stomp:1,onGround:false});
 const ground=groundFromCollision(world),runtime=createRuntime();
 for(let i=0;i<100&&f.switches===0;i++){
  stepPlayer(p,NO_INPUT,runtime,ground,0);stepPlatformSwitches(s,p,world);
 }
 assert.equal(f.switches,1<<which,'real stomp activates fan');assert(f.guides.includes(which===0?0:4));
 assert.deepEqual(f.angles.get(which===0?17:16),which===0?[384,0,0]:[0,0,384]);
 assert.notDeepEqual(world.polys[h.polys[0]!.index]!.vertices,h.polys[0]!.vertices,'switch collision rotates');
 const base=f.paths.get(which===0?10:1)![0]!;
 Object.assign(p,{x:base.x,y:base.y-256,z:base.z,vy:0,stomp:1});
 stepLevelPlatforms(s,world,p);assert.equal(p.vy,-128);assert.equal(p.stomp,0);assert(f.emitters.some(e=>e.vertical));
 p.vy=-4096;stepLevelPlatforms(s,world,p);assert.equal(p.vy,-4096,'shaft velocity limit');
 restoreLevelPlatforms(s,world);
 for(const h of f.hulls)for(const poly of h.polys){
  assert.deepEqual(world.polys[poly.index]!.vertices,poly.vertices,'switch collision exact reset');
  assert.deepEqual(world.polys[poly.index]!.normal,poly.normal,'switch normals exact reset');
 }
 const again=createLevelPlatforms(10,dat,world)!;assert.equal(again.fans!.switches,0);
 // Arbitrary rotations must not accumulate drift or leave duplicate grid entries.
 for(let i=0;i<20;i++)transformCollisionGroup(world,h,h.origin,0,.5,.25);
 transformCollisionGroup(world,h,h.origin,0);
 for(const cell of world.cells.values())assert.equal(new Set(cell).size,cell.length);
}
{
 const {world,s,p,f}=fresh(),base=f.paths.get(10)![0]!;f.switches=1;
 Object.assign(p,{x:base.x,y:base.y-25000,z:base.z,onGround:false});
 const initial=p.y,ground=groundFromCollision(world),runtime=createRuntime();
 ground.beforeMove=()=>stepLevelPlatforms(s,world,p);
 for(let i=0;i<60;i++)stepPlayer(p,NO_INPUT,runtime,ground,0);
 assert(p.y<initial-10000&&p.vy<0,'real player physics rises in an active shaft without repositioning');
}
{
 const {world,s,p,f}=fresh(),base=f.paths.get(2)![0]!;
 f.phase=100;f.speed=128;Object.assign(p,{x:base.x+1000,y:base.y,z:base.z,vx:0});
 stepLevelPlatforms(s,world,p);assert(p.vx>0);assert.equal(f.ramp,256);assert(f.emitters.some(e=>!e.vertical));
 p.vx=0;p.contacts=[{group:0,normal:{x:-1,y:0,z:0}}];stepLevelPlatforms(s,world,p);assert.equal(p.vx,0);assert.equal(f.ramp,0);
 p.contacts=[];p.climb=10;stepLevelPlatforms(s,world,p);assert.equal(p.vx,0,'no wind during ledge climb');
}
console.log('PASS: fan rotation/quiet phase, eight boss columns and boundaries, physical stomp switches, shaft acceleration/caps, horizontal wind/contact/climb gates, collision normals/grid/reset');
