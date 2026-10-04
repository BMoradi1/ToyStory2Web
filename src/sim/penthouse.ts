/** Penthouse prop controllers, independent of its creature-owned gunslinger. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import {captureCollisionGroup,collisionGroupByObject,transformCollisionGroup,type CollisionWorld} from '../formats/collision.ts';
import type {PlayerState} from './player.ts';
import type {RandomStream} from './creatures.ts';
import type {CutHandle} from './tasks.ts';
import type {ZurgShot} from './zurg-boss.ts';
import {sin,cos,yawOf} from './trig.ts';
export function readPenthouseTables(exe:Uint8Array){
  const v=new DataView(exe.buffer,exe.byteOffset,exe.byteLength);
  if(exe.length<0xf4045)throw Error('Executable is missing Penthouse prop tables');
  return {hazards:Array.from({length:6},(_,i)=>({
    models:Array.from({length:4},(_,j)=>v.getInt32(0xf3e74+i*16+j*4,true)),
    button:Array.from({length:4},(_,j)=>v.getUint8(0xf3fb4+i*4+j)),
    zone:[3,2,2,5,4,1][i]!,
  }))};
}
export type PenthouseTables=ReturnType<typeof readPenthouseTables>;
export function penthouseObjects(t:PenthouseTables){return [...new Set(t.hazards.flatMap(h=>[...h.models,h.button[1]!,h.button[2]!]))];}
const near=(a:Vec3,b:Vec3,r:number)=>((a.x-b.x)>>8)**2+((a.y-b.y)>>8)**2+((a.z-b.z)>>8)**2<r*r;
interface PenthouseObject {id:number;index:number;rest:Vec3;position:Vec3;angles:readonly[number,number,number];scale:readonly[number,number,number]}
export function createPenthouse(dat:DatLevel,w:CollisionWorld,t:PenthouseTables){
  const objects=new Map(penthouseObjects(t).map(id=>{
    const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing Penthouse object ${id}`);
    const rest={x:o.position.x*o.unitScale*32,y:o.position.y*o.unitScale*32,z:o.position.z*o.unitScale*32};
    return [id,{id,index,rest,position:{...rest},angles:[o.rotation.x,o.rotation.y,o.rotation.z] as readonly[number,number,number],scale:[1,1,1] as readonly[number,number,number]}] as [number,PenthouseObject];
  }));
  const hazards=t.hazards.map(h=>({...h,timer:0,yaw:objects.get(h.models[0]!)!.angles[1],
    hull:captureCollisionGroup(w,collisionGroupByObject(w,h.button[0]!))}));
  for(const h of hazards){for(const id of h.models.slice(2))objects.get(id)!.scale=[0,0,0];objects.get(h.button[2]!)!.scale=[0,0,0];}
  return {objects,hazards,clock:0,blinkClock:0,blink:false,disabled:0};
}
export type Penthouse=ReturnType<typeof createPenthouse>;
export interface PenthouseWorld {
  zone:number;rand:RandomStream;gateSeven:boolean;cut?:CutHandle;
  sound?:(event:number,at:Vec3)=>void;touch?:(angle:number,reaction:number)=>void;
  projectile?:(shot:ZurgShot)=>void;effect?:(at:Vec3,kind:number,mode:number,spin:boolean)=>void;
  guide?:(id:number)=>void;
}
/** 00428700: x87 distance includes two random offsets absent from decompiler C. */
export function penthouseShot(at:Vec3,yaw:number,p:Vec3,rand:RandomStream):ZurgShot|null{
  const dx=(at.x-p.x+(rand.byte()-128)*128)>>5,dz=(at.z-p.z+(rand.byte()-128)*128)>>5;
  const distance=Math.trunc(Math.sqrt(dx*dx+dz*dz));if(distance<2000)return null;
  const speed=Math.trunc(distance*2/3),flight=Math.trunc(distance*4096/speed),y=at.y-16384;
  return {x:at.x,y,z:at.z,vx:Math.trunc(cos(yaw)*speed/16384),
    vy:Math.trunc((p.y-y)*128/flight)-Math.trunc(flight/2),vz:Math.trunc(sin(yaw-2048)*speed/16384),
    gravity:128,rotation:0,spin:0,kind:92};
}
/** Runs after the player's collision pass, so real stomp contacts own switches. */
export function stepPenthouse(s:Penthouse,p:PlayerState,w:CollisionWorld,host:PenthouseWorld){
  for(const h of s.hazards){
    if(h.timer!==0)continue;
    const button=s.objects.get(h.button[1]!)!,flash=s.objects.get(h.button[2]!)!;
    if(near(button.position,p,1120)){
      const lit=near(button.position,p,992)&&s.blinkClock>768;
      if(lit&&!s.blink){s.blink=true;flash.position={...button.position};button.scale=[0,0,0];flash.scale=[1,1,1];}
      else if(!lit&&s.blink&&(s.blinkClock<768||!near(button.position,p,992))){s.blink=false;button.scale=[1,1,1];flash.scale=[0,0,0];}
    }
    if(p.stompImpact&&p.contacts.some(c=>c.group===h.hull.groupIndex&&c.normal.y<-.5)){
      button.scale=[1,.5,1];flash.scale=[0,0,0];h.timer=60;
      transformCollisionGroup(w,h.hull,{...h.hull.origin,y:h.hull.origin.y+3600/32},0);
      const at=s.objects.get(h.models[0]!)!.position;
      host.cut?.start(at,180,32);
      if(host.cut){host.cut.look.y-=8192;host.cut.eye.y-=16384;}
      host.guide?.(h.button[3]!);
    }
  }
  s.clock++;if(s.clock>300)s.clock+=1000;s.blinkClock=(s.blinkClock+32)&1023;
  for(let i=0;i<s.hazards.length;i++){
    const h=s.hazards[i]!,body=s.objects.get(h.models[0]!)!,at=body.position;
    if(host.zone!==h.zone||!near(at,p,1152))continue;
    if(near(at,p,50))host.touch?.(yawOf(p.x-at.x,p.z-at.z),(s.disabled&(1<<i))?1:3);
    if(!(s.disabled&(1<<i))){
      let dx=p.x-at.x,dz=p.z-at.z;while(Math.abs(dx)>16384||Math.abs(dz)>16384){dx>>=1;dz>>=1;}
      const want=yawOf(-dz,dx),delta=(want-h.yaw)&4095;
      h.yaw=(h.yaw+(delta<2048?Math.min(delta,8):-Math.min(4096-delta,8)))&4095;
      for(const id of h.models.slice(0,2))s.objects.get(id)!.angles=[0,h.yaw,0];
      if(s.clock>1000){const shot=penthouseShot(at,h.yaw,p,host.rand);if(shot){host.projectile?.(shot);host.sound?.(0x92,at);}}
    }else if(host.gateSeven)host.effect?.({...at,y:at.y-8192},17,26,true);
  }
  if(s.clock>1000)s.clock-=1300;
  for(let i=0;i<s.hazards.length;i++){
    const h=s.hazards[i]!;if(h.timer<=0||--h.timer>0)continue;
    h.timer=-1;s.disabled|=1<<i;
    for(const id of h.models.slice(0,2))s.objects.get(id)!.scale=[0,0,0];
    for(const id of h.models.slice(2)){const o=s.objects.get(id)!;o.scale=[1,1,1];o.angles=[0,h.yaw,0];}
    const at=s.objects.get(h.models[0]!)!.position;
    for(let j=0;j<4;j++)host.effect?.({...at,y:at.y-12288},35,14,true);
    host.sound?.(-2,at);
  }
}
export function restorePenthouse(s:Penthouse,w:CollisionWorld){
  for(const h of s.hazards)transformCollisionGroup(w,h.hull,h.hull.origin,0);
}
