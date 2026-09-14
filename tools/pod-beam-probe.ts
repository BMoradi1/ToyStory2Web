import assert from 'node:assert/strict';
import {buildCreature,createCreatureSim,CREATURE_HANDLERS,RandomStream,stepCreatures} from '../src/sim/creatures.ts';
import {podMuzzle,podBeam,podImpactHits} from '../src/sim/pod-beam.ts';
import {sweepSphere,type CollisionWorld} from '../src/formats/collision.ts';
const c=buildCreature({slot:0,x:0,y:0,z:0,type:20,script:0,turnRate:0,facing:0,health:3,respawn:0,flags:1,
  rangeX:1000,rangeZ:1000,rangeYaw:0,vulnerable:1,accel:0,accelSide:0,speedMax:0,speed:0},true);
const sim=createCreatureSim([],{groundY:()=>null},new RandomStream(new Uint8Array([0,255])),5);
const handler=CREATURE_HANDLERS[c.handler!]!;
const args={bits:1,chasing:true,fwd:0,side:0,dt:1};
for(const [before,fires] of [[282,false],[281,true],[101,true],[100,false]] as const){
  c.timer=before;sim.beamCasters=[];handler(sim,c,args);assert.equal(sim.beamCasters.length,fires?1:0);
}
c.timer=0;handler(sim,c,args);assert.equal(c.timer,360);assert(c.vx<0);
c.timer=0;handler(sim,c,args);assert(c.vx>0);
c.timer=150;sim.beamCasters=[];handler(sim,c,{...args,chasing:false});assert.equal(c.timer,360);assert.equal(sim.beamCasters.length,0);
c.hover=0;handler(sim,c,{...args,fwd:1000,chasing:false});assert.equal(c.hover,-32);
sim.beamCasters=[c];stepCreatures(sim,{x:0,y:0,z:0});assert.equal(sim.beamCasters.length,0,'requests expire each tick');
c.hover=0;
assert.deepEqual(podMuzzle(c,null),{x:0,y:0,z:3200});
assert.deepEqual(podMuzzle({...c,heading:1024},null),{x:3200,y:0,z:0});
assert.deepEqual(podMuzzle(c,{translation:{x:10,y:20,z:30},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}}),{x:-320,y:640,z:2240});
assert(podImpactHits({x:6399,y:0,z:0},{x:0,y:0,z:0}));
assert(!podImpactHits({x:6400,y:0,z:0},{x:0,y:0,z:0}));
assert(!podImpactHits({x:-6145,y:0,z:0},{x:0,y:0,z:0}),'signed shift boundary');
const empty:CollisionWorld={polys:[],groups:[],cells:new Map(),cellSize:1024,lowestY:10000};
const cast=(world:CollisionWorld)=>(from:{x:number;y:number;z:number},delta:{x:number;y:number;z:number})=>{
  const hit=sweepSphere(world,from,delta,256,{scale:1,skin:0,passes:1,stopAtFirstContact:true});
  return {x:hit.x,y:hit.y,z:hit.z};
};
assert.deepEqual(podBeam({x:0,y:0,z:0},0,cast(empty)).to,{x:0,y:96000,z:65536});
const floor:CollisionWorld={...empty,cells:new Map([['0,0',[0]]]),polys:[{vertices:[{x:-200000,y:10000,z:-200000},{x:200000,y:10000,z:-200000},{x:0,y:10000,z:200000}],normal:{x:0,y:-1,z:0},walkable:true,group:0}]};
const hit=podBeam({x:0,y:0,z:0},0,cast(floor));
assert(Math.abs(hit.to.y-9744)<1);assert(Math.abs(hit.to.z-65536*9744/96000)<1,'beam ends at first contact without sliding');
const slide=sweepSphere(floor,{x:0,y:0,z:0},{x:0,y:96000,z:65536},256,{scale:1,skin:0,passes:1});
assert(slide.z>hit.to.z,'movement keeps its existing slide behavior');
console.log('PASS: ZPOD firing window, drift, reset, lean, request expiry, muzzle, signed impact radius and first-contact beam casting.');
