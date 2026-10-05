import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision,collisionGroupByObject,sweepSphere} from '../src/formats/collision.ts';
import {PUSH_BLOCKS} from '../src/sim/level-data.ts';
import {createPushBlocks} from '../src/sim/push-blocks.ts';
import {createPlayer} from '../src/sim/player.ts';
import {createAlleyBridge,stepAlleyBridge,restoreAlleyBridge} from '../src/sim/alley-bridge.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level05/level.dat'));
const w=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level05/TERRAIN.ALL'))).groups);
const push=createPushBlocks(PUSH_BLOCKS[5]!,tag=>dat.paths.find(p=>p.id===tag)?.points.map(p=>({x:p.x*32,y:p.y*32,z:p.z*32}))??null,id=>collisionGroupByObject(w,id),5);
const s=createAlleyBridge(dat,w),p=createPlayer(0,0,0);
function cast(h:typeof s.open){const poly=w.polys[h.polys[0]!.index]!,n=poly.normal,at=poly.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});return sweepSphere(w,{x:at.x+n.x*2000,y:at.y+n.y*2000,z:at.z+n.z*2000},{x:-n.x*4000,y:-n.y*4000,z:-n.z*4000},100,{groups:new Set([h.groupIndex])}).contacts.length;}
assert.equal(cast(s.open),0);assert(cast(s.trigger)>0);
push.blocks[1]!.run=12;stepAlleyBridge(s,w,p,push);assert.equal(push.blocks[1]!.run,0);assert.equal(s.angle,0);
push.blocks[2]!.run=12;push.held=3;p.vx=p.vz=200;stepAlleyBridge(s,w,p,push);assert.equal(s.angle,1);assert.equal(push.held,0);assert.equal(p.vx,0);assert.equal(p.vz,0);assert.equal(cast(s.trigger),0);assert(cast(s.open)>0);
let bursts=0;for(let t=0;t<100;t++){stepAlleyBridge(s,w,p,push);bursts+=Number(s.burst);}
assert.equal(s.angle,1024);assert.equal(bursts,1);assert(s.objects.filter(o=>o.id>=41).every(o=>o.scale.every(v=>v===0)));
push.blocks[1]!.run=12;stepAlleyBridge(s,w,p,push);assert.equal(push.blocks[1]!.run,12);
assert.deepEqual(push.blocks.filter(b=>b.sceneObject>=0).map(b=>b.sceneFollowers),[[15],[1],[52]]);
restoreAlleyBridge(s,w);assert(cast(s.trigger)>0);assert(cast(s.open)>0);for(const h of [s.trigger,s.open])for(const q of h.polys)assert.deepEqual(w.polys[q.index]!.vertices,q.vertices);
console.log('PASS Alley bridge: installed push trigger, real collision swap, blocked/released crate, accelerated quarter-turn, one-shot debris event, distant crate mappings and restoration');
