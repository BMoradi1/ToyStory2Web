/** Installed Toy Barn dinosaur: breath, hit recovery, authored defeat and reward. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unpackRaw} from '../src/formats/rnc.ts';
import {parseCreatureList} from '../src/formats/creatures.ts';
import {parseAll,readHitShapes,GroupType} from '../src/formats/all.ts';
import {createCreatureSim,RandomStream,CREATURE_FLAGS,stepCreatures} from '../src/sim/creatures.ts';
import {createDinosaur,stepDinosaur,dinosaurBar} from '../src/sim/dinosaur.ts';
import {createTasks,stepTasks} from '../src/sim/tasks.ts';
import {LEVEL_TASKS} from '../src/sim/level-data.ts';
import {AI_SCRIPTS} from '../src/sim/creature-data.ts';
import {readEffectTable,EFFECT} from '../src/formats/effect-table.ts';
import {createEffects,spawnEffect,stepEffects,touchPlayer} from '../src/sim/effects.ts';
const raw=unpackRaw(readFileSync('Toy Story 2/data/level07/level.raw'));
const p=parseCreatureList(raw.find(r=>r.type===35)!.data).find(c=>c.type===26)!;
const model=parseAll(readFileSync('Toy Story 2/data/chars3/dino.all'));
function fresh(){
 const sim=createCreatureSim([p],{groundY:()=>null},new RandomStream(new Uint8Array([128,192,55])),7),c=sim.creatures[0]!,s=createDinosaur(c);
 c.hitShapes=readHitShapes(model.groups.find(g=>g.type===GroupType.HitShapes)!);
 const fx:any[]=[],shots:any[]=[],lights:any[]=[],sounds:number[]=[],shakes:number[]=[],parts:number[]=[];
 const w={phase:2,cameraZone:4,gateSeven:false,rand:sim.rand,
  sound:(n:number)=>sounds.push(n),shake:(n:number)=>shakes.push(n),
  attachment:(_:any,part:number,offset:any)=>{parts.push(part);return {x:c.x+offset.x*32,y:c.y+offset.y*32,z:c.z+offset.z*32};},
  effect:(at:any,kind:number,mode:number)=>{const e:any={...at,kind,mode,flags:0};fx.push(e);return e;},
  projectile:(at:any,velocity:any,spin:number,kind:number)=>{const e:any={...at,velocity,spin,kind,flags:0};shots.push(e);return e;},
  light:(l:any)=>lights.push(l)};
 return {sim,c,s,w,fx,shots,lights,sounds,shakes,parts};
}
{
 const {c,s,w,shots,shakes,parts,sounds}=fresh();c.heading=0;c.timer=30;
 stepDinosaur(s,c,w);assert.equal(c.timer,29);assert.deepEqual(parts,[1]);assert.equal(shots.length,1);
 assert.deepEqual(shots[0].velocity,{x:0,y:704,z:2048});assert.equal(shots[0].spin,64);assert.equal(shots[0].kind,85);assert.equal(shots[0].flags&2,2);assert.deepEqual(shakes,[40]);assert(sounds.includes(0x78));
 stepDinosaur(s,c,w);assert.equal(shots[1].flags&2,0,'only the first breath particle hurts');
 w.cameraZone=3;const n=shots.length;stepDinosaur(s,c,w,40);assert.equal(c.timer,0);assert.equal(shots.length,n,'off-room breath drains without emission');
 c.health-=2;stepDinosaur(s,c,w);assert.equal(s.hurt,59);assert.equal(c.record.vulnerable,4);assert(sounds.includes(0x79));
 for(let i=0;i<59;i++)stepDinosaur(s,c,w);assert.equal(s.hurt,0);assert.equal(c.record.vulnerable,4);stepDinosaur(s,c,w);assert.equal(c.record.vulnerable,7);
}
{
 const {sim,c,s,w,fx,lights,sounds}=fresh();c.health=9;c.wait=17;c.flags|=CREATURE_FLAGS.hurts;
 stepDinosaur(s,c,w);assert(s.defeated);assert.equal(c.script,AI_SCRIPTS[24]);assert.equal(c.pc,58);assert.equal(c.wait,17,'defeat does not discard the current script wait');assert.equal(c.record.vulnerable,4);assert(!(c.flags&CREATURE_FLAGS.hurts));
 assert.equal(fx.filter(e=>e.kind===35).length,5);assert.equal(lights.length,1);assert.deepEqual([lights[0].r,lights[0].g,lights[0].b,lights[0].life],[240,128,0,32]);
 const offset=c.hitShapes![0]!.offset;assert.deepEqual([lights[0].x,lights[0].y,lights[0].z],[c.x+offset.x,c.y+offset.y,c.z+offset.z]);assert(sounds.includes(-2));
 w.phase=3;c.wait=0;stepCreatures(sim,{x:c.x,y:c.y,z:c.z});assert.equal(c.animState,2,'authored collapse animation');
 w.gateSeven=true;c.frame=10*65536;w.rand=new RandomStream(new Uint8Array([1]));stepDinosaur(s,c,w);
 assert.equal(fx.filter(e=>e.kind===35).length,5,'defeat burst occurs once');assert(fx.some(e=>e.kind===17&&e.width===40));assert(fx.some(e=>e.kind===4&&e.life===26));assert.equal(c.record.vulnerable,4,'defeat never reopens combat');
}
{
 const {c,s,sim}=fresh(),tasks=createTasks();tasks.dinosaur=s;c.flags|=CREATURE_FLAGS.near;
 const world={x:c.x,y:0,z:c.z,level:7,coins:0,found:0,rand:sim.rand,talking:false,cameraZone:4,playerZone:4,items:0,tokens:0,onGround:true,pathPoints:()=>null};
 const tick=(dt=1)=>stepTasks(tasks,{boss:LEVEL_TASKS[7]!.boss},i=>i===0?c:undefined,world,dt);
 assert(tick());assert.equal(tasks.boss,1);world.talking=true;tick();assert.equal(tasks.boss,1);world.talking=false;tick();assert.equal(c.pc,14);assert.equal(c.record.facing,0);
 s.barTicks=90;assert.equal(dinosaurBar(s,c),54);c.health=19;assert.equal(dinosaurBar(s,c),27);s.defeated=true;tasks.boss=3;assert.equal(dinosaurBar(s,c),0);
 while(tasks.boss<120)tick();assert.equal(tasks.done&16,0);tick();assert.equal(tasks.boss,200);assert.equal(tasks.done&16,16,'reward does not wait for type removal');
 assert.equal(c.type,26);
}
const table=readEffectTable(readFileSync('Toy Story 2/toy2.exe')),pool=createEffects(table.kinds,table.modes,new RandomStream(new Uint8Array([128])));
const ew={cameraX:0,cameraY:0,cameraZ:0,playerX:100000,playerY:0,playerZ:0,playerYaw:0,playerVx:0,playerVz:0,groundAt:()=>null,waterY:null};
const e=spawnEffect(pool,ew,0,0,0,0,704,2048,0,0,64,85)!;assert(e);assert(!(e.flags&2));e.flags|=2;stepEffects(pool,ew);assert(e.z>0);
ew.playerX=e.x;ew.playerY=e.y+EFFECT.hitAbove;ew.playerZ=e.z;touchPlayer(pool,ew);assert.notEqual(pool.hurt,null);
console.log('PASS: installed dinosaur breath offsets/random/gates/damage, recovery, nine-health collapse and burst/light/smoke, taunt/bar and delayed token without removal');
