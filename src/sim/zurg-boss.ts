/** Zurg, level 12: retail init 0042b300 and tick 0042b3a0.
 * Coordinates use +Y down. The final radial clamp excludes the inner circle.
 */
import type {Creature,RandomStream} from './creatures.ts';
import {ANIM_SCRIPTS} from './creature-data.ts';
import {sin,cos,yawOf,idiv} from './trig.ts';
import type {CutHandle} from './tasks.ts';
import type {Point} from './laser.ts';
export interface ZurgBoss {
  phase:number; health:number; hurt:number; flip:number; flashScale:number;
  voice:number; introVoice:number; attack:number; retaliation:boolean;
  fallSpeed:number; cutTicks:number; beaten:boolean; won:boolean;
}
export interface ZurgShot extends Point {
  vx:number;vy:number;vz:number;gravity:number;rotation:number;spin:number;kind:number;
}
export interface ZurgWorld extends Point {
  rand:RandomStream;cut?:CutHandle;
  sound?:(event:number,at:Point|null)=>void;
  attachment?:(c:Creature,part:number,point:Point)=>Point;
  projectile?:(shot:ZurgShot)=>void;
  pinPlayer?:(point:Point)=>void;
  lookAt?:(point:Point)=>void;
}
export function createZurgBoss(c:Creature):ZurgBoss {
  c.flags|=0x800;c.y-=0x28000;c.z+=0x10000;
  c.heading=0xc00;c.wantYaw=c.heading;c.targetY=c.y;c.record.turnRate=0;
  return {phase:0,health:c.health,hurt:0,flip:0,flashScale:1,voice:300,introVoice:120,
    attack:260,retaliation:false,fallSpeed:0,cutTicks:0,beaten:false,won:false};
}
function animate(c:Creature,state:number,script:number,rate:number):void {
  c.animState=state;c.animScript=ANIM_SCRIPTS[script]!;c.animIndex=0;c.frame=c.animScript[0]!*65536;
  c.animRateGround=c.animRateAir=rate;
}
export function zurgBossBar(s:ZurgBoss):number {return Math.max(0,Math.min(54,Math.trunc((s.health-9)*54/20)));}
export function stepZurgBoss(s:ZurgBoss,c:Creature,w:ZurgWorld,dt=1):void {
  s.cutTicks=w.cut?w.cut.ticks:Math.max(0,s.cutTicks-dt);
  const cut=()=>{s.cutTicks=300;w.cut?.start(c,300,16);};
  const pin=()=>{if(w.y>-70000)w.pinPlayer?.({x:-0x1da7c,y:-0x12bd0,z:0xf699});};
  w.sound?.(0x67,null);
  s.flip=(s.flip-1)&1;s.flashScale=1;
  if(s.phase>1){
    s.hurt-=dt;
    if(s.hurt<0){s.hurt=0;c.record.vulnerable=6;}
    else if(s.flip)s.flashScale=2;
  }
  if(s.phase===0&&w.x>=-0x18b2a){
    s.phase=1;cut();
    if(w.cut){Object.assign(w.cut.eye,{x:c.x-0x3000,y:c.y-0x5000,z:c.z});w.cut.look.y=c.y-0x4000;}
    w.sound?.(0xd8,null);
  }
  if(s.phase===1){
    if(s.introVoice>0){s.introVoice-=dt;if(s.introVoice<1)w.sound?.(0xb9,c);}
    pin();
    if(s.cutTicks===0){s.phase=2;c.flags|=12;c.record.turnRate=10;c.record.vulnerable=6;}
    else{
      c.y+=512*dt;c.targetY=c.y;
      if(w.cut){w.cut.eye.y+=544*dt;w.cut.eye.x-=dt*(32+(s.cutTicks<180?336:0));w.cut.look.y=c.y-0x4000;}
    }
  }
  if(s.phase===2){
    s.voice-=dt;
    if(s.voice<0){s.voice=w.rand.byte()*2+400;w.sound?.(0xba+(w.rand.byte()&3),c);}
    w.lookAt?.({...c});
    if(c.health!==s.health){
      if((w.rand.byte()&3)===0)w.sound?.(0xd9,w);
      s.health=c.health;s.hurt=60;c.record.vulnerable=4;
      if(c.health<10){
        s.phase=3;cut();
        if(w.cut){Object.assign(w.cut.eye,{x:c.x+sin(c.heading),y:c.y-0x4000,z:c.z+cos(c.heading)});w.cut.look.y=c.y-0x4000;}
        animate(c,2,25,-64);c.flags&=~12;s.attack=30;c.record.accel=c.record.accelSide=32;
        s.beaten=true;w.sound?.(0xc0,c);
      }else{
        w.sound?.(0xbe+(w.rand.byte()&1),c);s.attack=0;s.retaliation=true;animate(c,1,2,-32);
      }
    }
    const before=s.attack;s.attack-=dt;
    if(s.attack<0){
      s.attack=302;const heading=c.heading+(w.rand.byte()<128?-512:512);
      c.vx=sin(heading)>>3;c.vz=cos(heading)>>3;
    }else{
      const crossed=(n:number)=>before>n&&s.attack<=n;
      if(crossed(200))animate(c,0,24,-64);
      let shot=0;
      if(crossed(146))shot=1;
      if(crossed(138))shot=2;
      if(before>=127&&s.attack<=126)shot=1;
      if(shot){
        const point={x:-250,y:-250,z:0};
        const at=w.attachment?.(c,1,point)??c;
        const ballistic=!s.retaliation&&(c.health>19||shot!==2);
        w.projectile?.({...at,vx:ballistic?sin(c.heading-128)>>2:0,
          vy:ballistic?1024:-2,vz:ballistic?cos(c.heading-128)>>2:0,
          gravity:ballistic?256:c.heading*4,rotation:0,spin:0,kind:ballistic?0x6c:0x6d});
        w.sound?.(0x9d,c);
      }
      if(crossed(104)){s.retaliation=false;animate(c,1,2,-32);}
    }
  }
  if(s.phase===3){
    pin();c.wantYaw=yawOf((-0xbd7c-c.x)>>5,(0x99-c.z)>>5)&4095;
    const inside=c.x>-0x256d6&&c.x<0xe0aa&&c.z>-0x1b3e9&&c.z<0x1b297;
    if(inside){c.vx=(-sin(c.wantYaw))>>4;c.vz=(-cos(c.wantYaw))>>4;}
    else{
      c.record.turnRate=0;c.heading=(c.heading+16*dt)&4095;
      if(c.y<170000){
        c.y+=s.fallSpeed*dt;if(c.y>=170000)w.sound?.(0x9f,null);
        s.fallSpeed+=64;c.targetY=c.y;
      }
      if(c.y>70000){
        w.sound?.(0x9e,null);
        if(s.cutTicks>50)w.projectile?.({x:c.x,y:80000,z:c.z,vx:0,vy:-0x2400,vz:0,
          gravity:0,rotation:w.rand.byte()<<4,spin:128,kind:0x70});
      }
    }
    if(w.cut){
      Object.assign(w.cut.look,{x:c.x,y:c.y-0x4000,z:c.z});
      const distance=Math.max(1,Math.min(8,idiv(s.fallSpeed,64)));
      Object.assign(w.cut.eye,{x:c.x+idiv(sin(c.heading),distance),y:-0x188e0,z:c.z+idiv(cos(c.heading),distance)});
    }
    if(s.cutTicks===0){s.phase=4;s.won=true;}
  }
  const dx=(-0xbd7c-c.x)>>5,dz=(0x99-c.z)>>5;
  if(dx*dx+dz*dz<0x190000){
    const yaw=yawOf(dx,dz);
    c.x=-0xbd7c-((sin(yaw)*1280)>>9);c.z=0x99-((cos(yaw)*1280)>>9);
  }
}
