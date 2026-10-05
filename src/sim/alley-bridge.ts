/** Alley push-triggered bridge and collision swap, 0041e390/0041e880. */
import type {DatLevel} from '../formats/dat.ts';
import {captureCollisionGroup,collisionGroupByObject,transformCollisionGroup,type CollisionWorld} from '../formats/collision.ts';
import type {PlayerState} from './player.ts';
import type {PushState} from './push-blocks.ts';
export const ALLEY_BRIDGE_OBJECTS=[2,3,41,42] as const;
export const ALLEY_BRIDGE_BURST={x:0x52334,y:-0xc56,z:0x5a016};
function disable(w:CollisionWorld,indices:Set<number>){for(const [key,cell] of w.cells){const keep=cell.filter(i=>!indices.has(i));if(keep.length)w.cells.set(key,keep);else w.cells.delete(key);}}
export function createAlleyBridge(dat:DatLevel,w:CollisionWorld){
 const objects=ALLEY_BRIDGE_OBJECTS.map(id=>{const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing Alley bridge artwork ${id}`);return {id,index,angles:[o.rotation.x,o.rotation.y,o.rotation.z] as [number,number,number],scale:[1,1,1] as [number,number,number]};});
 const trigger=captureCollisionGroup(w,collisionGroupByObject(w,18)),open=captureCollisionGroup(w,collisionGroupByObject(w,19));
 disable(w,new Set(open.polys.map(p=>p.index)));
 return {objects,trigger,open,angle:0,speed:0,burst:false,disabled:new Set(trigger.polys.map(p=>p.index))};
}
export type AlleyBridge=ReturnType<typeof createAlleyBridge>;
export function stepAlleyBridge(s:AlleyBridge,w:CollisionWorld,p:PlayerState,push:PushState){
 s.burst=false;
 if(s.angle===0){
  if(push.blocks[2]?.run){
   s.angle=1;disable(w,s.disabled);transformCollisionGroup(w,s.open,s.open.origin,0);
   p.vx=p.vz=0;push.held=0;p.contacts=p.contacts.filter(c=>c.group!==s.trigger.groupIndex);
  }
  if(push.blocks[1])push.blocks[1].run=0;
  return;
 }
 if(push.held===3)push.held=0;
 if(s.angle<1024){
  s.angle+=s.speed;
  if(s.angle>=1024){s.angle=1024;s.burst=true;for(const o of s.objects)if(o.id>=41)o.scale=[0,0,0];}
  for(const o of s.objects)if(o.id<4)o.angles=[0,0,s.angle];
  s.speed++;
 }
}
export function restoreAlleyBridge(s:AlleyBridge,w:CollisionWorld){for(const h of [s.trigger,s.open])transformCollisionGroup(w,h,h.origin,0);}
