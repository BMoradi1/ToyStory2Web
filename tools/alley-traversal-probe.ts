import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision} from '../src/formats/collision.ts';
import {createPlayer,createRuntime,groundFromCollision,stepPlayer,NO_INPUT} from '../src/sim/player.ts';
import {createAlleyTraversal,moveAlleyTraversal,stepAlleyTraversal,restoreAlleyTraversal} from '../src/sim/alley-traversal.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level05/level.dat'));
function fresh(){const w=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level05/TERRAIN.ALL'))).groups);return {w,s:createAlleyTraversal(dat,w)};}
for(const i of [0,1])for(const sign of [-1,1]){
 const {w,s}=fresh(),r=s.seesaws[i]!,o=r.objects[0]!.rest,p=createPlayer(o.x+sign*16000,o.y,o.z);
 p.onGround=true;p.contacts=[{group:r.hull.groupIndex,normal:{x:0,y:-1,z:0}} as any];s.landingVelocity=1024;
 stepAlleyTraversal(s,p);assert.equal(Math.sign(r.speed),sign);assert.equal(Math.sign(r.velocity),sign);
 let bounced=false;
 for(let t=0;t<120;t++){moveAlleyTraversal(s,w,p);p.x=o.x+sign*16000;p.y=o.y;p.onGround=true;stepAlleyTraversal(s,p);assert(Math.abs(r.angle)<=1792);bounced ||= Math.sign(r.speed)===-sign;}
 assert(bounced,'seesaw should reverse at its limit');
 p.climbGroup=r.hull.groupIndex;moveAlleyTraversal(s,w,p);stepAlleyTraversal(s,p);assert.equal(r.speed,0);
 restoreAlleyTraversal(s,w);for(const r of s.seesaws)for(const q of r.hull.polys)assert.deepEqual(w.polys[q.index]!.vertices,q.vertices);
}
for(const stomp of [false,true]){
 const {w,s}=fresh(),floor=w.groups[s.spring]!.polys.map(i=>w.polys[i]!).find(p=>p.normal.y<-.99)!;assert(floor);
 const at=floor.vertices.reduce((a,v)=>({x:a.x+v.x/3,y:a.y+v.y/3,z:a.z+v.z/3}),{x:0,y:0,z:0});
 const p=createPlayer(at.x*32,at.y*32-3000,at.z*32),runtime=createRuntime(),ground=groundFromCollision(w);ground.beforeMove=()=>moveAlleyTraversal(s,w,p);
 p.stomp=stomp?1:0;let launched=false;
 for(let t=0;t<120&&!launched;t++){stepPlayer(p,NO_INPUT,runtime,ground,0);stepAlleyTraversal(s,p);launched=s.launched;}
 assert(launched,'physical spring landing missing');assert.equal(p.vy,stomp?-3072:-2432);assert.equal(p.onGround,false);assert.equal(p.stomp,0);assert.equal(p.launched,false,'spring must retain normal air control');
}
console.log('PASS both Alley seesaws: landing weight, both directions, limit rebound, ledge gate, collision restore; actual normal/stomp spring landings');
