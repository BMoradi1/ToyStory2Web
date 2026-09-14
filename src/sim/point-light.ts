import type {Point} from './laser.ts';

interface LightSample extends Point { r:number; g:number; b:number }
export interface PointLight extends LightSample { life:number; owner:number }
export interface PlayerLight { direction:Point; colour:readonly [number,number,number] }
export interface PointLights {
  slots:PointLight[];
  /** -1 is the browser's base lighting, corresponding to reserved slot 0. */
  selected:number; remaining:number; from:LightSample; base:PointLight;
}
const empty=():PointLight=>({x:0,y:0,z:0,r:0,g:0,b:0,life:0,owner:0});
/** 0049ee50 allocates only temporary slots 2..5, replacing the least life. */
export function createPointLights():PointLights{
  return {slots:Array.from({length:4},empty),selected:-1,remaining:0,from:empty(),base:empty()};
}
export function addPointLight(state:PointLights,light:PointLight):void{
  const pool=state.slots;
  let slot=0;
  for(let i=1;i<pool.length;i++)if(pool[i]!.life<pool[slot]!.life)slot=i;
  Object.assign(pool[slot]!,light);
}
/** Signed divisions truncate toward zero, unlike the distance shifts below. */
function blend(from:LightSample,to:LightSample,remaining:number):LightSample{
  const mix=(a:number,b:number)=>b+Math.trunc((a-b)*remaining/64);
  return {x:mix(from.x,to.x),y:mix(from.y,to.y),z:mix(from.z,to.z),
    r:mix(from.r,to.r),g:mix(from.g,to.g),b:mix(from.b,to.b)};
}
/** 0049eee0 temporary selection and owner transitions. Base RGB is zero
 * additive contribution: retail reserved lights/normal shading remain open. */
export function stepPointLights(state:PointLights,player:Point):PlayerLight|null{
  let selected=-1,nearest=Infinity;
  const origin={x:player.x,y:player.y-8192,z:player.z};
  Object.assign(state.base,origin);
  for(let i=0;i<state.slots.length;i++){
    const light=state.slots[i]!;
    light.life=Math.max(0,light.life-1);
    if(!light.life)continue;
    const d=((light.x-origin.x)>>8)**2+((light.y-origin.y)>>8)**2+((light.z-origin.z)>>8)**2;
    if(d>0x8000){light.life=0;continue;}
    if(d<nearest){nearest=d;selected=i;}
  }
  const at=(slot:number)=>slot<0?state.base:state.slots[slot]!;
  if(at(state.selected).owner!==at(selected).owner){
    // Capture the outgoing interpolated sample before choosing a new owner.
    state.from=blend(state.from,at(state.selected),state.remaining);
    state.selected=selected;
    state.remaining=selected<0?64:0;
  }
  // Equal owners retain the previous slot, matching 0049f19c.
  const light=blend(state.from,at(state.selected),state.remaining);
  state.remaining=Math.max(0,state.remaining-1);
  if(light.r===0&&light.g===0&&light.b===0)return null;
  const direction={x:(light.x-origin.x)>>8,y:(light.y-origin.y)>>8,z:(light.z-origin.z)>>8};
  const gain=0x10000-Math.min(0x10000,direction.x**2+direction.y**2+direction.z**2);
  return {direction,colour:[(light.r*gain)>>16,(light.g*gain)>>16,(light.b*gain)>>16]};
}
