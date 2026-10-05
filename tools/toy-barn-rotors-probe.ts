import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision} from '../src/formats/collision.ts';
import {createPlayer} from '../src/sim/player.ts';
import {createToyBarnRotors,moveToyBarnRotors,stepToyBarnRotors,restoreToyBarnRotors} from '../src/sim/toy-barn-rotors.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level07/level.dat'));
const w=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level07/TERRAIN.ALL'))).groups);
const s=createToyBarnRotors(dat,w),p=createPlayer(1e8,0,1e8);
moveToyBarnRotors(s,w,p);assert(s.every(r=>r.angle===0));stepToyBarnRotors(s);
for(let t=1;t<=4096;t++){
 moveToyBarnRotors(s,w,p);
 for(const [i,r] of s.entries()){
  assert.equal(r.angle,((i%2?44:36)*t)&16383);
  const theta=r.angle*Math.PI/8192,c=Math.cos(theta),sn=Math.sin(theta),o=r.hull.origin;
  for(const base of r.hull.polys){
   const poly=w.polys[base.index]!;
   for(const [j,v] of base.vertices.entries()){
    const at=poly.vertices[j]!;
    assert(Math.abs(at.x-(o.x+(v.x-o.x)*c-(v.y-o.y)*sn))<1e-8);
    assert(Math.abs(at.y-(o.y+(v.x-o.x)*sn+(v.y-o.y)*c))<1e-8);
    assert.equal(at.z,v.z);
   }
   assert.equal(poly.walkable,poly.normal.y<=-.5+1e-12);
  }
 }
}
for(const r of s)assert.equal(r.angle,0);
// Standing and attached ledges rotate around the collision pivot; airborne
// players remain independent. Check actual game-unit rounding at each speed.
for(const r of s)for(const mode of ['standing','climbing','airborne']){
 p.x=r.hull.origin.x*32+10000;p.y=r.hull.origin.y*32;p.z=r.hull.origin.z*32;
 p.onGround=mode==='standing';p.climb=mode==='climbing'?1:0;p.climbGroup=mode==='climbing'?r.hull.groupIndex:-1;
 p.contacts=p.onGround?[{group:r.hull.groupIndex,normal:{x:0,y:-1,z:0}} as any]:[];
 const x=p.x,y=p.y;moveToyBarnRotors(s,w,p);
 const a=r.speed*Math.PI/8192;
 assert.equal(p.x,mode==='airborne'?x:Math.round(r.hull.origin.x*32+10000*Math.cos(a)));
 assert.equal(p.y,mode==='airborne'?y:Math.round(r.hull.origin.y*32+10000*Math.sin(a)));
}
restoreToyBarnRotors(s,w);for(const r of s)for(const b of r.hull.polys){assert.deepEqual(w.polys[b.index]!.vertices,b.vertices);assert.deepEqual(w.polys[b.index]!.normal,b.normal);}
console.log('PASS four installed rotors: exact rates/wrap, full-turn collision geometry/normals, standing and ledge carry, airborne isolation, restore');
