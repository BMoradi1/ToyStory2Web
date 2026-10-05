import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision} from '../src/formats/collision.ts';
import {createPlayer,createRuntime,groundFromCollision,stepPlayer,NO_INPUT} from '../src/sim/player.ts';
import {sceneForLevel} from '../src/sim/level-data.ts';
import {createSeesaws,moveSeesaws,stepSeesaws,restoreSeesaws} from '../src/sim/seesaws.ts';
import {toRadians} from '../src/sim/trig.ts';
function fresh(level:number){const scene=sceneForLevel(level)!,dat=parseDat(readFileSync(`Toy Story 2/data/${scene}.dat`)),terrain=scene.replace(/\/level1$/,'/TERR1.ALL').replace(/\/level$/,'/TERRAIN.ALL');const w=buildCollisionWorld(parseCollision(parseAll(readFileSync(`Toy Story 2/data/${terrain}`))).groups);return {w,s:createSeesaws(level,dat,w)!};}
for(const level of [1,2,13]){
 const count=fresh(level).s.platforms.length;
 for(let i=0;i<count;i++)for(const sign of [-1,1]){
  const {w,s}=fresh(level),r=s.platforms[i]!,o=r.objects[0]!.rest,yaw=toRadians(r.profile.yaw),p=createPlayer(o.x+Math.cos(yaw)*sign*24000,o.y,o.z-Math.sin(yaw)*sign*24000);
  p.onGround=true;p.contacts=[{group:r.hull.groupIndex,normal:{x:0,y:-1,z:0}} as any];s.landingVelocity=1024;
  stepSeesaws(s,p,5,2);assert.equal(Math.sign(r.speed),sign);
  let bounced=false;
  for(let t=0;t<2000;t++){
   moveSeesaws(s,w,p);Object.assign(p,{x:o.x+Math.cos(yaw)*sign*24000,y:o.y,z:o.z-Math.sin(yaw)*sign*24000,onGround:true});
   stepSeesaws(s,p,5,2);assert(r.angle>=r.profile.min*4&&r.angle<=r.profile.max*4);bounced ||= Math.sign(r.speed)===-sign;
  }
  assert(bounced,`bound rebound ${level}/${i}/${sign}`);
  const origin=r.hull.origin,before=Math.hypot(p.x-origin.x*32,p.y-origin.y*32,p.z-origin.z*32);r.velocity=16;moveSeesaws(s,w,p);assert(Math.abs(Math.hypot(p.x-origin.x*32,p.y-origin.y*32,p.z-origin.z*32)-before)<2,'passenger radius drift');
  p.climbGroup=r.hull.groupIndex;moveSeesaws(s,w,p);stepSeesaws(s,p,5,2);assert.equal(r.speed,0,'held ledge did not stop force');
  assert(r.objects.every(o=>o.angles.join(',')===r.objects[0]!.angles.join(',')),'near/far artwork diverged');
  restoreSeesaws(s,w);for(const r of s.platforms)for(const q of r.hull.polys)assert.deepEqual(w.polys[q.index]!.vertices,q.vertices);
 }
 const {w,s}=fresh(level),p=createPlayer();stepSeesaws(s,p,5,2);assert.equal(s.platforms[0]!.speed,level===1?2:0,'empty platform mode');
 s.platforms[0]!.angle=200;s.platforms[0]!.speed=0;stepSeesaws(s,p,5,2);assert.equal(s.platforms[0]!.speed,level===1?2:level===13?-1:0,'native return-force mode');
 if(level!==2){const before=JSON.stringify(s);stepSeesaws(s,p,level===1?0:2,level===1?5:0);assert.equal(JSON.stringify(s),before,'wrong zone source changed controller');}
 console.log(`PASS level ${level}: all ${count} seesaws, both weight directions, limits/rebound, passenger rotation, ledge gate, near/far, idle mode, zone rules and collision restoration`);
 // Real player physics acquires every authored seesaw floor.
 for(let i=0;i<s.platforms.length;i++){
  const {w,s}=fresh(level),r=s.platforms[i]!;
  const floors=r.hull.polys.map(q=>w.polys[q.index]!).filter(q=>q.normal.y<-.99);
  const area=(q:typeof floors[number])=>Math.abs((q.vertices[1]!.x-q.vertices[0]!.x)*(q.vertices[2]!.z-q.vertices[0]!.z)-(q.vertices[2]!.x-q.vertices[0]!.x)*(q.vertices[1]!.z-q.vertices[0]!.z));
  const floor=floors.sort((a,b)=>area(b)-area(a))[0]!;assert(floor);
  const at=floor.vertices.reduce((a,v)=>({x:a.x+v.x/3,y:a.y+v.y/3,z:a.z+v.z/3}),{x:0,y:0,z:0});
  const p=createPlayer(at.x*32,at.y*32-300,at.z*32),runtime=createRuntime(),ground=groundFromCollision(w);ground.beforeMove=()=>moveSeesaws(s,w,p);
  let contacts=0;for(let t=0;t<80;t++){stepPlayer(p,NO_INPUT,runtime,ground,0);stepSeesaws(s,p,5,2);if(p.onGround&&p.contacts.some(c=>c.group===r.hull.groupIndex))contacts++;}
  assert(contacts>3,`actual seesaw landing ${level}/${i}: ${contacts}`);
 }
 console.log(`PASS level ${level}: actual player landings on every seesaw`);
}
