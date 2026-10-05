/** Neighborhood pump and floating prop, 00418e50/004190c0. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import {captureCollisionGroup,collisionGroupByObject,transformCollisionGroup,type CollisionWorld} from '../formats/collision.ts';
import type {PlayerState} from './player.ts';
import {standingSurface} from './stomp-props.ts';
import {carryOnYawPlatform} from './moving-platform.ts';
export const NEIGHBORHOOD_PUMP_OBJECTS=[6,7,20] as const;
export function neighborhoodLiquid(x:number):{y:number;kind:1|2}{return x< -0x246ff?{y:0x4400,kind:1}:{y:0x1800,kind:2};}
export function createNeighborhoodPump(dat:DatLevel,w:CollisionWorld){
 const objects=NEIGHBORHOOD_PUMP_OBJECTS.map(id=>{const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing pump artwork ${id}`);const rest={x:o.position.x*o.unitScale*32,y:o.position.y*o.unitScale*32,z:o.position.z*o.unitScale*32};return {id,index,rest,position:{...rest},angles:[o.rotation.x,o.rotation.y,o.rotation.z] as [number,number,number],base:{...o.scale},scale:[1,1,1] as [number,number,number]};});
 const hull=captureCollisionGroup(w,collisionGroupByObject(w,7)),position={...objects[0]!.rest};
 transformCollisionGroup(w,hull,{x:position.x/32,y:position.y/32,z:position.z/32},0);
 return {objects,hull,position,hullPosition:{...position},pending:{x:0,y:0,z:0},vx:0,vy:0,inflation:4095,pump:0,target:0,rising:false,cooldown:0};
}
export type NeighborhoodPump=ReturnType<typeof createNeighborhoodPump>;
export function moveNeighborhoodPump(s:NeighborhoodPump,w:CollisionWorld,p:PlayerState){
 const v=s.pending;if(!v.x&&!v.y&&!v.z)return;
 const before=s.hullPosition;s.hullPosition={x:before.x+v.x,y:before.y+v.y,z:before.z+v.z};
 carryOnYawPlatform(p,s.hull.groupIndex,before,s.hullPosition,0);
 transformCollisionGroup(w,s.hull,{x:s.hullPosition.x/32,y:s.hullPosition.y/32,z:s.hullPosition.z/32},0);
 s.pending={x:0,y:0,z:0};
}
export function stepNeighborhoodPump(s:NeighborhoodPump,w:CollisionWorld,p:PlayerState,host:{cameraZone:number;cameraY:number;guide:()=>void;sound:(id:number,at:Vec3)=>void;splash:(at:Vec3)=>void}){
 const [float,pump,water]=s.objects;
 const scale=(o:typeof float,x:number,y:number,z:number)=>{if(o)o.scale=[x/o.base.x,y/o.base.y,z/o.base.z];};
 s.cooldown=Math.max(0,s.cooldown-1);
 // Native uses the last standing surface plus the six-tick ground grace.
 const surface=standingSurface({...p,onGround:true},w);
 if(surface===11&&p.coyote!==0){if(s.cooldown===0&&s.target===0){host.guide();host.sound(0x38,p);s.cooldown=30;s.target=0xc00;}}
 else s.target=0;
 if(s.inflation===4096){
  if(p.stomp===-40&&p.onGround&&p.contacts.some(c=>c.group===s.hull.groupIndex&&c.normal.y<-.5)&&p.y<0x4400)s.vy=1448;
  float!.position={x:(s.position.x>>5)*32,y:(s.position.y>>5)*32,z:(s.position.z>>5)*32};
  s.vx=Math.max(0,s.vx-4);s.vy=s.position.y<0x4400?Math.min(1536,s.vy+48):s.vy-48;
  s.position.x+=s.vx;const nextY=s.position.y+s.vy;
  if(nextY>=0x4400&&s.position.y<0x4400){
   host.splash({x:s.position.x,y:0x4400,z:s.position.z});
   if(p.stomp===0)s.vy=s.vy>543?s.vy>>1:543;
   host.sound(0x39,{...s.position,y:nextY});
  }
  s.position.y=nextY;
  s.pending={x:s.position.x-s.hullPosition.x,y:s.position.y-s.hullPosition.y-4096,z:s.position.z-s.hullPosition.z};
 }else{
  if(!s.rising)s.inflation=Math.max(1024,s.inflation-10);
  else{s.inflation+=p.stomp<0?48:32;if(s.inflation>=4096){s.inflation=4096;s.vx=850;s.vy=-1810;host.sound(0xb,s.position);}}
  scale(float,4096,s.inflation,4096);
 }
 if(s.pump!==0)scale(pump,4096,4096-s.pump,4096);
 s.rising=false;
 if(s.pump!==s.target){s.rising=s.pump-s.target< -128;s.pump-=Math.trunc((s.pump-s.target)/8);}
 if(host.cameraZone===1&&neighborhoodLiquid(p.x).kind===1){const size=host.cameraY>0x4400?0:4096;scale(water,size,size,size);}
}
export function restoreNeighborhoodPump(s:NeighborhoodPump,w:CollisionWorld){transformCollisionGroup(w,s.hull,s.hull.origin,0);}
