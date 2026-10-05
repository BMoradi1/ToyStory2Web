/** Footfall sound selector and per-foot source position, 004a3680..004a3741. */
import type {PlayerState} from './player.ts';
import {sin,cos} from './trig.ts';
export function footOffset(yaw:number,mask:number){
 const right=(mask&2)!==0;
 return {x:(right?sin(yaw-1024):cos(yaw))>>4,z:(right?sin(yaw):sin(yaw-2048))>>4};
}
export function playerFootstep(p:PlayerState,mask:number,surface:number,residue:{dripTicks:number;dripKind:number}){
 if(p.coyote===0||(mask&3)===0)return null;
 const offset=footOffset(p.yaw,mask);
 const events:Record<number,number>={31:1,32:3,33:4,54:5};
 const event=surface===-1||residue.dripTicks===0?0:events[residue.dripKind]??0;
 return {event,at:{x:p.x+offset.x*8,y:p.y,z:p.z+offset.z*8}};
}
