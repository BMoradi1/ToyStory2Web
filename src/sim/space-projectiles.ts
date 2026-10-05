/** Room-2 path-16 projectile volley, 00423ff2..004241b1. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import {sin,cos,yawOf} from './trig.ts';
export function createSpaceProjectiles(dat:DatLevel){
  const points=dat.paths.find(p=>p.id===16)?.points;
  if(!points?.length)throw Error('Missing Space Land projectile path 16');
  return {points:points.map(p=>({x:p.x*32,y:p.y*32,z:p.z*32})),clock:0,node:0};
}
export type SpaceProjectiles=ReturnType<typeof createSpaceProjectiles>;
export function spaceProjectileVelocity(from:Vec3,to:Vec3):Vec3|null{
  const dx=(from.x-to.x)>>5,dz=(from.z-to.z)>>5,distance=Math.trunc(Math.hypot(dx,dz));
  const speed=Math.trunc(distance*2/3);if(!speed)return null;
  const flight=Math.trunc(distance*4096/speed),yaw=(yawOf(dx,dz)-2048)&4095;
  return {x:Math.trunc(sin(yaw)*speed/16384),z:Math.trunc(cos(yaw)*speed/16384),
    y:Math.trunc(-flight*128/256)-Math.trunc((from.y-to.y)*128/flight)};
}
export function stepSpaceProjectiles(s:SpaceProjectiles,p:Vec3,host:{zone:number;gateSixteen:boolean;
  projectile:(at:Vec3,v:Vec3,gravity:number,kind:number)=>void;sound:(id:number,at:Vec3)=>void;
},dt=1){
  if(host.zone!==2||p.x>=0x1b467)return;
  s.clock+=dt;if(s.clock<=200||!host.gateSixteen)return;
  const at=s.points[s.node++]!;
  if(s.node>=s.points.length){s.node=0;s.clock=0;}
  const dx=(at.x-p.x)>>8,dy=(at.y-p.y)>>8,dz=(at.z-p.z)>>8;
  if(dx*dx+dy*dy+dz*dz>=768*768)return;
  const v=spaceProjectileVelocity(at,p);if(!v)return; // Native divides by zero at coincident XZ.
  host.projectile(at,v,128,96);host.sound(0xd,at);
}
