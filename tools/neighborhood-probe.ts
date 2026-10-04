/** Installed Neighborhood mower emission and kite flight/combat/reward boundaries. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unpackRaw} from '../src/formats/rnc.ts';
import {parseCreatureList} from '../src/formats/creatures.ts';
import {createCreatureSim,RandomStream,CREATURE_FLAGS,damageCreature,stepCreatures} from '../src/sim/creatures.ts';
import {createKite,stepKite,stepKiteLevel,stepMower,updateMowerRange,kiteBar} from '../src/sim/neighborhood.ts';
import {createTasks,stepTasks} from '../src/sim/tasks.ts';
import {LEVEL_TASKS} from '../src/sim/level-data.ts';
import {sin,cos} from '../src/sim/trig.ts';
const raw=unpackRaw(readFileSync('Toy Story 2/data/level02/level.raw'));
const placements=parseCreatureList(raw.find(r=>r.type===35)!.data);
const make=()=>createCreatureSim(placements,{groundY:()=>null},new RandomStream(new Uint8Array([128,192,55,99,255])),2);
{
 const sim=make(),c=sim.creatures.find(c=>c.type===12)!,effects:any[]=[],shots:any[]=[],sounds:number[]=[];
 const w={gateTwo:2,gateSixteen:true,rand:sim.rand,sound:(n:number)=>sounds.push(n),
  effect:(p:any,kind:number,mode:number)=>{const e:any={...p,kind,mode};effects.push(e);return e;},
  projectile:(p:any,v:any,gravity:number,rotation:number,spin:number,kind:number)=>{const e:any={...p,v,gravity,rotation,spin,kind};shots.push(e);return e;}};
 c.flags&=~CREATURE_FLAGS.awake;stepMower(c,w);assert.deepEqual(sounds,[0x4b]);assert.equal(effects.length+shots.length,0);
 c.flags|=CREATURE_FLAGS.awake;c.heading=0;stepMower(c,w);assert.equal(effects[0].kind,49);assert.equal(effects[0].rotation,2048);assert.equal(shots.length,2);
 const shot=shots[0],yaw=(1280+192*6)&4095;
 assert.deepEqual(shot.v,{x:sin(yaw)>>4,y:55-3072,z:cos(yaw)>>4});assert.equal(shot.rotation,55<<4);assert.equal(shot.spin,55*2-256);assert.equal(shot.gravity,256);assert.equal(shot.g,96);
 assert.equal(shot.x,c.x);assert.equal(shot.z,c.z-16384);assert.equal(shot.kind,50);
 updateMowerRange(c,{x:-500000,y:1e9,z:-100000});assert.equal(c.bodyRadius,3800);
 updateMowerRange(c,{x:-0x7ccdc,y:0,z:-100000});assert.equal(c.bodyRadius,1800,'strict mower range rectangle');
}
const args={bits:0,chasing:false,fwd:0,side:0,dt:1};
{
 const sim=make(),c=sim.creatures.find(c=>c.type===15)!,s=createKite(c),sounds:number[]=[],looks:any[]=[];
 const w={x:c.x+50000,y:-500000,z:c.z,phase:0,rand:sim.rand,sound:(n:number)=>sounds.push(n),lookAt:(p:any)=>looks.push(p)};
 assert(c.flags&CREATURE_FLAGS.diedOnce);
 stepKite(s,c,args,w);assert.equal(c.hover,sin(36)>>6);assert.equal(c.y,(sin(64)>>3)-0x7c000);
 w.phase=2;stepKite(s,c,args,w);assert.equal(c.timer,2);assert.equal(c.heading,64);assert.equal(c.targetX,w.x);assert(c.targetY<=-0x741ad);assert.equal(s.barTicks,90);assert.equal(kiteBar(s,c),54);assert(sounds.includes(0x3c));assert(looks.length);
 const oldHealth=c.health;c.health=5;stepKite(s,c,{...args,chasing:true},w);assert.equal(s.health,5);assert.equal(s.hurt,60);assert.equal(c.wait,0);assert(sounds.includes(0x98));assert.equal(kiteBar(s,c),27);
 stepKite(s,c,{...args,chasing:true},w);assert.equal(s.hurt,59);
 w.y=-0x71fff;stepKite(s,c,args,w);assert.equal(c.targetX,c.homeX);assert.equal(c.targetZ,c.homeZ);assert.equal(c.record.vulnerable,4);assert.equal(c.wait,50);assert(!(c.flags&CREATURE_FLAGS.chase));
 assert(c.health<oldHealth);assert(c.y<=-0x741ad);
}
{
 const sim=make(),c=sim.creatures.find(c=>c.type===15)!,s=createKite(c),tasks=createTasks();tasks.kite=s;c.flags|=CREATURE_FLAGS.near;
 const world={x:180000,y:-500000,z:240000,level:2,coins:0,found:0,rand:sim.rand,talking:false,cameraZone:0,playerZone:0,items:0,tokens:0,onGround:true,pathPoints:()=>null};
 const tick=(dt=1)=>stepTasks(tasks,{boss:LEVEL_TASKS[2]!.boss},i=>sim.creatures.find(c=>c.slot===i),world,dt);
 assert(tick());assert.equal(tasks.boss,1);world.talking=true;tick();assert.equal(tasks.boss,1);world.talking=false;tick();assert.equal(tasks.boss,2);assert.equal(c.pc,14);
 s.barTicks=90;c.health=2;c.stun=0;damageCreature(sim,c,0,4);stepCreatures(sim,{x:c.x,y:c.y,z:c.z});assert.equal(c.type,0);
 s.tail={x:world.x,y:world.y,z:world.z};const before={...s.tail},fx:any[]=[];
 tasks.boss=stepKiteLevel(s,c,tasks.boss,{...world,gateFour:true,effect:(...e:any[])=>fx.push(e)});
 assert.equal(tasks.boss,4);assert.equal(s.tail.y,before.y+192);assert.equal(fx[0][3],58);assert.equal(kiteBar(s,c),0);
 while(tasks.boss<120)tick();assert.equal(tasks.done&16,0);tick();assert.equal(tasks.done&16,16);assert.equal(tasks.boss,200);
}
console.log('PASS: installed mower gates/random offsets/grass colour/range; kite bob/roll, dive/retreat, health response, camera cue, taunt/bar, falling tail and delayed reward');
