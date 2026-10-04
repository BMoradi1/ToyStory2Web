/** Installed Alleys boats, cannonball damage, clown recovery and reward timing. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unpackRaw} from '../src/formats/rnc.ts';
import {parseCreatureList} from '../src/formats/creatures.ts';
import {createCreatureSim,RandomStream,CREATURE_HANDLERS,CREATURE_FLAGS,damageCreature,stepCreatures} from '../src/sim/creatures.ts';
import {createClown,stepClown,clownBar} from '../src/sim/clown.ts';
import {createTasks,stepTasks} from '../src/sim/tasks.ts';
import {LEVEL_TASKS} from '../src/sim/level-data.ts';
import {sin,cos} from '../src/sim/trig.ts';
import {readEffectTable,EFFECT} from '../src/formats/effect-table.ts';
import {createEffects,spawnEffect,stepEffects,touchPlayer} from '../src/sim/effects.ts';
const raw=unpackRaw(readFileSync('Toy Story 2/data/level05/level.raw'));
const placements=parseCreatureList(raw.find(r=>r.type===35)!.data);
const make=()=>createCreatureSim(placements,{groundY:()=>null},new RandomStream(new Uint8Array([128,0,255])),5);
const args={bits:0,chasing:false,fwd:0,side:0,dt:1};let boats=0;
for(const p of placements.filter(c=>c.type===27)){
 const sim=make(),c=sim.creatures.find(c=>c.slot===p.slot)!,handler=CREATURE_HANDLERS[c.handler!]!;assert(handler);
 handler(sim,c,args);assert.equal(c.timer,200);assert.equal(sim.attachedProjectiles.length,1);
 for(let i=0;i<200;i++)handler(sim,c,args);
 assert.equal(c.timer,0);assert.equal(sim.attachedProjectiles.length,1,'strict negative timer');
 handler(sim,c,args);assert.equal(sim.attachedProjectiles.length,2);
 const shot=sim.attachedProjectiles[0]!;
 assert.deepEqual(shot.offset,{x:0,y:-500,z:-300});assert.deepEqual(shot.velocity,{x:sin(c.heading)>>2,y:-3072,z:cos(c.heading)>>2});
 assert.equal(shot.gravity,128);assert.equal(shot.kind,92);assert.equal(shot.part,0);
 stepCreatures(sim,{x:1e8,y:1e8,z:1e8});assert.equal(sim.attachedProjectiles.length,0,'queued shells do not survive a tick');
 boats++;
}
const sim=make(),c=sim.creatures.find(c=>c.type===32)!,state=createClown(c),tasks=createTasks();tasks.clown=state;
const sounds:number[]=[];
const world={x:c.x,y:c.y,z:c.z,level:5,coins:0,found:0,rand:sim.rand,talking:false,cameraZone:2,playerZone:2,items:0,tokens:0,onGround:true,pathPoints:()=>null};
const tick=(dt=1)=>{
 const request=stepTasks(tasks,{boss:LEVEL_TASKS[5]!.boss},i=>i===c.slot?c:undefined,world,dt);
 if(c.type!==0)stepClown(state,c,tasks.boss,world.cameraZone,event=>sounds.push(event),dt);
 return request;
};
c.flags|=CREATURE_FLAGS.near;assert(tick(),'clown intro trigger');assert.equal(tasks.boss,1);
world.talking=true;tick(100);assert.equal(tasks.boss,1);assert.equal(clownBar(state,c),-1);
world.talking=false;tick();assert.equal(tasks.boss,2);assert.equal(c.pc,14);assert.equal(c.record.facing,0);assert.equal(clownBar(state,c),54);
c.health=10;tick();assert.equal(clownBar(state,c),27,'bar is health / 20');assert.equal(state.hurt,59);assert.equal(c.record.vulnerable,4);
let lit=0;for(let i=0;i<59;i++){tick();if(state.flash)lit++;}
assert.equal(state.hurt,0);assert.equal(c.record.vulnerable,4,'zero tick remains protected');assert(lit>20&&lit<40,'alternating flash');
tick();assert.equal(c.record.vulnerable,7);assert(!state.flash);
c.flags|=CREATURE_FLAGS.touched;tick();assert(!(c.flags&CREATURE_FLAGS.touched));assert.equal(sounds.filter(n=>n===0xa1).length,1);tick();assert.equal(sounds.length,1);
world.cameraZone=1;tick(89);assert(clownBar(state,c)>=0);tick();assert.equal(clownBar(state,c),-1,'bar expires outside rooftop camera room');
world.cameraZone=2;tick();assert.equal(clownBar(state,c),27);
c.health=2;c.stun=0;damageCreature(sim,c,0,4);stepCreatures(sim,world);assert.equal(c.type,0,'real damage removes clown');
tick();assert.equal(tasks.boss,4);assert.equal(clownBar(state,c),0);assert.equal(tasks.done&16,0);
while(tasks.boss<120)tick();assert.equal(tasks.done&16,0);tick();assert.equal(tasks.boss,200);assert.equal(tasks.done&16,16);
const table=readEffectTable(readFileSync('Toy Story 2/toy2.exe')),pool=createEffects(table.kinds,table.modes,sim.rand);
const ew={cameraX:0,cameraY:0,cameraZ:0,playerX:100000,playerY:0,playerZ:0,playerYaw:0,playerVx:0,playerVz:0,groundAt:()=>null,waterY:null};
const shell=spawnEffect(pool,ew,0,0,0,0,-3072,4096,128,0,0,92)!;assert(shell);
stepEffects(pool,ew);assert(shell.y<0&&shell.z>0);assert.equal(shell.gravity,32);
ew.playerX=shell.x;ew.playerY=shell.y+EFFECT.hitAbove;ew.playerZ=shell.z;touchPlayer(pool,ew);assert.notEqual(pool.hurt,null,'boat shell damages Buzz');
console.log(`PASS: ${boats} installed boat timers/trajectories and shell damage; clown taunt, hit immunity/flash, contact sound, health bar, removal and delayed token`);
