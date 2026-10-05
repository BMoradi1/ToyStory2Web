/** Shared rain and Alley water-clipped splashes, 0041e880. */
import {stepRain,type RainState,type RainWorld} from './rain.ts';
import {sin,cos} from './trig.ts';
type Point={x:number;y:number;z:number};
export interface AlleyWeatherWorld extends RainWorld {
 follow:Point & {yaw:number};waterY:number;eighthTick:boolean;
 ground:(at:Point)=>number|null;splash:(at:Point)=>void;
}
export function stepAlleyWeather(s:RainState,w:AlleyWeatherWorld){
 stepRain(s,w);
 if(!w.eighthTick||w.follow.y>w.waterY)return;
 const at={x:w.follow.x+(w.byte()-128)*256+sin(w.follow.yaw)*3,y:w.follow.y-0x8000,z:w.follow.z+(w.byte()-128)*256+cos(w.follow.yaw)*3};
 const floor=w.ground(at);if(floor===null)return;
 const y=Math.min(floor,w.waterY);if(w.follow.y<y)w.splash({...at,y});
}
