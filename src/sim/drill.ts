/** Construction Yard jackhammer, 0041b780 / level tick 0041c640. */
import {CREATURE_FLAGS,type Creature,type RandomStream} from './creatures.ts';
import type {Effect} from './effects.ts';
import {sin,yawOf} from './trig.ts';
type Point={x:number;y:number;z:number};
export interface DrillArena {x:number[];z:number[];snapX:number[];snapZ:number[]}
/** Runtime tables; no installed arena geometry is shipped in the source. */
export function readDrillArena(exe:Uint8Array):DrillArena{
  const d=new DataView(exe.buffer,exe.byteOffset,exe.byteLength);
  const row=(address:number)=>Array.from({length:4},(_,i)=>d.getInt32(address-0x400000+i*4,true));
  return {x:row(0x4f1ccc),z:row(0x4f1cdc),snapX:row(0x4f1cec),snapZ:row(0x4f1cfc)};
}
export function createDrill(c:Creature,arena:DrillArena){
  return {arena,cell:0,health:c.health,hurt:0,frame:0,flash:false,barTicks:0};
}
export type Drill=ReturnType<typeof createDrill>;
export interface DrillWorld extends Point {
  phase:number;disksActive:boolean;shake:number;gateFour:boolean;gateSixteen:boolean;rand:RandomStream;
  setShake:(ticks:number)=>void;sound:(event:number)=>void;
  effect:(at:Point,kind:number,mode:number)=>Effect|null;
  projectile:(at:Point,velocity:Point,gravity:number,kind:number)=>Effect|null;
}
export function drillDebrisVelocity(c:Point,player:Point):Point|null{
  const dx=(c.x-player.x)>>5,dz=(c.z-player.z)>>5;
  const distance=Math.trunc(Math.sqrt(dx*dx+dz*dz)),speed=Math.trunc(distance*3/4);
  // The retail division is undefined at coincident horizontal positions.
  if(speed===0)return null;
  const flight=Math.trunc(distance*4096/speed),yaw=yawOf(dx,dz)&4095;
  return {x:Math.trunc(sin(yaw-2048)*speed/16384),
    y:Math.trunc(-flight*128/256)-Math.trunc((c.y-player.y)*128/flight),
    z:Math.trunc(sin(yaw-1024)*speed/16384)};
}
export function stepDrill(s:Drill,c:Creature,w:DrillWorld,dt=1):void{
  s.frame=(s.frame-1)&1;w.sound(0x99);
  if(c.flags&CREATURE_FLAGS.touched){c.flags&=~CREATURE_FLAGS.touched;w.sound(0x9a);}
  const dx=(w.x-c.x)>>8,dy=(w.y-c.y)>>8,dz=(w.z-c.z)>>8,d2=dx*dx+dy*dy+dz*dz;
  if(w.shake===0&&d2<300*300)w.setShake(20);
  else if(w.shake<20&&d2<100*100)w.setShake(40);
  s.flash=false;
  if(w.phase>1){s.hurt-=dt;if(s.hurt<0){s.hurt=0;c.record.vulnerable=7;}else s.flash=s.frame!==0;}
  if(c.health!==s.health){s.hurt=60;s.health=c.health;c.record.vulnerable=4;}
  // This final write overrides the recovery write: active disks expose it to spin.
  c.record.vulnerable=w.phase<2||!w.disksActive?4:5;
  const count=(value:number,bounds:number[])=>{let n=0;while(n<4&&value>=bounds[n]!)n++;return n;};
  let cell=count(c.x,s.arena.x)+16*count(c.z,s.arena.z);
  if((cell&0x11)===0x11){
    if(!(s.cell&1)){
      const n=(cell&3)-1,lo=s.arena.snapX[n]!,hi=s.arena.snapX[n+1]!;
      c.x=c.x<hi-Math.trunc((hi-lo)/2)?lo:hi;cell&=~1;
    }
    if(!(s.cell&16)){
      const n=((cell>>4)&3)-1,lo=s.arena.snapZ[n]!,hi=s.arena.snapZ[n+1]!;
      c.z=c.z<hi-Math.trunc((hi-lo)/2)?lo:hi;cell&=~16;
    }
  }
  s.cell=cell;
  if((c.y>>>0)>0xfff63c20)c.y=-0x9c3e0;
  if(w.phase<3&&w.gateFour){const e=w.effect(c,4,9);if(e)e.period=32;}
  if(w.phase===2&&w.y<-0x7de25&&w.gateSixteen){
    let e:Effect|null=null;
    if((w.rand.byte()&3)===0){const velocity=drillDebrisVelocity(c,w);if(velocity)e=w.projectile(c,velocity,128,84);}
    else e=w.effect(c,84,14);
    const spin=w.rand.byte()-128;
    if(e){e.spin=spin;e.width=e.height=100;}
  }
}
/** These level clocks and range adjustment continue when the boss is not near. */
export function stepDrillLevel(s:Drill,c:Creature|undefined,phase:number,playerY:number,dt=1):number{
  s.barTicks=Math.max(0,s.barTicks-dt);
  if(c)c.bodyRadius=playerY>-0x89188?1800:3800;
  if(phase===2){if(c?.type===0)return 3+dt;if(playerY<-0x7de25)s.barTicks=90;}
  if(phase>2&&phase<120)return phase+dt;
  if(phase>=120)return 200;
  return phase;
}
export function drillBar(s:Drill,c:Creature|undefined):number{
  return s.barTicks===0?-1:!c||c.type===0||c.deathTimer<0?0:Math.max(0,Math.min(54,Math.trunc(c.health*54/30)));
}
