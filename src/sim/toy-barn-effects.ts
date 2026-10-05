/** Two path-authored Toy Barn emitters, 00421340, on the shared 64-tick gate. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import type {Effect} from './effects.ts';
export function createToyBarnEffects(dat:DatLevel){
 const path=(id:number)=>{const p=dat.paths.find(p=>p.id===id);if(!p?.points.length)throw Error(`Missing Toy Barn effect path ${id}`);return p.points.map(p=>({x:p.x*32,y:p.y*32,z:p.z*32}));};
 return {balls:path(6),puffs:path(7),node:0};
}
export type ToyBarnEffects=ReturnType<typeof createToyBarnEffects>;
export function stepToyBarnEffects(s:ToyBarnEffects,p:Vec3,w:{gate64:boolean;randomByte:()=>number;effect:(at:Vec3,kind:number,mode:number)=>Effect|null;sound:(id:number,at:Vec3)=>void}){
 if(!w.gate64)return;
 if(p.x> -0x5cf57&&p.x< -0x36a57&&p.z>0x6d7d&&p.z<0x5247d){
  s.node=(s.node+1)%s.balls.length;
  const at=s.balls[s.node]!,e=w.effect(at,86,25);
  if(e){e.floor=0;w.sound(0x74,e);}
 }
 if(p.x> -0x3bb3a&&p.x< -0x1b73a&&p.z> -0xa7dd&&p.z<0x48fa3){
  let node=w.randomByte()&7;if(node>5)node-=6;
  const at=s.puffs[node];if(!at)throw Error('Toy Barn effect path 7 requires six nodes');
  const e=w.effect(at,80,24),rotation=(w.randomByte()&3)<<10;
  if(e)e.rotation=rotation;
 }
}
