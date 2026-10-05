import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision} from '../src/formats/collision.ts';
import {createPlayer} from '../src/sim/player.ts';
import {createConstructionLifts,moveConstructionLifts,stepConstructionLifts,restoreConstructionLifts} from '../src/sim/construction-lifts.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level04/level.dat'));
const w=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level04/TERRAIN.ALL'))).groups);
const s=createConstructionLifts(dat,w,readFileSync('Toy Story 2/toy2.exe')),p=createPlayer(1e8,0,1e8);
const target=new Set(),home=new Set(),flags=new Set(),waiting=new Set();
for(let tick=0;tick<2500;tick++){
 moveConstructionLifts(s,w,p);stepConstructionLifts(s,p,()=>0);flags.add(s.bits);
 for(const l of s.lifts){
  const endpoint=dat.paths.find(p=>p.id===4)!.points[l.id]!;
  if(Math.hypot(l.position.x-endpoint.x*32,l.position.y-endpoint.y*32,l.position.z-endpoint.z*32)<2048)target.add(l.id);
  if(target.has(l.id)&&Math.hypot(l.position.x-l.rest.x,l.position.y-l.rest.y,l.position.z-l.rest.z)<2048)home.add(l.id);
  if(l.script.wait>0)waiting.add(l.id);
  assert.equal(w.groups[l.hull.groupIndex]!.position!.y*32,l.position.y);
  assert.equal(w.groups[l.partner.groupIndex]!.position!.x*32,l.partnerPosition.x);
  const [near,far,under,top,rail,farRail,cable]=l.objects;
  assert.deepEqual(under!.position,near!.position);
  assert.equal(top!.position.y,top!.rest.y);assert.equal(rail!.position.y,rail!.rest.y);
  assert.equal(l.axis?rail!.position.x:rail!.position.z,l.axis?near!.position.x:near!.position.z);
  assert.deepEqual(cable!.position,top!.position);assert.equal(far!.position.x,(l.position.x>>7)*128);
  assert.equal(l.axis?farRail!.position.x:farRail!.position.z,l.axis?far!.position.x:far!.position.z);
 }
}
assert.equal(target.size,4);assert.equal(home.size,4);assert.equal(waiting.size,4);assert(flags.has(256)&&flags.has(0));
// Hanging from either member stops the script without losing its program counter.
const l=s.lifts[0]!,pc=l.script.pc;p.climbGroup=l.partner.groupIndex;
moveConstructionLifts(s,w,p);stepConstructionLifts(s,p,()=>0);assert.equal(l.script.pc,pc);assert.deepEqual(l.script.velocity,{x:0,y:0,z:0});
p.climbGroup=-1;p.climb=0;p.onGround=true;p.contacts=[{group:l.hull.groupIndex,normal:{x:0,y:-1,z:0}} as any];
p.x=l.position.x;p.y=l.position.y;p.z=l.position.z+32768;
moveConstructionLifts(s,w,p);stepConstructionLifts(s,p,()=>0);assert(l.rockSpeed>0,'standing off-centre tips the platform');
for(let i=0;i<120;i++){p.x=l.position.x;p.y=l.position.y;p.z=l.position.z+32768;moveConstructionLifts(s,w,p);stepConstructionLifts(s,p,()=>0);assert(Math.abs(l.angle)<=896);}
assert(l.angle>0,'tilt is applied to moving collision');
p.onGround=false;p.contacts=[];const previous={x:p.x,y:p.y,z:p.z};moveConstructionLifts(s,w,p);assert.deepEqual({x:p.x,y:p.y,z:p.z},previous);
// The native tilt uses pre-collision vertical speed: landing doubles the
// lever force at 512, while walking off lets the empty platform self-right.
const tilt=s.lifts[2]!;
p.onGround=true;p.contacts=[{group:tilt.hull.groupIndex,normal:{x:0,y:-1,z:0}} as any];
p.x=tilt.position.x+32768;p.y=tilt.position.y;p.z=tilt.position.z;
tilt.angle=tilt.rockSpeed=0;s.landingVelocity=0;stepConstructionLifts(s,p,()=>0);assert.equal(tilt.rockSpeed,14);
tilt.angle=tilt.rockSpeed=0;s.landingVelocity=512;stepConstructionLifts(s,p,()=>0);assert.equal(tilt.rockSpeed,30);
p.x=tilt.position.x-32768;tilt.rockSpeed=0;stepConstructionLifts(s,p,()=>0);assert.equal(tilt.rockSpeed,-30);
p.onGround=false;p.contacts=[];tilt.angle=400;tilt.rockSpeed=0;stepConstructionLifts(s,p,()=>0);assert.equal(tilt.rockSpeed,-1);

restoreConstructionLifts(s,w);for(const l of s.lifts)for(const h of [l.hull,l.partner])for(const base of h.polys)assert.deepEqual(w.polys[base.index]!.vertices,base.vertices);
console.log('PASS: four installed lift routes, synchronized flags/waits, linked supports, collision motion, ledge pause, player tilt limits, airborne isolation and restore');
