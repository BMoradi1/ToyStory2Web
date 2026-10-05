import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {parseCreatureList} from '../src/formats/creatures.ts';
import {unpackRaw} from '../src/formats/rnc.ts';
import {buildCollisionWorld,parseCollision,sweepSphere} from '../src/formats/collision.ts';
import {createCreatureSim,damageCreature,RandomStream} from '../src/sim/creatures.ts';
import {creatureModelGeometry} from '../src/sim/creature-model.ts';
import {fireBeam,laserTargetCentre} from '../src/sim/laser.ts';
import {createPlayer} from '../src/sim/player.ts';
import {createNeighborhoodHoles,stepNeighborhoodHoles} from '../src/sim/neighborhood-holes.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level02/level.dat'));
const raw=unpackRaw(readFileSync('Toy Story 2/data/level02/level.raw'));
const sim=createCreatureSim(parseCreatureList(raw.find(r=>r.type===35)!.data),{groundY:()=>0},new RandomStream(new Uint8Array([128])),2),s=createNeighborhoodHoles(dat,sim.creatures),c=sim.creatures.find(c=>c.slot===4)!,p=createPlayer();
const sounds:number[]=[],fx:number[]=[];let stops=0,clears=0;
const tick=()=>stepNeighborhoodHoles(s,sim.creatures,p,{focus:p,sound:id=>sounds.push(id),stopSequence:()=>stops++,effect:(_at,kind)=>fx.push(kind),clearWarning:()=>clears++});
assert.equal(c.timer,100);tick();assert.equal(s.node,1);assert.equal(c.y,14336);assert.equal(c.floorY,416);assert.equal(c.homeY,0);
c.flags|=2;c.y=0;p.x=c.x+24576;p.y=0;p.z=c.z;tick();assert.equal(s.timer,0,'strict scare radius');p.x=c.x+24000;tick();assert.equal(s.timer,99);assert.equal(c.targetY,20480);
for(let i=0;i<20;i++)tick();assert.equal(s.timer,79);assert(fx.includes(59));assert(sounds.includes(-3));
p.onGround=true;p.stomp=-40;p.x=s.points[s.last]!.x;p.y=-3000;p.z=s.points[s.last]!.z;tick();assert.equal(s.closed,0,'occupied hole closed');
c.y=18433;tick();assert.notEqual(s.node,s.last);assert.equal(s.closed,1);assert.equal(c.flags&32,32);assert.equal(clears,1);
for(let round=1;round<6;round++){
 c.y=0;c.flags|=2;p.onGround=false;p.stomp=0;p.x=c.x+20000;p.y=0;p.z=c.z;tick();assert.equal(s.timer,99);
 const old=s.last;c.y=18433;p.x=s.points[old]!.x;p.y=-3000;p.z=s.points[old]!.z;p.onGround=true;p.stomp=-40;tick();assert.equal(s.closed,round+1);assert(s.points[old]!.closed);assert(!s.points[s.node]!.closed);
}
assert.equal(s.closed,6);assert.equal(c.flags&32,0);assert.equal(c.flags&0x84,0x84);assert.equal(clears,6);assert.equal(stops,6);
const reset=createNeighborhoodHoles(dat,sim.creatures);assert.equal(reset.closed,0);assert(reset.points.every(p=>!p.closed));assert(dat.paths.find(p=>p.id===2)!.points.every(p=>p.y===0),'mutated source path');
// A missed opportunity expires at zero, without closing the hole or stopping
// a later sequence twice. Warning starts on 80 -> 79, not at 80.
const fresh=createNeighborhoodHoles(dat,sim.creatures);fresh.timer=81;fresh.node=2;fresh.last=1;c.flags&=~32;c.y=0;p.onGround=false;
let stopped=0,warnings=0;const expire=()=>stepNeighborhoodHoles(fresh,sim.creatures,p,{focus:p,sound:()=>{},stopSequence:()=>stopped++,effect:(_at,kind)=>{if(kind===59)warnings++;},clearWarning:()=>{throw Error('expired hole closed');}});
expire();assert.equal(warnings,0);expire();assert.equal(warnings,1);for(let i=0;i<79;i++)expire();assert.equal(fresh.timer,0);assert.equal(stopped,1);expire();assert.equal(stopped,1);assert.equal(fresh.closed,0);
console.log('PASS Neighborhood soldier holes: installed slot/path, strict scare, warning timing, occupied-hole rejection, six unique closures, freed flags, effect cancellation and fresh path reset');
