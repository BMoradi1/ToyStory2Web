/** Alleys rooftop clown: 0041ddb0, with level reward timing from 0041e880. */
import {CREATURE_FLAGS,type Creature} from './creatures.ts';
export interface Clown {
  health:number;hurt:number;frame:number;flash:boolean;barTicks:number;
}
export function createClown(c:Creature):Clown{
  return {health:c.health,hurt:0,frame:0,flash:false,barTicks:0};
}
/** Runs with the creature after shared movement; the script owns its attacks. */
export function stepClown(s:Clown,c:Creature,phase:number,cameraZone:number,sound:(event:number)=>void,dt=1):void{
  s.frame=(s.frame-1)&1;
  if(c.health!==s.health){s.hurt=60;s.health=c.health;c.record.vulnerable=4;}
  if((c.flags&CREATURE_FLAGS.touched)!==0){c.flags&=~CREATURE_FLAGS.touched;sound(0xa1);}
  s.flash=false;
  if(phase>=2){
    s.hurt-=dt;
    if(s.hurt<0){s.hurt=0;c.record.vulnerable=7;}
    else s.flash=s.frame!==0;
  }
  if(phase===2&&cameraZone===2)s.barTicks=90;
}
/** Starts at 3+dt on removal; reaching 120 reveals token slot 4 next tick. */
export function stepClownLevel(s:Clown,c:Creature|undefined,phase:number,dt=1):number{
  s.barTicks=Math.max(0,s.barTicks-dt);
  if(phase===2&&c?.type===0)return 3+dt;
  if(phase>2&&phase<120)return phase+dt;
  if(phase>=120)return 200;
  return phase;
}
export function clownBar(s:Clown,c:Creature|undefined):number{
  if(s.barTicks===0)return -1;
  return !c||c.type===0||c.deathTimer<0?0:Math.max(0,Math.min(54,Math.trunc(c.health*54/20)));
}
