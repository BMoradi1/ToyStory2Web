/** Room-2 scenery and collision gates, 00417510/00417380 in 00417680. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import {captureCollisionGroup,collisionGroupByObject,transformCollisionGroup,type CollisionWorld} from '../formats/collision.ts';
import type {Effect} from './effects.ts';
import {cos} from './trig.ts';
export const ANDY_MACHINERY_OBJECTS=[9,17,18,10,16] as const;
export function createAndyMachinery(dat:DatLevel,w:CollisionWorld){
 const objects=ANDY_MACHINERY_OBJECTS.map(id=>{
  const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing Andy machinery ${id}`);
  const rest={x:o.position.x*o.unitScale*32,y:o.position.y*o.unitScale*32,z:o.position.z*o.unitScale*32};
  return {id,index,rest,position:{...rest},angles:[o.rotation.x,o.rotation.y,o.rotation.z] as [number,number,number],base:{...o.scale},scale:[1,1,1] as [number,number,number]};
 });
 return {objects,barriers:[12,13].map(id=>({hull:captureCollisionGroup(w,collisionGroupByObject(w,id)),enabled:true})),phase:0,spin:0,roll:0};
}
export type AndyMachinery=ReturnType<typeof createAndyMachinery>;
function barrier(s:AndyMachinery,w:CollisionWorld,index:number,enabled:boolean){
 const b=s.barriers[index]!;if(b.enabled===enabled)return;b.enabled=enabled;
 if(enabled)transformCollisionGroup(w,b.hull,b.hull.origin,0);
 else {const indices=new Set(b.hull.polys.map(p=>p.index));for(const [key,cell] of w.cells){const keep=cell.filter(i=>!indices.has(i));if(keep.length)w.cells.set(key,keep);else w.cells.delete(key);}}
}
export interface AndyMachineryWorld{
 cameraZone:number;gateTwo:number;byte:()=>number;
 child:(at:Vec3,kind:number,mode:number)=>Effect|null;
 sound:(id:number,at:Vec3)=>void;
}
export function stepAndyMachinery(s:AndyMachinery,w:CollisionWorld,p:Vec3,host:AndyMachineryWorld){
 if(host.cameraZone!==2)return;
 s.phase=(s.phase+64)&8191;s.spin=(s.spin+256)&4095;s.roll=(s.roll+128)&4095;
 for(let i=0;i<s.objects.length;i++){
  const o=s.objects[i]!,at=o.rest,dx=(at.x-p.x)>>8,dy=(at.y-p.y)>>8,dz=(at.z-p.z)>>8;
  if(dx*dx+dy*dy+dz*dz>=640*640)continue;
  const rising=i<3,offset=rising?[0,0xaaa,0x1555][i]!:(i-3)*4096;
  let phase=(s.phase+offset)&8191;
  if(!rising&&phase>=1024&&phase<1088)barrier(s,w,i-3,false);
  if(phase>=2048&&phase<4096)phase=2048;
  else if(phase>=4096&&phase<6144){
   if(!rising&&phase>=5120&&phase<5184){barrier(s,w,i-3,true);host.sound(0x25,at);}
   phase=6144-phase;
  }else if(phase>=6144){
   if(rising&&phase<6208){host.child({...at,y:at.y+0x4800},0x19,2);host.child({...at,y:at.y+0x6000},0x1a,2);host.sound(0x24,at);}
   for(let n=0;n<host.gateTwo;n++){
    const e=host.child({x:at.x+(rising?0:-0x3800),y:at.y+(rising?0x6000:0x1000),z:at.z},0x18,rising?9:13);
    const rotation=host.byte()<<4,spin=host.byte()-128;if(e){e.rotation=rotation;e.spin=spin;}
   }
   phase=0;
  }
  if(rising){o.angles=[0,(s.spin+i*512)&4095,0];o.scale=[4096/o.base.x,((cos(phase)>>3)+3072)/o.base.y,4096/o.base.z];}
  else {o.angles=[0,0,(s.roll+(i-3)*512)&4095];o.position.y=((at.y>>5)-(cos(phase)>>6)+256)*32;}
 }
}
export function restoreAndyMachinery(s:AndyMachinery,w:CollisionWorld){for(const b of s.barriers)transformCollisionGroup(w,b.hull,b.hull.origin,0);}
