/** Path-0 falling leaves, 004190c0 at 00419890..0041996f. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import type {Effect} from './effects.ts';
export function createNeighborhoodLeaves(dat:DatLevel){
 const points=dat.paths.find(p=>p.id===0)?.points;if(!points?.length)throw Error('Missing Neighborhood leaf path');
 return {points:points.map(p=>({x:p.x*32,y:p.y*32,z:p.z*32})),node:0,pending:true};
}
export type NeighborhoodLeaves=ReturnType<typeof createNeighborhoodLeaves>;
export function stepNeighborhoodLeaves(s:NeighborhoodLeaves,p:Vec3,host:{four:boolean;sixteen:boolean;byte:()=>number;spawn:(at:Vec3)=>Effect|null;ground:(at:Vec3)=>number|null}){
 if((p.y> -0xbe01?host.four:host.sixteen)&&(host.byte()&7)===0)s.pending=true;
 if(!s.pending)return;
 const point=s.points[s.node]!,dy=p.y-point.y;
 if(dy>0x7000&&dy<0x50000){
  const at={x:point.x-16384+host.byte()*128,y:point.y,z:point.z-16384+host.byte()*128};
  if(((p.x-at.x)>>8)**2+((p.z-at.z)>>8)**2<640000){
   const e=host.spawn(at),floor=host.ground({x:at.x,y:-16384,z:at.z}),spin=host.byte()-128;
   if(e){e.floor=floor??0x1460;e.spin=spin;}
   s.pending=false;
  }
 }
 s.node=(s.node+1)%s.points.length;
}
