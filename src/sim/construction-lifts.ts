/** Four linked lift assemblies: 0041c640, 0041bee0 and 0049ec00. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import {captureCollisionGroup,collisionGroupByObject,transformCollisionGroup,type CollisionWorld} from '../formats/collision.ts';
import type {PlayerState} from './player.ts';
import {carryOnYawPlatform} from './moving-platform.ts';
import {createMoverScript,stepMoverScript} from './mover-script.ts';
import {sin,cos,toRadians} from './trig.ts';
export const CONSTRUCTION_LIFT_OBJECTS=Array.from({length:4},(_,i)=>[i,i+4,i+8,i+16,i+20,i+24,i+57]).flat();
const game=(v:Vec3,scale=32):Vec3=>({x:v.x*scale,y:v.y*scale,z:v.z*scale});
export function createConstructionLifts(dat:DatLevel,w:CollisionWorld,exe:Uint8Array){
  const view=new DataView(exe.buffer,exe.byteOffset,exe.byteLength);
  const lifts=[0,1,2,3].map(id=>{
    const objects=[id,id+4,id+8,id+16,id+20,id+24,id+57].map(n=>{
      const index=dat.objectIds[n]!,o=dat.objects[index];if(!o)throw Error(`Missing lift artwork ${n}`);
      const rest=game(o.position,o.unitScale*32);
      return {id:n,index,rest,position:{...rest},angles:[o.rotation.x,o.rotation.y,o.rotation.z] as [number,number,number],scale:[1,1,1] as [number,number,number]};
    });
    const hull=captureCollisionGroup(w,collisionGroupByObject(w,id+1));
    const partner=captureCollisionGroup(w,collisionGroupByObject(w,[7,8,9,6][id]!));
    const offset=[0xf1ba4,0xf1bc8,0xf1bf4,0xf1c1c][id]!,count=[18,22,20,18][id]!;
    return {id,objects,hull,partner,position:game(hull.origin),partnerPosition:game(partner.origin),partnerVelocity:{x:0,y:0,z:0},
      rest:objects[0]!.rest,yaw:id<2?3072:0,angle:0,angularVelocity:0,rockSpeed:0,
      height:[137600,48000,72000,52800][id]!,axis:id%2,
      script:createMoverScript(Array.from({length:count},(_,i)=>view.getInt16(offset+i*2,true)))};
  });
  const s={lifts,bits:0,grabbed:-1,landingVelocity:0,paths:dat.paths};
  for(const l of lifts){transformCollisionGroup(w,l.hull,game(l.position,1/32),toRadians(l.yaw));updateArtwork(l);}
  return s;
}
export type ConstructionLifts=ReturnType<typeof createConstructionLifts>;
type Lift=ConstructionLifts['lifts'][number];
function updateArtwork(l:Lift){
  const [near,far,under,top,rail,farRail,cable]=l.objects;
  near!.position={x:(l.position.x>>5)*32,y:(l.position.y>>5)*32,z:(l.position.z>>5)*32};near!.angles=[0,l.yaw,l.angle>>2];
  // Far meshes store coordinates at quarter scale: preserve the native shifts.
  far!.position={x:(l.position.x>>7)*128,y:(l.position.y>>7)*128,z:(l.position.z>>7)*128};far!.angles=[...near!.angles];
  under!.position={...near!.position};
  top!.position={x:near!.position.x,y:top!.rest.y,z:near!.position.z};
  cable!.position={...top!.position};cable!.scale=[1,Math.trunc((l.position.y-l.rest.y+l.height)*4096/l.height)/4096,1];
  rail!.position={x:l.axis?near!.position.x:rail!.rest.x,y:rail!.rest.y,z:l.axis?rail!.rest.z:near!.position.z};
  farRail!.position={x:l.axis?far!.position.x:farRail!.rest.x,y:farRail!.rest.y,z:l.axis?farRail!.rest.z:far!.position.z};
}
export function moveConstructionLifts(s:ConstructionLifts,w:CollisionWorld,p:PlayerState){
  s.landingVelocity=p.vy;s.grabbed=p.climbGroup;
  for(const l of s.lifts){
    const before={...l.position},angle=l.angle,v=l.script.velocity;
    l.position={x:before.x+v.x,y:before.y+v.y,z:before.z+v.z};l.angle+=l.angularVelocity;
    const standing=p.onGround&&p.climb===0&&p.contacts.some(c=>c.group===l.hull.groupIndex&&c.normal.y<-.5);
    const hanging=p.climbGroup===l.hull.groupIndex&&!p.dying&&p.hitStun<=0;
    if(standing||hanging){
      // Undo the old yaw/roll, then apply the new roll/yaw and translation.
      const cy=Math.cos(toRadians(l.yaw)),sy=Math.sin(toRadians(l.yaw));
      const dx=p.x-before.x,dz=p.z-before.z,x=dx*cy-dz*sy,z=dz*cy+dx*sy,y=p.y-before.y;
      const a=toRadians((l.angle-angle)/4),c=Math.cos(a),sn=Math.sin(a),xx=x*c-y*sn,yy=x*sn+y*c;
      p.x=Math.round(l.position.x+xx*cy+z*sy);p.y=Math.round(l.position.y+yy);p.z=Math.round(l.position.z+z*cy-xx*sy);
    }
    transformCollisionGroup(w,l.hull,game(l.position,1/32),toRadians(l.yaw),0,toRadians(l.angle/4));
    const old={...l.partnerPosition},pv=l.partnerVelocity;
    l.partnerPosition={x:old.x+pv.x,y:old.y+pv.y,z:old.z+pv.z};
    carryOnYawPlatform(p,l.partner.groupIndex,old,l.partnerPosition,0);
    transformCollisionGroup(w,l.partner,game(l.partnerPosition,1/32),0);
  }
}
export function stepConstructionLifts(s:ConstructionLifts,p:PlayerState,randomByte:()=>number){
  const host={bits:s.bits,randomByte,point:(path:number,node:number)=>s.paths.find(p=>p.id===path)?.points[node]};
  for(const l of s.lifts){
    const held=s.grabbed===l.hull.groupIndex;
    if(held)l.rockSpeed=0;
    else {
      if(p.onGround&&p.contacts.some(c=>c.group===l.hull.groupIndex&&c.normal.y<-.5)){
        const lever=Math.trunc((((p.z-l.position.z)>>5)*(sin(l.yaw-2048)>>2)+((p.x-l.position.x)>>5)*(cos(l.yaw)>>2))/4096);
        const distance=Math.trunc(Math.hypot(lever,(p.y-l.position.y)>>5))>>5;
        const force=Math.trunc(((s.landingVelocity*distance>>9)+distance)/2);
        l.rockSpeed+=lever>0?force:-force;
      }else if(Math.abs(l.angle)>8)l.rockSpeed+=l.angle<0?3:-3;
      l.rockSpeed=l.rockSpeed>0?Math.max(0,l.rockSpeed-2):Math.min(0,l.rockSpeed+2);
      let target=l.angle+Math.trunc(l.rockSpeed/16);
      if(target< -896){target=-896;l.rockSpeed=Math.abs(Math.trunc(l.rockSpeed*3/4));}
      else if(target>896){target=896;l.rockSpeed=-Math.abs(Math.trunc(l.rockSpeed*3/4));}
      l.angularVelocity=target-l.angle;
    }
    if(held||s.grabbed===l.partner.groupIndex)l.script.velocity={x:0,y:0,z:0};
    else stepMoverScript(l.script,l.position,l.rest,host);
    updateArtwork(l);
    const at=l.objects[4]!.position;
    l.partnerVelocity={x:at.x-l.partnerPosition.x,y:at.y-l.partnerPosition.y,z:at.z-l.partnerPosition.z};
  }
  s.bits=host.bits;
}
export function restoreConstructionLifts(s:ConstructionLifts,w:CollisionWorld){for(const l of s.lifts){transformCollisionGroup(w,l.hull,l.hull.origin,0);transformCollisionGroup(w,l.partner,l.partner.origin,0);}}
