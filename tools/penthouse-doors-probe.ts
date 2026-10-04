/** Installed Penthouse spring and guard-door collision/animation. */
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

for(const stomp of [false,true]){
 const {w,s,p,tick,sounds,guides}=fresh();
 const face=w.groups[s.spring.groupIndex]!.polys.map(i=>w.polys[i]!).filter(q=>q.normal.y<-.75).sort((a,b)=>a.vertices[0]!.y-b.vertices[0]!.y)[0]!;
 const at=face.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});
 Object.assign(p,{...at,y:at.y-16000,stomp:stomp?1:0,onGround:false,contacts:[]});
 for(let n=0;n<150&&!guides.includes(13);n++)tick();
 assert(guides.includes(13),'real spring landing');assert.equal(p.vy,stomp?-3072:-2432);assert.equal(p.stomp,0);assert(p.launched);assert(!p.onGround);assert(sounds.includes(0x1c));
}
for(const which of [0,1]){
 const {w,s,p,host}=fresh(),d=s.doors[which]!;
 stepPenthouse(s,p,w,{...host,health:()=>1});assert.equal(d.phase,0,'living guard keeps door shut');
 stepPenthouse(s,p,w,{...host,health:slot=>slot===d.slot?0:1});assert.equal(d.phase,1,'defeat starts delay');
 stepPenthouse(s,p,w,host);assert.equal(d.phase,17);assert.notDeepEqual(w.polys[d.hull.polys[0]!.index]!.vertices,d.hull.polys[0]!.vertices,'door collision rotates');
 const first=s.objects.get(d.models[0]!)!.angles[1];for(let n=0;n<70;n++)stepPenthouse(s,p,w,host);
 assert(d.phase>=1024);assert.notEqual(s.objects.get(d.models[0]!)!.angles[1],first,'door mesh swings');
 assert.deepEqual(s.objects.get(d.models[0]!)!.angles,s.objects.get(d.models[1]!)!.angles);
 restorePenthouse(s,w);for(const q of d.hull.polys)assert.deepEqual(w.polys[q.index]!.vertices,q.vertices);
}
console.log('PASS: real normal/stomp spring launches, guide/sound, two independent guard doors, collision rotation, paired artwork and restart restoration');
