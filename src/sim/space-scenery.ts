/** Space Land's hanging toys and four animated displays, 00423200/00423bea. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import {sin} from './trig.ts';
export const SPACE_SCENERY_OBJECTS=[2,3,4,5,6,7,8,9,20,21,22,23] as const;
export function createSpaceScenery(dat:DatLevel){
  return {soundTicks:0,objects:SPACE_SCENERY_OBJECTS.map(id=>{
    const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing Space Land scenery ${id}`);
    const rest={x:o.position.x*o.unitScale*32,y:o.position.y*o.unitScale*32,z:o.position.z*o.unitScale*32};
    const angles:[number,number,number]=[o.rotation.x,o.rotation.y,o.rotation.z];
    return {id,index,rest,position:{...rest},restAngles:angles,angles:[...angles] as [number,number,number],phase:0,yaw:0};
  })};
}
export type SpaceScenery=ReturnType<typeof createSpaceScenery>;
export function stepSpaceScenery(s:SpaceScenery,host:{zone:number;randomByte:()=>number;sound:(event:number,at:Vec3)=>void},dt=1){
  for(const o of s.objects){
    if(o.id<10){
      o.phase=(o.phase+o.id*dt)&4095;o.yaw=(o.yaw+(sin(o.phase)>>10)*dt)&4095;
      o.angles=[o.restAngles[0],(o.restAngles[1]+o.yaw)&4095,o.restAngles[2]];
    }else if(host.zone===4){
      o.phase=(o.phase+[8,7,6,11][o.id-20]!*dt)&4095;
      const axis=o.id===20||o.id===23?'y':'x';o.position[axis]=o.rest[axis]+(sin(o.phase)>>6)*32;
    }
  }
  if(host.zone!==4)return;
  s.soundTicks-=dt;
  if(s.soundTicks<1){
    s.soundTicks=(host.randomByte()&127)+10;
    let event=host.randomByte()&3;if(event===3)event=0;
    const source=host.randomByte()&3;
    host.sound(0x7b+event,s.objects.find(o=>o.id===20+source)!.rest);
  }
}
