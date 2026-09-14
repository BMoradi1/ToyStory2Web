import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCreature} from '../src/sim/creatures.ts';
import {readPodHelpers,createPodBoss,stepPodBoss,podBossBar,podRange} from '../src/sim/pod-boss.ts';
import {podBossAim} from '../src/sim/pod-beam.ts';
const helpers=readPodHelpers(readFileSync(`${process.argv[2]??'Toy Story 2'}/toy2.exe`));
assert.deepEqual(helpers,[8,8,7,7,8,9,10,7,11,8,11,7]);
assert.throws(()=>readPodHelpers(new Uint8Array()));
const creatures=Array.from({length:12},(_,slot)=>buildCreature({slot,type:slot===0?54:slot<7?55:20,x:0,y:0,z:0,
  script:0,turnRate:0,facing:0,health:slot===0?26:1,respawn:0,flags:1,rangeX:1000,rangeZ:1000,rangeYaw:0,
  vulnerable:7,accel:0,accelSide:0,speedMax:0,speed:0},true));
const at=(slot:number)=>creatures[slot],boss=creatures[0]!;
const state=createPodBoss(at,helpers),events:number[]=[];
const world={x:0,y:0,z:-0x1bb58,groundAt:()=>0,sound:(event:number)=>events.push(event)};
const tick=(n=1)=>{for(let i=0;i<n;i++)stepPodBoss(state,at,world);};
assert(creatures.slice(7).every(c=>c.health===0&&c.respawn===10000));
tick();assert.equal(state.phase,0);assert.equal(state.laserReady,false);
world.z++;tick();assert.equal(state.phase,1);assert.equal(state.cutTicks,360);
tick(359);assert.equal(state.phase,1);assert.equal(state.laserReady,false);
tick();assert.equal(state.phase,2);assert.equal(boss.record.speed,16);assert(events.includes(0xd5));
world.z=0;tick(200);assert.equal(state.laserReady,true);assert.equal(podBossBar(state),54);
for(let stage=1;stage<=6;stage++){
  assert.equal(state.stage,stage);boss.health-=3;tick();
  assert.equal(boss.health,stage<6?26-stage:18,'early hits clamp to one health per stage');
  assert.equal(boss.record.vulnerable,4);assert.equal(state.laserReady,false);
  tick(62);assert(state.released);assert(state.pair.every(id=>at(id)!.health>0));
  tick(299);assert.equal(state.cutTicks,0);
  tick(700);assert.equal(state.stage,stage,'living helpers keep the shell closed');
  for(const id of state.pair)at(id)!.health=0;
  tick();assert.equal(state.stage,stage+1);assert.equal(state.stun,120);
  tick(120);assert.equal(boss.record.vulnerable,7);
}
assert.equal(state.phase,3);
boss.health=10;tick();assert.equal(state.phase,4);assert(state.beaten);assert.equal(state.laserReady,false);
tick(121);assert(boss.deathTimer<0);tick(119);assert.equal(state.phase,5);assert(state.won);
state.won=false;tick();assert.equal(state.won,false,'victory emitted only once');
assert.equal(podBossBar(state),0);
assert.equal(podBossAim({x:0,y:0,z:0},{x:100,y:0,z:0},0),512);
assert.equal(podBossAim({x:0,y:0,z:0},{x:-100,y:0,z:0},0),3584);
assert(!podRange({x:400*256,y:0,z:0},{x:0,y:0,z:0},400));
console.log('PASS: retail helper table, intro/laser gates, six releases, shell health clamp, final phase, death/win, aim and range.');
