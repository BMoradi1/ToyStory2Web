import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision} from '../src/formats/collision.ts';
import {createPlayer,NO_INPUT} from '../src/sim/player.ts';
import {readPoles,stepPole} from '../src/sim/poles.ts';
import {createAlleyBubbles,stepAlleyBubbles,restoreAlleyBubbles} from '../src/sim/alley-bubbles.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level05/level.dat'));
const w=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level05/TERRAIN.ALL'))).groups);
const poles=readPoles(dat.paths.find(p=>p.id===61)!.points),original=poles.map(p=>({...p})),s=createAlleyBubbles(dat,w,poles),p=createPlayer(0,0,0);
for(let t=0;t<1000;t++){p.coyote=6;stepAlleyBubbles(s,w,p);}
assert.equal(s.active,false);assert.equal(s.bubbles[0]!.position.x,-0xe4433);assert.equal(s.bubbles[1]!.phase,0);assert.equal(poles[1]!.type,3);
p.onGround=true;p.stompImpact=true;p.contacts=[{group:s.button.groupIndex,normal:{x:0,y:-1,z:0}} as any];stepAlleyBubbles(s,w,p);assert(s.active&&s.guide);assert.equal(w.groups[s.button.groupIndex]!.position!.y,s.button.origin.y+112.5);
p.onGround=false;p.stompImpact=false;p.contacts=[];
let spawn=false,pop=false,carried=false;
for(let t=0;t<2000;t++){
 p.coyote=6;stepAlleyBubbles(s,w,p);spawn ||= s.sounds.some(e=>e.event===0xa0);pop ||= s.sounds.some(e=>e.event===0xb);
 for(const b of s.bubbles)if(b.phase>0){assert.equal(b.pole.bottom-b.pole.top,40000);assert.equal(b.pole.x,b.position.x);assert.equal(b.pole.z,b.position.z);}
 if(!carried&&s.bubbles[1]!.phase>=4096&&poles[1]!.type!==3){
  const b=s.bubbles[1]!;p.x=b.position.x;p.z=b.position.z;p.y=b.position.y+16000;p.coyote=0;p.poleLock=-1;
  assert(stepPole(p,NO_INPUT,NO_INPUT,poles,0));assert.equal(p.pole,1);
  const dy=p.y-b.position.y;stepAlleyBubbles(s,w,p);assert.equal(p.y-b.position.y,dy);assert.equal(p.x,b.position.x);assert.equal(p.z,b.position.z);carried=true;
 }
}
assert(spawn&&pop&&carried);assert(s.bubbles.every(b=>b.cycles>0));assert.equal(s.motor,128);assert(s.tilt>=300&&s.tilt<=600);
// Popping retires the attachment and releases its passenger on the following tick.
const b=s.bubbles[0]!;b.phase=-1;p.pole=0;stepAlleyBubbles(s,w,p);assert.equal(p.pole,-1);assert.equal(p.onGround,false);assert.equal(b.pole.type,3);assert(b.objects.every(o=>o.scale.every(v=>v===0)));
restoreAlleyBubbles(s,w);assert.deepEqual(poles,original);for(const q of s.button.polys)assert.deepEqual(w.polys[q.index]!.vertices,q.vertices);
console.log('PASS Alley bubbles: initial idle bubble, stomp machine, growth, paired emission/pop/recycle, real pole acquisition/carry/release, pressed collision and restoration');
