/** Shared 0049ec00 rocking platforms in House, Neighborhood and Airport. */
import type {DatLevel} from '../formats/dat.ts';
import {captureCollisionGroup,collisionGroupByObject,transformCollisionGroup,type CollisionWorld} from '../formats/collision.ts';
import type {PlayerState} from './player.ts';
import {sin,cos,toRadians} from './trig.ts';
interface Profile{collision:number;objects:readonly number[];yaw:number;mode:0|1|2;min:number;max:number;divisor:number;}
const PROFILES:Readonly<Record<number,readonly Profile[]>>={
 1:[{collision:15,objects:[15],yaw:0,mode:1,min:-448,max:448,divisor:8}],
 2:[{collision:0,objects:[0],yaw:0x961,mode:0,min:-448,max:448,divisor:8},{collision:1,objects:[1],yaw:0xb4a,mode:0,min:-448,max:224,divisor:8}],
 13:[{collision:3,objects:[4,6],yaw:0,mode:2,min:-224,max:224,divisor:128},{collision:4,objects:[5,7],yaw:-1024,mode:2,min:-224,max:224,divisor:128}],
};
export function seesawObjects(level:number){return PROFILES[level]?.flatMap(p=>p.objects)??[];}
export function createSeesaws(level:number,dat:DatLevel,w:CollisionWorld){
 const profiles=PROFILES[level];if(!profiles)return null;
 const platforms=profiles.map(profile=>{
  const hull=captureCollisionGroup(w,collisionGroupByObject(w,profile.collision));
  const objects=profile.objects.map(id=>{
   const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing level ${level} seesaw ${id}`);
   return {id,index,rest:{x:o.position.x*o.unitScale*32,y:o.position.y*o.unitScale*32,z:o.position.z*o.unitScale*32},angles:[0,profile.yaw,0] as [number,number,number]};
  });
  transformCollisionGroup(w,hull,hull.origin,toRadians(profile.yaw));
  return {profile,hull,objects,angle:0,speed:0,velocity:0};
 });
 return {level,platforms,landingVelocity:0,grabbed:-1};
}
export type Seesaws=NonNullable<ReturnType<typeof createSeesaws>>;
export function moveSeesaws(s:Seesaws,w:CollisionWorld,p:PlayerState){
 s.landingVelocity=p.vy;s.grabbed=p.climbGroup;
 for(const r of s.platforms){
  if(!r.velocity)continue;
  r.angle+=r.velocity;
  const standing=p.onGround&&p.climb===0&&p.contacts.some(c=>c.group===r.hull.groupIndex&&c.normal.y<-.5);
  const hanging=p.climbGroup===r.hull.groupIndex&&!p.dying&&p.hitStun<=0;
  if(standing||hanging){
   const o=r.hull.origin,cy=Math.cos(toRadians(r.profile.yaw)),sy=Math.sin(toRadians(r.profile.yaw));
   const dx=p.x-o.x*32,dz=p.z-o.z*32,x=dx*cy-dz*sy,z=dz*cy+dx*sy,y=p.y-o.y*32;
   const a=toRadians(r.velocity/4),c=Math.cos(a),sn=Math.sin(a),xx=x*c-y*sn,yy=x*sn+y*c;
   p.x=Math.round(o.x*32+xx*cy+z*sy);p.y=Math.round(o.y*32+yy);p.z=Math.round(o.z*32+z*cy-xx*sy);
  }
  transformCollisionGroup(w,r.hull,r.hull.origin,toRadians(r.profile.yaw),0,toRadians(r.angle/4));
 }
}
export function stepSeesaws(s:Seesaws,p:PlayerState,cameraZone:number,playerZone:number){
 if(s.level===1&&cameraZone!==5)return;
 if(s.level===13&&![2,4,5].includes(playerZone))return;
 for(const r of s.platforms){
  if(s.grabbed===r.hull.groupIndex){r.speed=0;continue;}
  const {yaw,mode,divisor,min,max}=r.profile;
  if(p.onGround&&p.contacts.some(c=>c.group===r.hull.groupIndex&&c.normal.y<-.5)){
   const at=r.objects[0]!.rest;
   const lever=Math.trunc((((p.z-at.z)>>5)*(sin(yaw-2048)>>2)+((p.x-at.x)>>5)*(cos(yaw)>>2))/4096);
   const distance=Math.trunc(Math.hypot(lever,(p.y-at.y)>>5))>>5;
   const force=Math.trunc(((s.landingVelocity*distance>>9)+distance)/2);
   r.speed+=lever>0?force:-force;
  }else if(mode===1)r.speed+=4;
  else if(mode===2&&Math.abs(r.angle)>8)r.speed+=r.angle<0?3:-3;
  r.speed=r.speed>0?Math.max(0,r.speed-2):Math.min(0,r.speed+2);
  let target=r.angle+Math.trunc(r.speed/divisor);
  if(target<min*4){target=min*4;r.speed=Math.abs(Math.trunc(r.speed*3/4));}
  else if(target>max*4){target=max*4;r.speed=-Math.abs(Math.trunc(r.speed*3/4));}
  r.velocity=target-r.angle;
  for(const o of r.objects)o.angles=[0,yaw,r.angle>>2];
 }
}
export function restoreSeesaws(s:Seesaws,w:CollisionWorld){for(const r of s.platforms)transformCollisionGroup(w,r.hull,r.hull.origin,0);}
