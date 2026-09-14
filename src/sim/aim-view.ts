import { cos, sin } from './trig.ts';
import type { PlayerInput, PlayerState } from './player.ts';

export interface AimView { active: boolean; held: boolean; yaw: number; pitch: number }
export const createAimView = (): AimView => ({active:false,held:false,yaw:0,pitch:0});
/** Manual visor view. Eye height follows FUN_004038e0; turn speed is a port tuning. */
export function stepAimView(s:AimView,p:PlayerState,input:PlayerInput,blocked=false):void {
  const pressed=!!input.aim&&!s.held;s.held=!!input.aim;
  if(blocked||p.dying||p.hitStun>0||p.pole>=0||p.zipLine>=0||p.climb!==0){s.active=false;return;}
  if(pressed){s.active=!s.active;if(s.active){s.yaw=p.yaw;s.pitch=0;}}
  if(!s.active)return;
  s.yaw=(s.yaw+Math.round(input.moveX*20))&4095;
  s.pitch=Math.max(-768,Math.min(768,s.pitch+Math.round(input.moveY*16)));
  p.yaw=s.yaw;
  p.vx=0;p.vz=0;
}
export function aimCamera(s:AimView,p:{x:number;y:number;z:number}) {
  const eye={x:p.x,y:p.y-0x3000,z:p.z};
  const flat=cos(s.pitch)/16384;
  const look={x:eye.x+sin(s.yaw)*flat,y:eye.y-sin(s.pitch),z:eye.z+cos(s.yaw)*flat};
  return {eye,look};
}
