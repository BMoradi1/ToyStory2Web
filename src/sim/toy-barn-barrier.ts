/** Timed fetch barrier, collision 18/art 31 in 00421340. */
import type {DatLevel} from '../formats/dat.ts';
import {captureCollisionGroup,collisionGroupByObject,transformCollisionGroup,type CollisionWorld} from '../formats/collision.ts';
export const TOY_BARN_BARRIER_OBJECT=31;
export function createToyBarnBarrier(dat:DatLevel,w:CollisionWorld){
 const index=dat.objectIds[TOY_BARN_BARRIER_OBJECT]!,o=dat.objects[index];if(!o)throw Error('Missing Toy Barn fetch barrier');
 return {index,hull:captureCollisionGroup(w,collisionGroupByObject(w,18)),height:0,enabled:true,angles:[o.rotation.x,o.rotation.y,o.rotation.z] as [number,number,number]};
}
export type ToyBarnBarrier=ReturnType<typeof createToyBarnBarrier>;
export function stepToyBarnBarrier(s:ToyBarnBarrier,w:CollisionWorld,fetch:number,done:number){
 // First-run completion and timeout close the barrier. Completing the second
 // run leaves the native height target open even after the task becomes idle.
 const target=fetch!==0||done===2?16384:0;
 s.height+=Math.sign(target-s.height)*Math.min(512,Math.abs(target-s.height));
 const enabled=s.height===0;if(enabled===s.enabled)return;s.enabled=enabled;
 if(enabled){restoreToyBarnBarrier(s,w);return;}
 const indices=new Set(s.hull.polys.map(p=>p.index));
 for(const [key,cell] of w.cells){const keep=cell.filter(i=>!indices.has(i));if(keep.length)w.cells.set(key,keep);else w.cells.delete(key);}
}
export function restoreToyBarnBarrier(s:ToyBarnBarrier,w:CollisionWorld){transformCollisionGroup(w,s.hull,s.hull.origin,0);s.enabled=true;}
