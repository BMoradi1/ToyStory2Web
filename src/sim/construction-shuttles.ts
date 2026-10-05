/** Four Construction Yard shuttles: 0041c190/0041c640, using 0048acc0. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import {captureCollisionGroup,collisionGroupByObject,transformCollisionGroup,type CollisionWorld} from '../formats/collision.ts';
import type {PlayerState} from './player.ts';
import {carryOnYawPlatform} from './moving-platform.ts';
import {createMoverScript,stepMoverScript} from './mover-script.ts';
export const CONSTRUCTION_SHUTTLE_OBJECTS=[41,42,43,44] as const;
export function readConstructionShuttleScripts(exe:Uint8Array){
  if(exe.length<0xf1c88)throw Error('Missing Construction Yard mover scripts');
  const v=new DataView(exe.buffer,exe.byteOffset,exe.byteLength);
  return [0xf1c64,0xf1c40].map(offset=>Array.from({length:18},(_,i)=>v.getInt16(offset+i*2,true)));
}
export function createConstructionShuttles(dat:DatLevel,w:CollisionWorld,exe:Uint8Array){
  const scripts=readConstructionShuttleScripts(exe);
  const movers=CONSTRUCTION_SHUTTLE_OBJECTS.map((id,i)=>{
    const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing shuttle artwork ${id}`);
    const hull=captureCollisionGroup(w,collisionGroupByObject(w,14+i));
    const rest={x:o.position.x*o.unitScale*32,y:o.position.y*o.unitScale*32,z:o.position.z*o.unitScale*32};
    return {id,index,hull,rest,position:{x:hull.origin.x*32,y:hull.origin.y*32,z:hull.origin.z*32},angles:[o.rotation.x,o.rotation.y,o.rotation.z] as const,script:createMoverScript(scripts[i<2?0:1]!)};
  });
  return {movers,bits:0};
}
export type ConstructionShuttles=ReturnType<typeof createConstructionShuttles>;
export function moveConstructionShuttles(s:ConstructionShuttles,w:CollisionWorld,p:PlayerState){
  for(const m of s.movers){
    const before={...m.position},v=m.script.velocity;
    m.position={x:before.x+v.x,y:before.y+v.y,z:before.z+v.z};
    if(v.x||v.y||v.z){
      carryOnYawPlatform(p,m.hull.groupIndex,before,m.position,0);
      transformCollisionGroup(w,m.hull,{x:m.position.x/32,y:m.position.y/32,z:m.position.z/32},0);
    }
  }
}
export function stepConstructionShuttles(s:ConstructionShuttles,randomByte:()=>number){
  const host={bits:s.bits,randomByte,point:():Vec3|undefined=>undefined};
  for(const m of s.movers)stepMoverScript(m.script,m.position,m.rest,host);
  s.bits=host.bits;
}
export function restoreConstructionShuttles(s:ConstructionShuttles,w:CollisionWorld){for(const m of s.movers)transformCollisionGroup(w,m.hull,m.hull.origin,0);}
