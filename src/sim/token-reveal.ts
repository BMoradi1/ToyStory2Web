import type {TokenRevealProfile} from '../formats/token-reveal.ts';
/** The scale reads the old timer; particles fire when it crosses 100. */
export function stepTokenReveal(timer:number,profile:TokenRevealProfile,dt=1){
  const next=Math.max(0,timer-dt);
  return {timer:next,scale:profile.scales[timer]??1,burst:timer>100&&next<=100};
}
