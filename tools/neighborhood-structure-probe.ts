import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision} from '../src/formats/collision.ts';
import {createPlayer,createRuntime,groundFromCollision,stepPlayer,NO_INPUT} from '../src/sim/player.ts';
import {createNeighborhoodStructure,stepNeighborhoodStructure,restoreNeighborhoodStructure} from '../src/sim/neighborhood-structure.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level02/level.dat')),collision=parseCollision(parseAll(readFileSync('Toy Story 2/data/level02/TERRAIN.ALL')));
for(const order of [[8,9],[9,8]]){
 const w=buildCollisionWorld(collision.groups),s=createNeighborhoodStructure(dat,w),p=createPlayer(0,0,0),rt=createRuntime(),ground=groundFromCollision(w),guides:number[]=[],sounds:number[]=[];let refreshes=0,releases=0;
 const tick=()=>stepNeighborhoodStructure(s,w,p,{guide:id=>guides.push(id),sound:id=>sounds.push(id),refreshFloors:()=>refreshes++,release:()=>releases++});
 const land=(surface:number,stomp:boolean)=>{
  const group=w.groups.findIndex(g=>g.surface===surface&&g.enabled!==false);assert(group>=0);
  const floor=w.groups[group]!.polys.map(i=>w.polys[i]!).find(p=>p.normal.y<-.75)!;
  const at=floor.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});
  Object.assign(p,{x:at.x,y:at.y-16000,z:at.z,vx:0,vy:0,vz:0,stomp:stomp?1:0,stompImpact:false,onGround:false,hitStun:0,fallTimer:0,launched:false,pole:-1,climb:0});
  let landed=false;for(let t=0;t<100;t++){stepPlayer(p,NO_INPUT,rt,ground,0);landed ||= p.onGround;tick();if(landed)break;}assert(landed,`surface ${surface} landing`);
 };
 land(10,true);assert.equal(s.launcher,0,'locked spring launched');
 land(order[0]!,false);assert.deepEqual(s.supports,[4096,4096]);
 land(order[0]!,true);assert.equal(s.supports[order[0]!-8],4031);assert.equal(s.phase,0);
 p.onGround=false;p.stomp=0;p.stompImpact=false;for(let i=0;i<40;i++)tick();assert(s.roll>0);assert.equal(Math.sign(s.pitch),order[0]===8?-1:1);
 land(order[1]!,true);assert.equal(s.phase,1);assert.equal(w.groups[s.closed]!.enabled,false);assert.equal(w.groups[s.open]!.enabled,true);assert.equal(refreshes,1);
 p.onGround=false;p.stomp=0;p.stompImpact=false;for(let i=0;i<130;i++)tick();assert.equal(s.phase,2);assert.deepEqual(s.supports,[0,0]);assert.equal(s.roll,128);assert.equal(s.pitch,0);assert.deepEqual(s.objects.find(o=>o.id===4)!.scale,[0,0,0]);assert.deepEqual(s.objects.find(o=>o.id===21)!.scale,[1,1,1]);
 land(10,true);assert.equal(s.launcher,3);for(let i=0;i<3;i++)tick();assert.equal(s.launcher,6);assert.equal(releases,0);tick();assert.equal(s.launcher,7);assert.equal(p.vy,-4224);assert.equal(p.vz,16384);assert(p.launched);assert.equal(releases,1);
 p.onGround=false;p.stomp=0;p.stompImpact=false;for(let i=0;i<70;i++)tick();assert.equal(s.launcher,0);assert.deepEqual(guides,[order[0]!-8,order[1]!-8,2]);assert.deepEqual(sounds,[0x38,0x38,0x3b,0x1c]);assert.equal(refreshes,1);
 restoreNeighborhoodStructure(s,w);assert.equal(w.groups[s.closed]!.enabled,true);const reset=createNeighborhoodStructure(dat,w);assert.equal(reset.phase,0);assert.equal(w.groups[reset.open]!.enabled,false);
}
console.log('PASS Neighborhood structure: real landings and stomps in both orders, wobble/collapse, collision swap, visibility, floor refresh, delayed directional launch, recovery and reset');
