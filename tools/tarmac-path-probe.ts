/** Original 0042e790: Slinky's timed path and revocable slot 2 reward. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {createPickups, hideToken, revealToken} from '../src/sim/pickups.ts';
import {createTasks, markSlotDone, stepTasks} from '../src/sim/tasks.ts';
import {LEVEL_TASKS} from '../src/sim/level-data.ts';
import {buildCreature, CREATURE_FLAGS, RandomStream} from '../src/sim/creatures.ts';
const config = LEVEL_TASKS[14]!.timedPath!;
const pickups = createPickups(parseDat(readFileSync('Toy Story 2/data/level04/level1.dat')),14);
const token = pickups.items.find(i=>i.tokenSlot===2)!;
const giver = buildCreature({slot:38,x:0,y:0,z:0,type:44,script:0,turnRate:0,facing:0,
  health:102,respawn:0,flags:1,rangeX:1000,rangeZ:1000,rangeYaw:0,vulnerable:1,
  accel:0,accelSide:0,speedMax:0,speed:0},true);
let state = createTasks();
let hides=0;
const sounds:number[]=[];
const world = {coins:0,found:0,rand:new RandomStream(new Uint8Array([0])),talking:false,
  x:0,y:0,z:0,level:14,items:0,tokens:0,onGround:true,pathPoints:()=>null,
  cameraZone:0,playerZone:0,jumpState:0,standingSurface:8,
  sound:(event:number)=>{sounds.push(event);},
  hideToken:(slot:number)=>{hides++;hideToken(pickups,slot);}};
const tick=()=>stepTasks(state,{timedPath:config},i=>i===38?giver:undefined,world);
const touch=()=>{giver.flags|=CREATURE_FLAGS.touched;return tick();};
function accept(){
  const request=touch()!;
  assert.equal(request.text,0x4f471c);assert.equal(request.slot,2);
  assert.equal(state.pathRun,1);assert.equal(state.pathClock,100);
  assert.equal(giver.flags&CREATURE_FLAGS.touched,0);
  world.talking=true;for(let i=0;i<200;i++)tick();
  assert.equal(state.pathRun,1);assert.equal(state.pathClock,100);
  world.talking=false;markSlotDone(state,2);revealToken(pickups,2,false);tick();
  assert.equal(state.pathRun,2);assert.equal(state.pathClock,170);
  assert(token.enabled);assert.equal(pickups.revealTimers[2],132);
}
accept();
assert.deepEqual(sounds,[0xb6]);
const hurry=touch()!;assert.equal(hurry.text,0x4f47a4);assert.equal(hurry.slot,-1);
assert.equal(state.pathClock,170);assert.deepEqual(sounds,[0xb6]);
state.slowTick=0;
for(let i=0;i<70*64;i++)tick();
assert.equal(state.pathClock,100);assert.equal(state.pathRun,2);
for(let i=0;i<64;i++)tick();
assert.equal(state.pathClock,100);assert.equal(state.pathRun,0);assert.equal(hides,1);
assert.equal(state.done&4,0);assert(!token.enabled);assert.equal(pickups.revealTimers[2],0);
assert.equal(pickups.revealScales[2],0);
accept(); // Must get a fresh animated reveal after withdrawal.
for(const jumpState of [1,2,3,4]){
  world.jumpState=jumpState;tick();assert.equal(state.pathRun,0);assert(!token.enabled);
  world.jumpState=0;accept();
}
for(const jumpState of [0,5,6]){world.jumpState=jumpState;tick();assert.equal(state.pathRun,2);}
world.jumpState=0;world.standingSurface=0;tick();assert.equal(state.pathRun,0);assert(!token.enabled);
world.standingSurface=8;accept();
world.tokens=4;pickups.tokens=4;token.collected=true;world.jumpState=1;world.standingSurface=0;
const before=hides;tick();assert.equal(state.pathRun,0);assert.equal(hides,before);
assert.equal(touch(),null);assert.equal(giver.flags&CREATURE_FLAGS.touched,0);
hideToken(pickups,2);assert(token.enabled);assert(token.collected);
for(const slot of [-1,5,1.5])hideToken(pickups,slot);
state=createTasks();assert.equal(state.pathRun,0);assert.equal(state.pathClock,100);
console.log('PASS: Slinky offer/close/start/hurry, 64-tick clock and exact expiry, jump/slime failures, repeat reveal, collected reward immunity and fresh state.');
