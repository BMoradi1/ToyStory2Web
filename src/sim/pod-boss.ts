/** Level 9, 00424390/00424490. Gameplay state; camera framing uses the shared cut host. */
import {buildCreature,killCreature,type Creature} from './creatures.ts';
import {ANIM_SCRIPTS} from './creature-data.ts';
import {sin,cos,yawOf} from './trig.ts';
import type {CutHandle} from './tasks.ts';
import type {Point} from './laser.ts';
import {podAttachment} from './pod-beam.ts';
export interface PodBoss {
  helpers:readonly number[];
  phase:number; stage:number; health:number; base:number; bob:number; ring:number; frame:number;
  cutTicks:number; stun:number; cooldown:number; voice:number; introVoice:number; stretch:number;
  flashScale:number; lookSlot:number; lookTimer:number;
  pair:number[]; released:boolean; opened:boolean; growing:number[];
  laserReady:boolean; beaten:boolean; won:boolean; finished:boolean;
}
export interface PodWorld extends Point {
  cut?:CutHandle;
  sound?:(event:number,at:Point|null)=>void;
  touch?:(angle:number,reaction:number)=>void;
  groundAt?:(x:number,z:number,y:number)=>number|null;
  effect?:(x:number,y:number,z:number,kind:number,mode:number)=>void;
  attachment?:(creature:Creature,part:number,point:Point)=>Point;
  releaseGate?:{two:number;four:boolean};
  cameraEye?:Point;
  lookAt?:(point:Point)=>void;
  burstLight?:(point:Point)=>void;
}
/** The leading -1 is a sentinel; the six pairs begin at 004f2f5c. */
export function readPodHelpers(exe:Uint8Array):number[]{
  const at=0xf2f5c;
  if(exe.length<at+48)throw Error('Executable is missing the pod helper table');
  const view=new DataView(exe.buffer,exe.byteOffset,exe.byteLength);
  return Array.from({length:12},(_,i)=>view.getInt32(at+i*4,true));
}
export function createPodBoss(at:(slot:number)=>Creature|undefined,helpers:readonly number[]):PodBoss{
  const boss=at(0);
  if(boss)boss.record.speed=0;
  for(let i=0;i<12;i++){
    const c=at(i);if(!c)continue;c.flags|=0x800;
    if(i>=7){c.respawn=10000;c.health=0;c.stun=0;
      if(boss){c.record.rangeX=boss.record.rangeX;c.record.rangeZ=boss.record.rangeZ;}}
  }
  return {helpers,phase:0,stage:1,health:boss?.health??26,base:-0x58000,bob:0,ring:0,frame:0,
    cutTicks:0,stun:0,cooldown:200,voice:0,introVoice:120,stretch:1,flashScale:1,lookSlot:0,lookTimer:0,pair:[],released:false,opened:false,growing:[],laserReady:false,beaten:false,won:false,finished:false};
}
function animate(c:Creature,state:number,script:number){
  c.animState=state;c.animScript=ANIM_SCRIPTS[script]!;c.animIndex=0;c.frame=c.animScript[0]!*65536;
}
function ringClamp(c:Creature,radius:number){
  if((c.x>>5)**2+(c.z>>5)**2<=radius*radius)return;
  const yaw=yawOf(c.x,c.z);c.x=(sin(yaw)*radius)>>9;c.z=(cos(yaw)*radius)>>9;
}
export function podBossBar(s:PodBoss):number{return Math.max(0,Math.trunc((s.health-10)*54/16));}
export function podRange(a:Point,b:Point,radius:number):boolean{
  return ((a.x-b.x)>>8)**2+((a.y-b.y)>>8)**2+((a.z-b.z)>>8)**2<radius*radius;
}
export function stepPodBoss(s:PodBoss,at:(slot:number)=>Creature|undefined,w:PodWorld):void{
  const helpers=s.helpers;
  const boss=at(0);if(!boss)return;
  s.cutTicks=w.cut?w.cut.ticks:Math.max(0,s.cutTicks-1);
  s.voice=Math.max(0,s.voice-1);s.laserReady=false;s.frame++;
  const cut=(ticks:number,look:Point=boss)=>{s.cutTicks=ticks;w.cut?.start(look,ticks,0x10);};
  ringClamp(boss,0x1068+(s.phase>=3?800:0));
  s.bob=(s.bob+32)&4095;s.ring=(s.ring+4)&4095;
  const height=s.base+(sin(s.bob)>>3),points:Point[]=[];
  boss.y=height;boss.vy=0;
  for(let i=1;i<=6;i++){
    const bub=at(i);if(!bub)continue;
    bub.x=boss.x;bub.y=height;bub.z=boss.z;bub.heading=(s.ring+(i-1)*0x2ab)&4095;
    if(bub.animState===0)bub.frame=((s.frame-1)*0x4000+(i-1)*0xc0000)%0x180000;
    const local={x:0,y:0x96,z:0x5aa};
    const attached=w.attachment?.(bub,1,local)??podAttachment(bub,null,local);
    const {x,z}=attached,y=w.groundAt?.(x,z,attached.y)??attached.y;
    points[i]={x,y,z};
    if(bub.health===1&&podRange(w,points[i]!,75))w.touch?.(yawOf(w.x-x,w.z-z),1);
  }
  for(const id of s.pair){const c=at(id);if(c){ringClamp(c,0x15e0);if(s.cutTicks)c.vx=c.vy=c.vz=0;}}
  if(s.phase>=2&&s.phase<4&&boss.health!==s.health){
    w.sound?.(0x83,boss);
    if(s.stage<6)boss.health=26-s.stage;
    s.health=boss.health;boss.record.vulnerable=4;
    if(s.health<=10){s.phase=4;s.cooldown=10000;s.stun=10000;boss.record.speed=0;cut(240);s.beaten=true;}
    else{
      if(s.phase===2){s.pair=[...new Set(helpers.slice((s.stage-1)*2,s.stage*2))];s.released=false;s.opened=false;s.stun=600;boss.record.speed=0;cut(360);}
      else s.stun=120;
    }
  }
  s.stun=Math.max(0,s.stun-1);
  // 00424abb: draw mode alternates between a 2x triple and normal drawing.
  s.flashScale=s.stun>0&&s.phase!==2&&(s.frame&1)?2:1;
  if(s.stun===0){boss.record.vulnerable=7;boss.drawScale=1;s.stretch=1;if(s.phase===2&&s.stage===7){s.phase=3;boss.record.turnRate=2;boss.record.speed=20;}}
  if(s.phase===0&&w.z>-0x1bb58){s.phase=1;s.base=-0x38000;cut(360);if(w.cut)Object.assign(w.cut.eye,{x:w.x,y:w.y-0x8000,z:w.z});}
  if(s.phase===1){
    if(s.introVoice>0&&--s.introVoice===0)w.sound?.(0xd5,null);
    s.base=Math.min(-0x8000,s.base+0x280);
    if(w.cut){w.cut.eye.y-=128;Object.assign(w.cut.look,boss);}
    if(s.cutTicks===0){s.phase=2;boss.record.speed=16;}
  }
  if(s.phase===2&&s.stun>0){
    if(s.stun>480)s.stun=600;
    const bub=at(s.stage),p=points[s.stage]??boss;
    if(s.cutTicks>0){
      s.cooldown=200;
      if(w.cut){
        Object.assign(w.cut.look,p);
        if(bub)Object.assign(w.cut.eye,{x:p.x+3*sin(bub.heading+0x400),y:p.y,z:p.z+3*sin(bub.heading-0x800)});
      }
      if(s.cutTicks<300&&!s.released){
        s.released=true;if(bub)animate(bub,1,0x17);
        for(const id of s.pair){const c=at(id);if(!c)continue;Object.assign(c,buildCreature(c.record,false,c));c.flags=0xaf0;c.drawScale=0;s.growing.push(id);}
        w.sound?.(0x86,p);
      }
      if(bub&&s.cutTicks>185&&s.cutTicks<300&&(w.releaseGate?.two??0)>0){
        const local={x:0,y:400,z:1200};
        const emit=w.attachment?.(bub,4,local)??podAttachment(bub,null,local);
        w.effect?.(emit.x,emit.y,emit.z,w.releaseGate?.four?0x11:4,w.releaseGate?.four?2:4);
      }
      if(s.released&&bub?.health===1){
        for(const id of s.pair){const c=at(id);if(c){c.x=p.x;c.y=p.y+0x1000;c.z=p.z;c.vx=c.vy=c.vz=0;c.timer=460;}}
        if(s.cutTicks<60&&!s.opened){s.opened=true;for(let i=0;i<4;i++)w.effect?.(p.x,p.y,p.z,0x23,14);w.sound?.(0x85,p);w.sound?.(0xd6,null);w.burstLight?.(p);killCreature(bub,1);}
      }
    }else if(s.released&&s.pair.every(id=>(at(id)?.health??0)<=0)){
      s.stun=120;s.stage++;s.released=false;boss.record.speed=16;
    }
    const pulse=s.frame&63;
    s.stretch=1+(pulse>31?63-pulse:pulse)/32;
  }
  for(const id of [...s.growing]){const c=at(id);if(c){c.drawScale=Math.min(1,c.drawScale+12/4096);if(c.drawScale===1)s.growing=s.growing.filter(n=>n!==id);}}
  if(s.phase===3){const target=podRange(w,boss,200)?w.y:-0x8000;s.base+=Math.max(-128,Math.min(128,target-s.base));}
  if(s.phase===4){if(w.cut)w.cut.eye.y+=128;if(s.cutTicks<120){killCreature(boss,1);s.phase=5;}}
  if(s.phase===5&&s.cutTicks===0&&!s.finished){s.won=true;s.finished=true;}
  if(s.phase>=2&&s.phase<4&&s.cutTicks===0)s.cooldown=Math.max(0,s.cooldown-1);
  s.laserReady=s.phase>=2&&s.phase<4&&s.cooldown===0&&podRange(w,boss,400);
  if(s.phase===2||s.phase===3){
    // 004254eb: retain the selected slot for 30 ticks, even if it dies.
    if(--s.lookTimer<=0){
      s.lookTimer=30;s.lookSlot=0;
      const eye=w.cameraEye??w;
      let nearest=Infinity;
      for(const id of s.pair){
        const c=at(id);if(!c||c.health<=0)continue;
        const distance=((eye.x-c.x)>>8)**2+((eye.z-c.z)>>8)**2;
        if(distance<=nearest){nearest=distance;s.lookSlot=id;}
      }
    }
    const target=at(s.lookSlot)??boss;
    w.lookAt?.({x:target.x,y:target.y-(s.lookSlot===0?0x4000:0x2000),z:target.z});
  }
}
