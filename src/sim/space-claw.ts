/** Space Land's three-press claw machine, 00423640..00423bca. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import type {PickupState} from './pickups.ts';
import {sin} from './trig.ts';

export const SPACE_CLAW_OBJECTS=[10,11,12,13,14,16,53] as const;
export function createSpaceClaw(dat:DatLevel){
  const objects=SPACE_CLAW_OBJECTS.map(id=>{
    const index=dat.objectIds[id]!,o=dat.objects[index];
    if(!o)throw Error(`Missing Space Land claw object ${id}`);
    const rest={x:o.position.x*o.unitScale*32,y:o.position.y*o.unitScale*32,z:o.position.z*o.unitScale*32};
    return {id,index,rest,position:{...rest},angles:[o.rotation.x,o.rotation.y,o.rotation.z] as [number,number,number],scale:1};
  });
  const rest=objects[0]!.rest;
  const s={objects,base:{x:rest.x-0x4000,y:rest.y,z:rest.z-0x4000},
    prize:{...rest,y:rest.y+0x6000},phase:0,cooldown:0,x:0,z:0,drop:0,hold:0,
    prizeState:0,prizeVelocity:0,randomized:false,wobble:0,yaw:0};
  pose(s);return s;
}
export type SpaceClaw=ReturnType<typeof createSpaceClaw>;
const fold=(v:number)=>v>0x7fff?0x10000-v:v;
function position(s:SpaceClaw):Vec3{return {x:s.base.x+fold(s.x),y:s.base.y+s.drop,z:s.base.z+fold(s.z)};}
function pose(s:SpaceClaw){
  const at=position(s);
  for(const o of s.objects){
    if([10,11,12,16].includes(o.id)){
      o.position={x:at.x>>5<<5,y:(o.id===16?s.base.y:at.y)>>5<<5,z:at.z>>5<<5};
      if(o.id===12||o.id===16)o.position.y-=0x420*32;
    }
    if(o.id===10||o.id===11){o.angles=[0,s.yaw,0];o.scale=(o.id===11)===(s.phase>=4&&s.phase<=6)?1:0;}
    if(o.id===13||o.id===14)o.scale=(o.id===14)===(s.cooldown>0)?1:0;
    if(o.id===53)o.position={x:s.prize.x>>5<<5,y:s.prize.y>>5<<5,z:s.prize.z>>5<<5};
  }
  // The claw closes halfway through its pause, not when lowering ends.
  if(s.phase===4&&s.hold<60){s.objects.find(o=>o.id===10)!.scale=1;s.objects.find(o=>o.id===11)!.scale=0;}
}
export function syncSpaceClawPrize(s:SpaceClaw,pickups:PickupState){
  const item=pickups.items.find(i=>i.id===53);if(!item||item.collected)return;
  item.x=s.prize.x>>5;item.y=s.prize.y>>5;item.z=s.prize.z>>5;
  item.reach=s.prizeState>=2&&s.prize.y> -0x6d41?40:0;
}
export function stepSpaceClaw(s:SpaceClaw,p:Vec3,host:{zone:number;stomp:boolean;randomByte:()=>number;
  sound:(id:number,at:Vec3)=>void;guide:()=>void},dt=1){
  if(host.zone!==4)return;
  const near=(a:Vec3,b:Vec3,r:number)=>{const x=(a.x-b.x)>>8,z=(a.z-b.z)>>8;return x*x+z*z<r*r;};
  if(!s.randomized&&near(s.prize,p,1000)){
    s.prize.x+=(128-host.randomByte())*96;s.prize.z+=(128-host.randomByte())*96;
    s.z=host.randomByte()<<8;s.x=host.randomByte()<<8;s.randomized=true;
  }
  if(host.stomp&&s.cooldown===0){s.cooldown=60;if(s.phase<3)s.phase++;host.guide();}
  s.cooldown=Math.max(0,s.cooldown-dt);
  let motor=false;
  switch(s.phase){
    case 1:s.x=(s.x+128*dt)&0xffff;motor=true;break;
    case 2:s.z=(s.z+128*dt)&0xffff;motor=true;break;
    case 3:s.drop+=128*dt;motor=true;if(s.drop>0x4fff){s.drop=0x5000;s.phase=4;s.hold=0;}break;
    case 4:{
      const before=s.hold;s.hold+=dt;
      if(before<60&&s.hold>=60)host.sound(0x81,s.base);
      if(s.hold>119){s.phase=5;s.prizeState=near(position(s),s.prize,15)?1:0;}
      break;
    }
    case 5:
      s.drop-=128*dt;motor=true;
      if(s.drop<0){s.drop=0;if(s.prizeState===1){s.phase=6;s.x=fold(s.x);s.z=fold(s.z);}
        else{s.phase=0;host.sound(0x81,s.base);}}
      break;
    case 6:
      s.x=Math.max(0,s.x-128*dt);s.z=Math.min(0x8000,s.z+128*dt);
      if(s.x===0&&s.z===0x8000){s.phase=7;s.prizeState=2;s.prizeVelocity=0;host.sound(0x81,s.base);}
      else motor=true;
  }
  if(motor)host.sound(0x82,s.base);
  if(s.prizeState===1){const at=position(s);s.prize={...at,y:at.y+0x1000};}
  else if(s.prizeState===2){
    s.prizeVelocity+=32*dt;s.prize.y+=s.prizeVelocity*dt;
    if(s.prize.y> -0x6d41){s.prize.x-=256*dt;s.prize.z+=256*dt;}
    if(s.prize.y> -0x1800){s.prize.y=-0x1800;s.prizeVelocity=-Math.trunc(s.prizeVelocity/2);
      if(Math.abs(s.prizeVelocity)<256)s.prizeState=3;}
  }
  s.wobble=(s.wobble+8*dt)&4095;s.yaw=(s.yaw+(sin(s.wobble)>>11)*dt)&4095;
  pose(s);
}
