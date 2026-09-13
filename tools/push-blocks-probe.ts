/** Actual level-1 push collision and movement regression. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {parseCollision,buildCollisionWorld,collisionGroupByObject,groundBelow,moveCollisionGroup} from '../src/formats/collision.ts';
import {PUSH_BLOCKS} from '../src/sim/level-data.ts';
import {createPushBlocks,stepPushBlocks} from '../src/sim/push-blocks.ts';
import {createPlayer,createRuntime,stepPlayer,NO_INPUT,groundFromCollision} from '../src/sim/player.ts';
import {sin,cos} from '../src/sim/trig.ts';
const root=join(process.argv[2]??'Toy Story 2','data/level01');
const dat=parseDat(readFileSync(join(root,'level.dat')));
const world=buildCollisionWorld(parseCollision(parseAll(readFileSync(join(root,'TERRAIN.ALL')))).groups);
const state=createPushBlocks(PUSH_BLOCKS[1]!,tag=>dat.paths.find(p=>p.id===tag)?.points.map(p=>({x:p.x*32,y:p.y*32,z:p.z*32}))??null,id=>collisionGroupByObject(world,id),1);
const b=state.blocks[0]!, start={x:b.x,y:b.y,z:b.z};
const verts=world.groups[b.group]!.polys.flatMap(i=>world.polys[i]!.vertices);
const original=verts.map(v=>({...v}));
const reach=(Math.max(Math.max(...verts.map(v=>v.x))-Math.min(...verts.map(v=>v.x)),Math.max(...verts.map(v=>v.z))-Math.min(...verts.map(v=>v.z)))/2+80)*32;
const x=b.x-sin(b.segYaw)/16384*reach,z=b.z-cos(b.segYaw)/16384*reach;
const floor=groundBelow(world,x/32,(b.y-4000)/32,z/32)!;
const p=createPlayer(x,floor.y*32,z,b.segYaw),rt=createRuntime(),ground=groundFromCollision(world);
let heldTicks=0;
ground.beforeMove=(_,input)=>{
  const result=stepPushBlocks(state,{...p,busy:p.jumpState!==0},Math.hypot(input.moveX,input.moveY)>0);
  if(state.held)heldTicks++;
  for(const m of result.moved){const block=state.blocks.find(b=>b.index===m.index)!;moveCollisionGroup(world,block.group,m.dx/32,m.dy/32,m.dz/32);}
  if(result.playerVelocity){p.vx=result.playerVelocity.x;p.vz=result.playerVelocity.z;}
};
for(let t=0;t<80;t++)stepPlayer(p,{...NO_INPUT,moveY:1},rt,ground,b.segYaw);
assert(heldTicks>50);assert(b.run>500);assert(p.x-x>10000);
assert(p.contacts.some(c=>c.group===b.group&&Math.abs(c.normal.y)<0.5));
assert(Math.abs(p.x-b.x-state.offsetX*32)<8,'Buzz keeps the push offset');
for(let i=0;i<verts.length;i++){
  assert.equal(verts[i]!.x-original[i]!.x,(b.x-start.x)/32,'every vertex moves once, in level units');
  assert.equal(verts[i]!.z-original[i]!.z,(b.z-start.z)/32);
}
stepPlayer(p,NO_INPUT,rt,ground,b.segYaw);assert.equal(state.held,0);
const stopped=b.run;for(let i=0;i<10;i++)stepPlayer(p,NO_INPUT,rt,ground,b.segYaw);assert.equal(b.run,stopped);
const object=dat.objects[dat.objectIds[b.sceneObject]!]!;assert(object,'real crate artwork resolves');
// Tipping completes independently and ends at the landing node.
const drop=state.blocks[3]!;drop.run=drop.tipPoint;drop.tipPoint=-1;state.held=0;
for(let i=0;i<300;i++)stepPushBlocks(state,{...p,busy:true},false);
assert.equal(drop.fallSpeed,0);assert.equal(drop.seg,2);assert.equal(drop.y,drop.path[2]!.y);
console.log(`PASS: ${heldTicks} held ticks; Buzz, crate and all collision vertices stay aligned; release stops push`);
