/** The burrowing Army soldier's seven-hole puzzle, 00418e50/004190c0. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import type {Creature} from './creatures.ts';
import type {PlayerState} from './player.ts';
export function createNeighborhoodHoles(dat:DatLevel,creatures:Creature[]){
 const points=dat.paths.find(p=>p.id===2)?.points;if(!points||points.length!==7)throw Error('Missing Neighborhood hole path');
 const soldier=creatures.find(c=>c.slot===4);if(!soldier||soldier.type!==13)throw Error('Missing burrowing Army soldier');
 soldier.timer=100;
 return {points:points.map(p=>({x:p.x*32,y:p.y*32,z:p.z*32,closed:false})),node:0,last:0,scan:0,timer:0,closed:0};
}
export type NeighborhoodHoles=ReturnType<typeof createNeighborhoodHoles>;
export function stepNeighborhoodHoles(s:NeighborhoodHoles,creatures:Creature[],p:PlayerState,host:{focus:Vec3;sound:(id:number,at:Vec3)=>void;stopSequence:()=>void;effect:(at:Vec3,kind:number,mode:number)=>void;clearWarning:()=>void}){
 const c=creatures.find(c=>c.slot===4);if(!c||c.type!==13)return;
 const distance=(a:Vec3,b:Vec3,shift:number)=>((a.x-b.x)>>shift)**2+((a.y-b.y)>>shift)**2+((a.z-b.z)>>shift)**2;
 if((c.flags&2)&&(c.flags&0x20)&&distance(p,c,5)<0x90000&&c.targetY!==0x5000){c.targetY=0x5000;s.timer=100;s.last=s.node;host.sound(0x31,c);}
 if(c.y>0x4800){
  s.node=(s.node+1)%s.points.length;
  for(let i=0;i<s.points.length&&(s.points[s.node]!.closed||s.node===s.last);i++)s.node=(s.node+1)%s.points.length;
  const at=s.points[s.node]!;c.x=c.homeX=c.targetX=at.x;c.z=c.homeZ=c.targetZ=at.z;c.y=0x3800;c.homeY=c.targetY=at.y;c.floorY=0x1a0;
 }
 const hole=s.points[s.scan]!;
 if(hole.closed){const at={x:hole.x,y:-3000,z:hole.z};if(distance(host.focus,at,8)<0x40000)host.effect(at,58,3);}
 s.scan=(s.scan+1)%s.points.length;
 if(s.timer>0){
  s.timer--;if(s.timer===0)host.stopSequence();
  if(s.timer===79){const at={x:s.points[s.last]!.x,y:-0x23b0,z:s.points[s.last]!.z};host.effect(at,59,2);host.sound(-3,at);}
 }
 if(p.onGround&&p.stomp< -20&&s.node!==s.last&&s.timer!==0){
  const at=s.points[s.last]!;
  if(distance(p,{x:at.x,y:-3000,z:at.z},8)<0x900){
   host.stopSequence();at.closed=true;s.closed++;s.timer=0;
   if(s.closed>5)c.flags=(c.flags&~0x20)|0x84;
   host.clearWarning();
  }
 }
}
