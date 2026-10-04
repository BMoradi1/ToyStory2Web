/** Toy Barn dinosaur, 00420af0; reward clock from 00421340. */
import {CREATURE_FLAGS,type Creature,type RandomStream} from './creatures.ts';
import {AI_SCRIPTS} from './creature-data.ts';
import type {Effect} from './effects.ts';
import type {PointLight} from './point-light.ts';
import {sin,cos} from './trig.ts';
type Point={x:number;y:number;z:number};
export function createDinosaur(c:Creature){return {health:c.health,hurt:0,frame:0,flash:false,defeated:false,barTicks:0};}
export type Dinosaur=ReturnType<typeof createDinosaur>;
export interface DinosaurWorld {
  phase:number;cameraZone:number;gateSeven:boolean;rand:RandomStream;
  sound:(event:number)=>void;shake:(ticks:number)=>void;
  attachment:(c:Creature,part:number,offset:Point)=>Point;
  effect:(at:Point,kind:number,mode:number)=>Effect|null;
  projectile:(at:Point,velocity:Point,spin:number,kind:number)=>Effect|null;
  light:(light:PointLight)=>void;
}
export function stepDinosaur(s:Dinosaur,c:Creature,w:DinosaurWorld,dt=1):void{
  s.frame=(s.frame-1)&1;
  if(c.health!==s.health){s.health=c.health;s.hurt=60;c.record.vulnerable=4;w.sound(0x79);}
  if(c.timer!==0){
    if(w.cameraZone===4){
      const yaw=(c.heading-128+w.rand.byte())&4095;
      const at=w.attachment(c,1,{x:20,y:-600,z:0});w.sound(0x78);
      const n=w.rand.byte();w.rand.byte(); // Original advances two bytes and reuses the first.
      const e=w.projectile(at,{x:sin(yaw)>>3,y:n+512,z:cos(yaw)>>3},n-128,85);
      if(c.timer===30){w.shake(40);if(e)e.flags|=2;}
    }
    c.timer=Math.max(0,(c.timer-dt)<<16>>16);
  }
  let phase=w.phase;s.flash=false;
  if(phase>=2){
    s.hurt-=dt;
    if(s.hurt<0){s.hurt=0;if(phase===2)c.record.vulnerable=7;}
    else s.flash=s.frame!==0;
  }
  if(c.health<10&&phase===2&&!s.defeated){
    c.script=AI_SCRIPTS[24]!;c.pc=58;c.record.vulnerable=4;c.flags&=~CREATURE_FLAGS.hurts;
    // The original reads the first hit-shape record directly, without yaw.
    const offset=c.hitShapes?.[0]?.offset??{x:c.offsetX,y:c.offsetY,z:c.offsetZ};
    const at={x:c.x+offset.x,y:c.y+offset.y,z:c.z+offset.z};
    for(let i=0;i<5;i++){const e=w.effect(at,35,14),spin=w.rand.byte()-128;if(e)e.spin=spin;}
    w.light({...at,r:240,g:128,b:0,life:32,owner:0x52c840+c.slot*0x9c});w.sound(-2);
    s.defeated=true;phase=3;
  }
  if(phase>=3&&w.cameraZone===4){
    const dx=sin(c.heading-1024)>>2,dz=sin(c.heading)>>2;
    const at=s.frame?{x:c.x+dx,y:c.y-7424,z:c.z+dz}:{x:c.x-dx*3,y:c.y-1024,z:c.z-dz*3};
    if(w.gateSeven){const e=w.effect(at,17,10),spin=w.rand.byte()-128;if(e){e.spin=spin;e.width=e.height=40;}}
    if((w.rand.byte()&3)!==0&&(c.frame>>>16)===10){const e=w.effect(at,4,4),period=(w.rand.byte()&15)*2+24;if(e)e.period=period;}
  }
  if(phase===2&&w.cameraZone===4)s.barTicks=90;
}
export function stepDinosaurLevel(s:Dinosaur,phase:number,dt=1):number{
  s.barTicks=Math.max(0,s.barTicks-dt);
  if(phase>2&&phase<120)return phase+dt;
  return phase>=120?200:phase;
}
export function dinosaurBar(s:Dinosaur,c:Creature|undefined):number{
  return s.barTicks===0?-1:s.defeated||!c?0:Math.max(0,Math.min(54,Math.trunc((c.health-9)*54/20)));
}
