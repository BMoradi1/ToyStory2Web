/** Two-stomp structure and delayed directional spring, 00418e50/004190c0. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import {collisionGroupByObject,setCollisionGroupEnabled,type CollisionWorld} from '../formats/collision.ts';
import type {PlayerState} from './player.ts';
import {standingSurface} from './stomp-props.ts';
import {springLaunch} from './spring-launch.ts';
import {sin} from './trig.ts';
export const NEIGHBORHOOD_STRUCTURE_OBJECTS=[2,3,4,8,9,10,21,32,33,34,35] as const;
const SOUND_AT={x:0x59280,y:0x1000,z:-0x5c127};
export function createNeighborhoodStructure(dat:DatLevel,w:CollisionWorld){
 const objects=NEIGHBORHOOD_STRUCTURE_OBJECTS.map(id=>{const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing Neighborhood structure ${id}`);return {id,index,base:{...o.scale},angles:[o.rotation.x,o.rotation.y,o.rotation.z] as [number,number,number],scale:(id===21||id===32||id===33?[0,0,0]:[1,1,1]) as [number,number,number]};});
 const open=collisionGroupByObject(w,5),closed=collisionGroupByObject(w,6);setCollisionGroupEnabled(w,open,false);
 return {objects,open,closed,supports:[4096,4096],phase:0,wave:0xc00,roll:0,pitch:0,launcher:0};
}
export type NeighborhoodStructure=ReturnType<typeof createNeighborhoodStructure>;
export function stepNeighborhoodStructure(s:NeighborhoodStructure,w:CollisionWorld,p:PlayerState,host:{guide:(id:number)=>void;sound:(id:number,at:Vec3)=>void;refreshFloors:()=>void;release:()=>void}){
 const surface=p.onGround&&(p.stomp!==0||p.stompImpact)?standingSurface(p,w):-1;
 const obj=(id:number)=>s.objects.find(o=>o.id===id)!;
 const scale=(id:number,x:number,y:number,z:number)=>{const o=obj(id);o.scale=[x/o.base.x,y/o.base.y,z/o.base.z];};
 for(let i=0;i<2;i++){
  if(s.supports[i]===4096&&surface===8+i){s.supports[i]=4095;host.guide(i);host.sound(0x38,SOUND_AT);scale(32+i,4096,4096,4096);scale(34+i,0,0,0);}
  if(s.supports[i]!==4096&&s.supports[i]!>0){s.supports[i]=Math.max(0,s.supports[i]!-64);scale(2+i,4096,s.supports[i]!,4096);}
 }
 const bits=(s.supports[0]!==4096?1:0)+(s.supports[1]!==4096?2:0);
 if(bits&&bits!==3){s.roll=(sin(s.wave)>>9)+32;s.wave=(s.wave+32)&4095;s.pitch=bits===1?-s.roll:s.roll;}
 else if(bits===3){
  if(s.phase===0){s.phase=1;setCollisionGroupEnabled(w,s.open,true);setCollisionGroupEnabled(w,s.closed,false);host.refreshFloors();}
  const moving=s.roll<128||s.pitch!==0;
  s.roll=Math.min(128,s.roll+2);s.pitch+=s.pitch>0?-Math.min(2,s.pitch):Math.min(2,-s.pitch);
  if(!moving&&s.phase===1){s.phase=2;scale(21,4096,4096,4096);scale(4,0,0,0);host.sound(0x3b,SOUND_AT);}
 }
 if(bits)for(const id of [4,8,9,10])obj(id).angles=[s.pitch,0,s.roll];
 if(surface===10&&s.launcher===0&&s.phase!==0)s.launcher=2;
 if(s.launcher!==0){
  s.launcher++;
  if(s.launcher===7){springLaunch(p,-0x1080);p.vx=0;p.vz=16384;p.yaw=p.targetYaw=0;p.launched=true;host.release();host.guide(2);host.sound(0x1c,p);}
  if(s.launcher>32)s.launcher=-32;
  obj(21).angles=[(-Math.abs(s.launcher)&0x7f)<<5,0,0];
 }
}
export function restoreNeighborhoodStructure(s:NeighborhoodStructure,w:CollisionWorld){setCollisionGroupEnabled(w,s.open,true);setCollisionGroupEnabled(w,s.closed,true);}
