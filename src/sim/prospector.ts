/** Airport Prospector, 0042be60; finale type 61 has a separate controller. */
import type {Creature,HandlerArgs,RandomStream} from './creatures.ts';
import {ANIM_SCRIPTS} from './creature-data.ts';
import type {ZurgShot} from './zurg-boss.ts';
import {sin,cos} from './trig.ts';
type Point={x:number;y:number;z:number};
export function createProspector(c:Creature){
  c.record.rangeX=90;
  return {health:c.health,hurt:0,flip:0,flash:false,fuse:0,voice:200,defeated:false};
}
export type Prospector=ReturnType<typeof createProspector>;
export function stepProspector(s:Prospector,c:Creature,args:HandlerArgs,w:Point&{
  active:boolean;rand:RandomStream;sound?:(event:number,at:Point)=>void;
  projectile?:(shot:ZurgShot)=>void;speaking?:boolean;
}){
  if(c.type!==61||s.defeated)return;
  const dt=args.dt;s.flip=(s.flip-1)&1;s.flash=false;
  if(c.health!==s.health){
    s.health=c.health;s.hurt=60;c.record.vulnerable=4;
    let variant=w.rand.byte()&3;if(variant===3)variant=0;
    w.sound?.(0xc4+variant,c);
  }
  if(!w.active)return;
  if((s.voice-=dt)<0){s.voice=w.rand.byte()*2+400;w.sound?.(0xc3,c);}
  s.hurt-=dt;
  if(s.hurt<0){s.hurt=0;c.record.vulnerable=6;}else s.flash=s.flip!==0;
  // The final nine points belong to the authored defeat script, not combat.
  if(c.health<10){
    c.pc=45;c.wait=0;c.record.vulnerable=4;c.flags&=~0x108;c.record.speed=0;
    s.defeated=true;s.fuse=0;s.flash=false;w.sound?.(-2,c);return;
  }
  const near=((w.x-c.x)>>8)**2+((w.y-c.y)>>8)**2+((w.z-c.z)>>8)**2<200*200;
  if(args.chasing&&near&&c.animState===4){
    c.animRateGround=c.animRateAir=-48;c.animState=3;c.animScript=ANIM_SCRIPTS[9]!;
    c.animIndex=0;c.frame=c.animScript[0]!*65536;c.record.speed=0;s.fuse=44;
    if(!w.speaking)w.sound?.(0xc2,c);
  }
  if(c.animState===3&&(c.frame>>>16)>21){c.pc=16;c.wait=0;c.record.speed=16;c.flags&=~12;}
  if(s.fuse!==0&&(s.fuse-=dt)<1){
    s.fuse=0;
    w.projectile?.({x:c.x+(cos(c.heading)>>3),y:c.y-2048,z:c.z+(sin(c.heading-2048)>>3),
      vx:sin(c.heading)>>2,vy:0,vz:cos(c.heading)>>2,gravity:0,rotation:(2047-c.heading)&4095,spin:0,kind:0x68});
    w.sound?.(0xa6,c);
  }
}
