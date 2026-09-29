/** Retail Zurg controller regression. Installed placement, injected damage/positions. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unpackRaw} from '../src/formats/rnc.ts';
import {parseCreatureList} from '../src/formats/creatures.ts';
import {createCreatureSim,RandomStream,damageCreature} from '../src/sim/creatures.ts';
import {createZurgBoss,stepZurgBoss,zurgBossBar,type ZurgShot} from '../src/sim/zurg-boss.ts';
import {createTasks,stepTasks} from '../src/sim/tasks.ts';
import {LEVEL_TASKS} from '../src/sim/level-data.ts';
const record=parseCreatureList(unpackRaw(readFileSync('Toy Story 2/data/level02/level1.raw')).find(r=>r.type===35)!.data)[0]!;
const sim=createCreatureSim([record],{groundY:()=>null},new RandomStream(new Uint8Array([0,128,255,1])),12);
const boss=sim.creatures[0]!,state=createZurgBoss(boss);
assert.equal(boss.type,57);assert.equal(boss.health,29);assert.equal(boss.y,(record.y<<5)-0x28000);
assert.equal(boss.z,65536);assert.equal(boss.record.turnRate,0);assert.equal(zurgBossBar(state),54);
const events:number[]=[],shots:ZurgShot[]=[],parts:number[]=[];
const cut={ticks:0,eye:{x:0,y:0,z:0},look:{x:0,y:0,z:0},start:(p:{x:number;y:number;z:number},ticks:number)=>{cut.ticks=ticks;Object.assign(cut.look,p);}};
const world={x:-0x18b2b,y:-60000,z:0,rand:sim.rand,cut,
 sound:(event:number)=>events.push(event),projectile:(shot:ZurgShot)=>shots.push(shot),
 pinPlayer:(p:{x:number;y:number;z:number})=>Object.assign(world,p),
 attachment:(_c:unknown,part:number,p:{x:number;y:number;z:number})=>{parts.push(part);assert.deepEqual(p,{x:-250,y:-250,z:0});return{x:123,y:456,z:789};}};
const tick=(dt=1)=>{cut.ticks=Math.max(0,cut.ticks-dt);stepZurgBoss(state,boss,world,dt);};
tick();assert.equal(state.phase,0);world.x=-0x18b2a;tick();
assert.equal(state.phase,1);assert.equal(cut.ticks,300);assert(events.includes(0xd8));
assert.deepEqual({x:world.x,y:world.y,z:world.z},{x:-0x1da7c,y:-0x12bd0,z:0xf699});
for(let i=0;i<299;i++)tick();assert.equal(state.phase,1);
tick();assert.equal(state.phase,2);assert.equal(boss.record.turnRate,10);assert.equal(boss.record.vulnerable,6);
assert.equal(events.filter(e=>e===0xb9).length,1);
state.attack=201;tick();assert.equal(boss.animState,0);assert.equal(boss.animRateAir,-64);
for(const threshold of [146,138,126]){state.attack=threshold+1;tick();}
assert.deepEqual(shots.map(s=>s.kind),[108,108,108]);assert(parts.every(p=>p===1));
assert.deepEqual([shots[0]!.x,shots[0]!.y,shots[0]!.z],[123,456,789]);
state.attack=105;tick();assert.equal(boss.animState,1);assert.equal(boss.animRateAir,-32);
state.attack=0;tick();assert.equal(state.attack,302);assert(boss.vx!==0||boss.vz!==0);
// A surviving hit closes the shell and switches the following volley to homing.
boss.stun=0;damageCreature(sim,boss,0,4);tick();assert.equal(state.health,27);
assert.equal(state.hurt,60);assert.equal(boss.record.vulnerable,4);assert(state.retaliation);
tick(60);assert.equal(state.hurt,0);assert.equal(boss.record.vulnerable,4);
tick();assert.equal(boss.record.vulnerable,6);assert.equal(state.flashScale,1);
state.attack=147;tick();assert.equal(shots.at(-1)!.kind,109);
state.attack=105;tick();assert.equal(state.retaliation,false);
boss.health=19;state.health=19;state.attack=147;tick();assert.equal(shots.at(-1)!.kind,108);
state.attack=139;tick();assert.equal(shots.at(-1)!.kind,109,'low-health middle shot homes');
state.attack=127;tick();assert.equal(shots.at(-1)!.kind,108);
// The inner-circle clamp pushes outward, not inward.
boss.x=-0xbd7c+100;boss.z=0x99;tick();
assert(Math.hypot(boss.x+0xbd7c,boss.z-0x99)>=40000);
boss.health=9;tick();assert.equal(state.phase,3);assert(state.beaten);assert.equal(boss.animState,2);
assert.equal(cut.ticks,300);assert.equal(boss.flags&12,0);assert.equal(zurgBossBar(state),0);
assert.equal(events.filter(e=>e===0xc0).length,1);
assert(boss.vx!==0||boss.vz!==0,'defeat drives out of arena');
boss.x=0xe0ab;boss.y=69999;state.fallSpeed=128;tick();
assert(boss.y>70000);assert.equal(shots.at(-1)!.kind,112);assert(events.includes(0x9e));
for(let i=0;i<100&&boss.y<170000;i++)tick();assert(boss.y>=170000);assert.equal(events.filter(e=>e===0x9f).length,1);
cut.ticks=1;tick();assert.equal(state.phase,4);assert(state.won);
state.won=false;tick();assert.equal(state.won,false,'win emitted once');
const reset=createZurgBoss(createCreatureSim([record],sim.world,sim.rand,12).creatures[0]!);
assert.equal(reset.phase,0);assert.equal(reset.hurt,0);assert.equal(reset.fallSpeed,0);
// Shared task integration emits save and victory requests through existing host.
const tasks=createTasks();tasks.zurg=reset;reset.phase=2;reset.health=11;boss.health=9;
const taskWorld={...world,coins:0,found:0,talking:false,level:12,items:0,tokens:0,
 cameraZone:0,playerZone:0,onGround:true,pathPoints:()=>null};
stepTasks(tasks,LEVEL_TASKS[12]!,()=>boss,taskWorld);assert(tasks.bossBeaten);assert.equal(tasks.bossPhase,3);
cut.ticks=0;stepTasks(tasks,LEVEL_TASKS[12]!,()=>boss,taskWorld);assert(tasks.levelWon);
console.log('PASS: Zurg installed init, trigger/cut/pin, entrance voice, volley boundaries/types/attachment, strafe, recovery, inner clamp, defeat fall/effects, one-shot reward/win, reset and task integration.');
