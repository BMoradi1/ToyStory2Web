/** Installed outdoor lids: phase boundaries, collision toggles and slam effects. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision} from '../src/formats/collision.ts';
import {createPaintCans,stepPaintCans,restorePaintCans} from '../src/sim/paint-cans.ts';
import {RandomStream} from '../src/sim/creatures.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level04/level.dat'));
const make=()=>{
 const world=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level04/TERRAIN.ALL'))).groups);
 const before=JSON.stringify([...world.cells].map(([k,v])=>[k,[...v].sort((a,b)=>a-b)]).sort());
 const state=createPaintCans(dat,world),effects:any[]=[],sounds:number[]=[],shakes:number[]=[];
 const host={rand:new RandomStream(new Uint8Array([16,200])),sound:(n:number)=>sounds.push(n),shake:(n:number)=>shakes.push(n),
  effect:(at:any,kind:number,mode:number)=>{const e:any={...at,kind,mode};effects.push(e);return e;}};
 return {world,state,before,host,effects,sounds,shakes};
};
const present=(w:any,c:any)=>[...w.cells.values()].some((cell:any)=>cell.some((i:number)=>c.hull.polys.some((p:any)=>p.index===i)));
for(let index=0;index<3;index++){
 const {world,state,before,host,effects,sounds,shakes}=make(),c=state.cans[index]!;
 assert.equal(c.clock,index*33);assert(!present(world,c));
 const original=JSON.stringify(c);stepPaintCans(state,{x:1e8,y:1e8,z:1e8},world,host);assert.equal(JSON.stringify(c),original,'far cans freeze');
 const p={...c.lid.rest};c.clock=0;
 const tick=(n=1)=>{for(let i=0;i<n;i++)stepPaintCans(state,p,world,host);};
 tick(4);assert(c.active&&present(world,c));assert.equal(c.lid.position.y,c.lid.rest.y-4096);
 tick();assert(!c.active&&!present(world,c));
 tick(45);assert.equal(c.clock,50);assert.equal(c.lid.position.y,c.lid.rest.y-51200);
 tick(99);assert.equal(c.clock,149);assert.equal(c.velocity,0);
 tick();assert.equal(c.velocity,384);assert.equal(c.drop,384);
 const count=effects.length;while(c.drop<51200)tick();
 assert(c.active&&present(world,c));assert(c.velocity<0);
 const burst=effects.slice(count).filter(e=>e.x===p.x&&e.z===p.z);assert.equal(burst.filter(e=>e.kind===66).length,8);assert.equal(burst.filter(e=>e.kind===25).length,1);
 assert(burst.filter(e=>e.kind===66).every(e=>e.rotation===256&&e.spin===72));assert(sounds.includes(0x69));assert(shakes.includes(40));
 assert.deepEqual(c.shadow.position,c.lid.position);
 while(c.clock!==0)tick();assert(sounds.includes(0x6a));assert.equal(c.lid.position.y,c.lid.rest.y);
 restorePaintCans(state,world);assert.equal(JSON.stringify([...world.cells].map(([k,v])=>[k,[...v].sort((a,b)=>a-b)]).sort()),before,'restart restores collision index exactly');
}
console.log('PASS: all 3 installed paint lids, staggered clocks, near/far freeze, rise/hold/drop/bounce, collision enable boundaries, impact random/effects/sound/shake and restore');
