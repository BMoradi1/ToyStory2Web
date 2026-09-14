import type {Point} from './laser.ts';

export interface PointLight extends Point { r:number; g:number; b:number; life:number }
export interface PlayerLight { direction:Point; colour:readonly [number,number,number] }
/** 0049ee50 allocates only temporary slots 2..5, replacing the least life. */
export function createPointLights():PointLight[]{
  return Array.from({length:4},()=>({x:0,y:0,z:0,r:0,g:0,b:0,life:0}));
}
export function addPointLight(pool:PointLight[],light:PointLight):void{
  let slot=0;
  for(let i=1;i<pool.length;i++)if(pool[i]!.life<pool[slot]!.life)slot=i;
  Object.assign(pool[slot]!,light);
}
/** Temporary portion of 0049eee0. Reserved lights and transition blending
 * remain separate work; absent a temporary light the renderer keeps its base. */
export function stepPointLights(pool:PointLight[],player:Point):PlayerLight|null{
  let selected:PointLight|null=null,nearest=Infinity;
  const origin={x:player.x,y:player.y-8192,z:player.z};
  for(const light of pool){
    light.life=Math.max(0,light.life-1);
    if(!light.life)continue;
    const d=((light.x-origin.x)>>8)**2+((light.y-origin.y)>>8)**2+((light.z-origin.z)>>8)**2;
    if(d>0x8000){light.life=0;continue;}
    if(d<nearest){nearest=d;selected=light;}
  }
  if(!selected)return null;
  const gain=0x10000-nearest;
  return {direction:{x:(selected.x-origin.x)>>8,y:(selected.y-origin.y)>>8,z:(selected.z-origin.z)>>8},
    colour:[(selected.r*gain)>>16,(selected.g*gain)>>16,(selected.b*gain)>>16]};
}
