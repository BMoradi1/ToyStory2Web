/** Stomp-operated bridge: 0041c640, collision 26 and artwork 28/29. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import {captureCollisionGroup,collisionGroupByObject,transformCollisionGroup,type CollisionWorld} from '../formats/collision.ts';
import type {PlayerState} from './player.ts';
import {standingSurface} from './stomp-props.ts';
import {toRadians} from './trig.ts';
export const CONSTRUCTION_BRIDGE_OBJECTS=[28,29] as const;
export function createConstructionBridge(dat:DatLevel,w:CollisionWorld){
  return {hull:captureCollisionGroup(w,collisionGroupByObject(w,26)),phase:0,angle:0,velocity:0,
    objects:CONSTRUCTION_BRIDGE_OBJECTS.map(id=>{const index=dat.objectIds[id];if(index===undefined||!dat.objects[index])throw Error(`Missing bridge artwork ${id}`);return {id,index};})};
}
export type ConstructionBridge=ReturnType<typeof createConstructionBridge>;
export function moveConstructionBridge(s:ConstructionBridge,w:CollisionWorld,p:PlayerState):void{
  if(s.velocity===0)return;
  const old=s.angle;s.angle+=s.velocity;
  const group=s.hull.groupIndex;
  const standing=p.onGround&&p.climb===0&&p.contacts.some(c=>c.group===group&&c.normal.y<-.5);
  const climbing=p.climbGroup===group&&!p.dying&&p.hitStun<=0;
  if(standing||climbing){
    const origin=s.hull.origin,x=p.x-origin.x*32,y=p.y-origin.y*32;
    const delta=toRadians((s.angle-old)/4),cs=Math.cos(delta),sn=Math.sin(delta);
    p.x=Math.round(origin.x*32+x*cs-y*sn);p.y=Math.round(origin.y*32+x*sn+y*cs);
  }
  transformCollisionGroup(w,s.hull,s.hull.origin,0,0,toRadians(s.angle/4));
}
export function stepConstructionBridge(s:ConstructionBridge,p:PlayerState,w:CollisionWorld,host:{
  camera?:Vec3;sound:(event:number,at:Vec3)=>void;guide:(id:number)=>void;
},dt=1):void{
  const base={x:-0x12fd0,y:-0x23af6,z:0x191b2},camera=host.camera??base;
  const at={x:base.x+Math.trunc((camera.x-base.x)*3/4),y:base.y+Math.trunc((camera.y-base.y)*3/4),z:base.z+Math.trunc((camera.z-base.z)*3/4)};
  if(s.phase===0){
    if(p.onGround&&p.stompImpact&&standingSurface(p,w)===36){s.phase=1;host.guide(3);host.sound(0x6d,at);}
    return;
  }
  if(s.phase===1){
    if(s.angle< -0x998){s.phase=2;s.velocity=0;host.sound(0x6d,at);}
    else{s.velocity=-8*dt;host.sound(0x6e,at);}
    return;
  }
  const before=s.phase;s.phase+=dt;
  if(before<240&&s.phase>=240)host.sound(0x6d,at);
  if(s.phase>=240){
    if(s.angle< -32){s.velocity=8*dt;host.sound(0x6e,at);}
    else if(s.angle<0){s.velocity=-s.angle;host.sound(0x6e,at);}
    else{s.velocity=0;s.phase=0;host.sound(0x6d,at);}
  }
}
export function restoreConstructionBridge(s:ConstructionBridge,w:CollisionWorld):void{transformCollisionGroup(w,s.hull,s.hull.origin,0);}
export function constructionBridgeRoll(s:ConstructionBridge):number{return Math.trunc(s.angle/4)+0x266;}
