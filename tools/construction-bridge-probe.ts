import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision} from '../src/formats/collision.ts';
import {createPlayer,createRuntime,groundFromCollision,stepPlayer,NO_INPUT} from '../src/sim/player.ts';
import {createConstructionBridge,moveConstructionBridge,stepConstructionBridge,restoreConstructionBridge,constructionBridgeRoll} from '../src/sim/construction-bridge.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level04/level.dat'));
const w=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level04/TERRAIN.ALL'))).groups),s=createConstructionBridge(dat,w);
const floor=w.groups.findIndex(g=>g.surface===36),poly=w.polys[w.groups[floor]!.polys.find(i=>w.polys[i]!.normal.y<-.5)!]!;
const at=poly.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});
const p=createPlayer(at.x,at.y-20000,at.z),runtime=createRuntime(),ground=groundFromCollision(w),sounds:number[]=[],guides:number[]=[];
const host={sound:(n:number)=>sounds.push(n),guide:(n:number)=>guides.push(n)};
p.stomp=1;
for(let i=0;i<100&&s.phase===0;i++){stepPlayer(p,NO_INPUT,runtime,ground,0);stepConstructionBridge(s,p,w,host);}
assert.equal(s.phase,1,'real stomp contact starts bridge');assert.deepEqual(guides,[3]);assert.equal(constructionBridgeRoll(s),614);
p.stompImpact=false;p.onGround=false;p.climbGroup=-1;
const tick=()=>{moveConstructionBridge(s,w,p);stepConstructionBridge(s,p,w,host);};
let ticks=0;while(s.phase===1&&ticks++<400)tick();assert.equal(s.phase,2);assert.equal(s.angle,-2464);assert.equal(s.velocity,0);assert.equal(constructionBridgeRoll(s),-2);
const held=s.angle;for(let i=0;i<237;i++)tick();assert.equal(s.phase,239);assert.equal(s.angle,held);tick();assert.equal(s.phase,240);assert.equal(s.velocity,8);
while(s.phase!==0&&ticks++<1000)tick();assert.equal(s.phase,0);assert.equal(s.angle,0);assert.equal(s.velocity,0);assert.equal(constructionBridgeRoll(s),614);
assert(sounds.includes(0x6e));assert.equal(sounds.filter(n=>n===0x6d).length,4);
// A standing passenger follows the exact same roll as the collision geometry.
s.velocity=-8;p.onGround=true;p.climb=0;p.contacts=[{group:s.hull.groupIndex,normal:{x:0,y:-1,z:0}} as any];
p.x=s.hull.origin.x*32+10000;p.y=s.hull.origin.y*32;p.z=s.hull.origin.z*32;
const before={x:p.x,y:p.y};moveConstructionBridge(s,w,p);assert(p.y<before.y);assert(p.x<=before.x);
p.onGround=false;p.contacts=[];const free={x:p.x,y:p.y};moveConstructionBridge(s,w,p);assert.deepEqual({x:p.x,y:p.y},free,'airborne Buzz is independent');
restoreConstructionBridge(s,w);for(const base of s.hull.polys){assert.deepEqual(w.polys[base.index]!.vertices,base.vertices);assert.deepEqual(w.polys[base.index]!.normal,base.normal);}
console.log('PASS: installed bridge real stomp, lower/hold/raise bounds, art angle, sounds/guide, grounded passenger vs airborne and collision restore');
