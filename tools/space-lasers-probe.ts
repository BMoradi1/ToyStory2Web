import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {createSpaceLasers,stepSpaceLasers,SPACE_LASER_BOX as box} from '../src/sim/space-lasers.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level08/level.dat'));
function fresh(){
 const s=createSpaceLasers(dat),sparks:{life:number}[]=[],lights:any[]=[],sounds:number[]=[],hits:number[]=[];
 let bytes=0,culled=false;
 const host={randomByte:()=>{bytes++;return 0;},effect:()=>{const e={life:0};sparks.push(e);return culled?null:e;},
  light:(l:any)=>lights.push(l),sound:(id:number)=>sounds.push(id),hurt:(yaw:number)=>hits.push(yaw)};
 return {s,host,sparks,lights,sounds,hits,bytes:()=>bytes,cull:()=>{culled=true;}};
}
const centre={x:Math.trunc((box.xMin+box.xMax)/2),y:-100000,z:Math.trunc((box.zMin+box.zMax)/2)};
for(const p of [{...centre,x:box.xMin},{...centre,x:box.xMax},{...centre,z:box.zMin},{...centre,z:box.zMax}]){
 const f=fresh();stepSpaceLasers(f.s,p,f.host);assert.equal(f.s.beams.length,0);assert.equal(f.bytes(),0);
}
{
 const f=fresh();stepSpaceLasers(f.s,centre,f.host);
 assert.equal(f.s.beams.length,2);assert.equal(f.bytes(),14);assert.equal(f.sparks.length,10);
 assert(f.sparks.every(e=>e.life===24));assert.deepEqual(f.sounds,[7,7]);assert.equal(f.hits.length,0);
 for(let i=0;i<2;i++){
  const b=f.s.beams[i]!,source=f.s.paths[1-i]![0]!;
  assert.deepEqual(b.to,{x:source.x*32,y:source.y*32,z:source.z*32});assert.equal(b.width,64);
 }
 assert.deepEqual(f.s.beams.map(b=>b.colour),[[1,0,0],[0,.5,1]]);
 assert.deepEqual(f.lights.map(l=>[l.r,l.g,l.b,l.life]),[[240,0,0,16],[0,120,240,16]]);
 const full=f.s.beams.map(b=>Math.hypot(b.to.x-b.from.x,b.to.y-b.from.y,b.to.z-b.from.z));
 for(let tick=1;tick<8;tick++){
  stepSpaceLasers(f.s,centre,f.host);
  f.s.beams.forEach((b,i)=>assert(Math.abs(Math.hypot(b.to.x-b.from.x,b.to.y-b.from.y,b.to.z-b.from.z)-full[i]!*(8-tick)/8)<2));
 }
 assert.equal(f.sparks.length,10,'sparks only appear at a new target');
 const frozen=JSON.stringify(f.s.guns);stepSpaceLasers(f.s,{...centre,x:box.xMin},f.host);
 assert.equal(f.s.beams.length,0);assert.equal(JSON.stringify(f.s.guns),frozen);
 stepSpaceLasers(f.s,centre,f.host);assert.equal(f.sparks.length,20);
}
// Use an installed target inside the native active area for the floor-level aim/damage gate.
for(const y of [-0x150f,-0x150e]){
 const f=fresh(),n=f.s.paths[0]![0]!,p={x:n.x*32,y,z:n.z*32};
 assert(p.x>box.xMin&&p.x<box.xMax&&p.z>box.zMin&&p.z<box.zMax);
 stepSpaceLasers(f.s,p,f.host);
 if(y===-0x150e){assert.deepEqual(f.s.guns[0]!.target,{...p,y:y-2048});assert(f.hits.length>0);}
 else assert.deepEqual(f.s.guns[0]!.target,{x:n.x*32,y:n.y*32,z:n.z*32});
}
{
 const f=fresh();f.cull();stepSpaceLasers(f.s,centre,f.host);assert.equal(f.bytes(),14,'culled effects still consume lifetime bytes');
 const g=f.s.guns[0]!;g.node=29;g.ticks=0;f.host.randomByte=()=>7;
 stepSpaceLasers(f.s,centre,f.host);assert.equal(g.node,6);assert.equal(g.period,15);assert(f.sparks.slice(-10).some(e=>e.life===0));
}
assert(createSpaceLasers(dat).guns.every(g=>g.ticks===0&&g.node===0));
console.log('PASS: paired installed laser paths, strict area/height gates, targeting and damage, retracting coloured beams, burst cadence/random bytes, lights, pause outside region and reset');
