/** Neighborhood creature hooks: lawnmower 00418ce0 and kite 004189c0/004190c0. */
import {CREATURE_FLAGS,type Creature,type HandlerArgs,type RandomStream} from './creatures.ts';
import type {Effect} from './effects.ts';
import {sin,cos,yawOf} from './trig.ts';
type Point={x:number;y:number;z:number};
export interface MowerWorld {
  gateTwo:number;gateSixteen:boolean;rand:RandomStream;sound:(event:number)=>void;
  effect:(at:Point,kind:number,mode:number)=>Effect|null;
  projectile:(at:Point,v:Point,gravity:number,rotation:number,spin:number,kind:number)=>Effect|null;
}
export function stepMower(c:Creature,w:MowerWorld):void{
  w.sound(0x4b);
  if(!(c.flags&CREATURE_FLAGS.awake))return;
  if(w.gateSixteen){const e=w.effect(c,49,2),rotation=w.rand.byte()<<4;if(e)e.rotation=rotation;}
  const at={x:c.x+sin(c.heading-2048),y:c.y,z:c.z+sin(c.heading-1024)};
  for(let i=0;i<w.gateTwo;i++){
    const yaw=(c.heading+1280+w.rand.byte()*6)&4095,n=w.rand.byte();w.rand.byte();w.rand.byte();
    const e=w.projectile(at,{x:sin(yaw)>>4,y:n-3072,z:cos(yaw)>>4},256,n<<4,n*2-256,50);
    const green=(w.rand.byte()>>2)+64;if(e)e.g=green;
  }
}
export function updateMowerRange(c:Creature|undefined,p:Point):void{
  if(c?.type===12)c.bodyRadius=p.x>-0x7ccdc&&p.x<-0x75990&&p.z>-0x2765c&&p.z<-0x290?3800:1800;
}
export function createKite(c:Creature){
  c.flags|=CREATURE_FLAGS.diedOnce;
  return {health:c.health,hurt:0,frame:0,flash:false,roll:0,bob:0,spin:0,barTicks:0,tail:{x:c.x,y:c.y,z:c.z}};
}
export type Kite=ReturnType<typeof createKite>;
export function stepKite(s:Kite,c:Creature,args:HandlerArgs,p:Point&{phase:number;rand:RandomStream;sound:(event:number)=>void;lookAt:(at:Point)=>void}):void{
  const dt=args.dt;s.frame=(s.frame-1)&1;s.hurt-=dt;s.flash=false;
  if(s.hurt<0)s.hurt=0;else s.flash=s.frame!==0;
  s.roll=(s.roll+dt*36)&4095;c.hover=sin(s.roll)>>6;s.bob=(s.bob+dt*64)&4095;
  c.wantYaw=(yawOf(c.x-p.x,c.z-p.z)-2048)&4095;
  if(p.phase===2){
    const high=p.y<-0x71fff;
    if(high){s.barTicks=90;p.lookAt({x:c.x,y:c.y,z:c.z});}
    else{c.flags=(c.flags&~CREATURE_FLAGS.chase)|CREATURE_FLAGS.scriptVelocity;c.targetX=c.homeX;c.targetZ=c.homeZ;c.record.vulnerable=4;c.wait=50;}
    const y=Math.min(p.y,-0x721ad);
    if(!args.chasing&&high){
      c.timer=2;c.targetX=p.x;c.targetY=Math.min(sin(s.bob)-12288+y,-0x741ad);c.targetZ=p.z;
      const speed=264-c.health*20;p.sound(0x3c);s.spin=(s.spin+dt*speed)&4095;c.heading=s.spin;
      c.vx=sin(c.wantYaw)>>5;c.vz=cos(c.wantYaw)>>5;
    }else{
      if(s.health!==c.health){s.health=c.health;s.hurt=60;c.wait=0;if(s.health>0)p.sound(0x98);}
      s.spin=c.heading;c.targetY=sin(s.bob)-40960+y;c.timer=(c.timer-dt)<<16>>16;
      if(c.timer<0){c.timer=120;const yaw=c.heading+(p.rand.byte()<128?-512:512);c.vx=sin(yaw)>>3;c.vz=cos(yaw)>>3;}
    }
  }else c.y=(sin(s.bob)>>3)-0x7c000;
  c.y=Math.min(c.y,-0x741ad);
}
export function stepKiteLevel(s:Kite,c:Creature|undefined,phase:number,w:Point&{
  gateFour:boolean;attachment?:(c:Creature,part:number,offset:Point)=>Point;
  effect?:(x:number,y:number,z:number,kind:number,mode:number)=>void;
},dt=1):number{
  s.barTicks=Math.max(0,s.barTicks-dt);
  if(phase===2&&c?.type===0)phase=3;
  if(phase>2&&phase<120){
    phase+=dt;s.bob=(s.bob+dt*64)&4095;
    const d2=((w.x-s.tail.x)>>8)**2+((w.y-s.tail.y)>>8)**2+((w.z-s.tail.z)>>8)**2;
    s.tail.y+=192;s.tail.x+=sin(s.bob)>>5;s.tail.z+=sin(s.bob)>>5;
    if(w.gateFour&&d2<0x40000)w.effect?.(s.tail.x,s.tail.y,s.tail.z,58,3);
  }else if(phase>=120)phase=200;
  else if(c&&c.type>0)s.tail=w.attachment?.(c,0,{x:0,y:384,z:0})??{x:c.x,y:c.y+12288,z:c.z};
  return phase;
}
export function kiteBar(s:Kite,c:Creature|undefined):number{
  return s.barTicks===0?-1:!c||c.type===0||c.deathTimer<0?0:Math.max(0,Math.min(54,Math.trunc(c.health*54/10)));
}
