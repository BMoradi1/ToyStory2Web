/** Installed Space Land buggy: attacks, recovery, authored defeat and task reward. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unpackRaw} from '../src/formats/rnc.ts';
import {parseCreatureList} from '../src/formats/creatures.ts';
import {createCreatureSim,RandomStream,CREATURE_FLAGS,stepCreatures} from '../src/sim/creatures.ts';
import {createBuggy,stepBuggy,buggyBar} from '../src/sim/buggy.ts';
import {createTasks,stepTasks} from '../src/sim/tasks.ts';
import {LEVEL_TASKS} from '../src/sim/level-data.ts';
import {AI_SCRIPTS} from '../src/sim/creature-data.ts';
const raw=unpackRaw(readFileSync('Toy Story 2/data/level08/level.raw'));
const p=parseCreatureList(raw.find(r=>r.type===35)!.data).find(c=>c.type===47)!;
function fresh(){
 const sim=createCreatureSim([p],{groundY:()=>null},new RandomStream(new Uint8Array([128,192,55])),8),c=sim.creatures[0]!,s=createBuggy(c);
 const fx:any[]=[],shots:any[]=[],lights:any[]=[],sounds:number[]=[],beams:any[]=[],hits:number[]=[];
 const args={bits:0,chasing:true,fwd:0,side:0,dt:1};
 const w={phase:2,player:{x:c.x,y:c.y,z:c.z+32000},playerZone:5,gateFour:false,gateSeven:false,gateEight:true,rand:sim.rand,
  sound:(n:number)=>sounds.push(n),lookAt:()=>{},hurt:(yaw:number)=>hits.push(yaw),beam:(at:any,yaw:number)=>beams.push({at,yaw}),
  effect:(at:any,kind:number,mode:number)=>{const e:any={...at,kind,mode};fx.push(e);return e;},
  projectile:(at:any,velocity:any,gravity:number,spin:number,kind:number)=>{const e:any={...at,velocity,gravity,spin,kind};shots.push(e);return e;},
  light:(l:any)=>lights.push(l)};
 c.heading=0;c.timer=400;
 return {sim,c,s,w,args,fx,shots,lights,sounds,beams,hits};
}
{
 const {c,s,w,args,shots,beams,hits,lights}=fresh();
 s.laserClock=40;stepBuggy(s,c,args,w);assert.equal(beams.length,1);assert.equal(hits.length,1);assert.equal(lights[0].r,240);
 w.player.y=c.y-4096;stepBuggy(s,c,args,w);assert.equal(hits.length,1,'strict vertical boundary');
 w.player.y=c.y;w.player.x=c.x+32000;stepBuggy(s,c,args,w);assert.equal(hits.length,1,'outside narrow heading window');
 w.player.x=c.x;w.player.z=c.z+512*256;stepBuggy(s,c,args,w);assert.equal(hits.length,1,'strict range boundary');
 s.laserClock=0;const n=beams.length;stepBuggy(s,c,args,w);assert.equal(s.laserClock,240);assert.equal(beams.length,n,'reset tick cannot fire');
 c.timer=0;stepBuggy(s,c,args,w);assert.equal(c.timer,400);assert.equal(shots.length,1);assert.deepEqual(shots[0].velocity,{x:0,y:-2,z:0});assert.equal(shots[0].kind,114);assert.equal(shots[0].pitch,1024);
 w.playerZone=4;c.targetX=1;stepBuggy(s,c,args,w);assert.equal(c.targetX,c.homeX);
 c.health-=2;stepBuggy(s,c,args,w);assert.equal(s.hurt,59);assert.equal(c.record.vulnerable,4);
 for(let i=0;i<59;i++)stepBuggy(s,c,args,w);assert.equal(c.record.vulnerable,4);stepBuggy(s,c,args,w);assert.equal(c.record.vulnerable,7);
}
{
 const {sim,c,s,w,args,fx,lights}=fresh();w.gateFour=true;c.animState=1;c.frame=0;
 stepBuggy(s,c,args,w);assert.equal(fx.length,2);assert(fx.every(e=>e.kind===42&&e.vx===-128&&e.vz===256));
 c.health=9;c.wait=17;c.flags|=CREATURE_FLAGS.hurts;stepBuggy(s,c,args,w);
 assert(s.defeated);assert.equal(c.script,AI_SCRIPTS[35]);assert.equal(c.pc,34);assert.equal(c.wait,17);assert(!(c.flags&CREATURE_FLAGS.hurts));
 assert.equal(fx.filter(e=>e.kind===35).length,5);assert.equal(lights.at(-1).life,32);
 w.phase=3;c.wait=0;stepCreatures(sim,{x:c.x,y:c.y,z:c.z});assert.equal(c.animState,2);
 w.gateSeven=true;stepBuggy(s,c,args,w);assert(fx.some(e=>e.kind===17));assert.equal(c.record.vulnerable,4);
}
{
 const {sim,c,s}=fresh(),tasks=createTasks();tasks.buggy=s;c.flags|=CREATURE_FLAGS.near;
 const world={x:c.x,y:0,z:c.z,level:8,coins:0,found:0,rand:sim.rand,talking:false,cameraZone:1,playerZone:4,items:0,tokens:0,onGround:true,pathPoints:()=>null};
 const tick=()=>stepTasks(tasks,{boss:LEVEL_TASKS[8]!.boss},i=>i===40?c:undefined,world);
 assert.equal(tick(),null);world.playerZone=5;assert(tick(),'trigger uses player room, not camera room');assert.equal(tasks.boss,1);
 world.talking=true;tick();assert.equal(tasks.boss,1);world.talking=false;tick();assert.equal(tasks.boss,2);assert.equal(c.pc,14);assert.equal(c.timer,400);assert.equal(s.laserClock,600);assert.equal(c.record.facing,0);
 s.barTicks=90;assert.equal(buggyBar(s,c),54);c.health=19;assert.equal(buggyBar(s,c),27);
 s.defeated=true;tasks.boss=3;while(tasks.boss<120)tick();assert.equal(tasks.done&16,0);tick();assert.equal(tasks.done&16,16);assert.equal(c.type,47);
}
console.log('PASS: installed buggy laser boundaries/cadence, dropped hazard, recovery, skids, defeat script/sparks, player-room taunt and delayed reward');
