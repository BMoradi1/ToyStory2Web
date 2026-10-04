/** Space Land buggy, 00422660; activation/reward from 00423200. */
import {CREATURE_FLAGS,type Creature,type HandlerArgs,type RandomStream} from './creatures.ts';
import {AI_SCRIPTS} from './creature-data.ts';
import type {Effect} from './effects.ts';
import type {PointLight} from './point-light.ts';
import {sin,cos,yawOf} from './trig.ts';
import {podImpactHits} from './pod-beam.ts';
type Point={x:number;y:number;z:number};
export function createBuggy(c:Creature){return {health:c.health,hurt:0,frame:0,flash:false,defeated:false,barTicks:0,laserClock:600,voiceClock:60};}
export type Buggy=ReturnType<typeof createBuggy>;
export interface BuggyWorld {
  phase:number;player:Point;playerZone:number;gateFour:boolean;gateSeven:boolean;gateEight:boolean;rand:RandomStream;
  sound:(event:number)=>void;lookAt:(at:Point)=>void;hurt:(yaw:number)=>void;
  beam:(at:Point,yaw:number)=>void;
  effect:(at:Point,kind:number,mode:number)=>Effect|null;
  projectile:(at:Point,velocity:Point,gravity:number,spin:number,kind:number)=>Effect|null;
  light:(light:PointLight)=>void;
}
export function stepBuggy(s:Buggy,c:Creature,args:HandlerArgs,w:BuggyWorld,dt=1):void{
  if(args.side>0)w.sound(0x7f);
  if(w.playerZone!==5){c.targetX=c.homeX;c.targetY=c.homeY;c.targetZ=c.homeZ;}
  s.frame=(s.frame-1)&1;
  if(c.health!==s.health){s.health=c.health;s.hurt=60;c.record.vulnerable=4;}
  s.flash=false;
  if(w.phase>=2){s.hurt-=dt;if(s.hurt<0){s.hurt=0;if(w.phase===2)c.record.vulnerable=7;}else s.flash=s.frame!==0;}
  if(w.phase===2){
    s.laserClock-=dt;
    if(s.laserClock<0)s.laserClock=240;
    else if(s.laserClock<40&&w.gateEight){
      w.sound(2);w.beam({x:c.x+(sin(c.heading)>>2),y:c.y-4096,z:c.z+(cos(c.heading)>>2)},c.heading);
      const yaw=yawOf(w.player.x-c.x,w.player.z-c.z);
      if(w.player.y>c.y-4096&&podImpactHits(w.player,c,512)&&((yaw-c.heading+32)&4095)<64){
        w.hurt(yaw);w.light({...w.player,r:240,g:0,b:0,life:16,owner:w.player.z});
      }
    }
    if(w.playerZone===5){
      s.barTicks=90;w.lookAt({x:c.x,y:c.y,z:c.z});s.voiceClock-=dt;
      if(s.voiceClock<1){s.voiceClock=1800+w.rand.byte();w.sound(0xd4);}
    }
    c.timer=(c.timer-dt)<<16>>16;
    if(c.timer<0){
      c.timer=400;w.sound(0x4c);
      const e=w.projectile({x:c.x+(sin(c.heading-2048)>>2),y:c.y-8192,z:c.z+(sin(c.heading-1024)>>2)},
        {x:0,y:-2,z:0},c.heading*4,128,114);if(e)e.pitch=1024;
    }
    if(c.health<10&&!s.defeated){
      c.script=AI_SCRIPTS[35]!;c.pc=34;c.record.vulnerable=4;c.flags&=~CREATURE_FLAGS.hurts;
      const o=c.hitShapes?.[0]?.offset??{x:c.offsetX,y:c.offsetY,z:c.offsetZ};
      const at={x:c.x+o.x,y:c.y+o.y,z:c.z+o.z};
      for(let i=0;i<5;i++){const e=w.effect(at,35,14),spin=w.rand.byte()-128;if(e)e.spin=spin;}
      w.light({...at,r:240,g:128,b:0,life:32,owner:0x52c840+c.slot*0x9c});w.sound(-2);s.defeated=true;
    }
  }
  if(w.gateFour){
    const mode=c.animState===1&&c.frame<8*65536?2:c.animState===0&&Math.abs(args.fwd)>512?1:0;
    if(mode){
      for(const [x,z] of [[0x680,-0x580],[-0x680,-0x280]]){
        const e=w.effect({x:c.x+(sin(c.heading+x!)>>1),y:c.y-2048,z:c.z+(sin(c.heading+z!)>>1)},42,10),spin=w.rand.byte()-128;
        if(e){e.spin=spin;if(mode===2){e.vx=-128;e.vz=256;}}
      }
      w.sound(0x36);
    }
  }
  if(c.animState===2&&w.gateSeven){
    const e=w.effect({x:c.x-Math.trunc(sin(c.heading)/3),y:c.y-8192,z:c.z-Math.trunc(cos(c.heading)/3)},17,10),spin=w.rand.byte()-128;if(e)e.spin=spin;
  }
}
export function stepBuggyLevel(s:Buggy,phase:number,dt=1):number{
  s.barTicks=Math.max(0,s.barTicks-dt);
  return phase>2?phase<120?phase+dt:200:phase;
}
export function buggyBar(s:Buggy,c:Creature|undefined):number{
  return s.barTicks===0?-1:s.defeated||!c?0:Math.max(0,Math.min(54,Math.trunc((c.health-9)*54/20)));
}
