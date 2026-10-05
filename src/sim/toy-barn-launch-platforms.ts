/** Boarding-triggered Toy Barn rides: collision 10/14, 00421340. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import {captureCollisionGroup,collisionGroupByObject,transformCollisionGroup,type CollisionWorld} from '../formats/collision.ts';
import {JumpState,type PlayerState} from './player.ts';
import {carryOnYawPlatform} from './moving-platform.ts';
import {sin,cos} from './trig.ts';
export const TOY_BARN_LAUNCH_OBJECTS=[11,24] as const;
export function createToyBarnLaunchPlatforms(dat:DatLevel,w:CollisionWorld){
 return TOY_BARN_LAUNCH_OBJECTS.map((id,i)=>{
  const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing Toy Barn ride ${id}`);
  const hull=captureCollisionGroup(w,collisionGroupByObject(w,i?14:10));
  const rest={x:o.position.x*o.unitScale*32,y:o.position.y*o.unitScale*32,z:o.position.z*o.unitScale*32};
  return {index,hull,rest,artPosition:{...rest},position:{x:hull.origin.x*32,y:hull.origin.y*32,z:hull.origin.z*32},velocity:{x:0,y:0,z:0},speed:0,fallSpeed:0};
 });
}
export type ToyBarnLaunchPlatforms=ReturnType<typeof createToyBarnLaunchPlatforms>;
export function moveToyBarnLaunchPlatforms(s:ToyBarnLaunchPlatforms,w:CollisionWorld,p:PlayerState){
 for(const r of s){const before={...r.position},v=r.velocity;if(!(v.x||v.y||v.z))continue;
  r.position={x:before.x+v.x,y:before.y+v.y,z:before.z+v.z};
  carryOnYawPlatform(p,r.hull.groupIndex,before,r.position,0);
  transformCollisionGroup(w,r.hull,{x:r.position.x/32,y:r.position.y/32,z:r.position.z/32},0);
 }
}
function launch(p:PlayerState,shift:number){
 p.stomp=0;p.stompImpact=false;p.vy=-2560;p.onGround=false;p.coyote=0;p.fallTimer=0;
 p.jumpState=JumpState.Released;p.animPhase=2;p.launched=true;
 p.vx=sin(0x81e)>>shift;p.vz=cos(0x81e)>>shift;p.yaw=p.targetYaw=0x81e;
}
export function stepToyBarnLaunchPlatforms(s:ToyBarnLaunchPlatforms,p:PlayerState,host:{guide:(id:number)=>void;sound:(id:number,at:Vec3)=>void}){
 for(const [i,r] of s.entries()){
  const standing=p.onGround&&p.contacts.some(c=>c.group===r.hull.groupIndex&&c.normal.y<-.75);
  if(r.speed===0&&standing){r.speed=32;host.guide(i?2:3);}
  if(r.speed===0||(!i&&r.speed<0))continue;
  const at=r.position;r.artPosition={x:(at.x>>5)*32,y:(at.y>>5)*32,z:(at.z>>5)*32};
  if(!i){
   host.sound(0x7a,at);r.speed=r.speed<1700?r.speed+32:1700;
   if(at.z<0x42c60){
    if(at.y> -0x1e00-r.fallSpeed&&r.fallSpeed>0)r.fallSpeed=r.fallSpeed<1201?-192:Math.trunc(r.fallSpeed*-3/8);
    else r.fallSpeed=r.fallSpeed<4096?r.fallSpeed+96:4096;
   }
   r.velocity={x:0,y:r.fallSpeed,z:-r.speed};
   if(at.z<0x104c0){r.speed=-1;r.velocity={x:0,y:0,z:0};if(standing){launch(p,5);host.sound(0x1c,p);}}
  }else{
   if(r.speed>0){
    host.sound(0x7a,at);r.velocity={x:0,y:0,z:-r.speed};r.speed=r.speed<1800?r.speed+32:1800;
    if((at.z>>5)<0x2300){r.speed=Math.trunc(r.speed*-7/8);if(standing){launch(p,4);host.sound(0x1c,p);}}
   }
   if(r.speed<0){
    if((at.z>>5)>=0x3a27)r.speed+=32;
    if(r.speed<0)r.velocity={x:0,y:0,z:-r.speed};
    else{r.speed=0;r.velocity={x:0,y:0,z:0};}
   }
  }
 }
}
export function restoreToyBarnLaunchPlatforms(s:ToyBarnLaunchPlatforms,w:CollisionWorld){for(const r of s)transformCollisionGroup(w,r.hull,r.hull.origin,0);}
