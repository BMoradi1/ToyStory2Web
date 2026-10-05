import assert from 'node:assert/strict';
import {alleyWaterY} from '../src/sim/alley-effects.ts';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision} from '../src/formats/collision.ts';
import {createPlayer,createRuntime,groundFromCollision,stepPlayer,NO_INPUT} from '../src/sim/player.ts';
import {createAlleyPlatforms,moveAlleyPlatforms,stepAlleyPlatforms,restoreAlleyPlatforms,alleyPlatformPoses,alleyPathPoint} from '../src/sim/alley-platforms.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level05/level.dat'));
const world=()=>buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level05/TERRAIN.ALL'))).groups);
const w=world(),s=createAlleyPlatforms(dat,w),p=createPlayer(1e8,0,1e8);
const start=s.movers.map(m=>({...m.position}));
assert.deepEqual(alleyPathPoint([{x:0,y:0,z:0},{x:-3,y:7,z:10}],2048),{x:-1,y:3,z:5});
for(let t=0;t<6000;t++){
 moveAlleyPlatforms(s,w,p);stepAlleyPlatforms(s,w,p);
 for(const m of s.movers){assert.deepEqual(w.groups[m.hull.groupIndex]!.position,{x:m.position.x/32,y:m.position.y/32,z:m.position.z/32});assert(Math.hypot(m.velocity.x,m.velocity.y,m.velocity.z)<m.speed*4+3);}
}
assert(s.movers.every(m=>m.wraps>0),'all eight paths must recycle');
assert.equal(alleyPlatformPoses(s).length,12);
for(let i=0;i<8;i++){
 const a=s.movers[i]!,b=s.movers[i^1]!;p.climbGroup=a.hull.groupIndex;
 const phases=[a.phase,b.phase];stepAlleyPlatforms(s,w,p);
 assert.deepEqual([a.phase,b.phase],phases);assert.deepEqual(a.velocity,{x:0,y:0,z:0});assert.deepEqual(b.velocity,{x:0,y:0,z:0});
}
p.climbGroup=-1;
for(const mode of ['standing','climbing','airborne']){
 const m=s.movers[0]!;m.velocity={x:128,y:-32,z:64};p.onGround=mode==='standing';p.climb=mode==='climbing'?1:0;p.climbGroup=p.climb?m.hull.groupIndex:-1;
 p.contacts=p.onGround?[{group:m.hull.groupIndex,normal:{x:0,y:-1,z:0}} as any]:[];
 const before={x:p.x,y:p.y,z:p.z};moveAlleyPlatforms(s,w,p);const f=mode==='airborne'?0:1;
 assert.deepEqual({x:p.x,y:p.y,z:p.z},{x:before.x+128*f,y:before.y-32*f,z:before.z+64*f});
}
restoreAlleyPlatforms(s,w);for(const m of s.movers)for(const b of m.hull.polys)assert.deepEqual(w.polys[b.index]!.vertices,b.vertices);
assert.deepEqual(createAlleyPlatforms(dat,w).movers.map(m=>m.position),start);
console.log('PASS eight installed Alley paths: full cycles, speeds, interpolation, paired ledge freeze, 12 artwork poses, carry and collision reset');
for(let i=0;i<8;i++){
 const w=world(),s=createAlleyPlatforms(dat,w),m=s.movers[i]!;
 const floor=w.groups[m.hull.groupIndex]!.polys.map(i=>w.polys[i]!).find(p=>p.normal.y<-.9)!;assert(floor);
 const at=floor.vertices.reduce((a,v)=>({x:a.x+v.x/3,y:a.y+v.y/3,z:a.z+v.z/3}),{x:0,y:0,z:0});
 const rider=createPlayer(at.x*32,at.y*32-2000,at.z*32),runtime=createRuntime(),ground=groundFromCollision(w);ground.beforeMove=()=>moveAlleyPlatforms(s,w,rider);
 let contacts=0;
 for(let t=0;t<180;t++){ground.waterY=alleyWaterY(rider.z);stepPlayer(rider,NO_INPUT,runtime,ground,0);stepAlleyPlatforms(s,w,rider);if(rider.onGround&&rider.contacts.some(c=>c.group===m.hull.groupIndex))contacts++;}
 assert(contacts>100,`platform ${i}: physical rider lost floor (${contacts} contacts)`);
}
console.log('PASS actual collision landing/riding on all eight Alley platforms');
