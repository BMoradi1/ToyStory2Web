/** Three stomp switches and the height-selecting lift: 0041dac0..0041dd73. */
import type {DatLevel} from '../formats/dat.ts';
import {captureCollisionGroup,collisionGroupByObject,transformCollisionGroup,type CollisionWorld} from '../formats/collision.ts';
import type {PlayerState} from './player.ts';
import {carryOnYawPlatform} from './moving-platform.ts';
import {toRadians} from './trig.ts';
export const CONSTRUCTION_STOMP_LIFT_OBJECTS=[65,66,67,68] as const;
export function createConstructionStompLift(dat:DatLevel,w:CollisionWorld){
  const art=(id:number)=>{
    const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing stomp-lift artwork ${id}`);
    return {id,index,rest:{x:o.position.x*o.unitScale*32,y:o.position.y*o.unitScale*32,z:o.position.z*o.unitScale*32},angles:[o.rotation.x,o.rotation.y,o.rotation.z] as const};
  };
  const hull=captureCollisionGroup(w,collisionGroupByObject(w,21));
  return {bits:0,speed:0,velocity:0,position:{x:hull.origin.x*32,y:hull.origin.y*32,z:hull.origin.z*32},hull,art:art(68),
    switches:[65,66,67].map((id,i)=>({art:art(id),hull:captureCollisionGroup(w,collisionGroupByObject(w,22+i)),pressed:false}))};
}
export type ConstructionStompLift=ReturnType<typeof createConstructionStompLift>;
export function moveConstructionStompLift(s:ConstructionStompLift,w:CollisionWorld,p:PlayerState){
  if(!s.velocity)return;
  const before={...s.position};s.position.y+=s.velocity;
  carryOnYawPlatform(p,s.hull.groupIndex,before,s.position,0);
  transformCollisionGroup(w,s.hull,{x:s.position.x/32,y:s.position.y/32,z:s.position.z/32},0);
}
export function stepConstructionStompLift(s:ConstructionStompLift,w:CollisionWorld,p:PlayerState,guide:(id:number)=>void){
  if(p.stompImpact)for(const [i,b] of s.switches.entries()){
    if(b.pressed||!p.contacts.some(c=>c.group===b.hull.groupIndex&&c.normal.y<-.5))continue;
    b.pressed=true;s.bits|=1<<i;
    transformCollisionGroup(w,b.hull,b.hull.origin,0,toRadians(-384));guide(i+4);
  }
  // Higher switches override lower ones even when activated out of order.
  const target=(s.bits&4)?-0x63380:(s.bits&2)?-0x3b600:(s.bits&1)?-0x15e00:0;
  if(!target)return;
  if(!(s.bits&8)){
    if(s.art.rest.y+target<s.position.y)s.speed=Math.min(1024,s.speed+8);
    else{ s.speed-=8;if(s.speed<0){s.bits|=8;s.speed=0;} }
    s.velocity=-s.speed;
  }else{
    if(s.position.y+0xe100<s.art.rest.y)s.speed=Math.min(1024,s.speed+8);
    else{ s.speed-=8;if(s.speed<0){s.bits&=~8;s.speed=0;} }
    s.velocity=s.speed;
  }
}
export function restoreConstructionStompLift(s:ConstructionStompLift,w:CollisionWorld){
  for(const h of [s.hull,...s.switches.map(b=>b.hull)])transformCollisionGroup(w,h,h.origin,0);
}
