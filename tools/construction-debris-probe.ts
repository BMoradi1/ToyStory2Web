import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {RandomStream} from '../src/sim/creatures.ts';
import {createConstructionDebris,stepConstructionDebris,constructionThrow} from '../src/sim/construction-debris.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level04/level.dat'));
const fresh=()=>{
 const s=createConstructionDebris(dat),fx:any[]=[],shots:any[]=[];
 const w={rand:new RandomStream(new Uint8Array([1])),effect:(at:any,kind:number,mode:number)=>{const e:any={...at,kind,mode};fx.push(e);return e;},
  projectile:(at:any,v:any,gravity:number,spin:number,kind:number)=>{const e={...at,v,gravity,spin,kind};shots.push(e);return e;}};
 return {s,w,fx,shots};
};
for(let node=0;node<16;node+=2){
 const {s,w,fx}=fresh();s.node=node;s.throwClock=1000;
 const at=s.rolling[node]!,to=s.rolling[node+1]!,p={...at,y:at.y+10000};
 stepConstructionDebris(s,p,w);assert.equal(fx.length,0,'zero clock waits one tick');
 stepConstructionDebris(s,p,w);assert.equal(fx.length,1);assert.equal(s.rollingClock,16);assert.equal(fx[0].kind,67);assert.equal(fx[0].mode,19);assert.equal(fx[0].spin,64);
 if(Math.abs(to.x-at.x)>Math.abs(to.z-at.z))assert.equal(fx[0].vx,to.x<at.x?-384:384);
 else assert.equal(fx[0].vz,to.z<at.z?-384:384);
 s.node=node;s.rollingClock=-1;stepConstructionDebris(s,{...at,y:at.y},w);assert.equal(fx.length,1,'must be below emitter');
}
for(let node=0;node<16;node+=2){
 const {s,w,shots}=fresh();s.rollingClock=1000;s.throwClock=-1;w.rand=new RandomStream(new Uint8Array([node,1,31]));
 stepConstructionDebris(s,{x:0x783b,y:-0x7d05b,z:-0x742c4},w);
 assert.equal(shots.length,1);const e=shots[0],from=s.thrown[node]!,to=s.thrown[node+1]!;
 assert.deepEqual([e.x,e.y,e.z],[from.x,from.y,from.z]);assert.equal(e.kind,84);assert.equal(e.gravity,144);assert.equal(e.spin,64);assert.equal(s.throwClock,94);
 assert(e.v.x*(to.x-from.x)+e.v.z*(to.z-from.z)>0,'throws toward authored endpoint');
 assert(Object.values(e.v).every(Number.isFinite));
}
{
 const {s,w,fx,shots}=fresh();s.node=16;s.rollingClock=s.throwClock=-1;
 stepConstructionDebris(s,{x:1e8,y:0,z:1e8},w);assert.equal(s.node,0);assert.equal(fx.length+shots.length,0);assert.equal(s.rollingClock,16);assert.equal(s.throwClock,64);
 assert.equal(constructionThrow({x:0,y:0,z:0},{x:0,y:100,z:0}),null);
}
console.log('PASS: all 8 rolling and 8 thrown debris routes, clock/random boundaries, direction/gravity, range/height gating and safe exhausted-path wrap');
