/** Final Showdown: stage 0042faa0/0042fc50 and fighters 0042f310/530/7b0.
 * Level-owned state is deliberately separate from the same types in other levels.
 */
import type {Creature,HandlerArgs,RandomStream} from './creatures.ts';
import {ANIM_SCRIPTS} from './creature-data.ts';
import type {CutHandle} from './tasks.ts';
import type {Point} from './laser.ts';
import type {ZurgShot} from './zurg-boss.ts';
import {sin,cos,yawOf} from './trig.ts';
export const FINALE_HANDLERS:Readonly<Record<number,string>>={58:'FUN_0042f310',45:'FUN_0042f530',61:'FUN_0042f7b0'};
export const FINALE_SCENERY_OBJECTS = [0,1,2,3,4] as const;
export interface FinaleFighter {phase:number;health:number;hurt:number;flip:number;scale:number;fuse:number}
export interface Finale {
  fighters:FinaleFighter[]; entrance:number; active:boolean; defeated:number;last:number;
  cutTicks:number; rescueClock:number; beaten:boolean;won:boolean;finished:boolean;
  origin:Point;restY:number;bounce:number;wobble:number;wobbleKind:number;
  angles:Record<number,readonly [number,number,number]>;
  rollClock:number;rollDelay:number;roll:number;voice:number;
}
export interface FinaleWorld extends Point {
  rand:RandomStream;cut?:CutHandle;
  sound?:(event:number,at:Point|null)=>void;
  attachment?:(c:Creature,part:number,point:Point)=>Point;
  projectile?:(shot:ZurgShot)=>void;
  spark?:(point:Point,spin:number)=>void;
  speaking?:(c:Creature)=>boolean;
}
const starts=[[-0x32c6d,-0x92d6,-0x14f5],[-0x327cc,-0x92da,-0x45cd],[-0x32bbf,-0x92db,-0x8251]];
export function createFinale(at:(slot:number)=>Creature|undefined,origin:Point):Finale {
  const fighters:FinaleFighter[]=[];
  for(let i=0;i<5;i++){
    const c=at(i);if(!c)throw Error(`Finale creature ${i} missing`);
    c.respawn=10000;
    if(i<3){
      fighters.push({phase:0,health:c.health,hurt:0,flip:0,scale:1,fuse:0});
      c.handler=FINALE_HANDLERS[c.type]!;
      c.heading=c.wantYaw=1024;c.health=0;
      [c.x,c.y,c.z]=starts[i]! as [number,number,number];
    }
  }
  return {fighters,entrance:0,active:false,defeated:0,last:0,cutTicks:0,rescueClock:0,
    beaten:false,won:false,finished:false,origin:{...origin},restY:origin.y,bounce:0,wobble:0,wobbleKind:0,
    angles:{},rollClock:1024,rollDelay:240,roll:0,voice:200};
}
export function finaleBar(s:Finale,at:(slot:number)=>Creature|undefined):number {
  return Math.max(0,Math.min(54,Math.trunc(([0,1,2].reduce((sum,i)=>sum+(at(i)?.health??9),0)-27)*54/60)));
}
function animate(c:Creature,state:number,script:number):void {
  c.animState=state;c.animScript=ANIM_SCRIPTS[script]!;c.animIndex=0;c.frame=c.animScript[0]!*65536;
}
function separate(anchor:Creature,moved:Creature):void {
  const dx=(anchor.x-moved.x)>>5,dy=(anchor.y-moved.y)>>5,dz=(anchor.z-moved.z)>>5;
  if(dx*dx+dy*dy+dz*dz>=0x40000)return;
  const yaw=yawOf(dx,dz);moved.x=anchor.x-sin(yaw);moved.z=anchor.z-cos(yaw);
}
export function stepFinaleStage(s:Finale,at:(slot:number)=>Creature|undefined,w:FinaleWorld,dt=1):void {
  const smith=at(0),gun=at(1),prospector=at(2),jessie=at(3),woody=at(4);
  if(!smith||!gun||!prospector||!jessie||!woody)return;
  s.cutTicks=w.cut?w.cut.ticks:Math.max(0,s.cutTicks-dt);
  const cut=(point:Point,ticks:number,distance:number)=>{s.cutTicks=ticks;w.cut?.start(point,ticks,distance);};
  if(s.entrance!==0){
    const before=s.entrance;if(s.entrance<1000)s.entrance+=dt;
    const crossed=(n:number)=>before<=n&&s.entrance>n;
    const bounce=(kind:number)=>{s.bounce=-3072;s.wobble=2048;s.wobbleKind=kind;};
    if(crossed(150))w.sound?.(0xcd,jessie);
    if(crossed(280)){bounce(0);jessie.vy=-768;woody.vy=-1024;w.sound?.(0x2f,null);}
    if(crossed(335)){bounce(1);jessie.vy=-1024;woody.vy=-768;w.sound?.(0x2f,null);}
    if(crossed(360)){
      bounce(2);jessie.vy=-1792;woody.vy=-1920;jessie.vx=woody.vx=-1024;
      jessie.targetY=woody.targetY=0;w.sound?.(0x2f,null);
    }
    if(crossed(430)){
      bounce(3);smith.vy=-1792;gun.vy=-1536;prospector.vy=-2048;
      smith.health=gun.health=prospector.health=29;jessie.health=woody.health=0;w.sound?.(10,null);
    }
    s.bounce=Math.min(3072,s.bounce+512);
    s.origin.y=Math.min(s.restY,s.origin.y+s.bounce);
    if(s.wobble!==0){
      s.wobble=Math.max(0,s.wobble-256);
      let angles:readonly [number,number,number];
      if(s.wobbleKind===0)angles=[sin(s.wobble)>>7,0,0];
      else if(s.wobbleKind===1)angles=[0,0,(-sin(s.wobble))>>8];
      else if(s.wobbleKind===2)angles=[(-sin(s.wobble))>>7,0,0];
      else angles=[0,0,(-sin((s.wobble>>1)+1024))>>4];
      for(const id of s.wobbleKind===3?[0,1]:[0,1,2,3])s.angles[id]=angles;
    }
  }
  if(w.x<-0x16bd9&&s.entrance===0){
    s.entrance=80;cut(s.origin,480,56);
    if(w.cut){w.cut.eye.y-=0x4000;w.cut.look.y-=0x2000;}
  }
  if(s.cutTicks>240&&s.cutTicks<360&&s.defeated<3&&w.cut)w.cut.eye.x+=384*dt;
  if(s.entrance!==0&&s.cutTicks<30&&!s.active){
    s.active=true;
    for(let i=0;i<3;i++){
      const c=at(i)!;s.fighters[i]!.phase=2;c.pc=14;c.wait=0;c.record.facing=0;
      c.vy=[-1536,-2048,-1792][i]!;c.vx=1024;
    }
    w.sound?.(14,null);w.sound?.(199,prospector);
  }
  if(s.active){
    separate(smith,gun);separate(gun,prospector);separate(smith,prospector);
  }
  let rollPhase=1024;
  if(s.active&&(s.rollDelay-=dt)<1){
    s.rollDelay=0;s.rollClock+=8*dt;
    if(s.rollClock>=0x3000){s.rollClock=0;rollPhase=0;}
    else if(s.rollClock<2048)rollPhase=s.rollClock;
    else if(s.rollClock<6144)rollPhase=2048;
    else if(s.rollClock<8192)rollPhase=s.rollClock-4096;
    else rollPhase=0;
  }
  s.roll=s.cutTicks>0?0:(cos(rollPhase)>>6)&4095;
  w.sound?.(0xa8,null);
  if(s.defeated===3){
    s.defeated=4;cut(at(s.last)!,120,32);
    if(w.cut){w.cut.look.y-=8192;w.cut.eye.y-=32768;}
  }
  if(s.defeated===4&&s.cutTicks===0){
    s.defeated=5;s.beaten=true;s.rescueClock=240;
    Object.assign(jessie,{x:-0x4e4e0,y:-0xbc80,z:0x14e0,heading:1024,wantYaw:1024,health:1,targetY:-0xbc80});
    Object.assign(woody,{x:-0x46944,y:-0xb680,z:-0x1bea,heading:1024,wantYaw:1024,health:1,targetY:-0xb680});
    cut(woody,300,64);
    if(w.cut){Object.assign(w.cut.eye,{x:w.cut.look.x+12288,y:w.cut.look.y-12288,z:w.cut.look.z-4096});w.cut.look.y-=8192;}
  }else if(s.defeated===5&&!s.finished){
    s.rescueClock-=dt;
    if(s.rescueClock<=0){s.finished=true;s.won=true;}
  }
  if(s.defeated===5&&w.cut)w.cut.eye.z+=32*dt;
  for(const c of [smith,gun,prospector])if(c.x<-0x2bdd6&&c.vx<0)c.x=-0x2bdd6;
}
/** Runs after the shared creature mover/wordcode, before contacts. */
export function stepFinaleFighter(s:Finale,c:Creature,args:HandlerArgs,w:FinaleWorld):void {
  const f=s.fighters[c.slot];if(!f||c.slot>2||c.health<=0)return;
  const dt=args.dt;f.flip=(f.flip-1)&1;f.scale=1;
  if(c.health!==f.health){
    f.health=c.health;f.hurt=60;c.record.vulnerable=4;
    if(c.slot===1)w.sound?.(0xc1,c);
    if(c.slot===2){let variant=w.rand.byte()&3;if(variant===3)variant=0;w.sound?.(0xc4+variant,c);}
  }
  if(f.phase===2){
    if(c.slot===2&&(s.voice-=dt)<0){
      s.voice=w.rand.byte()*2+400;let v=w.rand.byte()%6;if(v===0)v=-4;w.sound?.(199+v,c);
    }
    f.hurt-=dt;
    if(f.hurt<0){f.hurt=0;c.record.vulnerable=c.slot===1?7:6;}
    else if(f.flip)f.scale=2;
  }
  if(f.phase!==2)return;
  // Do not let the final hit leave a pending attack after the defeat script.
  if(c.health<10){
    c.pc=c.slot===1?52:45;c.wait=0;c.record.vulnerable=4;
    c.flags&=c.slot===1?~0x100:~0x108;
    if(c.slot!==1)c.record.speed=16;
    f.fuse=0;c.timer=0;f.phase=3;s.defeated++;s.last=c.slot;w.sound?.(-2,c);return;
  }
  if(c.slot===1){
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
        w.sound?.(0x56,c);
        if(c.flags&1)for(let i=0;i<5;i++)w.spark?.(p,w.rand.byte()-128);
      }
    }
    return;
  }
  const near=((w.x-c.x)>>8)**2+((w.y-c.y)>>8)**2+((w.z-c.z)>>8)**2<90000;
  const smith=c.slot===0;
  if(args.chasing&&near&&c.animState===(smith?1:4)){
    if(!smith)c.animRateGround=c.animRateAir=-48;
    animate(c,3,smith?24:9);c.record.speed=0;f.fuse=smith?63:44;
    if(!smith&&!w.speaking?.(c))w.sound?.(0xc2,c);
  }
  if(c.animState===3&&(c.frame>>>16)>(smith?46:21)){
    c.pc=16;c.wait=0;c.record.speed=16;c.flags&=~12;
  }
  if(f.fuse!==0&&(f.fuse-=dt)<=0){
    f.fuse=0;
    if(smith){
      const p=w.attachment?.(c,4,{x:180,y:-150,z:-50})??c;
      w.projectile?.({...p,vx:0,vy:-2,vz:0,gravity:c.heading*4,rotation:0,spin:0,kind:0x66});
      w.sound?.(0xa7,c);
    }else{
      w.projectile?.({x:c.x+(cos(c.heading)>>3),y:c.y-2048,z:c.z+(sin(c.heading-2048)>>3),
        vx:sin(c.heading)>>2,vy:0,vz:cos(c.heading)>>2,gravity:0,rotation:(2047-c.heading)&4095,spin:0,kind:0x68});
      w.sound?.(0xa6,c);
    }
  }
}
