/** Six Toy Barn platforms: 00421090/00421340, using 0048acc0. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import {captureCollisionGroup,collisionGroupByObject,transformCollisionGroup,type CollisionWorld} from '../formats/collision.ts';
import type {PlayerState} from './player.ts';
import {carryOnYawPlatform} from './moving-platform.ts';
import {createMoverScript,stepMoverScript} from './mover-script.ts';
export const TOY_BARN_PLATFORM_OBJECTS=[15,16,17,12,13,14,18,19,20] as const;
export function readToyBarnPlatformScripts(exe:Uint8Array){
  if(exe.length<0xf2a24)throw Error('Missing Toy Barn mover scripts');
  const v=new DataView(exe.buffer,exe.byteOffset,exe.byteLength);
  return [0xf294c,0xf2970,0xf2994,0xf29b8,0xf29dc,0xf2a00].map(offset=>Array.from({length:18},(_,i)=>v.getInt16(offset+i*2,true)));
}
export function createToyBarnPlatforms(dat:DatLevel,w:CollisionWorld,exe:Uint8Array){
  const scripts=readToyBarnPlatformScripts(exe);
  const movers=TOY_BARN_PLATFORM_OBJECTS.slice(0,6).map((id,i)=>{
    const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing shuttle artwork ${id}`);
    const hull=captureCollisionGroup(w,collisionGroupByObject(w,[7,8,9,13,12,11][i]!));
    const rest={x:o.position.x*o.unitScale*32,y:o.position.y*o.unitScale*32,z:o.position.z*o.unitScale*32};
    return {id,index,hull,rest,enemy:i<3?null:i+4,position:{x:hull.origin.x*32+(i<3?0:25280),y:hull.origin.y*32,z:hull.origin.z*32},angles:[o.rotation.x,o.rotation.y,o.rotation.z] as const,script:createMoverScript(scripts[i]!)};
  });
  for(const m of movers)transformCollisionGroup(w,m.hull,{x:m.position.x/32,y:m.position.y/32,z:m.position.z/32},0);
  const followers=[18,19,20].map(id=>{const index=dat.objectIds[id]!,o=dat.objects[index]!;return {index,rest:{x:o.position.x*o.unitScale*32,y:o.position.y*o.unitScale*32,z:o.position.z*o.unitScale*32},angles:[o.rotation.x,o.rotation.y,o.rotation.z] as const};});
  return {movers,followers,bits:0};
}
export type ToyBarnPlatforms=ReturnType<typeof createToyBarnPlatforms>;
export function moveToyBarnPlatforms(s:ToyBarnPlatforms,w:CollisionWorld,p:PlayerState){
  for(const m of s.movers){
    const before={...m.position},v=m.script.velocity;
    m.position={x:before.x+v.x,y:before.y+v.y,z:before.z+v.z};
    if(v.x||v.y||v.z){
      carryOnYawPlatform(p,m.hull.groupIndex,before,m.position,0);
      transformCollisionGroup(w,m.hull,{x:m.position.x/32,y:m.position.y/32,z:m.position.z/32},0);
    }
  }
}
export function stepToyBarnPlatforms(s:ToyBarnPlatforms,randomByte:()=>number,health:(slot:number)=>number|undefined){
  const host={bits:s.bits,randomByte,point:():Vec3|undefined=>undefined};
  for(const m of s.movers)if(m.enemy===null||health(m.enemy)===0)stepMoverScript(m.script,m.position,m.rest,host);
  s.bits=host.bits;
}
export function restoreToyBarnPlatforms(s:ToyBarnPlatforms,w:CollisionWorld){for(const m of s.movers)transformCollisionGroup(w,m.hull,m.hull.origin,0);}

export function toyBarnPlatformPoses(s:ToyBarnPlatforms){
  return [...s.movers.map(m=>({index:m.index,rest:m.rest,position:{x:(m.position.x>>5)*32,y:(m.position.y>>5)*32,z:(m.position.z>>5)*32},angles:m.angles})),
    ...s.followers.map((f,i)=>{const p=s.movers[i]!.position;return {...f,position:{x:(p.x>>7)*128,y:(p.y>>7)*128,z:(p.z>>7)*128}};})];
}

/** 00421340: six unused disk permits means guards are closed (mask 4).
 * Any disk in flight opens mask 5, including its spin-vulnerability bit. */
export function updateToyBarnGuards(creatures:readonly {slot:number;record:{vulnerable:number}}[],disksActive:boolean){
  for(const c of creatures)if(c.slot>=7&&c.slot<=9)c.record.vulnerable=disksActive?5:4;
}
