/** Slot-1 flying-saucer course, 00423303..004235db. */
import type {Vec3} from '../formats/dat.ts';
import {CREATURE_FLAGS,type Creature} from './creatures.ts';
import {sin} from './trig.ts';
export function createSpaceSaucer(){return {phase:0,progress:0,speed:0,wobble:0};}
export type SpaceSaucer=ReturnType<typeof createSpaceSaucer>;
export function acceptSpaceSaucer(s:SpaceSaucer,c:Creature){
  s.phase=1;s.speed=0;s.progress=0;c.flags&=~CREATURE_FLAGS.drawn;
}
export function stepSpaceSaucer(s:SpaceSaucer,c:Creature,points:readonly Vec3[],host:{
  player:Vec3;coyote:number;talking:boolean;sound?:(id:number,at:Vec3)=>void;reward:()=>void;
  finish:{xMin:number;xMax:number;zMin:number;zMax:number;yMax:number};
},dt=1){
  if(points.length<2)throw Error('Missing Space Land saucer path 13');
  if(s.phase===1&&!host.talking){s.phase=2;s.progress=1;}
  if(s.phase===2&&host.coyote!==0){
    const p=host.player;
    const box=(xMin:number,xMax:number,zMin:number,zMax:number)=>p.x>xMin&&p.x<xMax&&p.z>zMin&&p.z<zMax;
    const end=host.finish;
    if(p.y<end.yMax){
      if(box(end.xMin,end.xMax,end.zMin,end.zMax)){s.phase=3;host.reward();}
      else if(!box(-0x924c,-0x204c,-0x5fd94,-0x3db94))s.phase=4;
    }else s.phase=4;
  }
  if(s.progress!==0){
    s.speed=Math.min(3000,s.speed+16*dt);
    if(s.phase===2)host.sound?.(0x7e,c);
    s.progress+=s.speed*dt;
    if((s.progress>>16)>points.length-2){
      c.flags|=CREATURE_FLAGS.drawn;s.progress=points.length*65536-65537;
      if(s.phase!==3)s.phase=4;
    }
  }
  const node=s.progress>>16,part=s.progress&65535,a=points[node]!,b=points[node+1]!;
  c.x=a.x*32+((b.x-a.x)*part>>11);
  c.y=a.y*32+((b.y-a.y)*part>>11)+(sin(s.wobble)>>2);
  c.z=a.z*32+((b.z-a.z)*part>>11);
  s.wobble=(s.wobble+32*dt)&4095;
  if(s.phase===4&&(c.flags&CREATURE_FLAGS.near)===0){
    c.health=0;s.progress=0;s.speed=0;s.phase=0;
  }
  // The shared creature script must not pull it back toward its spawn point.
  c.homeX=c.targetX=c.x;c.homeY=c.targetY=c.y;c.homeZ=c.targetZ=c.z;
}
