/** Room-1 breakable cot supports and falling artwork, 00417680. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import {collisionGroupByObject,setCollisionGroupEnabled,type CollisionWorld} from '../formats/collision.ts';
import type {Creature} from './creatures.ts';
import type {PlayerState} from './player.ts';
import {standingSurface} from './stomp-props.ts';
export const ANDY_COT_OBJECTS=[19,20,26] as const;
export function createAndyCot(dat:DatLevel,w:CollisionWorld){
 const objects=ANDY_COT_OBJECTS.map(id=>{
  const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing Andy cot ${id}`);
  const rest={x:o.position.x*o.unitScale*32,y:o.position.y*o.unitScale*32,z:o.position.z*o.unitScale*32};
  return {id,index,rest,position:{...rest},angles:[o.rotation.x,o.rotation.y,o.rotation.z] as [number,number,number],shift:id===26?7:5};
 });
 return {objects,group:collisionGroupByObject(w,9),speed:[0,0],timer:0,velocity:0};
}
export type AndyCot=ReturnType<typeof createAndyCot>;
export function stepAndyCot(s:AndyCot,w:CollisionWorld,p:PlayerState,creatures:readonly Creature[],cameraZone:number,sound:(id:number,at:Vec3)=>void){
 if(cameraZone!==1)return;
 const supports=[creatures.find(c=>c.slot===0),creatures.find(c=>c.slot===2)];
 if(!supports[0]||!supports[1])return;
 for(let i=0;i<2;i++){
  const c=supports[i]!;if(c.health===80)continue;
  c.record.vulnerable=0;s.speed[i]!+=4;
  c.hover=i===0?c.hover+s.speed[i]!:(c.hover-s.speed[i]!)&4095;
  if(i===0?c.hover>0x700:c.hover<0x900){
   s.speed[i]=-Math.trunc(s.speed[i]!/2);c.hover=i===0?0x700:0x900;sound(0x32,c);
   if(s.speed[i]!> -8)c.health=80;
  }
 }
 if(supports.every(c=>c!.record.vulnerable===0)){
  if(s.timer===0){s.timer=144;setCollisionGroupEnabled(w,s.group,false);}
 }else{
  for(const c of supports)if(c!.record.vulnerable!==0)c!.record.vulnerable=p.x<0x4c274?4:5;
  setCollisionGroupEnabled(w,s.group,!(p.onGround&&standingSurface(p,w)===14));
 }
 if(s.timer>0){
  if(--s.timer<1)s.timer=-1;
  s.velocity+=16;
  if(s.objects[0]!.position.y>0x11c00&&s.velocity>0)s.velocity=-Math.trunc(s.velocity/2);
  for(const o of s.objects)o.position.y=((o.position.y+s.velocity)>>o.shift)*2**o.shift;
 }
}
export function restoreAndyCot(s:AndyCot,w:CollisionWorld){setCollisionGroupEnabled(w,s.group,true);}
