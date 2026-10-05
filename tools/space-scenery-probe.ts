import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {createSpaceScenery,stepSpaceScenery} from '../src/sim/space-scenery.ts';
import {sin} from '../src/sim/trig.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level08/level.dat')),s=createSpaceScenery(dat);
let bytes=0;const events:{id:number;at:unknown}[]=[];
const host={zone:3,randomByte:()=>[0,3,2][bytes++%3]!,sound:(id:number,at:unknown)=>events.push({id,at})};
for(let i=0;i<100;i++)stepSpaceScenery(s,host);
assert.equal(bytes,0);assert.equal(s.soundTicks,0);
for(const o of s.objects){
  if(o.id<10){assert.equal(o.phase,o.id*100);assert.notDeepEqual(o.angles,o.restAngles);}
  else{assert.equal(o.phase,0);assert.deepEqual(o.position,o.rest);}
}
host.zone=4;
const ranges=new Map(s.objects.filter(o=>o.id>=20).map(o=>[o.id,{min:0,max:0}]));
for(let i=1;i<=4096;i++){
  stepSpaceScenery(s,host);
  for(const o of s.objects){
    assert.equal(o.angles[0],o.restAngles[0]);assert.equal(o.angles[2],o.restAngles[2]);
    if(o.id<10){assert.equal(o.phase,(o.id*(100+i))&4095);continue;}
    const axis=o.id===20||o.id===23?'y':'x',rate=[8,7,6,11][o.id-20]!;
    const delta=o.position[axis]-o.rest[axis];
    assert.equal(delta,(sin(rate*i)>>6)*32);const range=ranges.get(o.id)!;range.min=Math.min(range.min,delta);range.max=Math.max(range.max,delta);
    for(const other of ['x','y','z'] as const)if(axis!==other)assert.equal(o.position[other],o.rest[other]);
  }
}
for(const r of ranges.values())assert.deepEqual(r,{min:-8192,max:8192});
assert.equal(events.length,410);assert.equal(bytes,events.length*3);
for(const event of events){assert.equal(event.id,0x7b,'random sound 3 aliases sound 0');assert.deepEqual(event.at,s.objects.find(o=>o.id===22)!.rest);}
const displays=JSON.stringify(s.objects.filter(o=>o.id>=20)),timer=s.soundTicks;
host.zone=2;for(let i=0;i<100;i++)stepSpaceScenery(s,host);
assert.equal(JSON.stringify(s.objects.filter(o=>o.id>=20)),displays);assert.equal(s.soundTicks,timer);
assert(createSpaceScenery(dat).objects.every(o=>o.phase===0&&o.yaw===0));
console.log('PASS: 12 installed scenery objects, authored angles, full sine cycles/amplitudes, display axes, room gating, three-byte sound choices/timer and reset');
