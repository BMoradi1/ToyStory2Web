/** Andy's falling push-hatch and growing doorway, 004171d0/00417680. */
import type {DatLevel} from '../formats/dat.ts';
import {collisionGroupByObject,setCollisionGroupEnabled,type CollisionWorld} from '../formats/collision.ts';
import type {PlayerState} from './player.ts';
import type {PushState} from './push-blocks.ts';
export const ANDY_GATE_OBJECTS=[21,22] as const;
export function createAndyGates(dat:DatLevel,w:CollisionWorld){
 const objects=ANDY_GATE_OBJECTS.map(id=>{
  const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing Andy gate ${id}`);
  const rest={x:o.position.x*o.unitScale*32,y:o.position.y*o.unitScale*32,z:o.position.z*o.unitScale*32};
  return {id,index,rest,position:{...rest},angles:[o.rotation.x,o.rotation.y,o.rotation.z] as [number,number,number],base:{...o.scale},scale:[1,1,1] as [number,number,number]};
 });
 const doorway=collisionGroupByObject(w,8),hatch=collisionGroupByObject(w,1),landing=collisionGroupByObject(w,14);
 setCollisionGroupEnabled(w,doorway,false);setCollisionGroupEnabled(w,landing,false);
 const parent=objects[0]!,child=objects[1]!;
 parent.scale=[0,4096/parent.base.y,4096/parent.base.z];
 // 004ccff0 scales the child's position about the parent, not its mesh.
 // The initial zero X scale brings it onto the parent's X before growth.
 child.position.x=parent.position.x;
 return {objects,doorway,hatch,landing,growth:0,hatchAngle:0};
}
export type AndyGates=ReturnType<typeof createAndyGates>;
export function stepAndyGates(s:AndyGates,w:CollisionWorld,p:PlayerState,push:PushState){
 const block=push.blocks[3];
 if(block&&(block.tipPoint===-1||block.fallSpeed!==0)){
  if(s.hatchAngle===0){setCollisionGroupEnabled(w,s.landing,true);setCollisionGroupEnabled(w,s.hatch,false);}
  s.hatchAngle=Math.min(512,s.hatchAngle+16);
 }
 if(s.growth===0){
  if(p.z< -321858&&p.z> -361602&&p.x<0x4cbb6&&p.x>0x46376&&p.y<0x4800&&p.y>0&&p.coyote!==0){
   setCollisionGroupEnabled(w,s.doorway,true);s.growth=8;
  }
 }else if(s.growth<4096){
  s.growth=Math.min(4096,s.growth+64);
  const parent=s.objects[0]!,child=s.objects[1]!;
  parent.scale=[s.growth/parent.base.x,4096/parent.base.y,4096/parent.base.z];
  child.position.x=(child.position.x-parent.position.x)*(s.growth/4096)+parent.position.x;
 }
}
export function restoreAndyGates(s:AndyGates,w:CollisionWorld){for(const group of [s.doorway,s.hatch,s.landing])setCollisionGroupEnabled(w,group,true);}
