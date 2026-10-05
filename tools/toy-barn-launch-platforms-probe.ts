import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision} from '../src/formats/collision.ts';
import {createPlayer,createRuntime,groundFromCollision,stepPlayer,NO_INPUT} from '../src/sim/player.ts';
import {createToyBarnLaunchPlatforms,moveToyBarnLaunchPlatforms,stepToyBarnLaunchPlatforms,restoreToyBarnLaunchPlatforms} from '../src/sim/toy-barn-launch-platforms.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level07/level.dat'));
const fresh=()=>{const w=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level07/TERRAIN.ALL'))).groups);return {w,s:createToyBarnLaunchPlatforms(dat,w)};};
for(let i=0;i<2;i++){
 const {w,s}=fresh(),r=s[i]!,p=createPlayer(1e8,0,1e8),guides:number[]=[],sounds:number[]=[];
 const host={guide:(id:number)=>guides.push(id),sound:(id:number)=>sounds.push(id)};
 // Wall contact and airborne contact must not board the vehicle.
 p.contacts=[{group:r.hull.groupIndex,normal:{x:1,y:0,z:0}} as any];p.onGround=true;stepToyBarnLaunchPlatforms(s,p,host);assert.equal(r.speed,0);
 p.contacts=[{group:r.hull.groupIndex,normal:{x:0,y:-1,z:0}} as any];p.onGround=false;stepToyBarnLaunchPlatforms(s,p,host);assert.equal(r.speed,0);
 p.onGround=true;p.x=r.position.x;p.y=r.position.y;p.z=r.position.z;stepToyBarnLaunchPlatforms(s,p,host);assert.equal(r.speed,64);assert.deepEqual(guides,[i?2:3]);
 const initial={...r.position};let bounced=false,launched=false,returned=false;
 for(let t=0;t<1200;t++){
  const before={...r.position},playerBefore={x:p.x,y:p.y,z:p.z},v={...r.velocity};moveToyBarnLaunchPlatforms(s,w,p);
  if(p.onGround){assert.equal(p.x-playerBefore.x,v.x);assert.equal(p.y-playerBefore.y,v.y);assert.equal(p.z-playerBefore.z,v.z);}
  stepToyBarnLaunchPlatforms(s,p,host);bounced ||= r.fallSpeed<0;
  assert.equal(w.groups[r.hull.groupIndex]!.position!.z*32,r.position.z);
  if(p.launched){launched=true;assert.equal(p.vy,-2560);assert.equal(p.yaw,0x81e);}
  if(launched&&r.speed===0){returned=true;break;}
  if(!i&&r.speed===-1)break;
 }
 assert(launched,'end-of-route did not launch rider');assert.equal(sounds.filter(n=>n===0x1c).length,1);assert(sounds.includes(0x7a));
 if(i){assert(returned);assert(r.position.z>0x3a27*32);assert(r.position.z<0x3a27*32+41000);}
 else{assert(bounced);assert.equal(r.speed,-1);assert(r.position.z<0x104c0);assert.deepEqual(r.velocity,{x:0,y:0,z:0});}
 restoreToyBarnLaunchPlatforms(s,w);for(const ride of s)for(const b of ride.hull.polys)assert.deepEqual(w.polys[b.index]!.vertices,b.vertices);
}
// Real collision boarding: let Buzz fall onto each installed hull without
// injecting contact flags, then follow the initial acceleration.
for(let i=0;i<2;i++){
 const {w,s}=fresh(),r=s[i]!;
 const floor=w.groups[r.hull.groupIndex]!.polys.map(i=>w.polys[i]!).find(p=>p.normal.y<-.99)!;
 const at=floor.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});
 const p=createPlayer(at.x,at.y-20000,at.z),runtime=createRuntime(),ground=groundFromCollision(w);let guides=0,contacts=0;
 ground.beforeMove=()=>moveToyBarnLaunchPlatforms(s,w,p);
 for(let t=0;t<500&&!p.launched;t++){stepPlayer(p,NO_INPUT,runtime,ground,0);stepToyBarnLaunchPlatforms(s,p,{guide:()=>guides++,sound:()=>{}});if(p.onGround&&p.contacts.some(c=>c.group===r.hull.groupIndex))contacts++;}
 assert.equal(guides,1);assert(p.launched,`ride ${i}: physical rider did not reach launch`);assert(contacts>50,`ride ${i}: lost floor too soon (${contacts})`);assert(r.position.z<at.z-10000);
 console.log('PASS physical boarding, full ride and launch',i,at,contacts);
}
console.log('PASS both complete routes, speed/rebound/launch/return, contact gates, collision/carry and restore');
