import assert from 'node:assert/strict';
import {buildCreature,createCreatureSim,CREATURE_HANDLERS,RandomStream} from '../src/sim/creatures.ts';
const record={slot:2,x:100,y:200,z:300,type:5,script:0,turnRate:0,facing:0,health:12,respawn:0,flags:1,
 rangeX:1000,rangeZ:1000,rangeYaw:0,vulnerable:1,accel:0,accelSide:0,speedMax:0,speed:0};
for(const state of [3,5]){
 const sim=createCreatureSim([],{groundY:()=>null},new RandomStream(new Uint8Array([0])),1);
 const c=buildCreature(record,true);
 Object.assign(c,{health:12,animState:state,offsetX:123,offsetY:-456,offsetZ:789});
 const step=()=>CREATURE_HANDLERS[c.handler!]!(sim,c,{bits:1,chasing:true,fwd:0,side:0,dt:1});
 step();assert.equal(sim.defeatBursts.length,0,'initial health does not explode');
 c.health=10;step();assert.equal(c.pc,90);assert.equal(sim.defeatBursts.length,0,'surviving hit');
 c.health=9;c.animState=0;step();assert.equal(sim.bossLastHealth,10,'closed state defers transition');
 assert.equal(sim.defeatBursts.length,0);
 c.animState=state;step();assert.equal(c.pc,101);assert.equal(c.record.vulnerable,4);
 const at={x:c.x+123,y:c.y-456,z:c.z+789};
 assert.deepEqual(sim.defeatBursts,[{...at,light:{...at,r:240,g:128,b:0,life:32,owner:0x52c840+2*0x9c}}]);
 assert.equal(sim.deaths.length,0,'script explosion does not spill a coin');
 step();assert.equal(sim.defeatBursts.length,1,'same health cannot repeat explosion');
 c.animState=7;c.frame=12<<16;step();assert.equal(sim.bossSlotEarned,false);
 c.frame=13<<16;step();assert.equal(sim.bossSlotEarned,true,'token timing preserved');
 assert.equal(createCreatureSim([],sim.world,sim.rand,1).defeatBursts.length,0,'reset clears requests');
}
console.log('PASS: Tin Robot hit/death threshold, open-state gates, origin/light/owner, one-shot burst, no coin, token timing and reset.');
