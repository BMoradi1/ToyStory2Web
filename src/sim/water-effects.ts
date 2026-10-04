/** Water presentation from 004a2d80. Shared effects use the live level water plane. */
import type {PlayerState} from './player.ts';
import {spawnChild,type EffectSim,type EffectWorld} from './effects.ts';
import {sin,cos} from './trig.ts';
export function createWaterEffects(y=0){return {previousY:y,dripTicks:0};}
export type WaterEffects=ReturnType<typeof createWaterEffects>;
export function stepWaterEffects(state:WaterEffects,sim:EffectSim,world:EffectWorld,p:PlayerState,
  footfallMask:number,surface:number,cameraY:number,sound:(event:number)=>void){
  const water=world.waterY,wet=water!==null&&p.y>water;
  // Dry footsteps can leave water marks for 180 ticks after emerging.
  if(!wet&&state.dripTicks>0&&p.coyote>0&&footfallMask>0&&footfallMask<4&&(surface===-1||surface===13)){
    const right=(footfallMask&2)!==0;
    const x=(right?sin(p.yaw-1024):cos(p.yaw))>>4;
    const z=(right?sin(p.yaw):sin(p.yaw-2048))>>4;
    const e=spawnChild(sim,world,p.x+x,p.y,p.z+z,32,2);
    if(e)e.rotation=(-p.yaw-1024)&4095;
  }
  state.dripTicks=Math.max(0,state.dripTicks-1);
  if(water!==null){
    if(wet){
      if(state.previousY<=water){
        const hard=p.fallTimer===0x50;
        for(let i=0;i<(hard?20:5);i++){
          const e=spawnChild(sim,world,p.x,water,p.z,13,hard?14:9);
          const period=((sim.rand.byte()&1)+(hard?4:3))*2,rotation=sim.rand.byte()<<4;
          if(e){e.period=period;e.life=period*5;e.rotation=rotation;}
        }
        sound(0x3a);
      }
      state.dripTicks=0;
    }else if(state.previousY>water)state.dripTicks=180;
    const ripple=p.forwardSpeed!==0||p.lateralSpeed!==0?sim.gate.four:sim.gate.sixteen;
    if(wet&&p.y<water+12288&&ripple)spawnChild(sim,world,p.x,water,p.z,27+(sim.rand.byte()&1),2);
    // The original consumes three bytes per bubble but uses the first for all axes.
    if(p.inWater&&(sim.rand.byte()&3)===0){
      const count=p.spin!==0||p.spinCharge< -120?sim.gate.two:Number(sim.gate.seven);
      for(let i=0;i<count;i++){
        const r=sim.rand.byte();sim.rand.byte();sim.rand.byte();
        spawnChild(sim,world,p.x+(r-128)*16,p.y+(r-640)*16,p.z+(r-128)*16,45,18);
      }
    }
    if(cameraY>water){
      sound(0x5f);
      if(sim.gate.four){const off=(sim.rand.byte()-128)*256;sim.rand.byte();spawnChild(sim,world,p.x+off,water,p.z+off,57,2);}
    }
  }
  state.previousY=p.y;
}
