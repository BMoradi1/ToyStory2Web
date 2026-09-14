/** ZPOD beam geometry and endpoint damage, 0040670b..004068be. */
import {poseMatrix,type BonePose} from '../formats/anm.ts';
import {sin,cos,yawOf} from './trig.ts';
import type {LaserBeam,Point} from './laser.ts';

/** Part-zero attachment (0,0,-100), posed before entity yaw and hover roll. */
export function podMuzzle(c:Point&{heading:number;hover:number;drawScale:number},pose:BonePose|null,offset=-100):Point{
  return podAttachment(c,pose,{x:0,y:0,z:offset});
}

/** FUN_0043c1c0: a local attachment follows its animated part and entity transform. */
export function podAttachment(c:Point&{heading:number;hover:number;drawScale:number},pose:BonePose|null,point:Point):Point{
  const m=pose?poseMatrix(pose):null;
  const x=pose?pose.translation.x+point.x*m![0]!+point.y*m![1]!+point.z*m![2]!:point.x;
  const y=pose?pose.translation.y+point.x*m![3]!+point.y*m![4]!+point.z*m![5]!:point.y;
  const z=pose?pose.translation.z+point.x*m![6]!+point.y*m![7]!+point.z*m![8]!:point.z;
  const roll=sin(c.hover)/16384,cr=cos(c.hover)/16384;
  const rx=x*cr-y*roll,ry=x*roll+y*cr;
  const s=sin(c.heading)/16384,k=cos(c.heading)/16384,scale=32*c.drawScale;
  return {x:c.x+Math.trunc((-k*rx-s*z)*scale),y:c.y+Math.trunc(ry*scale),z:c.z+Math.trunc((s*rx-k*z)*scale)};
}

export function podBeam(from:Point,heading:number,clip:(from:Point,delta:Point)=>Point):LaserBeam{
  const delta={x:sin(heading)*4,y:0x17700,z:cos(heading)*4};
  return {from,to:clip(from,delta),life:32,colour:[0,1,0],width:32};
}

/** 0042520b deliberately subtracts 4095, not 4096, on the negative side. */
export function podBossAim(from:Point,player:Point,heading:number):number{
  let delta=(yawOf(player.x-from.x,player.z-from.z)-heading)&4095;
  if(delta>2048)delta-=4095;
  return (heading+Math.max(-512,Math.min(512,delta)))&4095;
}

/** FUN_0049f400 tests a strict radius in signed 256-unit steps, at the impact. */
export function podImpactHits(player:Point,impact:Point,radius=25):boolean{
  const x=(player.x-impact.x)>>8,y=(player.y-impact.y)>>8,z=(player.z-impact.z)>>8;
  return x*x+y*y+z*z<radius*radius;
}
