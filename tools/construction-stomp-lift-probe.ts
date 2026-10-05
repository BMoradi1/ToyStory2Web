import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision} from '../src/formats/collision.ts';
import {createPlayer,createRuntime,groundFromCollision,stepPlayer,NO_INPUT} from '../src/sim/player.ts';
import {createConstructionStompLift,moveConstructionStompLift,stepConstructionStompLift,restoreConstructionStompLift} from '../src/sim/construction-stomp-lift.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level04/level.dat'));
const collision=parseCollision(parseAll(readFileSync('Toy Story 2/data/level04/TERRAIN.ALL')));
for(const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]){
 const w=buildCollisionWorld(collision.groups),s=createConstructionStompLift(dat,w),p=createPlayer(1e8,0,1e8);
 const rt=createRuntime(),ground=groundFromCollision(w),guides:number[]=[];
 const update=()=>stepConstructionStompLift(s,w,p,id=>guides.push(id));
 for(let i=0;i<20;i++){moveConstructionStompLift(s,w,p);update();}assert.equal(s.velocity,0);assert.equal(s.bits,0);
 const stomp=(id:number)=>{
  const b=s.switches[id]!,floor=w.groups[b.hull.groupIndex]!.polys.map(i=>w.polys[i]!).find(p=>p.normal.y<-.99)!;
  const at=floor.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});
  at.x=b.hull.origin.x*32;at.z=Math.max(...floor.vertices.map(v=>v.z))*32-1024;
  Object.assign(p,{x:at.x,y:at.y-20000,z:at.z,vx:0,vy:0,vz:0,stomp:1,stompImpact:false,onGround:false,hitStun:0,fallTimer:0});
  for(let t=0;t<100&&!b.pressed;t++){stepPlayer(p,NO_INPUT,rt,ground,0);update();}
  assert(b.pressed,`real stomp did not press switch ${id}`);
  assert(w.polys[b.hull.polys[0]!.index]!.normal.z!==b.hull.polys[0]!.normal.z,'switch collision did not pitch');
 };
 for(const id of order){
  stomp(id);assert.equal(guides.length,s.switches.filter(b=>b.pressed).length);
  update();assert.equal(guides.length,s.switches.filter(b=>b.pressed).length,'held contact repeated guide retirement');
 p.stompImpact=false;p.onGround=false;p.contacts=[];
 let down=false,back=false,min=s.position.y,maxSpeed=0;
 for(let t=0;t<2400&&!back;t++){
  moveConstructionStompLift(s,w,p);update();maxSpeed=Math.max(maxSpeed,s.speed);min=Math.min(min,s.position.y);
  assert(s.speed>=0&&s.speed<=1024);
  assert.equal(w.groups[s.hull.groupIndex]!.position!.y*32,s.position.y);
  if(s.bits&8)down=true;else if(down)back=true;
 }
 assert(down&&back,'lift did not complete upper/lower reversal');assert.equal(maxSpeed,1024);
 const height=[0x15e00,0x3b600,0x63380][Math.max(...order.slice(0,order.indexOf(id)+1))]!;
 assert(min<s.art.rest.y-height,'active switch did not select its route with native braking overshoot');
 assert(min>s.art.rest.y-height-70000,'lift traveled beyond the native braking distance');
 }
 assert.equal(s.bits&7,7);assert.deepEqual(guides,order.map(n=>n+4));
 const y=s.position.y;p.y=y;p.x=s.position.x;p.z=s.position.z;p.onGround=true;p.contacts=[{group:s.hull.groupIndex,normal:{x:0,y:-1,z:0}} as any];
 s.velocity=-512;moveConstructionStompLift(s,w,p);assert.equal(p.y,y-512);
 p.onGround=false;p.contacts=[];const free=p.y;moveConstructionStompLift(s,w,p);assert.equal(p.y,free);
 restoreConstructionStompLift(s,w);
 for(const h of [s.hull,...s.switches.map(b=>b.hull)])for(const poly of h.polys)assert.deepEqual(w.polys[poly.index]!.vertices,poly.vertices);
 const fresh=createConstructionStompLift(dat,w);assert.equal(fresh.bits,0);assert.equal(fresh.speed,0);assert(fresh.switches.every(b=>!b.pressed));
}
console.log('PASS: all six switch orders through real stomp collisions, one-shot guides, pitched collision, highest-switch precedence, lift reversals/speed/overshoot, passenger isolation and restart restore');
