import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unpackRaw} from '../src/formats/rnc.ts';
import {parseCreatureList} from '../src/formats/creatures.ts';
import {parseDat} from '../src/formats/dat.ts';
import {createCreatureSim,RandomStream,CREATURE_FLAGS} from '../src/sim/creatures.ts';
import {createTasks,stepTasks,markSlotDone} from '../src/sim/tasks.ts';
import {createPickups,setChallengeItems,stepPickups,PickupKind} from '../src/sim/pickups.ts';
import {createPlayer} from '../src/sim/player.ts';
import {LEVEL_TASKS,sceneForLevel} from '../src/sim/level-data.ts';
for(const level of [4,5,11,13]){
 const dir=`Toy Story 2/data/${sceneForLevel(level)}`;
 const raw=unpackRaw(readFileSync(`${dir}.raw`));
 const sim=createCreatureSim(parseCreatureList(raw.find(r=>r.type===35)!.data),{groundY:()=>null},new RandomStream(new Uint8Array([128])),level);
 const config=LEVEL_TASKS[level]!.challenge!,tasks=createTasks(),pickups=createPickups(parseDat(readFileSync(`${dir}.dat`)),level);
 const items=pickups.items.filter(i=>i.id>=config.firstItem&&i.id<config.firstItem+5);
 assert.equal(items.length,5);assert(items.every(i=>i.kind===PickupKind.Kind9&&!i.enabled));
 const at=(slot:number)=>sim.creatures.find(c=>c.slot===slot),giver=at(config.creature)!;
 const sounds:number[]=[];
 const world={coins:0,found:0,rand:sim.rand,talking:false,x:0,y:0,z:0,level,items:0,tokens:0,onGround:true,pathPoints:()=>null,cameraZone:config.cameraZones?.[0]??0,playerZone:0,challengeItems:(enabled:boolean)=>setChallengeItems(pickups,level,enabled),sound:(event:number)=>sounds.push(event)};
 const tick=()=>{world.items=pickups.itemsFound;return stepTasks(tasks,{challenge:config},at,world);};
 const touch=()=>{giver.flags|=CREATURE_FLAGS.touched;return tick();};
 const collect=(index:number)=>{const i=items[index]!;stepPickups(pickups,createPlayer(i.x*32,(i.y+230)*32,i.z*32));};
 collect(0);assert.equal(pickups.itemsFound,0,'unaccepted challenge item collected');
 function offer(){
  assert.equal(touch()!.text,config.askText);assert.equal(tasks.challenge,1);assert(items.every(i=>i.enabled&&!i.collected));
  world.talking=true;for(let i=0;i<130;i++)tick();assert.equal(tasks.challenge,1);world.talking=false;tasks.slowTick=0;tick();assert.equal(tasks.challengeClock,config.clock);assert.equal(tasks.challenge,2);
 }
 offer();collect(0);assert.equal(pickups.itemsFound,1);assert.equal(touch()!.text,config.hurryText);
 tasks.slowTick=0;for(let i=0;i<(config.clock-100)*64;i++)tick();assert.equal(tasks.challengeClock,100);assert.equal(tasks.challenge,2);
 for(let i=0;i<64;i++)tick();assert.equal(tasks.challenge,0);assert(items.every(i=>!i.enabled));
 offer();if(config.cameraZones){world.cameraZone=0;tick();assert.equal(tasks.challenge,0);world.cameraZone=4;offer();}
 for(let i=0;i<5;i++)collect(i);assert.equal(pickups.itemsFound-tasks.challengeFrom,5);tick();assert.equal(tasks.challenge,2,'fifth pickup must still return to giver');
 assert.equal(touch()!.slot,2);assert.equal(tasks.challenge,3);assert.equal(touch(),null,'reward repeated');markSlotDone(tasks,2);assert.equal(touch(),null);
 assert(sounds.includes(config.askSound)&&sounds.includes(config.doneSound));
 console.log(`PASS level ${level}: installed five pickups, hidden start, dialogue, full deadline, partial failure/retry, zone rule, collection and one-shot reward`);
}
