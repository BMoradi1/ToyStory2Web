/** Installed Penthouse selectors, water planes and buoyant collision/passengers. */
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
for(let i=0;i<4;i++){
 const {w,s,p,host,tick,sounds,guides}=fresh(),a=s.water,b=a.buttons[i]!;
 const hull=w.groups[b.hull.groupIndex]!,face=hull.polys.map(j=>w.polys[j]!).filter(q=>q.normal.y<-.8).sort((x,y)=>x.vertices[0]!.y-y.vertices[0]!.y)[0]!;
 const at=face.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});
 Object.assign(p,{...at,y:at.y-20000,stomp:1,onGround:false,contacts:[]});
 for(let n=0;n<100&&!guides.includes(b.guide);n++)tick();
 assert(guides.includes(b.guide),'real selector stomp '+i);assert.equal(a.selected,b.bit);assert.equal(a.target,b.target);
 for(const q of a.buttons)assert.equal(w.groups[q.hull.groupIndex]!.position!.y,q.hull.origin.y+(q===b?112.5:0));
 Object.assign(p,{x:1e8,y:0,z:1e8,stompImpact:false});
 const before=a.offset;stepPenthouse(s,p,w,host);assert.equal(a.offset,Math.max(a.target,before-64));
 for(let n=0;n<1900;n++){movePenthouseFloats(s,w,p);stepPenthouse(s,p,w,host);}
 assert.equal(a.offset,b.target);assert.equal(a.y,b.target===0?null:191000+b.target);
 const shown=()=>a.planes.filter(q=>s.objects.get(q.art)!.scale[0]!==0);
 assert.equal(shown().length,b.target===0?0:1);
 if(a.y!==null){assert(sounds.includes(0x95));stepPenthouse(s,p,w,{...host,cameraY:a.y+1});assert.equal(shown().length,0,'underwater camera hides surface');}
 Object.assign(p,{x:0x2cc2e,y:0x2ee2b,z:-0x2fc03});stepPenthouse(s,p,w,host);
 assert.equal(a.target,0,'exit proximity drains');assert.equal(a.selected,16);
 const draining=a.offset;stepPenthouse(s,p,w,host);assert.equal(a.offset,Math.min(0,draining+512));
 restorePenthouse(s,w);for(const q of [...a.buttons,...a.floats])for(const poly of q.hull.polys)assert.deepEqual(w.polys[poly.index]!.vertices,poly.vertices);
}
for(let i=0;i<4;i++){
 const {w,s,p,host,tick,fx}=fresh(),a=s.water,f=a.floats[i]!;
 a.offset=a.target=-115200;
 for(let n=0;n<100;n++){movePenthouseFloats(s,w,p);stepPenthouse(s,p,w,host);}
 assert(f.y<f.hull.origin.y*32,'floating prop rises with water '+i);
 const top=w.groups[f.hull.groupIndex]!.polys.map(j=>w.polys[j]!).filter(q=>q.normal.y<-.8).sort((x,y)=>x.vertices[0]!.y-y.vertices[0]!.y)[0]!;
 const at=top.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});
 Object.assign(p,{...at,y:at.y-12000,stomp:1,onGround:false,contacts:[],vx:0,vy:0,vz:0});
 let hit=false;
 for(let n=0;n<100;n++){tick();if(p.stompImpact&&p.contacts.some(c=>c.group===f.hull.groupIndex)){hit=true;assert.equal(f.velocity,1232);break;}}
 assert(hit,'real float stomp '+i);
 let carried=0;
 for(let n=0;n<100;n++){
  if(p.onGround&&p.contacts.some(c=>c.group===f.hull.groupIndex)){
   const py=p.y,fy=f.y;movePenthouseFloats(s,w,p);assert.equal(p.y-py,f.y-fy);carried++;
   // The normal sweep is tested on all other ticks; do not apply this step twice.
   f.step=0;tick();
  }else tick();
 }
 assert(carried>0,'passenger carried on float '+i);assert(fx.includes(57),'float splash '+i);
}
console.log('PASS: four real water selector stomps, exclusive depressed collision, fill/drain speeds, surface visibility, exit reset, four floating hulls, real stomp bounce, passenger carry, splashes and restore');
