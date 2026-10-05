import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision} from '../src/formats/collision.ts';
import {createPlayer} from '../src/sim/player.ts';
import {createMoverScript,stepMoverScript} from '../src/sim/mover-script.ts';
import {createConstructionShuttles,moveConstructionShuttles,stepConstructionShuttles,restoreConstructionShuttles} from '../src/sim/construction-shuttles.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level04/level.dat'));
const w=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level04/TERRAIN.ALL'))).groups);
const s=createConstructionShuttles(dat,w,readFileSync('Toy Story 2/toy2.exe')),p=createPlayer(1e8,0,1e8);
const far=new Set<number>(),back=new Set<number>(),paused=new Set<number>();
for(let tick=0;tick<1800;tick++){
 moveConstructionShuttles(s,w,p);stepConstructionShuttles(s,()=>0);
 for(const m of s.movers){
  if(m.position.z-m.rest.z>24000)far.add(m.id);
  if(far.has(m.id)&&Math.abs(m.position.z-m.rest.z)<1024)back.add(m.id);
  if(m.script.wait>0){paused.add(m.id);assert.deepEqual(m.script.velocity,{x:0,y:0,z:0});}
  const origin=w.groups[m.hull.groupIndex]!.position!;assert.equal(origin.z*32,m.position.z);
 }
}
assert.equal(far.size,4);assert.equal(back.size,4);assert.equal(paused.size,4);
const m=s.movers[0]!,before={...m.position};p.x=before.x;p.y=before.y;p.z=before.z;p.onGround=true;p.contacts=[{group:m.hull.groupIndex,normal:{x:0,y:-1,z:0}} as any];m.script.velocity={x:0,y:0,z:256};
moveConstructionShuttles(s,w,p);assert.equal(p.z,before.z+256);
p.onGround=false;p.contacts=[];const z=p.z;moveConstructionShuttles(s,w,p);assert.equal(p.z,z);
restoreConstructionShuttles(s,w);for(const m of s.movers)for(const base of m.hull.polys)assert.deepEqual(w.polys[base.index]!.vertices,base.vertices);
// The shared VM's flag wait and random wait use one instruction per tick.
const vm=createMoverScript([6,256,3,127,32,9,256,0,7]),host={bits:0,randomByte:()=>255,point:()=>undefined},at={x:0,y:0,z:0};
stepMoverScript(vm,at,at,host);assert.equal(vm.pc,0);host.bits=256;stepMoverScript(vm,at,at,host);assert.equal(vm.pc,2);
stepMoverScript(vm,at,at,host);assert.equal(vm.wait,159);for(let i=0;i<159;i++)stepMoverScript(vm,at,at,host);assert.equal(vm.pc,5);stepMoverScript(vm,at,at,host);assert.equal(host.bits,0);stepMoverScript(vm,at,at,host);assert.equal(vm.pc,0);
console.log('PASS: 4 installed shuttle scripts complete out/back/wait cycles, collision alignment, passenger/airborne isolation, restore and shared wordcode flag/random timing');
