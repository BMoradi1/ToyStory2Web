/** Toy Barn's four continuously rolling platforms, 00421340. */
import type {DatLevel} from '../formats/dat.ts';
import {captureCollisionGroup,collisionGroupByObject,transformCollisionGroup,type CollisionWorld} from '../formats/collision.ts';
import type {PlayerState} from './player.ts';
import {toRadians} from './trig.ts';
export const TOY_BARN_ROTOR_OBJECTS=[7,6,4,5] as const;
export function createToyBarnRotors(dat:DatLevel,w:CollisionWorld){
 return TOY_BARN_ROTOR_OBJECTS.map((id,i)=>{
  const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing Toy Barn rotor ${id}`);
  return {index,hull:captureCollisionGroup(w,collisionGroupByObject(w,i+1)),angle:0,velocity:0,speed:i%2?44:36};
 });
}
export type ToyBarnRotors=ReturnType<typeof createToyBarnRotors>;
export function moveToyBarnRotors(s:ToyBarnRotors,w:CollisionWorld,p:PlayerState){
 for(const r of s){
  if(!r.velocity)continue;
  r.angle=(r.angle+r.velocity)&16383;
  const group=r.hull.groupIndex;
  const standing=p.onGround&&p.climb===0&&p.contacts.some(c=>c.group===group&&c.normal.y<-.5);
  const climbing=p.climbGroup===group&&!p.dying&&p.hitStun<=0;
  if(standing||climbing){
   const origin=r.hull.origin,x=p.x-origin.x*32,y=p.y-origin.y*32;
   const a=toRadians(r.velocity/4),c=Math.cos(a),sn=Math.sin(a);
   p.x=Math.round(origin.x*32+x*c-y*sn);p.y=Math.round(origin.y*32+x*sn+y*c);
  }
  transformCollisionGroup(w,r.hull,r.hull.origin,0,0,toRadians(r.angle/4));
 }
}
export function stepToyBarnRotors(s:ToyBarnRotors){for(const r of s)r.velocity=r.speed;}
export function restoreToyBarnRotors(s:ToyBarnRotors,w:CollisionWorld){for(const r of s)transformCollisionGroup(w,r.hull,r.hull.origin,0);}
