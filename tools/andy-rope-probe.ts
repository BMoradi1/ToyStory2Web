import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {readPoles,stepPole} from '../src/sim/poles.ts';
import {createPlayer,NO_INPUT} from '../src/sim/player.ts';
import {createAndyRope,stepAndyRope,restoreAndyRope} from '../src/sim/andy-rope.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level01/level.dat')),poles=readPoles(dat.paths.find(p=>p.id===61)!.points),s=createAndyRope(dat,poles),q=poles[8]!;
const p=createPlayer(q.x+2000,q.top+0x3600+1,q.z),sounds:number[]=[];
const tick=(zone=2)=>stepAndyRope(s,p,zone,id=>sounds.push(id));
tick();assert.equal(s.speed,0);p.pole=7;tick();assert.equal(s.speed,0);p.pole=-1;
assert(stepPole(p,NO_INPUT,NO_INPUT,poles,0));assert.equal(p.pole,8,'real pole acquisition');tick(1);assert.equal(s.speed,0);
tick();assert.equal(s.speed,34);assert.equal(s.height,s.rest.y+2);assert.equal(q.bottom,s.poleRest.bottom+2);assert.equal(s.position.y,s.rest.y);
const start=p.y;for(let t=0;t<100;t++){stepPole(p,NO_INPUT,NO_INPUT,poles,0);p.y+=p.vy;tick();assert.equal(q.bottom-q.top,s.poleRest.bottom-s.poleRest.top);}
assert.equal(s.height,s.target);assert.equal(s.speed,31);assert(p.y>start+30000,'moving top clamp did not lower attached player');assert.equal(p.pole,8);assert.equal(s.position.y-s.rest.y,0xb800);assert.deepEqual(sounds,[0x21]);
const frozen=JSON.stringify(s);tick(1);assert.equal(JSON.stringify(s),frozen);for(let t=0;t<50;t++)tick();assert.equal(s.height,s.target);assert.deepEqual(sounds,[0x21]);
restoreAndyRope(s);assert.deepEqual(q,s.poleRest);const reset=createAndyRope(dat,poles);assert.equal(reset.speed,0);assert.equal(reset.height,reset.rest.y);
console.log('PASS Andy rope: actual ninth-pole acquisition, room gate, accelerating fixed-length attachment/artwork, player top-clamp ride, native terminal value, one-shot audio and reset');
