import {sin,cos,idiv} from './trig.ts';
type Point={x:number;y:number;z:number};
export interface RainDrop extends Point {bottom:number}
export function createRain(){return {rain:Array.from({length:64},():RainDrop=>({x:0,y:0,z:0,bottom:0})),quota:0};}
export type RainState=ReturnType<typeof createRain>;
export interface RainWorld {render:Point & {yaw:number;pitch:number};playerVY:number;zone:number;byte:()=>number}
/** 0044ed90: one new drop per tick, 4096 game units/tick, at most eight free candidates. */
export function stepRain(s:RainState,w:RainWorld):void {
  const free:number[]=[];
  const speed=4096+(w.playerVY>1024?w.playerVY*2:0);
  for(let i=0;i<s.rain.length;i++){
    const d=s.rain[i]!;
    if(d.bottom!==0){d.y+=speed;if(d.y>d.bottom)d.bottom=0;}
    else if(free.length<8)free.push(i);
  }
  s.quota+=256;
  while(s.quota>255&&free.length){
    const d=s.rain[free.pop()!]!;
    const spread=w.byte()*8-1024;
    const distance=w.byte()+idiv(sin(w.render.pitch*3+1024),512);
    d.x=w.render.x+((w.byte()-128)<<5)-((sin(w.render.yaw+spread)*distance)>>5);
    d.y=w.render.y-0x14000;
    d.z=w.render.z+((w.byte()-128)<<5)+((cos(w.render.yaw+spread)*distance)>>5);
    d.bottom=Math.min(w.zone===3?0xf80c:0,d.y+0x24000);
    if(d.bottom===0)d.bottom=-1;
    s.quota-=256;
  }
}
