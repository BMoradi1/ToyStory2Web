import { cos, sin } from './trig.ts';
import type { PlayerInput, PlayerState } from './player.ts';

export interface AimView { active: boolean; held: boolean; yaw: number; pitch: number; modelYaw: number; modelPitch: number; swayPhase: number }
export const createAimView = (): AimView => ({active:false,held:false,yaw:0,pitch:0,modelYaw:0,modelPitch:0,swayPhase:0x7f8});
/** Manual visor view. Eye height follows FUN_004038e0; turn speed is a port tuning. */
export function stepAimView(s:AimView,p:PlayerState,input:PlayerInput,blocked=false):void {
  const pressed=!!input.aim&&!s.held;s.held=!!input.aim;
  if(blocked||p.dying||p.hitStun>0||p.pole>=0||p.zipLine>=0||p.climb!==0){s.active=false;return;}
  if(pressed){s.active=!s.active;if(s.active){s.yaw=p.yaw;s.pitch=0;s.modelYaw=p.yaw;s.modelPitch=0;s.swayPhase=0x7f8;}}
  if(!s.active)return;
  s.yaw=(s.yaw+Math.round(input.moveX*20))&4095;
  s.pitch=Math.max(-768,Math.min(768,s.pitch+Math.round(input.moveY*16)));
  // 004042c7..00404355: shortest-angle difference, one sixth per game tick.
  s.modelYaw=followAimAngle(s.modelYaw,s.yaw);
  s.modelPitch=followAimAngle(s.modelPitch,s.pitch);
  s.swayPhase=(s.swayPhase+64)&4095;
  p.yaw=s.yaw;
  p.vx=0;p.vz=0;
}
export function aimCamera(s:AimView,p:{x:number;y:number;z:number}) {
  const eye={x:p.x,y:p.y-0x3000,z:p.z};
  const flat=cos(s.pitch)/16384;
  const look={x:eye.x+sin(s.yaw)*flat,y:eye.y-sin(s.pitch),z:eye.z+cos(s.yaw)*flat};
  return {eye,look};
}

/** Keep wraparound turns short and preserve the executable's integer truncation. */
export function aimAngleDelta(from:number,to:number):number {
  return ((to-from+2048)&4095)-2048;
}
function followAimAngle(from:number,to:number):number {
  return (from-Math.trunc(aimAngleDelta(to,from)/6))&4095;
}
/** Relative camera-space pitch/yaw for scene objects 0x2d, 0x2e and 0x2f. */
export function aimModelAngles(s:AimView):readonly (readonly [number,number])[] {
  const sway=sin((s.swayPhase-64)&4095)>>10;
  const half=Math.trunc(sway/2);
  const yaw=aimAngleDelta(s.yaw,s.modelYaw),pitch=aimAngleDelta(s.pitch,s.modelPitch);
  return [[0,half],[pitch,yaw+sway],[pitch,yaw+half]];
}
