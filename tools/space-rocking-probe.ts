import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {parseCollision,buildCollisionWorld,collisionGroupByObject,moveCollisionGroup} from '../src/formats/collision.ts';
import {PUSH_BLOCKS} from '../src/sim/level-data.ts';
import {createPushBlocks,stepPushBlocks} from '../src/sim/push-blocks.ts';
import {createPlayer,createRuntime,stepPlayer,groundFromCollision,NO_INPUT} from '../src/sim/player.ts';
import {createSpaceRockingBlock,stepSpaceRockingBlock,SPACE_ROCKING_BOX as box} from '../src/sim/space-rocking-block.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level08/level.dat'));
const w=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level08/TERRAIN.ALL'))).groups);
const fresh=()=>createPushBlocks(PUSH_BLOCKS[8]!,id=>dat.paths.find(p=>p.id===id)?.points.map(p=>({x:p.x*32,y:p.y*32,z:p.z*32}))??null,id=>collisionGroupByObject(w,id),8);
const blocks=fresh(),b=blocks.blocks[2]!,s=createSpaceRockingBlock();
for(const b of blocks.blocks){const at=w.groups[b.group]!.position!;moveCollisionGroup(w,b.group,b.x/32-at.x,b.y/32-at.y,b.z/32-at.z);}
const p=createPlayer(b.x,b.y-20000,b.z),rt=createRuntime(),ground=groundFromCollision(w);
for(let t=0;t<120&&!s.tipped;t++){
 stepPlayer(p,NO_INPUT,rt,ground,0);stepSpaceRockingBlock(s,p,4,t,blocks);
}
assert(s.tipped,'landing on installed block collision must release its slide');assert.equal(b.tipPoint,-1);assert.equal(s.pitch,0);
assert(p.onGround);console.log('Rocking block landing',p.x,p.y,p.z);
const start={x:b.x,y:b.y,z:b.z};let fell=false,landed=false;
for(let t=0;t<300&&!landed;t++){
 const result=stepPushBlocks(blocks,{x:0,y:0,z:0,yaw:0,onGround:false,busy:false,contacts:[]},false);
 for(const m of result.moved){const block=blocks.blocks[m.index]!;moveCollisionGroup(w,block.group,m.dx/32,m.dy/32,m.dz/32);}
 fell ||= b.fallSpeed>0;landed=fell&&b.fallSpeed===0;
 assert.equal(w.groups[b.group]!.position!.y,b.y/32);
}
assert(fell&&landed);assert.equal(b.floorSeg,2);assert.equal(b.y,0);assert.equal(b.z,9368*32);assert.equal(b.x,start.x);
stepSpaceRockingBlock(s,p,4,16,blocks);assert.equal(b.tipPoint,0,'landing trigger fires once');assert.equal(s.pitch,0);
for(const candidate of [{...p,onGround:false},{...p,y:box.yMax},{...p,x:box.xMin},{...p,x:box.xMax},{...p,z:box.zMin},{...p,z:box.zMax}]){
 const state=createSpaceRockingBlock();stepSpaceRockingBlock(state,candidate,4,16,fresh());assert(!state.tipped);assert.equal(state.pitch,128);
}
const untouched=createSpaceRockingBlock();stepSpaceRockingBlock(untouched,p,3,16,fresh());assert.equal(untouched.pitch,0);assert(!untouched.tipped);
for(const b of blocks.blocks.slice(0,2)){
 assert.equal(b.sceneFollowers.length,1);const far=dat.objects[dat.objectIds[b.sceneFollowers[0]!]!]!;assert.equal(far.unitScale,4);
}
assert.equal(fresh().blocks[2]!.seg,0);
console.log('PASS: real landing trigger, strict height/XZ/ground/room gates, rocking pitch, one-shot slide/drop with moving collision, far-art links and reset');
