import {sin,cos} from './trig.ts';
import {createRain,stepRain} from './rain.ts';
export {stepRain,type RainDrop} from './rain.ts';
type Point = {x:number;y:number;z:number};
type Camera = Point & {yaw:number;pitch:number};
/** 0044ed60 / 0042e600. Independent of the general effect pool. */
export function createTarmacWeather() {
  return {...createRain(),
    flash:200,brightness:128,thunderDelay:0,thunderAt:{x:0,y:0,z:0},thunder:false,
    splashes:0};
}
export type TarmacWeather=ReturnType<typeof createTarmacWeather>;
export interface WeatherWorld {
  /** Render-camera yaw has forward (-sin(yaw), cos(yaw)); positions are game units. */
  render:Camera;
  follow:Point & {yaw:number};
  playerVY:number; zone:number; eighthTick:boolean; fading:boolean;
  byte:()=>number;
  ground:(at:Point)=>number|null;
  splash:(at:Point)=>void;
}
/** 0042eee7..0042f0e7: ground splashes, flash envelope, distance-delayed thunder. */
export function stepTarmacWeather(s:TarmacWeather,w:WeatherWorld):void {
  stepRain(s,w);
  s.thunder=false;
  if(w.eighthTick){
    const at={x:w.follow.x+(w.byte()-128)*256+sin(w.follow.yaw)*3,
      y:w.follow.y-0x8000,z:w.follow.z+(w.byte()-128)*256+cos(w.follow.yaw)*3};
    const floor=w.ground(at);
    if(floor!==null&&w.follow.y<floor){w.splash({...at,y:floor});s.splashes++;}
  }
  const before=s.flash;
  s.flash--;
  if(s.flash<32){
    if(before>=32){
      const distance=w.byte(),angle=w.follow.yaw-128+w.byte();
      s.thunderDelay=distance;
      s.thunderAt={x:w.follow.x+((sin(angle)*distance)>>5),y:w.follow.y,
        z:w.follow.z+((cos(angle)*distance)>>5)};
    }
    if(w.fading){s.brightness=128;s.flash=10000;}
    else if(s.flash<0)s.flash=w.byte()*2+32;
    else if(s.brightness>64)s.brightness=s.flash*3+128;
  }
  if(--s.thunderDelay<1){s.thunderDelay=20000;s.thunder=true;}
}
