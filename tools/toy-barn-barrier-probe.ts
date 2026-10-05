import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision,sweepSphere} from '../src/formats/collision.ts';
import {createToyBarnBarrier,stepToyBarnBarrier,restoreToyBarnBarrier} from '../src/sim/toy-barn-barrier.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level07/level.dat'));
const w=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level07/TERRAIN.ALL'))).groups),s=createToyBarnBarrier(dat,w);
const poly=w.polys[s.hull.polys[0]!.index]!,n=poly.normal;
const at=poly.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});
const cast=()=>sweepSphere(w,{x:at.x+n.x*2000,y:at.y+n.y*2000,z:at.z+n.z*2000},{x:-n.x*4000,y:-n.y*4000,z:-n.z*4000},100,{groups:new Set([s.hull.groupIndex])});
assert(cast().contacts.length>0,'closed barrier did not block actual sweep');
stepToyBarnBarrier(s,w,1,0);assert.equal(s.height,512);assert.equal(s.enabled,false);assert.equal(cast().contacts.length,0);
for(let i=1;i<32;i++)stepToyBarnBarrier(s,w,2,0);assert.equal(s.height,16384);
for(let i=0;i<31;i++){stepToyBarnBarrier(s,w,0,1);assert(!s.enabled);}
assert.equal(s.height,512);stepToyBarnBarrier(s,w,0,1);assert.equal(s.height,0);assert(s.enabled);assert(cast().contacts.length>0);
// A timeout closes either run; completion of the second leaves it open.
for(let i=0;i<32;i++)stepToyBarnBarrier(s,w,2,1);
for(let i=0;i<100;i++)stepToyBarnBarrier(s,w,0,2);assert.equal(s.height,16384);assert(!s.enabled);
restoreToyBarnBarrier(s,w);assert(cast().contacts.length>0);for(const b of s.hull.polys)assert.deepEqual(w.polys[b.index]!.vertices,b.vertices);
console.log('PASS installed barrier real collision sweeps, 32-tick open/close, early collision disable, first completion/timeout close, second completion stays open and restore');
