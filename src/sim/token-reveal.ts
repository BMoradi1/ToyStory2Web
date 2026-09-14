import type {TokenRevealProfile} from '../formats/token-reveal.ts';
import {revealToken,type PickupState} from './pickups.ts';
import {startCut,type CutState,type Vec} from './camera-cut.ts';
/** 004a0dfe..004a0e16: a fresh earned token gets a 180-tick cut, distance 16. */
export function revealEarnedToken(state:PickupState,slot:number,cut:CutState,player:Vec):void{
  const token=revealToken(state,slot,false);
  if(token)startCut(cut,{x:token.x*32,y:token.y*32,z:token.z*32},180,16,player);
}
/** The scale reads the old timer; particles fire when it crosses 100. */
export function stepTokenReveal(timer:number,profile:TokenRevealProfile,dt=1){
  const next=Math.max(0,timer-dt);
  return {timer:next,scale:profile.scales[timer]??1,burst:timer>100&&next<=100};
}
