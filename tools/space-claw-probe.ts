import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision} from '../src/formats/collision.ts';
import {createPlayer,createRuntime,groundFromCollision,stepPlayer,NO_INPUT} from '../src/sim/player.ts';
import {standingSurface} from '../src/sim/stomp-props.ts';
import {createPickups,revealToken,stepPickups} from '../src/sim/pickups.ts';
import {createSpaceClaw,stepSpaceClaw,syncSpaceClawPrize} from '../src/sim/space-claw.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level08/level.dat'));
const w=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level08/TERRAIN.ALL'))).groups);
const p=createPlayer(0,0,0),rt=createRuntime(),ground=groundFromCollision(w);
const button=w.groups.find(g=>g.surface===8)!;
const floor=button.polys.map(i=>w.polys[i]!).find(p=>p.normal.y<-.99)!;
const at=floor.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});
Object.assign(p,{...at,y:at.y-20000,stomp:1,onGround:false});
const physical=createSpaceClaw(dat);let guides=0;
for(let t=0;t<100&&!physical.phase;t++){
  stepPlayer(p,NO_INPUT,rt,ground,0);
  stepSpaceClaw(physical,p,{zone:4,stomp:p.stompImpact&&standingSurface(p,w)===8,
    randomByte:()=>128,sound:()=>{},guide:()=>guides++});
}
assert.equal(physical.phase,1,'real player stomp must activate installed button');assert.equal(guides,1);
console.log('Physical button',at);
for(const win of [false,true]){
  const s=createSpaceClaw(dat),pickups=createPickups(dat,8);revealToken(pickups,3);
  const events:number[]=[];let bytes=0,spent=0;
  const host={zone:4,stomp:false,randomByte:()=>[128,128,64,64][bytes++%4]!,sound:(id:number)=>events.push(id),guide:()=>spent++};
  const tick=(stomp=false)=>{host.stomp=stomp;stepSpaceClaw(s,s.base,host);syncSpaceClawPrize(s,pickups);};
  const art=(id:number)=>s.objects.find(o=>o.id===id)!;
  tick();assert.equal(bytes,4);assert.equal(s.prize.y,s.base.y+0x6000);assert.equal(art(11).scale,0);
  tick(true);assert.equal(s.phase,1);assert.equal(s.cooldown,59);assert.equal(art(14).scale,1);
  tick(true);assert.equal(s.phase,1,'cooldown blocks repeated impact');
  for(let i=0;i<254;i++)tick(); // 256 X ticks: mirrored midpoint.
  assert.equal(s.x,49152);tick(true);assert.equal(s.phase,2);
  for(let i=0;i<(win?511:63);i++)tick();
  tick(true);assert.equal(s.phase,3);assert.equal(spent,3);
  while(s.phase===3)tick();assert.equal(s.drop,0x5000);assert.equal(art(11).scale,0);
  for(let i=0;i<59;i++)tick();assert.equal(art(11).scale,0);
  tick();assert.equal(art(11).scale,1);assert(events.includes(0x81));
  while(s.phase===4)tick();assert.equal(s.prizeState,win?1:0);
  let ticks=0;while(s.phase!==0&&Number(s.prizeState)!==3&&ticks++<2000)tick();
  assert(ticks<2000);assert.equal(s.phase,win?7:0);assert.equal(art(10).scale,1);
  const prize=pickups.items.find(i=>i.id===53)!;
  if(win){
    assert.equal(s.prize.y,-0x1800);assert.equal(prize.reach,40);
    assert.equal(art(53).position.x,prize.x*32);assert.equal(art(53).position.y,prize.y*32);
    const collector=createPlayer(prize.x*32,(prize.y+230)*32,prize.z*32);
    stepPickups(pickups,collector);assert(prize.collected);assert(pickups.tokens&8);
    const saved={...prize};tick();assert.deepEqual(prize,saved,'collected reward must not be rewritten');
  }else{assert.equal(prize.reach,0);tick(true);assert.equal(s.phase,1,'missed grab can retry');}
  assert.equal(bytes,4,'prize randomization only runs once');assert(events.includes(0x82));
  const frozen=JSON.stringify(s);host.zone=3;for(let i=0;i<100;i++)tick();assert.equal(JSON.stringify(s),frozen,'machine is zone gated');
}
assert.equal(createSpaceClaw(dat).phase,0);
console.log('PASS: installed stomp surface, cooldown, mirrored X/Z travel, miss/retry, claw timing, successful lift/return/drop/bounce, actual token collection, zone gate and reset');
