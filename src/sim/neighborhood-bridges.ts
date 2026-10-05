/** Neighborhood's two push bridges, native 00418e50/004190c0. */
import type {DatLevel} from '../formats/dat.ts';
import {collisionGroupByObject,setCollisionGroupEnabled,type CollisionWorld} from '../formats/collision.ts';
import type {PlayerState} from './player.ts';
import type {PushState} from './push-blocks.ts';
export const NEIGHBORHOOD_BRIDGE_OBJECTS=[5,11,30,31] as const;
export function createNeighborhoodBridges(dat:DatLevel,w:CollisionWorld){
 const objects=NEIGHBORHOOD_BRIDGE_OBJECTS.map(id=>{const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing Neighborhood bridge ${id}`);return {id,index,at:{x:o.position.x*o.unitScale*32,y:o.position.y*o.unitScale*32,z:o.position.z*o.unitScale*32},angles:[0,0,id===5||id===11?750:o.rotation.z] as [number,number,number]};});
 const groups=new Map([2,3,4,11,12].map(id=>[id,collisionGroupByObject(w,id)]));
 for(const id of [4,12])setCollisionGroupEnabled(w,groups.get(id)!,false);
 return {objects,groups,firstAngle:750,firstSpeed:0,secondAngle:0,secondSpeed:0,sounds:[] as number[]};
}
export type NeighborhoodBridges=ReturnType<typeof createNeighborhoodBridges>;
export function stepNeighborhoodBridges(s:NeighborhoodBridges,w:CollisionWorld,p:PlayerState,push:PushState){
 s.sounds.length=0;
 const enable=(id:number,on:boolean)=>setCollisionGroupEnabled(w,s.groups.get(id)!,on);
 if(s.firstSpeed!==-2147483648){
  if(s.firstAngle<665)s.firstSpeed++;else s.firstSpeed=push.held===1?8:0;
  const before=s.firstAngle;s.firstAngle-=Math.trunc(s.firstSpeed/2);
  if(before>664&&s.firstAngle<665){enable(2,false);enable(3,false);enable(4,true);push.held=0;}
  if(s.firstAngle<1){
   s.firstSpeed=-(s.firstSpeed>>2);s.firstAngle=0;
   if(Math.abs(s.firstSpeed)<4)s.firstSpeed=-2147483648;else s.sounds.push(5);
  }
  for(const o of s.objects)if(o.id===5||o.id===11)o.angles=[0,0,s.firstAngle];
 }
 if(s.secondAngle===0){
  const block=push.blocks[1];
  if(p.y< -0x102f9){if(block?.run){s.secondAngle=1;enable(11,false);enable(12,true);p.vx=p.vz=0;push.held=0;}}
  else if(block)block.run=0;
 }else{
  if(push.held===2)push.held=0;
  if(s.secondAngle<0x245){
   s.secondAngle+=s.secondSpeed;
   if(s.secondAngle>=0x245){s.secondAngle=0x245;s.sounds.push(30);}
   for(const o of s.objects)if(o.id===30||o.id===31)o.angles=[0,0,0xfff-s.secondAngle];
   s.secondSpeed++;
  }
 }
}
export function restoreNeighborhoodBridges(s:NeighborhoodBridges,w:CollisionWorld){for(const group of s.groups.values())setCollisionGroupEnabled(w,group,true);}
