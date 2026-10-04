/** Focused combat regression, retail 0042be60/0042ca60. Uses installed placement
 * and shared wordcode; injects hits, not a complete playable encounter. */
import {createProspector,stepProspector} from '../src/sim/prospector.ts';
import {readEffectTable,EFFECT} from '../src/formats/effect-table.ts';
import {createEffects,spawnEffect,stepEffects,touchPlayer} from '../src/sim/effects.ts';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unpackRaw} from '../src/formats/rnc.ts';
import {parseCreatureList} from '../src/formats/creatures.ts';
import {createCreatureSim, CREATURE_FLAGS, damageCreature, RandomStream, stepCreatures} from '../src/sim/creatures.ts';
import {createTasks, stepTasks} from '../src/sim/tasks.ts';
import {LEVEL_TASKS} from '../src/sim/level-data.ts';
const raw = unpackRaw(readFileSync('Toy Story 2/data/level03/level1.raw'));
const placement = parseCreatureList(raw.find(r=>r.type===0x23)!.data).find(c=>c.slot===32)!;
assert.equal(placement.type,61);
const fresh = () => createCreatureSim([placement],{groundY:()=>null},new RandomStream(new Uint8Array([0])),13);
let sim=fresh(), c=sim.creatures[0]!, tasks=createTasks();
const sounds:number[]=[];
const world={coins:0,found:0,rand:sim.rand,talking:false,x:c.x,y:c.y,z:c.z,
  level:13,cameraZone:0,playerZone:0,items:0,tokens:0,onGround:true,pathPoints:()=>null,
  sound:(event:number)=>{sounds.push(event);}};
let state=createProspector(c);
const tick=(dt=1)=>{
 const request=stepTasks(tasks,{boss:LEVEL_TASKS[13]!.boss},slot=>slot===32?c:undefined,world,dt);
 stepProspector(state,c,{bits:0,chasing:false,fwd:0,side:0,dt},{...world,active:tasks.boss===2});
 if(state.defeated&&tasks.boss===2)tasks.boss=3;
 return request;
};
c.flags|=CREATURE_FLAGS.near;
assert.equal(tick()!.text,0x4f4068);assert.equal(tasks.boss,1);
world.talking=true;tick(100);assert.equal(tasks.boss,1);
world.talking=false;tick();assert.equal(tasks.boss,2);assert.equal(c.pc,14);
assert.equal(c.record.facing,0);assert.equal(c.record.vulnerable,6);
const full=c.health;
damageCreature(sim,c,0,2);assert.equal(c.health,full,'spin is still blocked');
damageCreature(sim,c,0,4);tick();assert.equal(c.health,full-2);
assert.equal(c.record.vulnerable,4);assert.equal(state.hurt,59);
tick(59);assert.equal(state.hurt,0);assert.equal(c.record.vulnerable,4);
tick();assert.equal(c.record.vulnerable,6,'reopens only below zero');
while(c.health>9){c.stun=0;damageCreature(sim,c,0,4);tick();if(c.health>9)tick(60);}
assert.equal(c.health,9);assert.equal(c.pc,45);assert.equal(c.wait,0);
assert.equal(c.record.vulnerable,4);assert.equal(c.record.speed,0);
assert.equal(c.flags&(CREATURE_FLAGS.hurts|CREATURE_FLAGS.chase),0);
assert.equal(sounds.filter(s=>s===-2).length,1);assert.equal(tasks.done&16,0);
// Execute the real defeat wordcode: ensure the entry is valid and the
// delayed award survives eventual model removal.
stepCreatures(sim,world);assert.equal(c.animState,1);
c.type=0;
while(tasks.boss<120)tick();
assert.equal(tasks.done&16,0);tick();assert.equal(tasks.done&16,16);
assert.equal(tasks.boss,200);tick(500);assert.equal(sounds.filter(s=>s===-2).length,1);
sim=fresh();c=sim.creatures[0]!;state=createProspector(c);
assert.equal(state.hurt,0);assert.equal(state.fuse,0);assert.equal(c.health,full);
const shots:any[]=[];const attackWorld={x:c.x+20000,y:c.y,z:c.z,active:true,rand:sim.rand,
 sound:(event:number)=>sounds.push(event),projectile:(shot:any)=>shots.push(shot)};
const args={bits:0,chasing:true,fwd:0,side:0,dt:1};
c.animState=4;stepProspector(state,c,args,attackWorld);
assert.equal(c.animState,3);assert.equal(state.fuse,43);assert.equal(c.record.speed,0);
for(let i=0;i<42;i++)stepProspector(state,c,args,attackWorld);
assert.equal(shots.length,0);stepProspector(state,c,args,attackWorld);
assert.equal(shots.length,1);assert.equal(shots[0].kind,0x68);assert(sounds.includes(0xa6));
c.frame=22*65536;stepProspector(state,c,args,attackWorld);assert.equal(c.pc,16);assert.equal(c.record.speed,16);
c.animState=4;stepProspector(state,c,args,attackWorld);assert(state.fuse>0);
c.health=9;stepProspector(state,c,args,attackWorld);assert(state.defeated);assert.equal(state.fuse,0);
for(let i=0;i<60;i++)stepProspector(state,c,args,attackWorld);assert.equal(shots.length,1,'no post-defeat throw');
console.log('PASS: Prospector taunt, vulnerability/recovery, authored defeat and delayed token, reset, pick wind-up/release and cancellation');

const table=readEffectTable(readFileSync('Toy Story 2/toy2.exe'));
const effects=createEffects(table.kinds,table.modes,sim.rand),shot=shots[0];
const effectWorld={cameraX:shot.x,cameraY:shot.y,cameraZ:shot.z,playerX:shot.x+100000,playerY:shot.y,playerZ:shot.z,
 playerYaw:0,playerVx:0,playerVz:0,groundAt:()=>null,waterY:null};
const pick=spawnEffect(effects,effectWorld,shot.x,shot.y,shot.z,shot.vx,shot.vy,shot.vz,shot.gravity,shot.rotation,shot.spin,shot.kind)!;
assert(pick);stepEffects(effects,effectWorld);assert(pick.x!==shot.x||pick.z!==shot.z,'installed pick advances');
effectWorld.playerX=pick.x;effectWorld.playerY=pick.y+EFFECT.hitAbove;effectWorld.playerZ=pick.z;
touchPlayer(effects,effectWorld);assert.notEqual(effects.hurt,null,'pick causes player damage');
console.log('PASS: installed Prospector pick template movement and damage');
