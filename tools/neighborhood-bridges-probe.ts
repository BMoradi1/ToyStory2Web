import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision,sweepSphere,moveCollisionGroup,captureCollisionGroup,transformCollisionGroup,setCollisionGroupEnabled,collisionGroupByObject} from '../src/formats/collision.ts';
import {createNeighborhoodBridges,stepNeighborhoodBridges,restoreNeighborhoodBridges} from '../src/sim/neighborhood-bridges.ts';
import {createPushBlocks} from '../src/sim/push-blocks.ts';
import {PUSH_BLOCKS} from '../src/sim/level-data.ts';
import {createPlayer} from '../src/sim/player.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level02/level.dat'));
const w=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level02/TERRAIN.ALL'))).groups);
const push=createPushBlocks(PUSH_BLOCKS[2]!,tag=>dat.paths.find(p=>p.id===tag)?.points.map(p=>({x:p.x*32,y:p.y*32,z:p.z*32}))??null,id=>collisionGroupByObject(w,id),2);
let s=createNeighborhoodBridges(dat,w);const p=createPlayer(0,0,0);
function cast(group:number){const poly=w.polys[w.groups[group]!.polys[0]!]!,n=poly.normal,at=poly.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});return sweepSphere(w,{x:at.x+n.x*2000,y:at.y+n.y*2000,z:at.z+n.z*2000},{x:-n.x*4000,y:-n.y*4000,z:-n.z*4000},100,{groups:new Set([group])}).contacts.length;}

const tick=()=>stepNeighborhoodBridges(s,w,p,push);
const hit=(id:number)=>cast(s.groups.get(id)!);
assert.equal(hit(4),0);assert.equal(hit(12),0);assert(hit(2)&&hit(3)&&hit(11));
for(let i=0;i<100;i++)tick();assert.equal(s.firstAngle,750);
push.held=1;for(let i=0;i<21;i++)tick();assert.equal(s.firstAngle,666);assert(hit(2));
tick();assert.equal(s.firstAngle,662);assert.equal(push.held,0);assert.equal(hit(2),0);assert.equal(hit(3),0);assert(hit(4));
let bounces=0;for(let i=0;i<500;i++){tick();bounces+=s.sounds.filter(id=>id===5).length;}
assert(bounces>0);assert.equal(s.firstAngle,0);assert.equal(s.firstSpeed,-2147483648);
assert(s.objects.filter(o=>o.id<12).every(o=>o.angles[2]===0));
push.blocks[1]!.run=12;p.y=-0x102f9;tick();assert.equal(push.blocks[1]!.run,0);assert.equal(s.secondAngle,0);
p.y--;push.blocks[1]!.run=1;push.held=2;p.vx=500;p.vz=-500;tick();assert.equal(s.secondAngle,1);assert.equal(push.held,0);assert.equal(p.vx,0);assert.equal(p.vz,0);assert.equal(hit(11),0);assert(hit(12));
let completed=0;for(let i=0;i<100;i++){push.held=2;tick();assert.equal(push.held,0);completed+=s.sounds.filter(id=>id===30).length;}
assert.equal(completed,1);assert.equal(s.secondAngle,581);assert(s.objects.filter(o=>o.id>=30).every(o=>o.angles[2]===3514));
restoreNeighborhoodBridges(s,w);assert(hit(2)&&hit(3)&&hit(4)&&hit(11)&&hit(12));
s=createNeighborhoodBridges(dat,w);assert.equal(s.firstAngle,750);assert.equal(s.secondAngle,0);assert.equal(hit(4),0);assert.equal(hit(12),0);
console.log('PASS Neighborhood bridges: held trigger, threshold swap, rebound/settle, strict height/run trigger, velocity/release, near/far angles, completion cue, actual hull casts and reset');
