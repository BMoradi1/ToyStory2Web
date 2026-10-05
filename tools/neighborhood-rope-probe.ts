import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {readPoles,stepPole} from '../src/sim/poles.ts';
import {createPlayer,NO_INPUT} from '../src/sim/player.ts';
import {createNeighborhoodRope,stepNeighborhoodRope,restoreNeighborhoodRope} from '../src/sim/neighborhood-rope.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level02/level.dat')),poles=readPoles(dat.paths.find(p=>p.id===61)!.points),s=createNeighborhoodRope(dat,poles),q=poles[0]!;
const p=createPlayer(q.x+2000,q.bottom,q.z),sounds:number[]=[];
const tick=()=>stepNeighborhoodRope(s,p,id=>sounds.push(id));
tick();assert.equal(s.speed,0);p.pole=1;tick();assert.equal(s.speed,0);p.pole=-1;
assert(stepPole(p,NO_INPUT,NO_INPUT,poles,0));assert.equal(p.pole,0);tick();assert.equal(s.speed,18);assert.equal(q.type,2);assert.equal(q.top,s.poleRest.top);assert.equal(s.height,s.poleRest.bottom+2);
const start=p.y;let attached=0;for(let t=0;t<400;t++){stepPole(p,NO_INPUT,NO_INPUT,poles,0);p.y+=p.vy;if(p.pole===0)attached++;tick();if(s.speed>0)assert.equal(q.top,s.poleRest.top);}
assert(attached>100);assert(p.y>start+200000,'rope did not slide rider');assert.equal(s.speed,-1);assert.equal(q.bottom,-0x2500);assert.equal(q.type,0);assert(q.top<=s.poleRest.top);assert(q.top>s.poleRest.top-2048);assert.equal(s.objects[1]!.scale[1],1);assert.deepEqual(sounds,[0x21]);
const frozen=JSON.stringify(s);for(let i=0;i<100;i++)tick();assert.equal(JSON.stringify(s),frozen);
restoreNeighborhoodRope(s);assert.deepEqual(q,s.poleRest);const reset=createNeighborhoodRope(dat,poles);assert.equal(reset.speed,0);assert.equal(reset.objects[1]!.scale[1],280/4096);
console.log('PASS Neighborhood rope: real grab, slide type, fixed upper endpoint, extending length, acceleration/cap, native final overshoot, artwork scale, cue and reset');
