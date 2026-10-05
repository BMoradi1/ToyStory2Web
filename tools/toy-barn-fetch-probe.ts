import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unpackRaw} from '../src/formats/rnc.ts';
import {parseCreatureList} from '../src/formats/creatures.ts';
import {parseDat} from '../src/formats/dat.ts';
import {createCreatureSim,RandomStream,CREATURE_FLAGS} from '../src/sim/creatures.ts';
import {createTasks,stepTasks,markSlotDone} from '../src/sim/tasks.ts';
import {createPickups,revealToken,hideToken} from '../src/sim/pickups.ts';
import {LEVEL_TASKS} from '../src/sim/level-data.ts';
const raw=unpackRaw(readFileSync('Toy Story 2/data/level07/level.raw'));
const sim=createCreatureSim(parseCreatureList(raw.find(r=>r.type===35)!.data),{groundY:()=>null},new RandomStream(new Uint8Array([128])),7);
const config=LEVEL_TASKS[7]!.fetch!,tasks=createTasks(),pickups=createPickups(parseDat(readFileSync('Toy Story 2/data/level07/level.dat')),7);
const at=(slot:number)=>sim.creatures.find(c=>c.slot===slot),giver=at(config.creature)!,egg=at(config.watch)!,token=pickups.items.find(i=>i.tokenSlot===2)!;
let hides=0;
const world={cannonActive:false,coins:0,found:0,rand:sim.rand,talking:false,x:0,y:0,z:0,level:7,items:0,tokens:0,onGround:true,pathPoints:()=>null,cameraZone:0,playerZone:0,hideToken:(slot:number)=>{hides++;hideToken(pickups,slot);}};
const tick=()=>stepTasks(tasks,{fetch:config},at,world);
function offer(second:boolean){
 giver.flags|=CREATURE_FLAGS.touched;const request=tick()!;
 assert.equal(request.text,second?config.againText:config.askText);assert.equal(request.slot,second?2:-1);
 assert.equal(tasks.fetch,1);const clock=tasks.fetchClock;world.talking=true;
 for(let t=0;t<130;t++)tick();assert.equal(tasks.fetch,1);assert.equal(tasks.fetchClock,clock);
 if(second){markSlotDone(tasks,2);revealToken(pickups,2,false);}
 world.talking=false;tick();assert.equal(tasks.fetch,2);
}
world.cannonActive=true;giver.flags|=CREATURE_FLAGS.touched;assert.equal(tick()!.text,config.hurryText);assert.equal(tasks.fetch,0);world.cannonActive=false;
offer(false);
egg.health=999;tick();assert.equal(tasks.fetchDone,0,'dying sentinel completed first run early');
egg.health=0;tick();assert.equal(tasks.fetchDone,1);assert.equal(tasks.fetch,0);assert.equal(hides,0);
for(const failure of ['deadline','zone']){
 offer(true);assert(token.enabled);
 if(failure==='zone'){world.cameraZone=4;tick();world.cameraZone=0;}
 else{tasks.slowTick=0;for(let t=0;t<31*64;t++)tick();}
 assert.equal(tasks.fetch,0);assert.equal(tasks.fetchDone,1);assert.equal(tasks.fetchClock,100);
 assert(!token.enabled);assert.equal(tasks.done&4,0);assert.equal(pickups.revealTimers[2],0);
}
assert.equal(hides,2);
offer(true);world.tokens=4;world.cameraZone=4;tick();
assert.equal(tasks.fetchDone,2);assert.equal(tasks.fetch,0);assert.equal(hides,2,'success lost to failure-zone gate');assert.equal(tasks.done&4,4);
giver.flags|=CREATURE_FLAGS.touched;assert.equal(tick(),null,'completed fetch offered again');
console.log('PASS installed two-stage fetch: dialogue holds clock, death sentinel, timeout/zone reward withdrawal, retry and success precedence');
