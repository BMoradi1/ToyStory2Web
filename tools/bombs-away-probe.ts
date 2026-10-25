/**
 * Bombs Away (internal level 6) world-boss regression against the installed
 * placement: `FUN_0041ffb0` init and `FUN_00420060` tick, driven through the
 * shared task step. Positions and hits are injected; this is not a playthrough.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {unpackRaw} from '../src/formats/rnc.ts';
import {CREATURE_LIST_TYPE,parseCreatureList} from '../src/formats/creatures.ts';
import {CREATURE_FLAGS,createCreatureSim,RandomStream} from '../src/sim/creatures.ts';
import {createTasks,startWorldBoss,stepTasks,worldBossBar} from '../src/sim/tasks.ts';
import {LEVEL_TASKS} from '../src/sim/level-data.ts';
import type {ZurgShot} from '../src/sim/zurg-boss.ts';
import {cos} from '../src/sim/trig.ts';

const root=process.argv[2]??'Toy Story 2';
const level=LEVEL_TASKS[6]!,fight=level.bossFight!;
const records=parseCreatureList(unpackRaw(readFileSync(join(root,'data/level06/level.raw'))).find(r=>r.type===CREATURE_LIST_TYPE)!.data);
assert.equal(records.length,1);
const record=records[0]!;
assert.equal(record.type,48,'the boss is creature type 48 (BI, the biplane)');
assert.equal(record.health,20);

type P={x:number;y:number;z:number};
function setup(){
  const sim=createCreatureSim([record],{groundY:()=>null},new RandomStream(new Uint8Array([7,200,33,129])),6);
  const boss=sim.creatures[0]!,tasks=createTasks(),placedX=boss.x;
  startWorldBoss(tasks,fight,boss);
  const sounds:{event:number;at:P|null}[]=[],effects:{kind:number;mode:number;at:P;spin?:number}[]=[],shots:ZurgShot[]=[],looks:P[]=[];
  const cut={ticks:0,eye:{x:0,y:0,z:0},look:{x:0,y:0,z:0},
    start:(p:P,ticks:number)=>{cut.ticks=ticks;Object.assign(cut.look,p);}};
  const gate={two:0,four:false,six:false,seven:false};
  const world={x:0x40000,y:-20000,z:0,rand:sim.rand,cut,coins:0,found:0,talking:false,level:6,items:0,tokens:0,
    cameraZone:0,playerZone:0,onGround:true,pathPoints:()=>null,cameraYaw:0,timerGate:false,releaseGate:gate,
    sound:(event:number,at:P|null)=>sounds.push({event,at:at&&{x:at.x,y:at.y,z:at.z}}),
    effect:(x:number,y:number,z:number,kind:number,mode:number,spin?:number)=>effects.push({kind,mode,at:{x,y,z},spin}),
    projectile:(shot:ZurgShot)=>shots.push(shot),
    lookAt:(p:P)=>looks.push({...p}),
    groundAt:()=>0};
  const tick=(n=1)=>{for(let i=0;i<n;i++){cut.ticks=Math.max(0,cut.ticks-1);stepTasks(tasks,level,s=>s===0?boss:undefined,world);}};
  return {sim,boss,tasks,placedX,sounds,effects,shots,looks,cut,gate,world,tick};
}

// --- init: faced into the arena, pushed off-stage, roaming box, flag 0x800.
let t=setup();
assert.equal(t.boss.heading,0xc00);assert.equal(t.boss.wantYaw,0xc00);
assert.equal(t.boss.x,t.placedX+0x80000);assert.equal(t.boss.homeX,t.boss.x);
assert.equal(t.boss.record.rangeX,0x1000);assert.equal(t.boss.record.rangeZ,0x1000);
assert.notEqual(t.boss.flags&0x800,0);
assert.equal(t.tasks.bossClock,300);assert.equal(t.tasks.bossSwing,0x40000);
assert.equal(worldBossBar(fight,20),0x36);
// C truncates: 9 * 54 / 10 is 48, which rounding would make 49.
assert.equal(worldBossBar(fight,19),48);assert.equal(worldBossBar(fight,10),0);

// --- the trigger is strict: x 0x31f9e waits, one less starts the entrance.
t.world.x=0x31f9e;t.tick();assert.equal(t.tasks.bossPhase,0);
assert(t.sounds.every(s=>s.event===fight.sounds.hum),'only the arena hum before the fight');
t.world.x=0x31f9d;t.tick();
assert.equal(t.tasks.bossPhase,1);assert.equal(t.cut.ticks,300);
const bossY=t.boss.y;
assert.deepEqual(t.cut.eye,{x:t.boss.x+0x800-0x48000,y:bossY-0x8000+0x130,z:t.boss.z-0x80},'eye starts back and up; the first entrance step runs the same tick');

// --- the entrance: it flies in 0x800 a tick; the eye sinks 0x130 a tick,
//     along z while 180 or more ticks are left and along x after.
let eye={...t.cut.eye},x=t.boss.x;
t.tick();
assert.equal(t.boss.x,x-0x800);assert.equal(t.cut.eye.y,eye.y+0x130,'entrance eye descends');
assert.equal(t.cut.eye.z,eye.z-0x80);assert.equal(t.cut.eye.x,eye.x);
t.tick(299-0xb4);assert.equal(t.cut.ticks,0xb4);
eye={...t.cut.eye};t.tick();
assert.equal(t.cut.ticks,0xb3);assert.equal(t.cut.eye.x,eye.x-0x200);assert.equal(t.cut.eye.z,eye.z);
assert.equal(t.boss.flags&CREATURE_FLAGS.scriptVelocity,0);
t.tick(0xb3-0x1d);assert.equal(t.cut.ticks,0x1d);
assert.notEqual(t.boss.flags&CREATURE_FLAGS.scriptVelocity,0,'mover takes it with 30 ticks left');
assert(t.shots.length===0&&t.looks.length===0,'no bombs or look-at during the entrance');
t.tick(0x1d);assert.equal(t.tasks.bossPhase,2);assert.equal(t.boss.x,t.placedX+0x80000-301*0x800,'301 ticks of flying in, the trigger tick included');

// --- the fight: chase above the gun threshold, guns under 0x226, charge under 0x12d.
t.world.x=t.boss.x+0x1000;t.world.z=t.boss.z;t.world.y=t.boss.y;
t.tasks.bossClock=0x227;t.sounds.length=0;t.tick();
assert.equal(t.tasks.bossClock,0x226);assert.equal(t.boss.targetX,t.world.x);assert.equal(t.boss.targetZ,t.world.z);
assert(!t.sounds.some(s=>s.event===fight.sounds.gun),'no guns at 0x226');
assert.deepEqual(t.looks.at(-1),{x:t.boss.x,y:t.boss.y,z:t.boss.z},'camera asked to turn toward it');
t.tick();
const gun=t.sounds.find(s=>s.event===fight.sounds.gun)!;
assert.deepEqual(gun.at,{x:t.boss.targetX,y:t.boss.targetY,z:t.boss.targetZ},'guns heard at the aim point');
assert.equal(t.sounds.filter(s=>s.event===fight.sounds.shout).length,1);
assert.deepEqual(t.sounds.find(s=>s.event===fight.sounds.shout)!.at,{x:t.world.x,y:t.world.y,z:t.world.z});
const gunTick=()=>{t.tasks.bossClock=0x200;t.tick();};
for(let i=0;i<400;i++)gunTick();assert.equal(t.sounds.filter(s=>s.event===fight.sounds.shout).length,1);
gunTick();assert.equal(t.sounds.filter(s=>s.event===fight.sounds.shout).length,2,'shout every 400 ticks');
// Bullet strikes only on the 1-in-6 tick, two guns, puff then spray.
t.effects.length=0;t.tasks.bossClock=0x200;t.tick();
assert(!t.effects.some(e=>e.kind===0x7b),'no strikes off the six-tick gate');
t.gate.six=true;t.tick();t.gate.six=false;
assert.deepEqual(t.effects.filter(e=>e.kind===0x7b||e.kind===0x7c).map(e=>[e.kind,e.mode]),[[0x7b,2],[0x7c,1],[0x7b,2],[0x7c,1]]);
assert(t.effects.filter(e=>e.kind===0x7c).every(e=>e.spin!>=0x80&&e.spin!<0x180),'spray spin is the raw random byte');
// The charge flips sides each lap.
t.tasks.bossClock=0x12d;t.tick();assert.equal(t.boss.targetX,0x40000);assert.equal(t.boss.targetZ,0);
assert.equal(t.boss.targetY,cosRamp(t.tasks.bossRamp)+0x4000+t.boss.homeY);
t.tasks.bossClock=1;t.tick();assert.equal(t.tasks.bossClock,600);assert.equal(t.tasks.bossSwing,-0x40000);
t.tasks.bossClock=0x100;t.tick();assert.equal(t.boss.targetX,-0x40000);

// --- bombs: the 64-tick gate, Buzz within 400 steps, not stunned; twice its velocity.
t.boss.vx=0x123;t.boss.vz=-0x45;t.world.timerGate=true;t.tick();t.world.timerGate=false;
assert.equal(t.shots.length,1);
assert.deepEqual(t.shots[0],{x:t.boss.x,y:t.boss.y,z:t.boss.z,vx:0x246,vy:0,vz:-0x8a,gravity:0x80,rotation:0,spin:0,kind:0xc});
t.tick();assert.equal(t.shots.length,1,'no bomb off the gate');
t.world.x=t.boss.x+400*256;t.world.timerGate=true;t.tick();
assert.equal(t.shots.length,1,'400 steps away is out of range');
t.world.x=t.boss.x+399*256;t.tick();t.world.timerGate=false;assert.equal(t.shots.length,2);

// --- the arena box is strict on both x bounds.
const ramp=t.tasks.bossRamp;t.boss.x=fight.arena.xMin;t.boss.z=0;t.tick();
assert.equal(t.tasks.bossRamp,Math.min(0x800,ramp+0x80),'the lower x bound is outside');
t.boss.x=-233646;t.tick();assert.equal(t.tasks.bossRamp,Math.min(0x800,ramp+0x80)-0x80);
assert.equal(fight.arena.xMin,-233647);

// --- exhaust and engine fire while on screen.
t.effects.length=0;t.boss.flags|=CREATURE_FLAGS.awake;t.gate.two=1;t.tick();t.gate.two=0;
const smoke=t.effects.filter(e=>e.kind===0x11);
assert.equal(smoke.length,2);assert(smoke.every(e=>e.mode===2&&e.spin!>=0x70&&e.spin!<0x90));
assert.notDeepEqual(smoke[0]!.at,smoke[1]!.at,'one plume off each wing');
t.gate.seven=true;t.tick();t.gate.seven=false;
assert(!t.effects.some(e=>e.kind===0x23),'no engine fire while healthy');

// --- a surviving hit: shell closed, lap clock restarted, 120-tick stun and cut.
t.world.x=t.boss.x+0x1000;t.world.z=t.boss.z;t.sounds.length=0;
t.boss.health=18;t.tick();
assert.equal(t.boss.record.vulnerable,4);assert.equal(t.tasks.bossClock,298);
assert.equal(t.tasks.bossHurt,0x78-1);assert.equal(t.cut.ticks,0x78);
const flashes=new Set<number>();
for(let i=0;i<6;i++){t.tick();flashes.add(t.tasks.bossFlash);}
assert.deepEqual([...flashes].sort(),[1,2],'stunned model flickers between 1x and 2x');
assert(!t.sounds.some(s=>s.event===fight.sounds.hit),'no sputter until under 0x5a');
assert(!t.sounds.some(s=>s.event===fight.sounds.fly),'engine loop is off while stunned');
t.world.timerGate=true;t.tick();t.world.timerGate=false;assert.equal(t.shots.length,2,'no bombs while stunned');
t.tick(0x78-7-0x5a);assert(t.sounds.some(s=>s.event===fight.sounds.hit),'sputter late in the stun');
assert.equal(t.boss.record.vulnerable,4);
t.tick(0x5b);assert.equal(t.tasks.bossHurt,0);assert.equal(t.boss.record.vulnerable,7);assert.equal(t.tasks.bossFlash,1);
assert.equal(worldBossBar(fight,t.boss.health),43);

// --- the killing hit: health under 11 starts the death and writes the save bit.
t.boss.health=10;t.boss.pitch=0;t.tick();
assert.equal(t.tasks.bossPhase,3);assert(t.tasks.bossBeaten);
assert.equal(t.cut.ticks,300);assert.equal(t.boss.targetX,t.boss.x);assert.equal(t.boss.targetZ,t.boss.z);
const dyingY=t.boss.y;t.tick();
assert.equal(t.boss.y,dyingY-0x280,'it climbs 0x280 a tick (up is negative y)');
assert.equal(t.boss.pitch,0x48,'it pitches over while stunned and dying');
t.effects.length=0;t.gate.seven=true;t.tick();t.gate.seven=false;
assert.deepEqual(t.effects.filter(e=>e.kind===0x23).map(e=>e.mode),[0xe],'engine fire while dying');
t.tick(300-2-0x78);assert.equal(t.cut.ticks,0x78);assert.equal(t.boss.flags&CREATURE_FLAGS.diedOnce,0x800);
assert.equal(t.boss.deathTimer,0,'still alive with 120 ticks of the cut left');
t.tick();assert.equal(t.boss.deathTimer,-1,'ended under 120 ticks of the cut');
assert(!t.tasks.levelWon);
t.tick(0x76);assert(!t.tasks.levelWon);t.tick();
assert.equal(t.tasks.bossPhase,4);assert(t.tasks.levelWon);
t.tasks.levelWon=false;t.tick(10);assert(!t.tasks.levelWon,'won once');

// --- a fresh level start is a fresh fight.
t=setup();
assert.equal(t.tasks.bossPhase,0);assert.equal(t.tasks.bossHurt,0);assert(!t.tasks.bossBeaten);assert.equal(t.tasks.bossFlash,1);
assert.equal(t.boss.health,20);

function cosRamp(r:number){return cos(r)*3;}
console.log('PASS: Bombs Away installed biplane init, strict trigger, descending entrance pan and mover handoff, chase/guns/charge thresholds, lap flip, gated strikes, 64-tick bombs, strict arena box, exhaust/fire, hit stun/flicker/sputter, truncating bar, death climb/pitch/kill timing, one-shot win and reset.');
