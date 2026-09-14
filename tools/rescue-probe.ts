import assert from 'node:assert/strict';
import {buildCreature,createCreatureSim,CREATURE_HANDLERS,CREATURE_FLAGS,RandomStream} from '../src/sim/creatures.ts';
import {CREATURE_TYPES} from '../src/sim/creature-data.ts';
const cues:Record<string,number>={FUN_00416a60:0x20,FUN_00418610:0x49,FUN_0041bb80:0x6c,
 FUN_0041dec0:0xa2,FUN_00420ed0:0x77,FUN_00422c70:0xb8,FUN_004259b0:0x8e,
 FUN_00428650:0x96,FUN_0042c150:0x6c,FUN_0042d620:0x1f};
const record={slot:2,x:100,y:200,z:300,type:6,script:0,turnRate:0,facing:0,health:102,respawn:0,flags:1,
 rangeX:1000,rangeZ:1000,rangeYaw:0,vulnerable:1,accel:0,accelSide:0,speedMax:0,speed:0};
const args={bits:1,chasing:true,fwd:0,side:0,dt:1};
const covered=new Set<string>();
for(const [type,data] of Object.entries(CREATURE_TYPES)){
 if(!data.handler||!(data.handler in cues))continue;
 covered.add(data.handler);
 const sim=createCreatureSim([],{groundY:()=>null},new RandomStream(new Uint8Array([0])),1);
 const c=buildCreature({...record,type:Number(type)},true);
 Object.assign(c,{timer:100,health:102,offsetX:400,offsetY:500,offsetZ:600});
 const run=()=>CREATURE_HANDLERS[data.handler!]!(sim,c,args);
 run();assert.equal(sim.foundCount,0);assert.equal(sim.rescues.length,0,'untouched creature');
 c.flags|=CREATURE_FLAGS.touched;c.health=0;run();assert.equal(sim.foundCount,0,'dead creature');
 c.health=102;run();assert.equal(sim.foundCount,1);
 assert.deepEqual(sim.rescues,[{x:c.x,y:c.y-0x2000,z:c.z}]);
 assert.deepEqual(sim.sounds,[{event:cues[data.handler],x:c.x,y:c.y,z:c.z}]);
 assert.equal(c.health,0);assert.equal(sim.deaths.length,0,'rescue must not spill a death coin');
 run();assert.equal(sim.foundCount,1);assert.equal(sim.rescues.length,1);assert.equal(sim.sounds.length,1);
}
assert.equal(covered.size,10);
console.log('PASS: all ten rescue handlers and their type variants, pickup cues, origin offset, one-shot count/burst, untouched/dead guards and no enemy-death rewards.');
