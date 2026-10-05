import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unpackRaw} from '../src/formats/rnc.ts';
import {parseCreatureList} from '../src/formats/creatures.ts';
import {createCreatureSim,RandomStream,CREATURE_FLAGS,stepCreatures} from '../src/sim/creatures.ts';
import {createToyBarnHoops,stepToyBarnHoops} from '../src/sim/toy-barn-hoops.ts';
const raw=unpackRaw(readFileSync('Toy Story 2/data/level07/level.raw'));
const records=parseCreatureList(raw.find(r=>r.type===35)!.data);
const fresh=()=>{const sim=createCreatureSim(records,{groundY:()=>0},new RandomStream(new Uint8Array([128])),7);return {sim,s:createToyBarnHoops(),hoops:sim.creatures.filter(c=>c.slot===10||c.slot===11)};};
{
 const {sim,s,hoops}=fresh(),crate={x:-460000,z:0};
 for(const [i,c] of hoops.entries()){c.x=i?0:-600000;c.z=-30000;}
 stepToyBarnHoops(s,sim.creatures,crate);
 for(const c of hoops){assert.equal(c.x,0xfff86271|0);assert.equal(c.z,-0x38c8);}
 for(const c of hoops)c.x=-470000;
 stepToyBarnHoops(s,sim.creatures,crate);for(const c of hoops)assert.equal(c.x,crate.x-0x4800);
 crate.z=0xae00;for(const c of hoops){c.x=crate.x-0x4800+1;c.z=crate.z-0x9800+1;c.vx=17;c.vy=18;}
 stepToyBarnHoops(s,sim.creatures,crate);
 for(const c of hoops){assert.equal(c.z,crate.z-0x9800);assert.equal(c.vz,-2304);assert.equal(c.vx,17);assert.equal(c.vy,18);}
 // Equality at the corner must not reverse the hoop.
 for(const c of hoops){c.x=crate.x-0x4800;c.z=crate.z;c.vz=100;}
 stepToyBarnHoops(s,sim.creatures,crate);for(const c of hoops)assert.equal(c.vz,100);
}
for(const near of [false,true]){
 const {sim,s,hoops}=fresh(),crate={x:0,z:0x100000};
 for(const c of hoops){c.flags=near?CREATURE_FLAGS.near:0;c.z=0x48000;}
 stepToyBarnHoops(s,sim.creatures,crate);assert(hoops.every(c=>c.health===101),'unseen hoop recycled');
 for(const c of hoops)c.flags|=CREATURE_FLAGS.awake;
 stepToyBarnHoops(s,sim.creatures,crate);
 for(const c of hoops){assert.equal(c.health,0);assert.equal(c.type,29);assert.equal(c.flags&CREATURE_FLAGS.near,0);}
 assert(s.seen.every(v=>!v));assert.equal(sim.deaths.length,0,'recycling emitted a defeat reward');
 // Shared respawn uses each installed 60/120-tick interval.
 for(let t=0;t<130;t++)stepCreatures(sim,{x:hoops[0]!.homeX,y:0,z:hoops[0]!.homeZ});
 assert(sim.creatures.filter(c=>c.slot===10||c.slot===11).every(c=>c.health===101),'recycled hoops did not respawn');
}
{
 const {sim,s,hoops}=fresh(),crate={x:0,z:0x100000};
 for(const c of hoops){c.flags=CREATURE_FLAGS.awake|CREATURE_FLAGS.near;c.z=0;}
 stepToyBarnHoops(s,sim.creatures,crate);assert(s.seen.every(Boolean));
 for(const c of hoops)c.flags&=~CREATURE_FLAGS.awake;
 stepToyBarnHoops(s,sim.creatures,crate);assert(hoops.every(c=>c.health===0));
}
console.log('PASS installed hoop crate constraints, unsigned X bound, strict corner/reversal, visibility and lane recycling, no defeat rewards and shared respawn');
