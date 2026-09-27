/** Read-only installed helicopter animation and pickup-coordinate regression. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {createTarmacHelicopter,helicopterPoses,stepTarmacHelicopter,syncHelicopterToken} from '../src/sim/tarmac-helicopter.ts';
import {createPickups,revealToken,stepPickups,PICKUP} from '../src/sim/pickups.ts';
import {createPlayer} from '../src/sim/player.ts';
const root=process.argv[2]??'Toy Story 2';
const dat=parseDat(readFileSync(`${root}/data/level04/level1.dat`));
const h=createTarmacHelicopter(dat), pickups=createPickups(dat,14);
assert.equal(h.objects.length,8);
const pose=(id:number)=>helicopterPoses(h).find(p=>p.id===id)!;
for(const [phase,wave] of [[0,0],[1024,16384],[2048,0],[3072,-16384]]) {
  h.phase=phase!;
  const near=pose(3),far=pose(49),token=pose(116);
  assert.equal(near.position.y,near.rest.y+wave!/64);
  assert(Math.abs(near.position.y-far.position.y)<4,'near/far body hover agrees');
  assert.equal(token.position.y,token.rest.y-1280+wave!/128);
  assert.deepEqual(pose(48).angles,pose(50).angles,'both rotors spin together');
  assert.equal(pose(48).angles[1],(phase!*21)&4095);
  assert.deepEqual(near.angles,h.objects.find(o=>o.id===3)!.angles,'body keeps authored tilt');
  syncHelicopterToken(h,pickups);
  assert.equal(pickups.items.find(i=>i.id===116)!.y,token.position.y);
}
Object.assign(h,createTarmacHelicopter(dat));
for(let i=0;i<4097;i++)stepTarmacHelicopter(h);
assert.equal(h.phase,0,'phase wraps after every original sine-table entry');
h.phase=1024;h.height=48000;syncHelicopterToken(h,pickups);
revealToken(pickups,3);
const token=pickups.items.find(i=>i.id===116)!;
const player=createPlayer(token.x*32,(token.y+PICKUP.centreAbove)*32,token.z*32);
assert(stepPickups(pickups,player).some(e=>pickups.items[e.index]!.id===116),'collect at moving position');
const collectedY=token.y;
h.phase=3072;syncHelicopterToken(h,pickups);
assert.equal(token.y,collectedY,'collected record stays retired');
assert(token.collected);
console.log('PASS: helicopter hover, authored tilt, near/far rotors, phase wrap, token motion/collection and retirement');
