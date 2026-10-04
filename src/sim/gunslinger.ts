/** Level-owned gunslingers: Elevator 00425700/00425f60, Penthouse 004282d0/0042a130.
 * The finale's type 45 deliberately keeps its own controller. */
import type {Creature,HandlerArgs,RandomStream} from './creatures.ts';
import {ANIM_SCRIPTS} from './creature-data.ts';
import type {ZurgShot} from './zurg-boss.ts';
import {sin,cos,yawOf} from './trig.ts';
type Point={x:number;y:number;z:number};
export const GUNSLINGER_HANDLERS:Readonly<Record<number,string>>={10:'FUN_00425700',11:'FUN_004282d0'};
export function createGunslinger(c:Creature,level:10|11){
  if(level===10)c.flags|=0x10000;
  return {level,health:c.health,hurt:0,flip:0,flash:false,defeated:false,
    shotClock:400,shotIndex:5,spinClock:0x3000,spinLimit:0x7fff,spin:0,clearHoming:false};
}
export type Gunslinger=ReturnType<typeof createGunslinger>;
export interface GunslingerWorld extends Point {
  phase:number;rand:RandomStream;
  sound?:(event:number,at:Point)=>void;
  attachment?:(c:Creature,part:number,point:Point)=>Point;
  projectile?:(shot:ZurgShot&{pitch?:number})=>void;
  spark?:(point:Point)=>void;
}
/** Level clocks must continue even once the creature has been removed. */
export function stepGunslingerLevel(s:Gunslinger,c:Creature|undefined,phase:number,rand:RandomStream,dt=1):number {
  if(s.level!==10)return phase;
  if(phase===2){
    s.spinClock+=dt*32;
    if(s.spinClock>s.spinLimit){s.spinClock=0;s.spinLimit=(rand.byte()+320)*64;s.spin=0;}
    else s.spin=s.spinClock<4096?s.spinClock:s.spinClock<8192?4096:s.spinClock<12288?12287-s.spinClock:0;
    if(c?.type===0){s.defeated=true;s.flash=false;s.clearHoming=true;return 3+dt;}
  }else if(phase>2)s.spin=Math.max(0,s.spin-dt*32);
  return phase;
}
function animate(c:Creature,state:number,script:number){
  c.animState=state;c.animScript=ANIM_SCRIPTS[script]!;c.animIndex=0;c.frame=c.animScript[0]!*65536;
}
export function stepGunslinger(s:Gunslinger,c:Creature,args:HandlerArgs,w:GunslingerWorld){
  if(c.type!==(s.level===10?31:45))return;
  if(s.level===11&&w.phase>1){
    if(c.z<-0x5b4f0){c.homeX=-0x9d020;c.homeZ=-0x62040;c.record.rangeX=299;c.record.rangeZ=112;}
    else{c.homeX=-0xa85a0;c.homeZ=-0x43fc0;c.record.rangeX=96;c.record.rangeZ=382;}
    if(w.phase===200){c.x=c.homeX;c.z=c.homeZ;}
  }
  if(s.defeated)return;
  if(s.level===10&&c.deathTimer<0){s.flash=false;return;}
  const dt=args.dt;s.flip=(s.flip-1)&1;s.flash=false;
  if(c.health!==s.health){s.health=c.health;s.hurt=60;c.record.vulnerable=4;w.sound?.(s.level===10?0x8a:0xa5,c);}
  if(w.phase===2){
    s.hurt-=dt;
    if(s.hurt<0){s.hurt=0;c.record.vulnerable=7;}else s.flash=s.flip!==0;
  }
  if(w.phase!==2)return;
  if(s.level===10){
    if((s.shotClock-=dt)<0){
      s.shotIndex=(s.shotIndex+1)%6;s.shotClock=[400,40,40,40,40,200][s.shotIndex]!;
      if(w.y>-0x1c2509){
        const p=w.attachment?.(c,0,{x:0,y:-500,z:-200})??c;
        if(s.shotIndex===0){
          w.projectile?.({...p,vx:0,vy:-2,vz:0,gravity:c.heading*4,rotation:0,spin:w.rand.byte()-128,kind:0x59,pitch:0});
          w.sound?.(0x8b,c);
        }else{
          w.projectile?.({...p,vx:sin(c.heading)>>2,vy:-1024,vz:cos(c.heading)>>2,gravity:64,rotation:0,spin:0,kind:0x77});
          w.sound?.(0x89,c);
        }
      }
    }
    const center=c.x>-0x7a00&&c.x<0x7a00&&c.z>-0x7a00&&c.z<0x7a00;
    const flying=s.spin>1024||center;
    c.flags=flying?c.flags|16:c.flags&~16;c.targetY=c.homeY-(flying?0x6000:0);
    if(c.animState===(flying?1:2)){animate(c,flying?2:1,flying?2:1);w.sound?.(0x88,c);}
    c.record.vulnerable=w.y<-0x1c2508||s.hurt>0?4:7;
    return;
  }
  // Nine final points belong to the death script. Cancel an in-flight burst.
  if(c.health<10){
    c.pc=52;c.wait=0;c.record.vulnerable=4;c.flags&=~0x100;c.timer=0;
    s.defeated=true;s.flash=false;w.sound?.(-2,c);return;
  }
  if(w.y<0x1bca1||w.y>0x22405){c.targetX=c.homeX;c.targetZ=c.homeZ;c.record.vulnerable=4;}
  else if(s.hurt===0)c.record.vulnerable=7;
  const before=c.timer;
  if(before!==0){
    let part=0;
    if(before>20){c.timer=10;part=15;}
    c.timer-=dt;if(c.timer<1){c.timer=0;part=16;}
    if(part){
      const p=w.attachment?.(c,part,{x:0,y:0,z:0})??c;
      let yaw=yawOf(w.x-p.x,w.z-p.z)&4095;
      if(((yaw-c.heading+256)&4095)>512)yaw=c.heading;
      w.projectile?.({...p,vx:sin(yaw)>>2,vy:512,vz:cos(yaw)>>2,gravity:0,rotation:0,spin:0,kind:0x61});
      w.sound?.(part===15?0x93:0x94,c);
      if(c.flags&1)for(let i=0;i<5;i++)w.spark?.(p);
    }
  }

}
