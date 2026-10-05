import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision} from '../src/formats/collision.ts';
import {createPlayer,createRuntime,groundFromCollision,stepPlayer,NO_INPUT} from '../src/sim/player.ts';
import {createToyBarnPlatforms,moveToyBarnPlatforms,stepToyBarnPlatforms,restoreToyBarnPlatforms,toyBarnPlatformPoses} from '../src/sim/toy-barn-platforms.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level07/level.dat'));
const w=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level07/TERRAIN.ALL'))).groups);
const exe=readFileSync('Toy Story 2/toy2.exe'),s=createToyBarnPlatforms(dat,w,exe),p=createPlayer(1e8,0,1e8);
const start=s.movers.map(m=>({...m.position}));
for(let t=0;t<100;t++){moveToyBarnPlatforms(s,w,p);stepToyBarnPlatforms(s,()=>0,slot=>slot===7?999:slot===8?-1:undefined);}
for(let i=3;i<6;i++){assert.deepEqual(s.movers[i]!.position,start[i]);assert.equal(s.movers[i]!.script.pc,0);assert.equal(start[i]!.x,s.movers[i]!.hull.origin.x*32+25280);}
const far=new Set(),back=new Set(),wait=new Set();
for(let t=0;t<2400;t++){
 moveToyBarnPlatforms(s,w,p);stepToyBarnPlatforms(s,()=>0,()=>0);
 for(const [i,m] of s.movers.entries()){
  const displacement=i<3?start[i]!.y-m.position.y:start[i]!.x-m.position.x;
  if(displacement>(i<3?50000:20000))far.add(i);
  if(far.has(i)&&Math.abs(displacement)<1024)back.add(i);
  if(m.script.wait>0){wait.add(i);assert.deepEqual(m.script.velocity,{x:0,y:0,z:0});}
  assert.deepEqual(w.groups[m.hull.groupIndex]!.position,{x:m.position.x/32,y:m.position.y/32,z:m.position.z/32});
 }
 const poses=toyBarnPlatformPoses(s);
 for(let i=0;i<3;i++)for(const axis of ['x','y','z'] as const)assert.equal(poses[i+6]!.position[axis],(s.movers[i]!.position[axis]>>7)*128);
}
assert.equal(far.size,6);assert.equal(back.size,6);assert.equal(wait.size,6);
const m=s.movers[0]!;m.script.velocity={x:0,y:-256,z:0};
for(const mode of ['standing','climbing','airborne']){
 p.onGround=mode==='standing';p.contacts=p.onGround?[{group:m.hull.groupIndex,normal:{x:0,y:-1,z:0}} as any]:[];
 p.climbGroup=mode==='climbing'?m.hull.groupIndex:-1;p.climb=mode==='climbing'?1:0;
 const y=p.y;moveToyBarnPlatforms(s,w,p);assert.equal(p.y,y+(mode==='airborne'?0:-256));
}
restoreToyBarnPlatforms(s,w);for(const m of s.movers)for(const b of m.hull.polys)assert.deepEqual(w.polys[b.index]!.vertices,b.vertices);
const reset=createToyBarnPlatforms(dat,w,exe);assert.deepEqual(reset.movers.map(m=>m.position),start);restoreToyBarnPlatforms(reset,w);
console.log('PASS six installed platform out/back/wait cycles, exact enemy health gate, initial extension, near/far poses, standing/climbing carry, airborne isolation and collision restoration');

for(let i=0;i<6;i++){
 const world=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level07/TERRAIN.ALL'))).groups);
 const platforms=createToyBarnPlatforms(dat,world,exe),m=platforms.movers[i]!;
 const floor=world.groups[m.hull.groupIndex]!.polys.map(i=>world.polys[i]!).find(p=>p.normal.y<-.9)!;
 const at=floor.vertices.reduce((a,v)=>({x:a.x+v.x/3,y:a.y+v.y/3,z:a.z+v.z/3}),{x:0,y:0,z:0});
 const rider=createPlayer(at.x*32,at.y*32-2000,at.z*32),runtime=createRuntime(),ground=groundFromCollision(world);
 ground.beforeMove=()=>moveToyBarnPlatforms(platforms,world,rider);
 let contactTicks=0;
 for(let t=0;t<180;t++){
  stepPlayer(rider,NO_INPUT,runtime,ground,0);stepToyBarnPlatforms(platforms,()=>0,()=>0);
  if(rider.onGround&&rider.contacts.some(c=>c.group===m.hull.groupIndex))contactTicks++;
 }
 assert(contactTicks>100,`platform ${i}: physical rider lost floor (${contactTicks} contacts)`);
}
console.log('PASS actual collision landing and riding on all six installed platforms');
