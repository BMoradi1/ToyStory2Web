/** Run with tsx tools/stomp-probe.ts 'Toy Story 2'. Local assets stay read-only. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseAll} from '../src/formats/all.ts';
import {parseDat} from '../src/formats/dat.ts';
import {parseCollision,buildCollisionWorld} from '../src/formats/collision.ts';
import {createPlayer,createRuntime,stepPlayer,NO_INPUT,flatGround,groundFromCollision,JumpState} from '../src/sim/player.ts';
import {selectState} from '../src/sim/player-animation.ts';
import {attackFromPlayer,DAMAGE} from '../src/sim/creatures.ts';
import {createPushBlocks,stepPushBlocks} from '../src/sim/push-blocks.ts';
import {PUSH_BLOCKS} from '../src/sim/level-data.ts';
import {createStompProps,stepStompProps,standingSurface} from '../src/sim/stomp-props.ts';
const root=process.argv[2]??'Toy Story 2';
const p=createPlayer(0,-24000,0),rt=createRuntime(),ground=flatGround(0);
p.jumpState=JumpState.Rising;
stepPlayer(p,{...NO_INPUT,spin:true,moveX:1},rt,ground,0);
assert(p.stomp>0);assert.equal(selectState(p,true),23);assert.equal(p.y,-24000);assert.equal(p.vx,0);
assert.equal(attackFromPlayer(p).kind,0,'wind-up does not damage');
for(let i=0;i<12;i++)stepPlayer(p,{...NO_INPUT,moveX:1,fire:true,jump:true},rt,ground,0);
assert.equal(p.y,-24000);assert.equal(p.laser,0);
stepPlayer(p,NO_INPUT,rt,ground,0);
assert.equal(p.vy,2048);assert.equal(attackFromPlayer(p).kind,DAMAGE.dive);
let impacts=0;
for(let i=0;i<30&&!p.onGround;i++){stepPlayer(p,NO_INPUT,rt,ground,0);if(p.stompImpact)impacts++;}
assert.equal(impacts,1);assert.equal(p.stomp,-40);assert.equal(selectState(p,false),24);
for(let i=0;i<25;i++)stepPlayer(p,{...NO_INPUT,moveX:1,spin:true},rt,ground,0);
assert.equal(p.stomp,-15);assert.equal(p.x,0);
stepPlayer(p,{...NO_INPUT,moveX:1},rt,ground,0);assert(p.vx>0,'recovery tail allows movement');
assert.equal(p.stompImpact,false);assert.equal(p.spin,0);
const held=createPlayer(0,-10000,0);held.jumpState=JumpState.Rising;
const heldRt=createRuntime();heldRt.previous.spin=true;
stepPlayer(held,{...NO_INPUT,spin:true},heldRt,ground,0);assert.equal(held.stomp,0,'fresh press required');
const laser=createPlayer(0,-10000,0);laser.jumpState=JumpState.Rising;laser.laser=4;laser.laserCharge=30;
stepPlayer(laser,{...NO_INPUT,spin:true},createRuntime(),ground,0);
assert(laser.stomp>0);assert.equal(laser.laser,0,'stomp cancels a pending laser');
const hit=createPlayer(0,-10000,0);hit.stomp=14;hit.hitStun=30;
stepPlayer(hit,NO_INPUT,createRuntime(),ground,0);assert.equal(hit.stomp,0,'damage cancels');

function scene(level:number){
 const dir=`${root}/data/level0${level}/`;
 return {world:buildCollisionWorld(parseCollision(parseAll(readFileSync(dir+'TERRAIN.ALL'))).groups),dat:parseDat(readFileSync(dir+'level.dat'))};
}
function land(level:number,surface:number){
 const {world,dat}=scene(level),state=createStompProps();
 const g=world.groups.findIndex(g=>g.surface===surface);assert(g>=0,`surface ${surface} exists`);
 const poly=world.groups[g]!.polys.map(i=>world.polys[i]!).find(p=>p.normal.y<-.99)!;
 const v=poly.vertices;const at={x:v.reduce((n,v)=>n+v.x,0)/3,y:v.reduce((n,v)=>n+v.y,0)/3,z:v.reduce((n,v)=>n+v.z,0)/3};
 const buzz=createPlayer(at.x*32,at.y*32-20000,at.z*32);buzz.jumpState=JumpState.Rising;
 const run=createRuntime(),floor=groundFromCollision(world);
 stepPlayer(buzz,{...NO_INPUT,spin:true},run,floor,0);
 for(let i=0;i<80&&!buzz.stompImpact;i++)stepPlayer(buzz,NO_INPUT,run,floor,0);
 assert(buzz.stompImpact,`land on ${surface}`);assert.equal(standingSurface(buzz,world),surface);
 stepStompProps(state,level,buzz,world,dat,level===4?{x:(surface-33)*700*32+10300*32,y:-4000*32,z:19050*32}:undefined);
 return {world,dat,state,buzz,run,floor};
}
const chair=land(1,8);assert.equal(chair.state.chair,3);
for(let i=0;i<4;i++) {stepPlayer(chair.buzz,NO_INPUT,chair.run,chair.floor,0);stepStompProps(chair.state,1,chair.buzz,chair.world,chair.dat);}
assert.deepEqual(chair.state.guidesSpent,[0]);
assert(chair.buzz.launched);assert.equal(chair.buzz.vy,-4736);assert.equal(chair.buzz.stomp,0);
stepPlayer(chair.buzz,NO_INPUT,chair.run,chair.floor,0);
assert(chair.buzz.vy< -4000);assert(Math.hypot(chair.buzz.vx,chair.buzz.vz)>2800,'spring speed survives regular movement clamp');
for(const surface of [33,34,35]) {
 const paint=land(4,surface);assert.deepEqual(paint.state.guidesSpent,[0,1,2]);assert.equal(paint.state.paint.button,surface-31);assert.equal(paint.state.paint.cooldown,59);
}
const {world,dat}=scene(4);
const misplaced=createStompProps(),buttonBuzz=createPlayer();buttonBuzz.onGround=true;buttonBuzz.stompImpact=true;
buttonBuzz.contacts=[{group:world.groups.findIndex(g=>g.surface===33),normal:{x:0,y:-1,z:0}}];
stepStompProps(misplaced,4,buttonBuzz,world,dat,{x:7300*32,y:-4000*32,z:19050*32});
assert.equal(misplaced.paint.first,0,'a stomp cannot fill a bucket away from the outlet');
buttonBuzz.stompImpact=false;
for(let i=0;i<60;i++)stepStompProps(misplaced,4,buttonBuzz,world,dat,{x:7300*32,y:-4000*32,z:19050*32});
stepStompProps(misplaced,4,buttonBuzz,world,dat,{x:10300*32,y:-4000*32,z:19050*32});
assert.equal(misplaced.paint.cooldown,0,'standing on the button does not retrigger it');
for(const reverse of [false,true]) {
 const state=createStompProps(),buzz=createPlayer(),bucket={x:0,y:-4000*32,z:19050*32};buzz.onGround=true;
 const cues:number[]=[];
 const tick=()=>{stepStompProps(state,4,buzz,world,dat,bucket);if(state.sequence!==null)cues.push(state.sequence);buzz.stompImpact=false;};
 const fill=(colour:number)=>{
   bucket.x=dat.paths.find(p=>p.id===3)!.points[colour+3]!.x*32;
   buzz.contacts=[{group:world.groups.findIndex(g=>g.surface===32+colour),normal:{x:0,y:-1,z:0}}];
   buzz.stompImpact=true;tick();for(let i=0;i<60;i++)tick();
 };
 for(const [target,pair] of [[0,[1,2]],[1,[1,3]],[2,[2,3]]] as const){
   for(const c of reverse?[...pair].reverse():pair)fill(c);
   bucket.x=dat.paths.find(p=>p.id===3)!.points[target]!.x*32;tick();
   assert(state.paint.solved&(1<<target));for(let i=0;i<32;i++)tick();
 }
 assert.equal(state.paint.solved,7);
 assert.deepEqual(cues,[-5,-5,-5]);
 fill(1);fill(1);assert.equal(cues.at(-1),-6);assert.equal(state.paint.first,0,'same colour drains instead of getting stuck');
}
console.log('PASS: stomp timing, recovery, damage, interruption; real chair and three paint surfaces; all mixes in both orders and duplicate-colour reset.');

// A flat rail's endpoint is not a drop. The bucket must also push back again.
const buckets=createPushBlocks(PUSH_BLOCKS[4]!,tag=>dat.paths.find(p=>p.id===tag)!.points.map(p=>({x:p.x*32,y:p.y*32,z:p.z*32})),id=>world.groups.findIndex(g=>g.objectNumber===id),4);
const b=buckets.blocks[0]!,body=createPlayer(b.x-10000,b.y,b.z,1024);body.onGround=true;
body.contacts=[{group:b.group,normal:{x:-1,y:0,z:0}}];
for(let i=0;i<500;i++)stepPushBlocks(buckets,{...body,busy:false},true);
assert.equal(b.seg,b.path.length-2);assert.equal(b.tipPoint,0);assert.equal(b.fallSpeed,0);
assert.equal(b.x,11700*32);
stepPushBlocks(buckets,{...body,busy:false},false);
body.yaw=3072;body.contacts=[{group:b.group,normal:{x:1,y:0,z:0}}];
for(let i=0;i<500;i++)stepPushBlocks(buckets,{...body,busy:false},true);
assert.equal(b.seg,0);assert.equal(b.x,7300*32);
console.log('PASS: paint bucket reaches both rail endpoints and reverses without tipping.');
