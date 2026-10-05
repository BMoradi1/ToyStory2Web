import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision} from '../src/formats/collision.ts';
import {createPlayer,createRuntime,groundFromCollision,stepPlayer,NO_INPUT} from '../src/sim/player.ts';
import {createNeighborhoodPump,moveNeighborhoodPump,stepNeighborhoodPump,restoreNeighborhoodPump,neighborhoodLiquid} from '../src/sim/neighborhood-pump.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level02/level.dat')),w=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level02/TERRAIN.ALL'))).groups),s=createNeighborhoodPump(dat,w),p=createPlayer(0,0,0),rt=createRuntime(),ground=groundFromCollision(w);
let guides=0,splashes=0;const sounds:number[]=[];
const tick=()=>stepNeighborhoodPump(s,w,p,{cameraZone:1,cameraY:0,guide:()=>guides++,sound:id=>sounds.push(id),splash:()=>splashes++});
const group=w.groups.findIndex(g=>g.surface===11),floor=w.groups[group]!.polys.map(i=>w.polys[i]!).find(p=>p.normal.y<-.75)!,at=floor.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});
Object.assign(p,{x:at.x,y:at.y-16000,z:at.z});
for(let t=0;t<100&&s.target===0;t++){stepPlayer(p,NO_INPUT,rt,ground,0);tick();}
assert.equal(s.target,3072);assert.equal(guides,1);assert(sounds.includes(0x38));
for(let t=0;t<1000&&s.inflation!==4096;t++){
 const jump=t%32===0;moveNeighborhoodPump(s,w,p);stepPlayer(p,{...NO_INPUT,jump},rt,ground,0);tick();
}
assert.equal(s.inflation,4096,'repeated real jumps did not inflate prop');assert.equal(sounds.filter(id=>id===0xb).length,1);
const start={...s.position};let carried=0;
for(let t=0;t<300;t++){
 // Stand a rider on the moving hull, then verify the native pending motion.
 p.onGround=true;p.climb=0;p.contacts=[{group:s.hull.groupIndex,normal:{x:0,y:-1,z:0}}];p.stomp=0;
 const before={x:p.x,y:p.y},v={...s.pending};moveNeighborhoodPump(s,w,p);assert.equal(p.x-before.x,v.x);assert.equal(p.y-before.y,v.y);if(v.x||v.y)carried++;
 tick();assert.equal(w.groups[s.hull.groupIndex]!.position!.x*32,s.hullPosition.x);
}
assert(carried>200);assert(s.position.x>start.x+80000);assert(splashes>0);assert(sounds.includes(0x39));assert.equal(s.vx,0);
assert.deepEqual(neighborhoodLiquid(-0x246ff),{y:6144,kind:2});assert.deepEqual(neighborhoodLiquid(-0x24700),{y:17408,kind:1});
p.x=-300000;stepNeighborhoodPump(s,w,p,{cameraZone:1,cameraY:17409,guide:()=>{},sound:()=>{},splash:()=>{}});assert.deepEqual(s.objects[2]!.scale,[0,0,0]);tick();assert.deepEqual(s.objects[2]!.scale,[1,1,1]);
restoreNeighborhoodPump(s,w);assert.deepEqual(w.groups[s.hull.groupIndex]!.position,s.hull.origin);const reset=createNeighborhoodPump(dat,w);assert.equal(reset.inflation,4095);assert.equal(reset.pump,0);
console.log('PASS Neighborhood pump: real landing/repeated jumps, inflation/cue, moving hull/rider carry, buoyancy splashes, water/mud boundary, water visibility and reset');
