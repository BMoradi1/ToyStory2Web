/** Installed-placement regression for Elevator and Penthouse boss controllers. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unpackRaw} from '../src/formats/rnc.ts';
import {parseCreatureList} from '../src/formats/creatures.ts';
import {createCreatureSim,damageCreature,RandomStream,stepCreatures} from '../src/sim/creatures.ts';
import {createGunslinger,stepGunslinger,stepGunslingerLevel} from '../src/sim/gunslinger.ts';
import {createTasks,stepTasks} from '../src/sim/tasks.ts';
import {LEVEL_TASKS,sceneForLevel} from '../src/sim/level-data.ts';
import {readEffectTable,EFFECT} from '../src/formats/effect-table.ts';
import {createEffects,spawnEffect,stepEffects,touchPlayer} from '../src/sim/effects.ts';
const args={bits:0,chasing:true,fwd:0,side:0,dt:1};
function fresh(level:10|11){
 const raw=unpackRaw(readFileSync(`Toy Story 2/data/${sceneForLevel(level)}.raw`));
 const slot=level===10?8:11,p=parseCreatureList(raw.find(r=>r.type===35)!.data).find(c=>c.slot===slot)!;
 const sim=createCreatureSim([p],{groundY:()=>null},new RandomStream(new Uint8Array([0,255,127])),level);
 const c=sim.creatures[0]!,state=createGunslinger(c,level),tasks=createTasks();tasks.gunslinger=state;
 const sounds:number[]=[],shots:any[]=[],parts:number[]=[];
 const world={x:c.x,y:level===10?-1800000:128000,z:c.z,level,coins:0,found:0,rand:sim.rand,talking:false,
  cameraZone:0,playerZone:0,items:0,tokens:0,onGround:true,pathPoints:()=>null,
  sound:(n:number)=>sounds.push(n),projectile:(shot:any)=>shots.push(shot),
  attachment:(_:any,part:number,p:any)=>{parts.push(part);return {x:c.x+p.x,y:c.y+p.y,z:c.z+p.z};}};
 const tick=(dt=1)=>{
  const request=stepTasks(tasks,{boss:LEVEL_TASKS[level]!.boss},i=>i===slot?c:undefined,world,dt);
  stepGunslinger(state,c,{...args,dt},{...world,phase:tasks.boss});
  if(state.defeated&&tasks.boss===2)tasks.boss=3;
  return request;
 };
 return {sim,c,state,tasks,world,tick,sounds,shots,parts};
}
for(const level of [10,11] as const){
 const f=fresh(level),{c,state,tasks,world,tick}=f;c.flags|=2;
 if(level===11){world.x=-690000;world.z=-210000;}
 assert(tick(),'intro trigger');assert.equal(tasks.boss,1);
 world.talking=true;tick(100);assert.equal(tasks.boss,1);
 world.talking=false;tick();assert.equal(tasks.boss,2);assert.equal(c.pc,14);assert.equal(c.record.facing,0);
 assert.equal(c.record.vulnerable,7);
 c.health-=2;tick();assert.equal(state.hurt,59);assert.equal(c.record.vulnerable,4);
 tick(59);assert.equal(state.hurt,0);
 // Both original handlers explicitly reopen at zero while Buzz is in the arena.
 assert.equal(c.record.vulnerable,7);
 world.y=level===10?-0x1c2509:0x1bca0;tick();assert.equal(c.record.vulnerable,4);
 world.y=level===10?-0x1c2508:0x1bca1;tick();assert.equal(c.record.vulnerable,7);
 if(level===11){
  world.y=0x22406;tick();assert.equal(c.record.vulnerable,4);world.y=0x22405;tick();assert.equal(c.record.vulnerable,7);
  c.z=-0x5b4f1;tick();assert.equal(c.record.rangeX,299);assert.equal(c.homeX,-0x9d020);
  c.z=-0x5b4f0;tick();assert.equal(c.record.rangeX,96);assert.equal(c.homeZ,-0x43fc0);
  c.health=9;c.timer=32;tick();assert(state.defeated);assert.equal(c.timer,0);assert.equal(c.pc,52);assert.equal(tasks.boss,3);
  stepCreatures(f.sim,world);assert.equal(c.animState,2,'real defeat script');
 }else{
  // Real damage/removal is the Elevator reward trigger, unlike the nine-point bosses.
  c.health=2;c.stun=0;damageCreature(f.sim,c,0,4);stepCreatures(f.sim,world);
  assert.equal(c.type,0);tick();assert(state.clearHoming);assert.equal(tasks.boss,4);
 }
 assert.equal(tasks.done&16,0);c.type=0;while(tasks.boss<120)tick();assert.equal(tasks.done&16,0);
 tick();assert.equal(tasks.done&16,16);assert.equal(tasks.boss,200);
 const reset=fresh(level);assert.equal(reset.c.health,level===10?30:29);assert.equal(reset.state.hurt,0);assert.equal(reset.state.spin,0);
}
const elevator=fresh(10);elevator.tasks.boss=2;
for(let i=0;i<400;i++)elevator.tick();assert.equal(elevator.shots.length,0);
elevator.tick();assert.equal(elevator.shots.length,1);assert.equal(elevator.shots[0].kind,89);assert.equal(elevator.shots[0].pitch,0);
for(let i=0;i<400;i++)elevator.tick();assert.equal(elevator.shots.length,1);
elevator.tick();assert.equal(elevator.shots[1].kind,119);assert.equal(elevator.shots[1].gravity,64);
for(let i=0;i<4*41;i++)elevator.tick();assert.deepEqual(elevator.shots.map(s=>s.kind),[89,119,119,119,119,119]);
elevator.world.y=-0x1c2509;elevator.tick(201);assert.equal(elevator.shots.length,6,'skip attack above arena');
let s=elevator.state,c=elevator.c;s.spinClock=0;s.spinLimit=32767;
stepGunslingerLevel(s,c,2,elevator.sim.rand,32);assert.equal(s.spin,1024);
c.x=40000;c.z=40000;c.animState=2;stepGunslinger(s,c,args,{...elevator.world,phase:2});assert.equal(c.animState,1);assert.equal(c.targetY,c.homeY);
stepGunslingerLevel(s,c,2,elevator.sim.rand);stepGunslinger(s,c,args,{...elevator.world,phase:2});assert.equal(c.animState,2);assert.equal(c.targetY,c.homeY-24576);
s.spinClock=s.spinLimit;stepGunslingerLevel(s,c,2,elevator.sim.rand);assert.equal(s.spin,0);assert(s.spinLimit>=20480&&s.spinLimit<=36800);
const pent=fresh(11);pent.tasks.boss=2;pent.c.timer=32;pent.c.heading=0;pent.world.x=pent.c.x+100000;pent.world.z=pent.c.z;
pent.tick();assert.deepEqual(pent.parts,[15]);assert.equal(pent.shots[0].vx,0,'outside aim cone falls back to heading');assert.equal(pent.c.timer,9);
for(let i=0;i<8;i++)pent.tick();assert.equal(pent.shots.length,1);pent.tick();assert.deepEqual(pent.parts,[15,16]);
assert.equal(pent.shots.length,2);assert(pent.sounds.includes(0x93)&&pent.sounds.includes(0x94));
pent.c.timer=32;pent.c.health=9;pent.tick();pent.tick(100);assert.equal(pent.shots.length,2,'defeat cancels burst');
const table=readEffectTable(readFileSync('Toy Story 2/toy2.exe'));
for(const shot of [elevator.shots[0],elevator.shots[1],pent.shots[0]]){
 const effects=createEffects(table.kinds,table.modes,new RandomStream(new Uint8Array([0])));
 const w={cameraX:shot.x,cameraY:shot.y,cameraZ:shot.z,playerX:shot.x+100000,playerY:shot.y,playerZ:shot.z,playerYaw:0,playerVx:0,playerVz:0,groundAt:()=>null,waterY:null};
 const e=spawnEffect(effects,w,shot.x,shot.y,shot.z,shot.vx,shot.vy,shot.vz,shot.gravity,shot.rotation,shot.spin,shot.kind)!;
 if(shot.pitch!==undefined)e.pitch=shot.pitch;
 stepEffects(effects,w);assert(e.x!==shot.x||e.y!==shot.y||e.z!==shot.z,'projectile moves');
 w.playerX=e.x;w.playerY=e.y+EFFECT.hitAbove;w.playerZ=e.z;touchPlayer(effects,w);assert.notEqual(effects.hurt,null,'projectile damages');
}
console.log('PASS: both intros, recovery and height boundaries, patrol bounds, actual defeat scripts/removal, delayed rewards/reset, full Elevator shot cycle/hover, Penthouse alternating burst/cancellation, installed projectile motion/damage');
