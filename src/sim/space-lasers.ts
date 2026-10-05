/** Paired laser displays: 00422d20, gated by the level tick's XZ box. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import type {Effect} from './effects.ts';
import type {LaserBeam} from './laser.ts';
import type {PointLight} from './point-light.ts';
import {yawOf} from './trig.ts';
export const SPACE_LASER_BOX={xMin:0x29ea3,xMax:0x9ab23,zMin:-0x6f3f3,zMax:-0x6273};
export function createSpaceLasers(dat:DatLevel){
  const paths=[14,15].map(id=>{const p=dat.paths.find(p=>p.id===id)?.points;
    if(!p||p.length<8)throw Error(`Missing Space Land laser path ${id}`);return p;});
  if(paths[0]!.length!==paths[1]!.length)throw Error('Unpaired Space Land laser paths');
  return {paths,beams:[] as LaserBeam[],guns:[0,1].map(()=>({ticks:0,period:0,node:0,target:{x:0,y:0,z:0}}))};
}
export type SpaceLasers=ReturnType<typeof createSpaceLasers>;
export function stepSpaceLasers(s:SpaceLasers,p:Vec3,host:{randomByte:()=>number;
  effect:(at:Vec3,kind:number,mode:number)=>Pick<Effect,'life'>|null;
  light:(l:PointLight)=>void;sound:(id:number,at:Vec3)=>void;hurt:(angle:number)=>void;
},dt=1){
  s.beams.length=0;const box=SPACE_LASER_BOX;
  if(p.x<=box.xMin||p.x>=box.xMax||p.z<=box.zMin||p.z>=box.zMax)return;
  const near=(a:Vec3,b:Vec3,r:number)=>{const x=(a.x-b.x)>>8,y=(a.y-b.y)>>8,z=(a.z-b.z)>>8;return x*x+y*y+z*z<r*r;};
  for(let id=0;id<2;id++){
    const gun=s.guns[id]!,path=s.paths[id]!;gun.ticks-=dt;
    if(gun.ticks<1){
      gun.ticks=gun.period=(host.randomByte()&7)+8;
      gun.node+=host.randomByte()&7;if(gun.node>=path.length)gun.node-=path.length;
      const node=path[gun.node]!;gun.target={x:node.x*32,y:node.y*32,z:node.z*32};
      if(p.y> -0x150f&&near(gun.target,p,500))gun.target={x:p.x,y:p.y-2048,z:p.z};
    }
    const source=s.paths[1-id]![gun.node]!,from={...gun.target};
    s.beams.push({from,to:{x:from.x+Math.trunc((source.x*32-from.x)*gun.ticks/gun.period),
      y:from.y+Math.trunc((source.y*32-from.y)*gun.ticks/gun.period),
      z:from.z+Math.trunc((source.z*32-from.z)*gun.ticks/gun.period)},
      width:64,life:32,colour:id===0?[1,0,0]:[0,.5,1]});
    if(gun.ticks!==gun.period)continue;
    for(let i=0;i<5;i++){const e=host.effect(gun.target,4,4),life=(host.randomByte()&15)*2+24;if(e)e.life=life;}
    host.light({...gun.target,r:id===0?240:0,g:id===0?0:120,b:id===0?0:240,life:16,
      owner:id===0?gun.target.z:gun.target.x});
    host.sound(7,gun.target);
    if(near(p,gun.target,25))host.hurt(yawOf(p.x-gun.target.x,p.z-gun.target.z));
  }
}
