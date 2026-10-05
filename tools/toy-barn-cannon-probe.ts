import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision} from '../src/formats/collision.ts';
import {createPlayer,createRuntime,groundFromCollision,stepPlayer,NO_INPUT} from '../src/sim/player.ts';
import {createToyBarnCannon,moveToyBarnCannon,stepToyBarnCannon,restoreToyBarnCannon,toyBarnCannonPoses} from '../src/sim/toy-barn-cannon.ts';
import {sin,cos} from '../src/sim/trig.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level07/level.dat'));
const fresh=()=>{const w=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level07/TERRAIN.ALL'))).groups);return {w,s:createToyBarnCannon(dat,w)};};
const {w,s}=fresh(),p=createPlayer(0,0,-300000),sounds:number[]=[],guides:number[]=[];
const host={fetchBusy:false,guide:()=>guides.push(0),sound:(id:number)=>sounds.push(id)};
p.onGround=true;p.contacts=[{group:s.button.groupIndex,normal:{x:0,y:-1,z:0}} as any];
stepToyBarnCannon(s,w,p,host);assert.equal(s.timer,0);p.stompImpact=true;host.fetchBusy=true;stepToyBarnCannon(s,w,p,host);assert.equal(s.timer,0);
host.fetchBusy=false;stepToyBarnCannon(s,w,p,host);assert.equal(s.timer,2700);assert(s.pressed);assert.equal(guides.length,1);
p.onGround=false;p.stompImpact=false;p.contacts=[];
let oscillated=false;
for(let t=1;t<=2700;t++){
 moveToyBarnCannon(s,w,p);stepToyBarnCannon(s,w,p,host);assert.equal(s.timer,2700-t);
 assert.equal(s.speed,Math.min(512,t));oscillated ||= s.position.y!==s.objects[0]!.rest.y&&s.angle!==0;
 const poses=toyBarnCannonPoses(s);assert.equal(poses[0]!.offset.y+s.objects[0]!.rest.y,(s.position.y>>5)*32);assert.equal(poses[1]!.offset.y+s.objects[1]!.rest.y,(s.position.y>>7)*128);
}
assert(oscillated);assert(!s.pressed);assert.equal(s.clock,100);assert(sounds.includes(0x75));
for(let t=0;t<512;t++){moveToyBarnCannon(s,w,p);stepToyBarnCannon(s,w,p,host);}assert.equal(s.speed,0);
// Early exit ends the timer and restores the button on that tick.
s.timer=100;s.pressed=true;p.z=-0x11202;stepToyBarnCannon(s,w,p,host);assert.equal(s.timer,0);assert(!s.pressed);
// Launch drives a recoil then recovery, while preserving live near/far art.
p.z=-300000;p.onGround=true;p.contacts=[{group:s.hull.groupIndex,normal:{x:0,y:-1,z:0}} as any];s.timer=1000;
stepToyBarnCannon(s,w,p,host);assert(p.launched);assert.equal(p.vy,-3072);assert.equal(p.vx,Math.trunc(sin(0xb90)/7));assert.equal(p.vz,Math.trunc(cos(0xb90)/7));assert.equal(p.yaw,0xb90);assert.equal(s.recoil,1);
let recovered=false;for(let t=0;t<300;t++){moveToyBarnCannon(s,w,p);stepToyBarnCannon(s,w,p,host);recovered ||= Number(s.recoil)===0;}assert(recovered);assert(sounds.includes(0x1c));
restoreToyBarnCannon(s,w);for(const h of [s.hull,s.button])for(const b of h.polys)assert.deepEqual(w.polys[b.index]!.vertices,b.vertices);
// Real stomp on the installed switch, then a real landing on the moving hull.
const physical=fresh(),c=physical.s,world=physical.w,ground=groundFromCollision(world),rt=createRuntime();
const centre=(group:number)=>{const f=world.groups[group]!.polys.map(i=>world.polys[i]!).find(p=>p.normal.y<-.99)!;return f.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});};
const at=centre(c.button.groupIndex),rider=createPlayer(at.x,at.y-20000,at.z);rider.stomp=1;
ground.beforeMove=()=>moveToyBarnCannon(c,world,rider);
for(let t=0;t<100&&!c.timer;t++){stepPlayer(rider,NO_INPUT,rt,ground,0);stepToyBarnCannon(c,world,rider,host);}assert(c.timer>0);
const platform=centre(c.hull.groupIndex);Object.assign(rider,{x:platform.x,y:platform.y-20000,z:platform.z,vy:0,vx:0,vz:0,stomp:0,onGround:false,contacts:[]});
for(let t=0;t<100&&!rider.launched;t++){stepPlayer(rider,NO_INPUT,rt,ground,0);stepToyBarnCannon(c,world,rider,host);}assert(rider.launched);assert.equal(rider.vy,-3072);
console.log('PASS full timer, fetch gate, 512-tick spin up/down, near/far motion, early end, recoil/recovery, hull restore and physical switch stomp/cannon launch',at,platform);
