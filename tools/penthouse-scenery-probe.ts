/** Installed Penthouse hurt collision, distant push-block artwork and ambient emitters. */
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

{
 const {w,s,p,host}=fresh(),a=s.scenery;
 const indexed=(h:typeof a.hurtHulls[number])=>h.polys.every(q=>[...w.cells.values()].some(cell=>cell.includes(q.index)));
 assert(indexed(a.hurtHulls[0]!));assert(!indexed(a.hurtHulls[1]!));
 p.hitStun=30;stepPenthouse(s,p,w,host);assert(!indexed(a.hurtHulls[0]!));assert(indexed(a.hurtHulls[1]!));
 p.hitStun=0;stepPenthouse(s,p,w,host);assert(indexed(a.hurtHulls[0]!));assert(!indexed(a.hurtHulls[1]!));
 for(const b of a.farBlocks){
   const g=w.groups[b.group]!,rest={...g.position!};
   g.position={x:rest.x+100,y:rest.y-200,z:rest.z+300};stepPenthouse(s,p,w,host);
   assert.deepEqual(s.objects.get(b.art)!.position,{x:g.position.x*32,y:g.position.y*32,z:g.position.z*32});g.position=rest;
 }
 restorePenthouse(s,w);assert(a.hurtHulls.every(indexed),'reset restores both captured collision hulls before fresh controller');
}
{
 const {w,s,p,host}=fresh(),shots:any[]=[],fx:any[]=[];
 const h={...host,cameraZone:2,projectile:(q:any)=>shots.push(q),effect:(...q:any[])=>fx.push(q)};
 stepPenthouse(s,p,w,{...h,cameraZone:1});assert.equal(shots.length,0);
 stepPenthouse(s,p,w,h);assert.equal(shots.length,1);assert.equal(shots[0].kind,76);assert.equal(shots[0].vx,384);
 for(let i=0;i<100;i++)stepPenthouse(s,p,w,h);assert.equal(shots.length,1);
 stepPenthouse(s,p,w,h);assert.equal(shots.length,2);assert.equal(shots[1].vx,-384);
 const at={x:0x1187c,y:0x2bd92,z:-0x13b72};
 stepPenthouse(s,p,w,{...h,cameraZone:0,zone:1,camera:at,gateTwo:1});assert.equal(fx.at(-1)[1],101);assert.equal(fx.at(-1)[2],10);
 const count=fx.length;stepPenthouse(s,p,w,{...h,cameraZone:0,zone:1,camera:{...at,x:at.x+768*256},gateTwo:1});assert.equal(fx.length,count,'strict camera range boundary');
 stepPenthouse(s,p,w,{...h,cameraZone:0,zone:2,camera:at,gateTwo:1});assert.equal(fx.length,count,'room gate');
}
console.log('PASS: hurt/recovery collision swaps, restart indexing, both distant push-block poses, alternating room debris, timed emission and strict ambient range/room gates');
