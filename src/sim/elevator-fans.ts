/** Elevator fan artwork, switches and airflow: 00425f60 and 00425eb0. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import {captureCollisionGroup,collisionGroupByObject,transformCollisionGroup,type CollisionWorld} from '../formats/collision.ts';
import {JumpState,type PlayerState} from './player.ts';
import {toRadians} from './trig.ts';
export const ELEVATOR_FAN_OBJECTS=Array.from({length:18},(_,i)=>i);
type Angles=readonly[number,number,number];
const near=(a:Vec3,b:Vec3,r:number)=>((a.x-b.x)>>8)**2+((a.y-b.y)>>8)**2+((a.z-b.z)>>8)**2<r*r;
export function createElevatorFans(dat:DatLevel,world:CollisionWorld){
  const paths=new Map<number,Vec3[]>();
  for(const id of [0,1,2,8,10]){
    const p=dat.paths.find(p=>p.id===id)?.points;
    if(!p||p.length%2)throw Error(`Missing paired fan path ${id}`);
    paths.set(id,p.map(v=>({x:v.x*32,y:v.y*32,z:v.z*32})));
  }
  return {paths,switches:0,phase:0,speed:0,angle:0,rotor:0,arena:0,ramp:0,
    angles:new Map<number,Angles>(),
    hulls:[4,5].map(id=>captureCollisionGroup(world,collisionGroupByObject(world,id))),
    sounds:[] as Vec3[],emitters:[] as {at:Vec3;vertical:boolean;speed:number}[],guides:[] as number[]};
}
export type ElevatorFans=ReturnType<typeof createElevatorFans>;
/** Same signed divisions as retail; coordinates remain game units here. */
const q=(n:number)=>Math.trunc(n/256);
function lift(p:PlayerState,base:Vec3,top:Vec3,radius:number,strength:number,limit:number){
  const x=q(base.x)-q(p.x),y=q(base.y)-q(p.y),z=q(base.z)-q(p.z);
  const height=Math.trunc((q(base.y)-q(top.y)-192)*strength/4096);
  if(x*x+z*z>=radius*radius||y<=0||y>=height)return false;
  p.stomp=0;p.onGround=false;p.coyote=0;p.jumpState=JumpState.Rising;
  if(p.vy>limit)p.vy-=128+Math.trunc(strength*128/4096);
  return true;
}
export function stepElevatorFans(s:ElevatorFans,p:PlayerState,spin:number){
  s.sounds.length=0;s.emitters.length=0;s.guides.length=0;
  s.arena=(s.arena+Math.trunc(spin*128/4096))&4095;
  s.rotor=(s.rotor+128)&4095;s.phase=(s.phase+6)&4095;
  s.speed=s.phase<2561?Math.min(128,s.speed+2):Math.max(0,s.speed-2);
  s.angle=(s.angle+s.speed)&4095;
  for(let id=0;id<4;id++)s.angles.set(id,[(s.angle+id*768)&4095,0,0]);
  for(let id=7;id<16;id++)s.angles.set(id,[0,(s.arena+(id-7)*768)&4095,0]);
  if(s.switches&1)s.angles.set(4,[0,s.rotor,0]);
  s.angles.set(6,[0,(s.rotor+768)&4095,0]);
  if(s.switches&2)s.angles.set(5,[0,(s.rotor+1536)&4095,0]);
  if(spin>0){
    const points=s.paths.get(8)!;let lifted=false;
    for(let i=0;i<points.length;i+=2){
      const base=points[i]!;
      if(!lifted&&near(base,p,1152))lifted=lift(p,base,points[i+1]!,160,spin,-2048);
    }
  }
  for(const id of [10,1,0]){
    if(id===10&&!(s.switches&1)||id===1&&!(s.switches&2))continue;
    const points=s.paths.get(id)!;
    for(let i=0;i<points.length;i+=2){
      const base=points[i]!,top=points[i+1]!;
      for(const at of [base,{...top,y:top.y+1500*32}])if(near(at,p,1408)){
        s.sounds.push(at);s.emitters.push({at,vertical:true,speed:5});
      }
      // Fixed shafts accelerate by 128, not the arena's spin-scaled 128..256.
      const vy=p.vy;
      if(lift(p,base,top,96,4096,-4096)&&vy>-4096)p.vy=vy-128;
    }
  }
  if(s.speed<=32)return;
  const points=s.paths.get(2)!;
  for(let i=0;i<points.length;i+=2){
    const at=points[i]!;if(!near(at,p,1408))continue;
    s.sounds.push(at);
    if(s.speed>64||s.phase<2560)s.emitters.push({at,vertical:false,speed:i<4?5:12});
    const x=q(at.x)-q(p.x),y=q(at.y)-q(p.y),z=q(at.z)-q(p.z),reach=q(at.x)-q(points[i+1]!.x)-32;
    if(y*y+z*z>=0x9000||x>=0||x<=reach||p.climb>0||p.pole>=0||p.zipLine>=0)continue;
    // Retail external force ramps in and stops at an opposing contact. Feed it
    // into the normal sphere sweep, rather than moving Buzz through walls.
    if(p.contacts.some(c=>c.normal.x<0)){s.ramp=0;continue;}
    s.ramp=Math.min(4096,s.ramp+256);
    p.vx+=Math.trunc(s.ramp*(s.speed*32-Math.trunc(s.speed*x*32/reach))/4096);
  }
}
export function stepFanSwitches(s:ElevatorFans,p:PlayerState,w:CollisionWorld){
  if(!p.stompImpact)return;
  for(let i=0;i<2;i++){
    const h=s.hulls[i]!;if(s.switches&(1<<i)||!p.contacts.some(c=>c.group===h.groupIndex))continue;
    s.switches|=1<<i;s.guides.push(i===0?0:4);
    const pitch=i===0?384:0,roll=i===1?384:0;
    transformCollisionGroup(w,h,h.origin,0,toRadians(pitch),toRadians(roll));
    s.angles.set(i===0?17:16,[pitch,0,roll]);
  }
}
export function restoreElevatorFans(s:ElevatorFans,w:CollisionWorld){
  for(const h of s.hulls)transformCollisionGroup(w,h,h.origin,0);
}
