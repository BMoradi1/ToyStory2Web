import {spawnChild,type Effect,type EffectSim,type EffectWorld} from './effects.ts';
import type {AimTarget} from './aim-lock.ts';
export interface AimMarker {effect:Effect|null;target:number|null}
export const createAimMarker=():AimMarker=>({effect:null,target:null});
/** FUN_004038e0's persistent kind 0x30 marker, using the installed template. */
export function stepAimMarker(state:AimMarker,sim:EffectSim,world:EffectWorld,
  target:AimTarget|null,locked:boolean):void {
  if(!target){if(state.effect?.kind===0x30)state.effect.life=0;state.effect=null;state.target=null;return;}
  if(state.effect?.kind!==0x30||state.effect.life<=0)state.effect=null;
  if(!state.effect)state.effect=spawnChild(sim,world,target.x,target.y,target.z,0x30,2);
  const e=state.effect;if(!e)return;
  if(state.target!==target.id){e.width=e.height=8;state.target=target.id;}
  e.x=target.x;e.y=target.y;e.z=target.z;e.life=10000;
  e.rotation=locked?0x200:0;e.r=locked?255:0;e.g=locked?0:255;e.b=0;
}
