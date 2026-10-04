/** Shared Zurg-car hook against every installed placement and boundary cases. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unpackRaw} from '../src/formats/rnc.ts';
import {CREATURE_LIST_TYPE,parseCreatureList} from '../src/formats/creatures.ts';
import {sceneForLevel} from '../src/sim/level-data.ts';
import {createCreatureSim,RandomStream,CREATURE_HANDLERS,CREATURE_FLAGS,stepCreatures,updateCreatureVisibility} from '../src/sim/creatures.ts';
import {AI_SCRIPTS} from '../src/sim/creature-data.ts';
import {sin} from '../src/sim/trig.ts';
const args={bits:1,chasing:true,fwd:0,side:300,dt:1};let total=0;
for(const level of [2,4,8,9]){
 const raw=unpackRaw(readFileSync(`Toy Story 2/data/${sceneForLevel(level)}.raw`));
 const placements=parseCreatureList(raw.find(r=>r.type===CREATURE_LIST_TYPE)!.data).filter(c=>c.type===14);
 assert(placements.length>0);
 for(const placement of placements){
  const sim=createCreatureSim([placement],{groundY:()=>0},new RandomStream(new Uint8Array([128])),level),c=sim.creatures[0]!;
  sim.effectGates={four:true,eight:true};const handler=CREATURE_HANDLERS[c.handler!]!;assert(handler);c.flags|=CREATURE_FLAGS.awake;
  handler(sim,c,args);assert.equal(c.timer,c.health);assert(sim.sounds.some(s=>s.event===0x41));assert.equal(sim.emissions.length,2);
  if(c.record.accelSide===255)assert(sim.sounds.some(s=>s.event===0x42));
  for(const [i,[x,z]]of [[0,[0x7a0,-0x460]],[1,[-0x7a0,-0x3a0]]] as [number,number[]][]){
   assert.equal(sim.emissions[i]!.x,c.x+(sin(c.heading+x!)*3>>2));assert.equal(sim.emissions[i]!.z,c.z+(sin(c.heading+z!)*3>>2));
  }
  c.health=2;c.timer=3;c.animState=0;c.wait=30;handler(sim,c,args);
  assert.equal(c.script,AI_SCRIPTS[12]);assert.equal(c.pc,62);assert.equal(c.wait,0);assert.equal(c.timer,2);
  c.animState=1;c.health=1;c.pc=5;c.wait=9;handler(sim,c,args);assert.equal(c.pc,5,'hurt animation is not restarted');assert.equal(c.wait,9);
  c.health=101;c.timer=1;handler(sim,c,args);assert.equal(c.timer,1,'special health bypasses hurt recovery');
  for(const [speed,awake,death,gate,count]of [[256,true,0,true,0],[257,true,0,true,2],[300,false,0,true,0],[300,true,-1,true,0],[300,true,0,false,0]] as const){
   sim.emissions=[];c.flags=awake?CREATURE_FLAGS.awake:0;c.deathTimer=death;sim.effectGates.four=gate;handler(sim,c,{...args,side:speed});assert.equal(sim.emissions.length,count);
  }
  sim.emissions.push({x:0,y:0,z:0,kind:39,mode:2});stepCreatures(sim,{x:1e8,y:1e8,z:1e8});assert.equal(sim.emissions.length,0,'emission queue clears each tick');
  total++;
 }
}

{
 const raw=unpackRaw(readFileSync(`Toy Story 2/data/${sceneForLevel(2)}.raw`));
 const placement=parseCreatureList(raw.find(r=>r.type===CREATURE_LIST_TYPE)!.data).find(c=>c.type===14)!;
 const sim=createCreatureSim([placement],{groundY:()=>0},new RandomStream(new Uint8Array([128])),2),c=sim.creatures[0]!;
 c.x=c.y=c.z=0;c.bodyRadius=100;c.flags=CREATURE_FLAGS.near;
 const visible=new Set([c.slot]);
 updateCreatureVisibility(sim,{x:400*32,y:0,z:0},visible);assert(!(c.flags&1),'strict wake boundary');
 updateCreatureVisibility(sim,{x:399*32,y:0,z:0},visible);assert(c.flags&1);
 updateCreatureVisibility(sim,{x:640*32,y:0,z:0},visible);assert(c.flags&1,'visibility range hysteresis');
 updateCreatureVisibility(sim,{x:641*32,y:0,z:0},visible);assert(!(c.flags&1));
 updateCreatureVisibility(sim,{x:0,y:0,z:0},visible);assert(c.flags&1);
 updateCreatureVisibility(sim,{x:0,y:0,z:0},new Set());assert(!(c.flags&1),'off-screen clears visibility');
}
console.log(`PASS: ${total} installed Zurg cars across four levels, engine cues, wheel smoke offsets/gates, hurt script recovery, special health and queue lifecycle`);
