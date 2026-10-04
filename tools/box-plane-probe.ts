/** Installed box/plane pairing, launch scripts, contact crash and trail gates. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unpackRaw} from '../src/formats/rnc.ts';
import {CREATURE_LIST_TYPE,parseCreatureList} from '../src/formats/creatures.ts';
import {sceneForLevel} from '../src/sim/level-data.ts';
import {createCreatureSim,RandomStream,CREATURE_HANDLERS,CREATURE_FLAGS,stepCreatures,buildCreature} from '../src/sim/creatures.ts';
import {AI_SCRIPTS} from '../src/sim/creature-data.ts';
const args={bits:0,chasing:false,fwd:0,side:0,dt:1};let boxes=0,planes=0;
for(const level of [5,7]){
 const raw=unpackRaw(readFileSync(`Toy Story 2/data/${sceneForLevel(level)}.raw`));
 const placements=parseCreatureList(raw.find(r=>r.type===CREATURE_LIST_TYPE)!.data);
 const make=()=>createCreatureSim(placements,{groundY:()=>0},new RandomStream(new Uint8Array([128,0,64,255])),level);
 for(const placement of placements.filter(c=>c.type===25)){
  const sim=make(),box=sim.creatures.find(c=>c.slot===placement.slot)!,first=sim.creatures.find(c=>c.slot===box.slot+1)!,second=sim.creatures.find(c=>c.slot===box.slot+2)!;
  assert.equal(first.type,24);assert.equal(second.type,24);
  assert.equal(first.health,0);assert.equal(first.respawn,10000);
  const handler=CREATURE_HANDLERS[box.handler!]!;assert(handler);
  box.timer=1;box.wait=99;handler(sim,box,args);
  assert.equal(box.timer,0);assert.equal(box.wait,0);assert.equal(box.pc,53);assert.equal(box.script,AI_SCRIPTS[21]);
  assert.equal(first.respawn,30);assert.equal(second.respawn,10000,'one plane per launch');
  // The spawn countdown is processed even when Buzz leaves this area.
  for(let i=0;i<30;i++)stepCreatures(sim,{x:1e8,y:1e8,z:1e8});
  assert.equal(first.respawn,0);assert.equal(first.health,0);
  stepCreatures(sim,{x:1e8,y:1e8,z:1e8});
  assert.equal(sim.creatures.find(c=>c.slot===first.slot)!.health,first.record.health);
  box.timer=1;handler(sim,box,args);assert.equal(second.respawn,30);
  second.health=1;box.timer=1;handler(sim,box,args);assert.equal(box.pc,59,'busy pair uses closed-box branch');
  const natural=make(),owner=natural.creatures.find(c=>c.slot===box.slot)!;
  let launched=false;
  for(let i=0;i<1200&&!launched;i++){
   stepCreatures(natural,{x:owner.x+20000,y:owner.y,z:owner.z});
   launched=natural.creatures.some(c=>c.type===24&&(c.slot===box.slot+1||c.slot===box.slot+2)&&c.health>0);
  }
  assert(launched,`authored box script never launched at level ${level} slot ${box.slot}`);
  boxes++;
 }
 for(const placement of placements.filter(c=>c.type===24)){
  const sim=make(),index=sim.creatures.findIndex(c=>c.slot===placement.slot),c=sim.creatures[index]=buildCreature(sim.creatures[index]!.record,false,sim.creatures[index]);
  const box=sim.creatures.find(b=>b.type===25&&(b.slot===c.slot-1||b.slot===c.slot-2))!;assert(box);
  box.x+=1000;box.y-=2000;box.z+=3000;
  const handler=CREATURE_HANDLERS[c.handler!]!;assert(handler);c.timer=1;
  handler(sim,c,args);
  assert.equal(c.timer,0);assert.deepEqual([c.x,c.y,c.z],[box.x,box.y,box.z]);
  assert.equal(c.homeY,box.y-20480);assert.deepEqual([c.targetX,c.targetY,c.targetZ],[box.x,box.y-20480,box.z]);
  assert(sim.sounds.some(s=>s.event===0x5d));
  sim.effectGates={four:false,eight:true};c.flags|=CREATURE_FLAGS.awake;
  handler(sim,c,args);assert.equal(sim.attachedEmissions.length,1);assert.deepEqual(sim.attachedEmissions[0]!.offset,{x:0,y:-200,z:400});
  assert.equal(sim.attachedEmissions[0]!.kind,88);assert.equal(sim.attachedEmissions[0]!.mode,3);
  sim.attachedEmissions=[];sim.effectGates.eight=false;handler(sim,c,args);assert.equal(sim.attachedEmissions.length,0);
  sim.effectGates.eight=true;c.flags&=~CREATURE_FLAGS.awake;handler(sim,c,args);assert.equal(sim.attachedEmissions.length,0);
  c.health=1;c.stun=0;c.flags|=CREATURE_FLAGS.touched;handler(sim,c,args);assert(c.deathTimer<0,'contact must crash one-health plane');
  sim.sounds=[];handler(sim,c,args);assert(!sim.sounds.some(s=>s.event===0x5d),'dead plane stops engine');
  planes++;
 }
}
console.log(`PASS: ${boxes} installed boxes and ${planes} planes, authored launch, ordered pair reuse, 30-tick spawn, parent position, contact crash and trail gates`);
