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
import {createAndyCot,stepAndyCot,restoreAndyCot} from '../src/sim/andy-cot.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level01/level.dat')),w=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level01/TERRAIN.ALL'))).groups);
const raw=unpackRaw(readFileSync('Toy Story 2/data/level01/level.raw'));
const sim=createCreatureSim(parseCreatureList(raw.find(r=>r.type===35)!.data),{groundY:()=>null},new RandomStream(new Uint8Array([128])),1);
const geometry=creatureModelGeometry(parseAll(readFileSync('Toy Story 2/data/chars/cotbit.all')));
const s=createAndyCot(dat,w),p=createPlayer(),sounds:number[]=[];
const tick=(zone=1)=>stepAndyCot(s,w,p,sim.creatures,zone,id=>sounds.push(id));
function cast(){const poly=w.polys[w.groups[s.group]!.polys[0]!]!,n=poly.normal,at=poly.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});return sweepSphere(w,{x:at.x+n.x*2000,y:at.y+n.y*2000,z:at.z+n.z*2000},{x:-n.x*4000,y:-n.y*4000,z:-n.z*4000},100,{groups:new Set([s.group])}).contacts.length;}
assert(cast()>0);p.onGround=true;p.contacts=[{group:w.groups.findIndex(g=>g.surface===14),normal:{x:0,y:-1,z:0}} as any];tick();assert.equal(cast(),0);p.onGround=false;tick();assert(cast()>0);
for(const slot of [0,2]){
 const c=sim.creatures.find(c=>c.slot===slot)!;
 const target={creature:c,position:c,heading:c.heading,shape:geometry.shapes[0]!,vulnerable:4};
 const centre=laserTargetCentre(target);
 for(const side of [-1,1]){
  const from={...centre,x:centre.x+side*8000};p.x=from.x;tick();target.vulnerable=c.record.vulnerable;
  assert.equal(target.vulnerable,side<0?4:5);
  const shot=fireBeam([],from,side<0?1024:3072,0,[target],()=>1);assert(shot.hit);damageCreature(sim,c,shot.yaw,shot.damageKind);
  assert.equal(c.health,side<0?80:79);
 }
 tick();assert.equal(c.record.vulnerable,0);const before=JSON.stringify([s,c.hover]);tick(2);assert.equal(JSON.stringify([s,c.hover]),before,'wrong room advanced puzzle');
 if(slot===0){assert.equal(s.timer,0);for(let i=0;i<200;i++)tick();assert.equal(c.health,80);assert.equal(c.hover,0x700);}
}
assert.equal(s.timer,143);assert.equal(cast(),0);const start=s.objects.map(o=>o.position.y);let bounce=false;
for(let i=0;i<142;i++){tick();bounce ||= s.velocity<0;}
assert.equal(s.timer,1);tick();assert.equal(s.timer,-1);assert(bounce);assert(s.objects.every((o,i)=>o.position.y!==start[i]));assert(s.objects.every(o=>o.position.y%2**o.shift===0));
for(let i=0;i<200;i++)tick();assert.equal(sim.creatures[2]!.hover,0x900);assert.equal(sim.creatures[2]!.health,80);const finished=JSON.stringify(s);for(let i=0;i<200;i++)tick();assert.equal(JSON.stringify(s),finished,'completed drop repeated');assert(sounds.filter(e=>e===0x32).length>2);
restoreAndyCot(s,w);assert(cast()>0);const reset=createAndyCot(dat,w);assert.equal(reset.timer,0);assert(reset.objects.every(o=>o.position.y===o.rest.y));
console.log('PASS installed cot laser geometry/vulnerability from both sides, both folding supports/bounce/audio, room/floor collision rules, one-shot 144-tick near/far drop and reset');
