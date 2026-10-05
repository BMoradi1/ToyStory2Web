/** Alley water, path projectiles and room-2 emitter, 0041e880. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import type {Effect} from './effects.ts';
export const ALLEY_WATER_OBJECTS=[39,40,44,49,50] as const;
export function alleyWaterY(playerZ:number){return playerZ>0xf329f?0x70000:0x10000;}
export function createAlleyEffects(dat:DatLevel){
 const path=dat.paths.find(p=>p.id===14)?.points;if(!path||path.length<4||path.length%2)throw Error('Missing paired Alley effect path 14');
 const objects=ALLEY_WATER_OBJECTS.map(id=>{const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing Alley water artwork ${id}`);return {index,angles:[o.rotation.x,o.rotation.y,o.rotation.z] as const,scale:[1,1,1] as [number,number,number],baseScale:o.scale};});
 return {points:path.map(p=>({x:p.x*32,y:p.y*32,z:p.z*32})),node:0,timer:0,vent:0,objects};
}
export type AlleyEffects=ReturnType<typeof createAlleyEffects>;
export interface AlleyEffectWorld {
 zone:number;gate32:boolean;playerZ:number;cameraY:number;
 projectile:(at:Vec3,velocity:Vec3,kind:number)=>Effect|null;
 child:(at:Vec3,kind:number,mode:number)=>Effect|null;
 sound:(id:number,at:Vec3)=>void;
}
export function stepAlleyEffects(s:AlleyEffects,w:AlleyEffectWorld){
 if(--s.timer<0){
  s.node=(s.node+2)%s.points.length;const a=s.points[s.node]!,b=s.points[s.node+1]!;
  const e=w.projectile(a,{x:(b.x-a.x)>>6,y:(b.y-a.y)>>6,z:(b.z-a.z)>>6},0x4c);
  if(e){e.life=128;w.sound(0xa4,e);}s.timer=20;
 }
 if(w.zone===2&&w.gate32){
  if(--s.vent<0)s.vent=10;
  else if(s.vent<5){const e=w.child({x:0x29630,y:-0xa5660,z:-0x2eb06},0x5d,14);if(e)w.sound(0xa4,e);}
 }
 const visible=alleyWaterY(w.playerZ)>=w.cameraY;
 for(const o of s.objects)o.scale=visible?[4096/o.baseScale.x,4096/o.baseScale.y,4096/o.baseScale.z]:[0,0,0];
}
