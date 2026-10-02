/** Read-only installed-data regression for level 10/13 movers. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision} from '../src/formats/collision.ts';
import {createLevelPlatforms,stepLevelPlatforms,stepPlatformSwitches,restoreLevelPlatforms} from '../src/sim/level-platforms.ts';
import {createPlayer,createRuntime,groundFromCollision,stepPlayer,NO_INPUT} from '../src/sim/player.ts';
const root=process.argv[2]??'Toy Story 2';
for(const [level,scene,terrain]of [[10,'level10/level','level10/TERRAIN'],[13,'level03/level1','level03/TERR1']] as const){
 const dat=parseDat(readFileSync(`${root}/data/${scene}.dat`));
 const world=buildCollisionWorld(parseCollision(parseAll(readFileSync(`${root}/data/${terrain}.ALL`))).groups);
 const cells=world.cells.size,s=createLevelPlatforms(level,dat,world)!,p=createPlayer(0,0,0);
 assert.equal(s.movers.length,level===10?2:5);
 if(level===10){
  const before=JSON.stringify(s.movers.map(m=>m.position));
  for(let i=0;i<100;i++)stepLevelPlatforms(s,world,p);
  assert.equal(JSON.stringify(s.movers.map(m=>m.position)),before,'lifts gated by puzzle');
  for(const button of [1,0,1,2]){
   const group=world.groups.findIndex(g=>g.surface===0x20+button);assert(group>=0);
   p.onGround=true;p.stompImpact=true;p.contacts=[{group,normal:{x:0,y:-1,z:0}}];stepPlatformSwitches(s,p,world);
  }
  assert(s.solved);assert.deepEqual(s.wires,[1,1,1]);
  assert(![...world.cells.values()].flat().some(i=>world.polys[i]!.group===s.barrier!.groupIndex),'puzzle barrier removed');
 }
 const m=s.movers[0]!,h=m.hulls[0]!;
 const floor=world.groups[h.groupIndex]!.polys.map(i=>world.polys[i]!).filter(p=>p.normal.y<-.99).sort((a,b)=>a.vertices[0]!.y-b.vertices[0]!.y)[0]!;
 assert(floor);
 const c=floor.vertices.reduce((a,v)=>({x:a.x+v.x/3,y:a.y+v.y/3,z:a.z+v.z/3}),{x:0,y:0,z:0});
 Object.assign(p,{x:c.x*32,y:c.y*32-1000,z:c.z*32,onGround:false,contacts:[],stompImpact:false});
 const runtime=createRuntime(),ground=groundFromCollision(world);ground.beforeMove=()=>stepLevelPlatforms(s,world,p);
 for(let i=0;i<60;i++)stepPlayer(p,NO_INPUT,runtime,ground,0);
 assert(p.onGround&&p.contacts.some(c=>c.group===h.groupIndex),`level ${level} landing`);
 const relative={x:p.x-m.position.x,y:p.y-m.position.y,z:p.z-m.position.z};
 for(let i=0;i<120;i++)stepPlayer(p,NO_INPUT,runtime,ground,0);
 assert(p.onGround&&p.contacts.some(c=>c.group===h.groupIndex),`level ${level} riding`);
 assert(Math.abs(p.y-m.position.y-relative.y)<100,'vertical passenger drift');
 assert(Math.abs(p.x-m.position.x-relative.x)<100,'horizontal passenger drift');
 stepPlayer(p,{...NO_INPUT,jump:true},runtime,ground,0);assert(!p.onGround&&p.vy<0,'jump release');
 // A lift composed of several hulls must not carry a seam contact twice.
 if(level===10){
  p.onGround=true;p.climb=0;p.climbGroup=-1;p.contacts=m.hulls.slice(0,2).map(h=>({group:h.groupIndex,normal:{x:0,y:-1,z:0}}));
  m.velocity={x:0,y:-100,z:0};const y=p.y;stepLevelPlatforms(s,world,p);assert.equal(p.y,y-100,'seam carried once');
 }
 p.onGround=false;p.contacts=[];p.climb=2;p.climbGroup=h.groupIndex;
 m.velocity={x:100,y:-100,z:0};const ledge={x:p.x,y:p.y};stepLevelPlatforms(s,world,p);
 assert.equal(p.x,ledge.x+100,'ledge carried horizontally');assert.equal(p.y,ledge.y-100,'ledge carried vertically');
 p.climb=0;p.climbGroup=-1;
 const seen=s.movers.map(()=>new Set<number>());
 for(let i=0;i<6000;i++){stepLevelPlatforms(s,world,p);s.movers.forEach((m,j)=>seen[j]!.add(m.node));}
 assert(seen.every(set=>set.size>1),'all routes advance');
 restoreLevelPlatforms(s,world);
 for(const h of s.movers.flatMap(m=>m.hulls))for(const poly of h.polys)assert.deepEqual(world.polys[poly.index]!.vertices,poly.vertices,'exact collision restore');
 assert.equal(world.cells.size,cells,'spatial index restored');
 const reset=createLevelPlatforms(level,dat,world)!;assert(!reset.solved);assert.equal(reset.ticks,0);
 console.log(`PASS level ${level}: puzzle gating, routes, landing, riding, jumping, collision reset`);
}
