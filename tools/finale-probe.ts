/** Installed finale cast + original stage/attack boundary checks. Positions/hits injected. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unpackRaw} from '../src/formats/rnc.ts';
import {parseCreatureList} from '../src/formats/creatures.ts';
import {parseDat} from '../src/formats/dat.ts';
import {createCreatureSim,RandomStream,stepCreatures} from '../src/sim/creatures.ts';
import {createFinale,stepFinaleStage,stepFinaleFighter,finaleBar} from '../src/sim/finale.ts';
import type {ZurgShot} from '../src/sim/zurg-boss.ts';
const placements=parseCreatureList(unpackRaw(readFileSync('Toy Story 2/data/level05/level1.raw')).find(r=>r.type===35)!.data);
const dat=parseDat(readFileSync('Toy Story 2/data/level05/level1.dat'));
const obj=dat.objects[dat.objectIds[0]!]!,u=obj.unitScale*32;
const origin={x:obj.position.x*u,y:obj.position.y*u,z:obj.position.z*u};
const fresh=()=>createCreatureSim(placements,{groundY:()=>null},new RandomStream(new Uint8Array([0,128,255,3])),15);
const sim=fresh(),at=(i:number)=>sim.creatures.find(c=>c.slot===i);
const state=createFinale(at,origin),sounds:number[]=[],shots:ZurgShot[]=[],parts:number[]=[];
const cut={ticks:0,eye:{x:0,y:0,z:0},look:{x:0,y:0,z:0},start:(p:{x:number;y:number;z:number},ticks:number)=>{cut.ticks=ticks;Object.assign(cut.look,p);}};
const world={x:-0x16bd9,y:0,z:0,rand:sim.rand,cut,sound:(event:number)=>sounds.push(event),
 projectile:(shot:ZurgShot)=>shots.push(shot),
 attachment:(c:typeof sim.creatures[number],part:number,_p:{x:number;y:number;z:number})=>{parts.push(part);return{x:c.x,y:c.y,z:c.z};}};
const tick=()=>{cut.ticks=Math.max(0,cut.ticks-1);stepFinaleStage(state,at,world);};
assert.deepEqual(sim.creatures.slice(0,3).map(c=>c.health),[0,0,0]);assert(sim.creatures.every(c=>c.respawn===10000));
tick();assert.equal(state.entrance,0);world.x--;tick();assert.equal(state.entrance,80);assert.equal(cut.ticks,480);
while(state.entrance<150)tick();assert(!sounds.includes(0xcd));tick();assert(sounds.includes(0xcd));
while(state.entrance<280)tick();assert.equal(state.origin.y,state.restY);tick();
assert.equal(at(3)!.vy,-768);assert.equal(at(4)!.vy,-1024);assert(state.origin.y<state.restY);
for(let i=0;i<8;i++)tick();assert.equal(state.wobble,0);assert.deepEqual(state.angles[0],[0,0,0]);
while(state.entrance<431)tick();assert.deepEqual(sim.creatures.slice(0,3).map(c=>c.health),[29,29,29]);
assert.equal(at(3)!.health,0);assert.equal(at(4)!.health,0);
while(cut.ticks>=30)tick();assert(state.active);assert(state.fighters.every(f=>f.phase===2));
assert(sim.creatures.slice(0,3).every(c=>c.pc===14));assert.equal(finaleBar(state,at),54);
const args={bits:1,chasing:true,fwd:0,side:0,dt:1};
const fighter=(i:number,dt=1)=>stepFinaleFighter(state,at(i)!,{...args,dt},world);
// Strict range and original fuses for both thrown weapons.
for(const [i,anim,fuse,kind] of [[0,1,63,102],[2,4,44,104]]){
 const c=at(i!)!;c.animState=anim!;world.x=c.x+300*256;world.y=c.y;world.z=c.z;
 fighter(i!);assert.equal(c.animState,anim);world.x=c.x;fighter(i!);assert.equal(c.animState,3);
 const before=shots.length;fighter(i!,fuse!-2);assert.equal(shots.length,before);
 fighter(i!);assert.equal(shots.at(-1)!.kind,kind);assert.equal(state.fighters[i!]!.fuse,0);
 c.frame=(i===0?47:22)<<16;fighter(i!);assert.equal(c.pc,16);assert.equal(c.record.speed,16);
}
// Gunslinger emits at the first and last muzzle, never every timer tick.
const gun=at(1)!;gun.timer=21;let before=shots.length;fighter(1);assert.equal(shots.length,before+1);assert.equal(parts.at(-1),15);
for(let i=0;i<8;i++)fighter(1);assert.equal(shots.length,before+1);
fighter(1);assert.equal(shots.length,before+2);assert.equal(parts.at(-1),16);
for(let i=0;i<3;i++){
 const c=at(i)!;c.health=27;fighter(i);assert.equal(c.record.vulnerable,4);assert.equal(state.fighters[i]!.hurt,59);
 fighter(i,59);assert.equal(c.record.vulnerable,4);fighter(i);assert.equal(c.record.vulnerable,i===1?7:6);
 c.health=9;fighter(i);assert.equal(c.pc,i===1?52:45);assert.equal(c.record.vulnerable,4);
 assert.equal(state.defeated,i+1);fighter(i);assert.equal(state.defeated,i+1,'defeat counts once');
}
assert.equal(state.last,2);tick();assert.equal(state.defeated,4);assert.equal(cut.ticks,120);assert(!state.beaten);
for(let i=0;i<119;i++)tick();assert.equal(state.defeated,4);tick();
assert.equal(state.defeated,5);assert(state.beaten);assert.equal(cut.ticks,300);
assert.equal(at(3)!.health,1);assert.equal(at(4)!.health,1);assert.equal(at(4)!.targetY,-0xb680);
for(let i=0;i<239;i++)tick();assert(!state.won);tick();assert(state.won);state.won=false;tick();assert(!state.won);
const resetSim=fresh(),reset=createFinale(i=>resetSim.creatures[i],origin);
assert.equal(reset.entrance,0);assert.equal(reset.defeated,0);assert.equal(reset.roll,0);assert.equal(reset.origin.y,origin.y);
// Verify defeat entries against installed wordcode rather than guessing an animation slot.
for(let i=0;i<3;i++){const c=at(i)!;c.flags|=1;c.health=9;c.pc=i===1?52:45;c.wait=0;}
stepCreatures(sim,at(0)!);assert.equal(at(0)!.animState,2);assert.equal(at(1)!.animState,2);assert.equal(at(2)!.animState,1);
// Roll follows the staged cosine cycle, and every camera cut suppresses it.
reset.active=true;reset.entrance=1000;reset.rollDelay=1;cut.ticks=0;
stepFinaleStage(reset,i=>resetSim.creatures[i],world);assert.notEqual(reset.roll,0);
cut.ticks=10;stepFinaleStage(reset,i=>resetSim.creatures[i],world);assert.equal(reset.roll,0);
// Independent recovery/defeat counters must not depend on kill order.
for(const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]){
 const cast=fresh(),s=createFinale(i=>cast.creatures[i],origin);
 s.active=true;
 for(const slot of order){const c=cast.creatures[slot]!;s.fighters[slot]!.phase=2;c.health=9;stepFinaleFighter(s,c,args,world);}
 assert.equal(s.defeated,3);assert.equal(s.last,order[2]);assert(s.fighters.every(f=>f.phase===3));
}
console.log('PASS: finale installed cast, exact entrance/bounce gates, activation, three attacks, recovery/defeat entries, one-shot rescue/save/win timing and reset.');
