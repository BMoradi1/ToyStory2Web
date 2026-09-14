import assert from 'node:assert/strict';
import {buildCreature,createCreatureSim,killCreature,RandomStream} from '../src/sim/creatures.ts';
import {createPointLights,addPointLight,stepPointLights} from '../src/sim/point-light.ts';
const record={slot:2,x:100,y:200,z:300,type:3,script:0,turnRate:0,facing:0,health:3,respawn:0,flags:1,
 rangeX:1000,rangeZ:1000,rangeYaw:0,vulnerable:1,accel:0,accelSide:0,speedMax:0,speed:0};
const sim=createCreatureSim([],{groundY:()=>null},new RandomStream(new Uint8Array([0])),1);
for(const type of [3,4,14,20,24,16,25,54,27,33,46,41,1]){
 const c=buildCreature({...record,type},true);
 Object.assign(c,{offsetX:123,offsetY:-456,offsetZ:789});
 sim.deaths.length=0;killCreature(c,1,sim);
 assert.equal(sim.deaths.length,1);
 const event=sim.deaths[0]!;
 if(event.burst>0){
  assert.deepEqual(event.light,{x:c.x+123,y:c.y-456,z:c.z+789,r:240,g:128,b:0,life:32,owner:0x52c840+2*0x9c});
  const pool=createPointLights();addPointLight(pool,event.light!);
  const buzz={x:event.light!.x,y:event.light!.y+8192,z:event.light!.z-8192};
  assert.deepEqual(stepPointLights(pool,buzz)!.colour,[236,126,0]);
  for(let i=1;i<32;i++)stepPointLights(pool,buzz);
  assert.equal(pool.slots[0]!.life,0);assert.equal(pool.remaining,63);
 }else assert.equal(event.light,null,'spark-only and nonburst deaths have no orange light');
 killCreature(c,1,sim);assert.equal(sim.deaths.length,1,'repeated death cannot replay flash');
}
const removed=buildCreature(record,true);sim.deaths.length=0;killCreature(removed,2,sim);
assert.equal(sim.deaths.length,0,'removal alone does not flash');
const a=buildCreature(record,true),b=buildCreature({...record,slot:3},true);
killCreature(a,1,sim);killCreature(b,1,sim);
assert.notEqual(sim.deaths[0]!.light!.owner,sim.deaths[1]!.light!.owner);
console.log('PASS: creature death centre, RGB, lifetime, distinct slot owners, one-shot emission, spark-only/removal exclusion and fade-back.');
