/** Timed stomp cannon, switch 15 and moving hull 0, 00421340. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import {captureCollisionGroup,collisionGroupByObject,transformCollisionGroup,type CollisionWorld} from '../formats/collision.ts';
import {JumpState,type PlayerState} from './player.ts';
import {sin,cos,toRadians} from './trig.ts';
export const TOY_BARN_CANNON_OBJECTS=[0,1,33] as const;
export function createToyBarnCannon(dat:DatLevel,w:CollisionWorld){
 const objects=TOY_BARN_CANNON_OBJECTS.map(id=>{const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing Toy Barn cannon object ${id}`);return {index,id,rest:{x:o.position.x*o.unitScale*32,y:o.position.y*o.unitScale*32,z:o.position.z*o.unitScale*32}};});
 const hull=captureCollisionGroup(w,collisionGroupByObject(w,0)),button=captureCollisionGroup(w,collisionGroupByObject(w,15));
 return {objects,hull,button,position:{x:hull.origin.x*32,y:hull.origin.y*32,z:hull.origin.z*32},velocity:0,angle:0,angularVelocity:0,timer:0,speed:0,phase:0,recoil:0,clock:100,pressed:false};
}
export type ToyBarnCannon=ReturnType<typeof createToyBarnCannon>;
export function moveToyBarnCannon(s:ToyBarnCannon,w:CollisionWorld,p:PlayerState){
 const from={...s.position};s.position.y+=s.velocity;s.angle+=s.angularVelocity;
 if(!(s.velocity||s.angularVelocity))return;
 const standing=p.onGround&&p.climb===0&&p.contacts.some(c=>c.group===s.hull.groupIndex&&c.normal.y<-.5);
 const climbing=p.climbGroup===s.hull.groupIndex&&!p.dying&&p.hitStun<=0;
 if(standing||climbing){const a=toRadians(s.angularVelocity/4),c=Math.cos(a),sn=Math.sin(a),x=p.x-from.x,y=p.y-from.y;
  p.x=Math.round(s.position.x+x*c-y*sn);p.y=Math.round(s.position.y+x*sn+y*c);
 }
 transformCollisionGroup(w,s.hull,{x:s.position.x/32,y:s.position.y/32,z:s.position.z/32},0,0,toRadians(s.angle/4));
}
function button(s:ToyBarnCannon,w:CollisionWorld,pressed:boolean){s.pressed=pressed;transformCollisionGroup(w,s.button,s.button.origin,0,0,toRadians(pressed?-384:0));}
export function stepToyBarnCannon(s:ToyBarnCannon,w:CollisionWorld,p:PlayerState,host:{fetchBusy:boolean;guide:()=>void;sound:(id:number,at:Vec3)=>void}){
 const standing=(group:number)=>p.onGround&&p.contacts.some(c=>c.group===group&&c.normal.y<-.5);
 if(s.timer>=2&&p.z>=-0x11202)s.timer=1;
 if(s.timer>0){
  s.clock=Math.trunc(s.timer/60)+100;s.speed=Math.min(512,s.speed+1);s.timer--;
  if(s.timer===0){button(s,w,false);s.clock=100;}
 }else{
  s.speed=Math.max(0,s.speed-1);
  if(p.stompImpact&&standing(s.button.groupIndex)&&!host.fetchBusy){s.timer=2700;button(s,w,true);host.guide();}
 }
 if(s.speed)host.sound(0x75,s.objects[2]!.rest);
 s.phase=(s.phase+Math.trunc(s.speed/16))|0;
 if(s.timer>0&&standing(s.hull.groupIndex)){
  s.recoil=1;p.stomp=0;p.stompImpact=false;p.vy=-3072;p.onGround=false;p.coyote=0;p.fallTimer=0;
  p.jumpState=JumpState.Released;p.animPhase=2;p.launched=true;
  p.vx=Math.trunc(sin(0xb90)/7);p.vz=Math.trunc(cos(0xb90)/7);p.yaw=p.targetYaw=0xb90;host.sound(0x1c,p);
 }
 s.velocity=s.objects[0]!.rest.y+Math.trunc(sin(Math.trunc(s.phase*7/6)&4095)/2)-s.position.y;
 const target=Math.trunc(sin(s.phase&4095)/32);
 const delta=(s.recoil===1?-1800:target)-s.angle;
 s.angularVelocity=delta>>(s.recoil===2?3:2);
 if(s.recoil!==0&&Math.abs(s.angularVelocity)<8)s.recoil=s.recoil===1?2:0;
}
export function toyBarnCannonPoses(s:ToyBarnCannon){
 return s.objects.map(o=>o.id===33?{index:o.index,angles:[0,0,s.pressed?-384:0] as [number,number,number],offset:{x:0,y:0,z:0}}:
  {index:o.index,angles:[0,0,s.angle>>2] as [number,number,number],offset:{x:((s.position.x>>(o.id?7:5))<<(o.id?7:5))-o.rest.x,y:((s.position.y>>(o.id?7:5))<<(o.id?7:5))-o.rest.y,z:((s.position.z>>(o.id?7:5))<<(o.id?7:5))-o.rest.z}});
}
export function restoreToyBarnCannon(s:ToyBarnCannon,w:CollisionWorld){for(const h of [s.hull,s.button])transformCollisionGroup(w,h,h.origin,0);}
