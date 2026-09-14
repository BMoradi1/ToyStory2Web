import {yawOf} from './trig.ts';
import {aimAngleDelta, type AimView} from './aim-view.ts';
import type {PlayerInput} from './player.ts';

export interface AimTarget {id:number;x:number;y:number;z:number}
export interface AimLock {target:number|null;locked:boolean;previous:boolean;next:boolean}
export const createAimLock=():AimLock=>({target:null,locked:false,previous:false,next:false});

/** Retail creature-list order/range, edge-triggered cycling, manual break and
 * quarter-error tracking. Q/E reverse/forward are the port's control mapping. */
export function stepAimLock(lock:AimLock,aim:AimView,eye:{x:number;y:number;z:number},
  input:PlayerInput,targets:readonly AimTarget[]):void {
  const previous=!!input.cameraLeft,next=!!input.cameraRight;
  const direction=next&&!lock.next?1:previous&&!lock.previous?-1:0;
  lock.previous=previous;lock.next=next;
  if(!aim.active){lock.target=null;lock.locked=false;return;}
  const candidates=targets.filter(t=>{
    const dx=(t.x-eye.x)/32,dy=(t.y-eye.y)/32,dz=(t.z-eye.z)/32;
    return dx*dx+dy*dy+dz*dz<0x1000000;
  });
  let index=candidates.findIndex(t=>t.id===lock.target);
  if(index<0){lock.target=null;lock.locked=false;}
  if(input.moveX!==0||input.moveY!==0){lock.locked=false;return;}
  if(direction&&candidates.length){
    index=index<0 ? (direction>0?0:candidates.length-1)
      : lock.locked ? (index+direction+candidates.length)%candidates.length : index;
    lock.target=candidates[index]!.id;lock.locked=true;
  }
  const target=candidates.find(t=>t.id===lock.target);
  if(!lock.locked||!target)return;
  const dx=target.x-eye.x,dy=target.y-eye.y,dz=target.z-eye.z;
  const yaw=yawOf(dx,dz),pitch=aimAngleDelta(0,yawOf(-dy,Math.hypot(dx,dz)));
  aim.yaw=(aim.yaw+Math.trunc(aimAngleDelta(aim.yaw,yaw)/4))&4095;
  aim.pitch=Math.max(-768,Math.min(768,aim.pitch+Math.trunc((pitch-aim.pitch)/4)));
}
