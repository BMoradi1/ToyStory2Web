/** Installed-data interactions; positions and random bytes are controlled. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDat } from '../src/formats/dat.ts';
import { parseAll } from '../src/formats/all.ts';
import { buildCollisionWorld, parseCollision } from '../src/formats/collision.ts';
import { createLevelPlatforms, stepLevelPlatforms, stepPlatformSwitches, restoreLevelPlatforms } from '../src/sim/level-platforms.ts';
import { createPlayer, createRuntime, groundFromCollision, stepPlayer, NO_INPUT } from '../src/sim/player.ts';
import { COLLISION } from '../src/sim/player-constants.ts';
const root=process.argv[2]??'Toy Story 2';
function load(level:number){
 const dir=level===10?'level10':'level03',name=level===10?'level':'level1',terrain=level===10?'TERRAIN':'TERR1';
 const dat=parseDat(readFileSync(`${root}/data/${dir}/${name}.dat`));
 const world=buildCollisionWorld(parseCollision(parseAll(readFileSync(`${root}/data/${dir}/${terrain}.ALL`))).groups);
 return {dat,world,s:createLevelPlatforms(level,dat,world)!,p:createPlayer(1e8,0,1e8)};
}
for(const byte of [0,127,255]){
 const {s,p,world}=load(10);s.solved=true;
 const waits:number[][]=[[],[]],sounds=new Set<number>();let flashes=0;
 for(let t=0;t<2400;t++){
  const previous=s.movers.map(m=>m.wait);
  stepLevelPlatforms(s,world,p,()=>byte);
  s.movers.forEach((m,i)=>{if(m.wait>0&&previous[i]===0)waits[i]!.push(m.wait);});
  for(const cue of s.sounds)sounds.add(cue.event);
  if(s.warningLight)flashes++;
  if(t===63)assert(s.warning,'warning phase wraps at 64');
  if(t===127)assert.equal(s.barrierScale,0,'barrier shrinks in 128 ticks');
 }
 assert(waits[0]!.includes(96+(byte&127)));assert(waits[0]!.includes(32+(byte&127)));
 assert(waits[1]!.every(n=>n===32+(byte&127))&&waits[1]!.length>1);
 assert(sounds.has(0x8f)&&sounds.has(0x90));assert(flashes>20);
 const m=s.movers[0]!,before={...m.position};p.climb=10;p.climbGroup=m.hulls[2]!.groupIndex;
 for(let i=0;i<10;i++)stepLevelPlatforms(s,world,p,()=>byte);
 assert.deepEqual(m.position,before,'compound lift freezes at an acquired ledge');
 p.climbGroup=-1;p.climb=0;
 restoreLevelPlatforms(s,world);const fresh=createLevelPlatforms(10,load(10).dat,world)!;
 assert.equal(fresh.barrierScale,4096);assert(!fresh.warning);
}
{
 const {s,p,world}=load(13),m=s.movers[2]!,other=s.movers[3]!;
 p.climb=10;p.climbGroup=m.hulls[0]!.groupIndex;
 const before=[{...m.position},{...other.position}];
 for(let i=0;i<20;i++)stepLevelPlatforms(s,world,p);
 assert.deepEqual([m.position,other.position],before,'paired trucks freeze during either ledge grab');
 p.climbGroup=-1;p.climb=0;
 // Put Buzz's sphere just outside a forward-facing truck polygon. The inverse
 // hull sweep must detect the obstruction without injecting contact flags.
 m.speed=100;m.velocity={x:400,y:0,z:0};m.node=10;
 const face=world.groups[m.hulls[0]!.groupIndex]!.polys.map(i=>world.polys[i]!).find(poly=>poly.normal.x>.99)!;
 assert(face,'forward truck face');
 const c=face.vertices.reduce((sum,v)=>({x:sum.x+v.x*32/3,y:sum.y+v.y*32/3,z:sum.z+v.z*32/3}),{x:0,y:0,z:0});
 Object.assign(p,{x:c.x+COLLISION.radius+100,y:c.y+COLLISION.radius+COLLISION.centreLift,z:c.z,contacts:[]});
 const at={...m.position};stepLevelPlatforms(s,world,p);
 assert(m.blocked,'physical truck obstruction detected');assert.deepEqual(m.position,at,'blocked truck stops');
 assert.equal(m.speed,-125);assert(other.speed<0,'paired truck reverses too');
 p.x=1e8;p.z=1e8;
 stepLevelPlatforms(s,world,p);assert(m.position.x<at.x,'truck retreats after obstruction');
 assert(s.exhaust.length===3,'three exhaust emitters');
}
for(const which of [0,1,2,3,4]){
 const {s,p,world}=load(13);
 const spring=which<2?s.springs[which]!:null,vehicle=which>=2?s.movers[which]!:null;
 const group=spring?.group??vehicle!.hulls[0]!.groupIndex;
 const floor=world.groups[group]!.polys.map(i=>world.polys[i]!).filter(poly=>poly.normal.y<-.99).sort((a,b)=>a.vertices[0]!.y-b.vertices[0]!.y)[0]!;
 const c=floor.vertices.reduce((sum,v)=>({x:sum.x+v.x*32/3,y:sum.y+v.y*32/3,z:sum.z+v.z*32/3}),{x:0,y:0,z:0});
 Object.assign(p,{x:c.x,y:c.y-20000,z:c.z,stomp:1,onGround:false});
 const ground=groundFromCollision(world),rt=createRuntime();
 // Freeze translation for this focused real collision landing/launch test.
 let launched=false;
 for(let t=0;t<100&&!launched;t++){
  stepPlayer(p,NO_INPUT,rt,ground,0);stepPlatformSwitches(s,p,world);launched=p.launched;
 }
 assert(launched,`spring ${which} launch from real stomp impact`);assert.equal(p.vy,-3072);assert(!p.onGround);assert.equal(p.stomp,0);
 assert.equal(s.springRoll,-512);assert(s.sounds.some(cue=>cue.event===0x1c));
 if(vehicle)assert(!vehicle.exhaust,'stomp turns off vehicle exhaust');
 if(spring)assert(s.guidesSpent.includes(spring.guide));
 p.x=1e8;p.z=1e8;
 for(let t=0;t<16;t++)stepLevelPlatforms(s,world,p);
 assert.equal(s.springRoll,0,'spring artwork settles after 16 ticks');
}
console.log('PASS: retail wait ranges, warnings/barrier/sounds, ledge pauses, physical paired reversal, exhaust, five stomp springs and reset');
