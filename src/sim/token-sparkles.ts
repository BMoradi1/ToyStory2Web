import {spawnChild,type EffectSim,type EffectWorld} from './effects.ts';
import type {Pickup} from './pickups.ts';
/** 004a0fa3..004a1082: saved token bits suppress the idle effect. The PC
 * visibility helper 004cd110 always returns true; only camera range gates it. */
export function stepTokenSparkles(items:readonly Pick<Pickup,'tokenSlot'|'enabled'|'collected'|'x'|'y'|'z'>[],
  savedTokens:number,sim:EffectSim,world:EffectWorld,camera:{x:number;y:number;z:number}):void{
  if(!sim.gate.sixteen)return;
  // Retail visits slots in order, regardless of placement order.
  for(let slot=0;slot<5;slot++){
    if(savedTokens&(1<<slot))continue;
    const item=items.find(i=>i.tokenSlot===slot&&i.enabled&&!i.collected);
    if(!item)continue;
    const x=item.x*32,y=item.y*32,z=item.z*32;
    const distance=((camera.x-x)>>8)**2+((camera.y-y)>>8)**2+((camera.z-z)>>8)**2;
    if(distance>=0x90000)continue;
    const child=spawnChild(sim,world,x,y,z,0x29,9);
    const spin=sim.rand.byte()-128,life=(sim.rand.byte()&15)*2+24;
    if(child){child.spin=spin;child.life=life;}
  }
}
