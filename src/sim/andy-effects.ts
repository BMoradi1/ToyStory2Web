/** Room-4 path lobber, cycling emitters and steam hazard, 00417680. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import type {Effect} from './effects.ts';
import {sin,cos,yawOf} from './trig.ts';
export const ANDY_EMITTER_CENTRE={x:0xb3e1a,y:0x26720,z:-529601};
export const ANDY_STEAM_CENTRE={x:0xb74dc,y:0x23f3e,z:-0x6634a};
export function createAndyEffects(dat:DatLevel,exe:Uint8Array){
 const points=dat.paths.find(p=>p.id===22)?.points;if(!points||points.length<17)throw Error('Missing Andy effect path 22');
 const view=new DataView(exe.buffer,exe.byteOffset,exe.byteLength);
 const emitters=Array.from({length:3},(_,i)=>({x:view.getInt32(0xf0eb8+i*12,true),y:view.getInt32(0xf0ebc+i*12,true),z:view.getInt32(0xf0ec0+i*12,true)}));
 return {points:points.map(p=>({x:p.x*32,y:p.y*32,z:p.z*32})),emitters,node:1,timer:0,emitter:0};
}
export type AndyEffects=ReturnType<typeof createAndyEffects>;
export interface AndyEffectWorld{
 cameraZone:number;player:Vec3;gate64:boolean;gate8:boolean;gateTwo:number;byte:()=>number;
 projectile:(at:Vec3,velocity:Vec3,spin:number)=>Effect|null;
 child:(at:Vec3,kind:number,mode:number)=>Effect|null;
 hurt:()=>void;
}
/** 0049f400 returns squared shifted distance + 1, or zero outside the sphere. */
function range(at:Vec3,p:Vec3){const x=(at.x-p.x)>>8,y=(at.y-p.y)>>8,z=(at.z-p.z)>>8,d=x*x+y*y+z*z;return d<640*640?d+1:0;}
export function stepAndyEffects(s:AndyEffects,w:AndyEffectWorld){
 if(w.cameraZone!==4)return;
 if(range(ANDY_EMITTER_CENTRE,w.player)){
  if(w.gate64){
   const at=s.points[0]!,target=s.points[s.node]!,dx=(at.x-target.x)>>8,dz=(at.z-target.z)>>8;
   const yaw=(yawOf(dx,dz)-2048)&4095,distance=Math.trunc(Math.hypot(dx,dz)),speed=Math.trunc(distance*7/2);
   const spin=(w.byte()-128)>>2;
   w.projectile(at,{x:Math.trunc(sin(yaw)*speed/8192),y:Math.trunc(-Math.trunc(distance*4096/speed)*128/64),z:Math.trunc(cos(yaw)*speed/8192)},spin);
   s.node+=1+(w.byte()&15);if(s.node>=s.points.length)s.node+=1-s.points.length;
  }
  if(++s.timer>120){s.timer-=120;s.emitter=(s.emitter+1)%3;const at=s.emitters[s.emitter]!;w.child({...at,y:at.y-2048},0x22,2);}
  for(let i=0;i<w.gateTwo;i++){const e=w.child(s.emitters[s.emitter]!,0x10,10),life=(w.byte()&15)+32;if(e)e.life=life;}
 }
 const steam=range(ANDY_STEAM_CENTRE,w.player);
 if(steam){
  if(steam<900)w.hurt();
  if(w.gate8){const e=w.child(ANDY_STEAM_CENTRE,0x11,10),spin=(w.byte()-128)>>3;if(e)e.spin=spin;}
 }
}
