/** Alleys and Gullies lane platforms, 0041e390/0041e150/0041e020. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import {captureCollisionGroup,collisionGroupByObject,transformCollisionGroup,type CollisionWorld} from '../formats/collision.ts';
import type {PlayerState} from './player.ts';
import {carryOnYawPlatform} from './moving-platform.ts';
const LANES=[
 {hull:8,path:0,objects:[29,33],phase:0,speed:96},
 {hull:5,path:0,objects:[30,34],phase:0x3c000,speed:96},
 {hull:6,path:5,objects:[31,35],phase:0,speed:96},
 {hull:7,path:5,objects:[32,36],phase:0x3c000,speed:96},
 {hull:9,path:2,objects:[21],phase:0,speed:192},
 {hull:10,path:2,objects:[22],phase:0x3c000,speed:192},
 {hull:11,path:3,objects:[23],phase:0,speed:192},
 {hull:12,path:3,objects:[24],phase:0x3c000,speed:192},
];
export const ALLEY_PLATFORM_OBJECTS=LANES.flatMap(l=>l.objects);
export function alleyPathPoint(points:readonly Vec3[],phase:number):Vec3 {
 const node=Math.trunc(phase/4096),fraction=phase&4095,a=points[node]!,b=points[node+1]!;
 return {x:a.x+Math.trunc((b.x-a.x)*fraction/4096),y:a.y+Math.trunc((b.y-a.y)*fraction/4096),z:a.z+Math.trunc((b.z-a.z)*fraction/4096)};
}
export function createAlleyPlatforms(dat:DatLevel,w:CollisionWorld){
 const movers=LANES.map(l=>{
  const points=dat.paths.find(p=>p.id===l.path)?.points;
  if(!points||points.length<62)throw Error(`Missing Alley platform path ${l.path}`);
  const hull=captureCollisionGroup(w,collisionGroupByObject(w,l.hull));
  const point=alleyPathPoint(points,l.phase);
  const objects=l.objects.map(id=>{const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing Alley platform artwork ${id}`);
   return {id,index,rest:{x:o.position.x*o.unitScale*32,y:o.position.y*o.unitScale*32,z:o.position.z*o.unitScale*32},angles:[o.rotation.x,o.rotation.y,o.rotation.z] as const};});
  return {...l,hull,points,objects,position:{x:point.x*32,y:point.y*32,z:point.z*32},velocity:{x:0,y:0,z:0},wraps:0};
 });
 for(const m of movers)transformCollisionGroup(w,m.hull,{x:m.position.x/32,y:m.position.y/32,z:m.position.z/32},0);
 return {movers};
}
export type AlleyPlatforms=ReturnType<typeof createAlleyPlatforms>;
export function moveAlleyPlatforms(s:AlleyPlatforms,w:CollisionWorld,p:PlayerState){
 for(const m of s.movers){const before={...m.position},v=m.velocity;
  m.position={x:before.x+v.x,y:before.y+v.y,z:before.z+v.z};
  if(v.x||v.y||v.z){carryOnYawPlatform(p,m.hull.groupIndex,before,m.position,0);transformCollisionGroup(w,m.hull,{x:m.position.x/32,y:m.position.y/32,z:m.position.z/32},0);}
 }
}
export function stepAlleyPlatforms(s:AlleyPlatforms,w:CollisionWorld,p:PlayerState){
 for(let i=0;i<s.movers.length;i++){
  const m=s.movers[i]!,pair=s.movers[i^1]!;
  if(p.climbGroup===m.hull.groupIndex||p.climbGroup===pair.hull.groupIndex){m.velocity={x:0,y:0,z:0};continue;}
  if(m.phase>(m.points.length-2)*4096){
   m.phase=0;m.wraps++;const at=alleyPathPoint(m.points,0);m.position={x:at.x*32,y:at.y*32,z:at.z*32};
   transformCollisionGroup(w,m.hull,at,0);
   // Recycling teleports the hull, without teleporting a passenger with it.
   if(p.contacts.some(c=>c.group===m.hull.groupIndex)){p.onGround=false;p.contacts=p.contacts.filter(c=>c.group!==m.hull.groupIndex);}
   continue;
  }
  const target=alleyPathPoint(m.points,m.phase);
  let x=target.x*32-m.position.x,y=target.y*32-m.position.y,z=target.z*32-m.position.z;
  // Native 0041e204 uses signed X only (JGE), not length or absolute X.
  if(x<4096)m.phase+=4096;
  while(Math.max(Math.abs(x),Math.abs(y),Math.abs(z))>16384){x>>=2;y>>=2;z>>=2;}
  const length=Math.hypot(x,y,z);
  m.velocity=length?{x:Math.trunc(x/length*4096)*m.speed>>10,y:Math.trunc(y/length*4096)*m.speed>>10,z:Math.trunc(z/length*4096)*m.speed>>10}:{x:0,y:0,z:0};
 }
}
export function alleyPlatformPoses(s:AlleyPlatforms){return s.movers.flatMap(m=>m.objects.map(o=>({...o,position:{x:(m.position.x>>5)*32,y:(m.position.y>>5)*32,z:(m.position.z>>5)*32}})));}
export function restoreAlleyPlatforms(s:AlleyPlatforms,w:CollisionWorld){for(const m of s.movers)transformCollisionGroup(w,m.hull,m.hull.origin,0);}
