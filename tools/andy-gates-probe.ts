import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision,sweepSphere,moveCollisionGroup,captureCollisionGroup,transformCollisionGroup,setCollisionGroupEnabled,collisionGroupByObject} from '../src/formats/collision.ts';
import {createAndyGates,stepAndyGates,restoreAndyGates} from '../src/sim/andy-gates.ts';
import {createPushBlocks} from '../src/sim/push-blocks.ts';
import {PUSH_BLOCKS} from '../src/sim/level-data.ts';
import {createPlayer} from '../src/sim/player.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level01/level.dat'));
const w=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level01/TERRAIN.ALL'))).groups);
const push=createPushBlocks(PUSH_BLOCKS[1]!,tag=>dat.paths.find(p=>p.id===tag)?.points.map(p=>({x:p.x*32,y:p.y*32,z:p.z*32}))??null,id=>collisionGroupByObject(w,id),1);
let s=createAndyGates(dat,w);const p=createPlayer(300000,1000,-340000);p.coyote=6;
function cast(group:number){const poly=w.polys[w.groups[group]!.polys[0]!]!,n=poly.normal,at=poly.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});return sweepSphere(w,{x:at.x+n.x*2000,y:at.y+n.y*2000,z:at.z+n.z*2000},{x:-n.x*4000,y:-n.y*4000,z:-n.z*4000},100,{groups:new Set([group])}).contacts.length;}
const tick=()=>stepAndyGates(s,w,p,push);
assert.equal(cast(s.doorway),0);assert.equal(cast(s.landing),0);assert(cast(s.hatch)>0);
assert.equal(s.objects[0]!.scale[0],0);assert.equal(s.objects[1]!.position.x,s.objects[0]!.rest.x);assert.deepEqual(s.objects[1]!.scale,[1,1,1]);
for(const [key,value] of [['x',0x46376],['x',0x4cbb6],['z',-321858],['z',-361602],['y',0],['y',0x4800],['coyote',0]] as const){const old=p[key];p[key]=value;tick();assert.equal(s.growth,0,`strict trigger ${key} ${value}`);p[key]=old;}
tick();assert.equal(s.growth,8);assert(cast(s.doorway)>0);assert.equal(s.objects[0]!.scale[0],0,'first trigger only arms growth');
tick();assert.equal(s.growth,72);for(let i=0;i<64;i++)tick();assert.equal(s.growth,4096);assert.equal(s.objects[0]!.scale[0],1);
push.blocks[3]!.run=12;tick();assert.equal(s.hatchAngle,0,'ordinary sliding opened hatch');
push.blocks[3]!.tipPoint=-1;tick();assert.equal(s.hatchAngle,16);assert.equal(cast(s.hatch),0);assert(cast(s.landing)>0);
for(let i=0;i<40;i++)tick();assert.equal(s.hatchAngle,512);
const rest=captureCollisionGroup(w,s.hatch);moveCollisionGroup(w,s.hatch,200,100,300);assert.equal(cast(s.hatch),0,'translation re-enabled disabled hull');transformCollisionGroup(w,rest,rest.origin,1,.4,.2);assert.equal(cast(s.hatch),0,'rotation re-enabled disabled hull');
setCollisionGroupEnabled(w,s.hatch,true);assert(cast(s.hatch)>0);const cells=JSON.stringify([...w.cells]);setCollisionGroupEnabled(w,s.hatch,true);assert.equal(JSON.stringify([...w.cells]),cells,'re-enable duplicated index');
transformCollisionGroup(w,rest,rest.origin,0);restoreAndyGates(s,w);assert(cast(s.doorway)>0&&cast(s.hatch)>0&&cast(s.landing)>0);
s=createAndyGates(dat,w);assert.equal(s.hatchAngle,0);assert.equal(s.growth,0);assert.equal(cast(s.doorway),0);assert.equal(cast(s.landing),0);
push.blocks[3]!.tipPoint=0;push.blocks[3]!.fallSpeed=1;tick();assert.equal(s.hatchAngle,16,'fall-speed trigger missing');
console.log('PASS Andy doorway strict bounds/grace/growth/child placement, falling-only hatch, real collision swaps, disabled translation/rotation, idempotent enable and reset');
