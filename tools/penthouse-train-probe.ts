/** Installed Penthouse train routing, switches, blocking and near/far artwork. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision} from '../src/formats/collision.ts';
import {createPlayer,createRuntime,groundFromCollision,stepPlayer,NO_INPUT} from '../src/sim/player.ts';
import {RandomStream} from '../src/sim/creatures.ts';
import {readPenthouseTables,createPenthouse,stepPenthouse,movePenthouseFloats,restorePenthouse} from '../src/sim/penthouse.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level01/level1.dat'));
const tables=readPenthouseTables(readFileSync('Toy Story 2/toy2.exe'));
function fresh(){
 const w=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level01/TERR1.ALL'))).groups);
 const s=createPenthouse(dat,w,tables),p=createPlayer(1e8,0,1e8),sounds:number[]=[],fx:number[]=[],guides:number[]=[];
 const host={zone:99,rand:new RandomStream(new Uint8Array([128])),gateSeven:false,cameraY:-1e8,
  sound:(n:number)=>sounds.push(n),effect:(_p:unknown,n:number)=>fx.push(n),guide:(n:number)=>guides.push(n)};
 const ground=groundFromCollision(w),runtime=createRuntime();ground.beforeMove=()=>movePenthouseFloats(s,w,p);
 const tick=()=>{stepPlayer(p,NO_INPUT,runtime,ground,0);stepPenthouse(s,p,w,host);};
 return {w,s,p,host,tick,sounds,fx,guides};
}

for(let which=0;which<3;which++){
 const {w,s,p,tick,guides}=fresh(),t=s.train,b=t.buttons[which]!;
 const face=b.hull.polys.filter(q=>q.normal.y<-.8).sort((a,b)=>a.vertices[0]!.y-b.vertices[0]!.y)[0]!;
 const at=face.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});
 Object.assign(p,{...at,y:at.y-20000,stomp:1,onGround:false,contacts:[]});
 for(let n=0;n<100&&!guides.includes(b.guide);n++)tick();
 assert(guides.includes(b.guide),'actual train selector stomp '+which);
 assert.equal(t.mask,[0x26,0x29,0x45][which]);assert(t.flash>0);assert.equal(s.objects.get(49)!.scale[0],1);
}
const finished:number[]=[];
for(let a=0;a<2;a++)for(let b=0;b<3;b++)for(let c=0;c<2;c++){
 const {w,s,p,host}=fresh(),t=s.train;
 for(const [button,count]of [[0,a],[1,b],[2,c]])for(let n=0;n<count!;n++){
  p.stompImpact=true;p.contacts=[{group:t.buttons[button!]!.hull.groupIndex,normal:{x:0,y:-1,z:0}} as any];stepPenthouse(s,p,w,host);
 }
 p.stompImpact=false;p.contacts=[];
 const start={...t.position},visited=new Set<number>();
 for(let n=0;n<18000&&t.path!==0;n++){stepPenthouse(s,p,w,{...host,gateFour:n%4===0});visited.add(t.path);}
 assert.notDeepEqual(t.position,start,'train moves');assert(visited.size>1,'train crosses authored route links');
 assert.deepEqual(s.objects.get(38)!.position,s.objects.get(80)!.position,'near/far artwork stays aligned in game space');
 if(t.path===0)finished.push(t.mask);
}
assert(finished.length>0,'some switch configuration reaches end');
{
 const {w,s,p,host}=fresh(),t=s.train;
 const collision=w.groups.find(g=>g.objectNumber===19)!;
 const original={...collision.position!};collision.position={x:t.position.x/32,y:t.position.y/32,z:t.position.z/32};
 stepPenthouse(s,p,w,host);assert(t.blocked);const at={...t.position};
 for(let n=0;n<200;n++)stepPenthouse(s,p,w,host);
 assert.deepEqual(t.position,at,'push block holds train');collision.position=original;
 for(let n=0;n<182;n++)stepPenthouse(s,p,w,host);
 assert(!t.blocked,'train resumes after block clears and timer expires');
 Object.assign(p,t.position);stepPenthouse(s,p,w,host);assert.equal(t.speed,16,'touch slows train');
}
console.log('PASS: three real train switch stomps, all 12 route configurations, near/far motion, finish paths '+finished.join(',')+', push-block stop/release and contact slowdown');
