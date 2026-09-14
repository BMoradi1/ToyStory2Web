import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readTokenReveal} from '../src/formats/token-reveal.ts';
import {stepTokenReveal} from '../src/sim/token-reveal.ts';
import {createPickups,revealToken} from '../src/sim/pickups.ts';
import {parseDat} from '../src/formats/dat.ts';
const exe=readFileSync('Toy Story 2/toy2.exe'),profile=readTokenReveal(exe);
assert.equal(profile.velocities.length,16);
assert(profile.velocities.some(v=>v.x<0)&&profile.velocities.some(v=>v.x>0));
assert.equal(profile.scales[132],0);assert.equal(profile.scales[97],0);
assert.equal(profile.scales[1],4052/4096);
assert(profile.scales.some(s=>s>1));
assert.deepEqual(readTokenReveal(new Uint8Array(Buffer.concat([Buffer.alloc(9),exe])).subarray(9)),profile);
assert.throws(()=>readTokenReveal(new Uint8Array(8)));
const state=createPickups(parseDat(readFileSync('Toy Story 2/data/level01/level.dat')),1);
revealToken(state,0);assert.equal(state.revealTimers[0],0);
revealToken(state,1,false);assert.equal(state.revealTimers[1],132);
state.revealTimers[1]=111;revealToken(state,1,false);assert.equal(state.revealTimers[1],111);
let timer=132,bursts=0;
for(let i=1;i<=132;i++){
 const next=stepTokenReveal(timer,profile);timer=next.timer;
 if(next.burst){assert.equal(i,32);bursts++;}
}
assert.equal(timer,0);assert.equal(bursts,1);
assert(stepTokenReveal(103,profile,5).burst);
assert(!stepTokenReveal(100,profile).burst);
console.log('PASS: local reveal vectors/scales, bounds/subarrays, quiet/idempotent reveal, 32-tick burst, large-dt crossing and finish.');
