/** Timed tasks share DAT_0052f1cb with effects, including across level resets. */
import assert from 'node:assert/strict';
import {createTasks,stepTasks} from '../src/sim/tasks.ts';
import {createEffects,stepEffectGates} from '../src/sim/effects.ts';
import {RandomStream} from '../src/sim/creatures.ts';
import {LEVEL_TASKS} from '../src/sim/level-data.ts';
const rand=new RandomStream(new Uint8Array([0]));
let effects=createEffects([],[],rand);
// Arrive partway through a global cycle, then replace level-owned state.
for(let i=0;i<47;i++)stepEffectGates(effects);
effects=createEffects([],[],rand);
for(const level of [4,5,7,11,13,14]){
 const config=LEVEL_TASKS[level]!,tasks=createTasks();
 const clock=level===7?'fetchClock':level===14?'pathClock':'challengeClock';
 if(level===7){tasks.fetch=2;tasks.fetchDone=1;tasks.fetchClock=150;}
 else if(level===14){tasks.pathRun=2;tasks.pathClock=150;}
 else {tasks.challenge=2;tasks.challengeClock=150;}
 const world={coins:0,found:0,rand,talking:false,x:0,y:0,z:0,level,items:0,tokens:0,onGround:true,pathPoints:()=>null,cameraZone:1,playerZone:0,jumpState:0,standingSurface:8,timerGate:false};
 const tick=()=>stepTasks(tasks,{fetch:config.fetch,timedPath:config.timedPath,challenge:config.challenge},()=>undefined,world);
 for(let i=0;i<200;i++)tick();assert.equal(tasks[clock],150,'local counter overrode shared false gate');
 world.timerGate=true;tick();assert.equal(tasks[clock],149);assert.equal(tasks.slowTick,0);
 world.timerGate=false;tick();assert.equal(tasks[clock],149);
 console.log(`PASS level ${level}: shared gate exclusively controls deadline`);
}
for(let i=0;i<16;i++){stepEffectGates(effects);assert(!effects.gate.sixtyFour);}
stepEffectGates(effects);assert(effects.gate.sixtyFour,'level reset restarted global phase');
console.log('PASS level-owned effect/task resets preserve the shared divider phase');
