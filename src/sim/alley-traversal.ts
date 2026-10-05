/** Alley seesaws (0049ec00) and collision-3 spring (0041e880). */
import type {DatLevel} from '../formats/dat.ts';
import {captureCollisionGroup,collisionGroupByObject,transformCollisionGroup,type CollisionWorld} from '../formats/collision.ts';
import {JumpState,type PlayerState} from './player.ts';
import {toRadians} from './trig.ts';
export const ALLEY_SEESAW_OBJECTS=[4,5,6,7] as const;
export function createAlleyTraversal(dat:DatLevel,w:CollisionWorld){
 const seesaws=[2,1].map((id,i)=>{
  const objects=[4+i*2,5+i*2].map(id=>{const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing Alley seesaw ${id}`);return {index,rest:{x:o.position.x*o.unitScale*32,y:o.position.y*o.unitScale*32,z:o.position.z*o.unitScale*32}};});
  return {hull:captureCollisionGroup(w,collisionGroupByObject(w,id)),objects,angle:0,velocity:0,speed:0};
 });
 return {seesaws,spring:collisionGroupByObject(w,3),landingVelocity:0,grabbed:-1,launched:false};
}
export type AlleyTraversal=ReturnType<typeof createAlleyTraversal>;
export function moveAlleyTraversal(s:AlleyTraversal,w:CollisionWorld,p:PlayerState){
 s.landingVelocity=p.vy;s.grabbed=p.climbGroup;
 for(const r of s.seesaws){
  if(!r.velocity)continue;r.angle+=r.velocity;
  const standing=p.onGround&&p.climb===0&&p.contacts.some(c=>c.group===r.hull.groupIndex&&c.normal.y<-.5);
  const hanging=p.climbGroup===r.hull.groupIndex&&!p.dying&&p.hitStun<=0;
  if(standing||hanging){const o=r.hull.origin,x=p.x-o.x*32,y=p.y-o.y*32,a=toRadians(r.velocity/4),c=Math.cos(a),sn=Math.sin(a);p.x=Math.round(o.x*32+x*c-y*sn);p.y=Math.round(o.y*32+x*sn+y*c);}
  transformCollisionGroup(w,r.hull,r.hull.origin,0,0,toRadians(r.angle/4));
 }
}
export function stepAlleyTraversal(s:AlleyTraversal,p:PlayerState){
 s.launched=false;
 for(const r of s.seesaws){
  if(s.grabbed===r.hull.groupIndex){r.speed=0;continue;}
  if(p.onGround&&p.contacts.some(c=>c.group===r.hull.groupIndex&&c.normal.y<-.5)){
   const origin=r.objects[0]!.rest,lever=(p.x-origin.x)>>5;
   const distance=Math.trunc(Math.hypot(lever,(p.y-origin.y)>>5))>>5;
   const force=Math.trunc(((s.landingVelocity*distance>>9)+distance)/2);
   r.speed+=lever>0?force:-force;
  }else if(Math.abs(r.angle)>8)r.speed+=r.angle<0?3:-3;
  r.speed=r.speed>0?Math.max(0,r.speed-2):Math.min(0,r.speed+2);
  let target=r.angle+r.speed;
  if(target< -1792){target=-1792;r.speed=Math.abs(Math.trunc(r.speed*3/4));}
  else if(target>1792){target=1792;r.speed=-Math.abs(Math.trunc(r.speed*3/4));}
  r.velocity=target-r.angle;
 }
 if(p.onGround&&p.contacts.some(c=>c.group===s.spring&&c.normal.y<-.75)){
  const stomp=p.stompImpact||p.stomp!==0;
  p.stomp=0;p.stompImpact=false;p.vy=stomp?-3072:-2432;p.onGround=false;p.coyote=0;
  p.jumpState=JumpState.Released;p.animPhase=2;p.fallTimer=0;
  s.launched=true;
 }
}
export function restoreAlleyTraversal(s:AlleyTraversal,w:CollisionWorld){for(const r of s.seesaws)transformCollisionGroup(w,r.hull,r.hull.origin,0);}
