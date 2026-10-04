/** Installed prop tables/collision, six hazard switches and attack arithmetic. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision} from '../src/formats/collision.ts';
import {createPlayer,createRuntime,groundFromCollision,stepPlayer,NO_INPUT} from '../src/sim/player.ts';
import {RandomStream} from '../src/sim/creatures.ts';
import {readPenthouseTables,createPenthouse,stepPenthouse,restorePenthouse,penthouseShot} from '../src/sim/penthouse.ts';
import {readEffectTable,EFFECT} from '../src/formats/effect-table.ts';
import {createEffects,spawnEffect,stepEffects,touchPlayer} from '../src/sim/effects.ts';
const exe=readFileSync('Toy Story 2/toy2.exe'),tables=readPenthouseTables(exe);
const dat=parseDat(readFileSync('Toy Story 2/data/level01/level1.dat'));
function fresh(){
 const w=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level01/TERR1.ALL'))).groups);
 const s=createPenthouse(dat,w,tables),p=createPlayer(1e8,0,1e8),sounds:number[]=[],shots:any[]=[],fx:any[]=[],guides:number[]=[];
 const host={zone:0,rand:new RandomStream(new Uint8Array([128])),gateSeven:false,sound:(n:number)=>sounds.push(n),
  projectile:(shot:any)=>shots.push(shot),effect:(...args:any[])=>fx.push(args),guide:(n:number)=>guides.push(n)};
 return {w,s,p,host,sounds,shots,fx,guides};
}
for(let i=0;i<6;i++){
 const {w,s,p,host,sounds,shots,fx,guides}=fresh(),h=s.hazards[i]!,body=s.objects.get(h.models[0]!)!;
 host.zone=h.zone;Object.assign(p,{...body.position,x:body.position.x+100000,z:body.position.z+100000});
 const yaw=h.yaw;stepPenthouse(s,p,w,{...host,zone:99});assert.equal(h.yaw,yaw,'wrong room does not track');
 for(let n=0;n<300;n++)stepPenthouse(s,p,w,host);
 const ownShots=()=>shots.filter(shot=>shot.x===body.position.x&&shot.z===body.position.z);
 assert.equal(ownShots().length,1,'300-tick attack cycle');assert.equal(shots[0].kind,92);assert(sounds.includes(0x92));
 assert.notEqual(h.yaw,yaw,'tracks nearby player');
 const face=h.hull.polys.filter(p=>p.normal.y<-.8).sort((a,b)=>a.vertices[0]!.y-b.vertices[0]!.y)[0]!;assert(face);
 const at=face.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});
 Object.assign(p,{...at,y:at.y-20000,vy:0,vx:0,vz:0,onGround:false,stomp:1,contacts:[]});
 const ground=groundFromCollision(w),runtime=createRuntime();
 for(let n=0;n<100&&h.timer===0;n++){stepPlayer(p,NO_INPUT,runtime,ground,0);stepPenthouse(s,p,w,host);}
 assert.equal(h.timer,59,'actual stomp starts delay');assert(guides.includes(h.button[3]!));assert.equal(s.disabled,0);
 assert.equal(w.groups[h.hull.groupIndex]!.position!.y,h.hull.origin.y+112.5);
 p.stompImpact=false;for(let n=0;n<58;n++)stepPenthouse(s,p,w,host);assert.equal(h.timer,1);assert.equal(s.disabled,0);
 stepPenthouse(s,p,w,host);assert.equal(h.timer,-1);assert.equal(s.disabled,1<<i);assert.equal(sounds.filter(n=>n===-2).length,1);
 for(const id of h.models.slice(0,2))assert.deepEqual(s.objects.get(id)!.scale,[0,0,0]);
 for(const id of h.models.slice(2))assert.deepEqual(s.objects.get(id)!.scale,[1,1,1]);
 const count=ownShots().length;Object.assign(p,{...body.position,x:body.position.x+100000,z:body.position.z+100000});
 for(let n=0;n<600;n++)stepPenthouse(s,p,w,{...host,gateSeven:true});assert.equal(ownShots().length,count,'disabled hazard cannot fire');assert(fx.some(f=>f[1]===17));
 restorePenthouse(s,w);for(const poly of h.hull.polys)assert.deepEqual(w.polys[poly.index]!.vertices,poly.vertices);
 assert.equal(createPenthouse(dat,w,tables).disabled,0);
}
const rand=new RandomStream(new Uint8Array([128]));
assert.equal(penthouseShot({x:0,y:0,z:0},0,{x:-63999,y:0,z:0},rand),null,'strict minimum shot distance');
const shot=penthouseShot({x:0,y:0,z:0},0,{x:-64000,y:0,z:0},rand)!;assert(shot);assert.equal(shot.vx,1333);assert.equal(shot.vz,0);
const t=readEffectTable(exe),effects=createEffects(t.kinds,t.modes,rand);
const ew={cameraX:0,cameraY:0,cameraZ:0,playerX:100000,playerY:0,playerZ:0,playerYaw:0,playerVx:0,playerVz:0,groundAt:()=>null,waterY:null};
const e=spawnEffect(effects,ew,shot.x,shot.y,shot.z,shot.vx,shot.vy,shot.vz,shot.gravity,0,0,92)!;
stepEffects(effects,ew);assert(e.x>0);ew.playerX=e.x;ew.playerY=e.y+EFFECT.hitAbove;ew.playerZ=e.z;touchPlayer(effects,ew);assert.notEqual(effects.hurt,null);
console.log('PASS: six installed hazard rotations/shots, room gates, real stomp switches, 60-tick disable/model/effect state, collision reset, installed projectile damage and distance boundary');
