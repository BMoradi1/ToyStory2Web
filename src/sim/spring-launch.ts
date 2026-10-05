/** 00434090: vertical bounce without the separate directional-launch mode. */
import {JumpState,type PlayerState} from './player.ts';
import {collisionGroupByObject,type CollisionWorld} from '../formats/collision.ts';
export function springLaunch(p:PlayerState,velocity:number):void{
 p.stomp=0;p.stompImpact=false;p.vy=velocity;p.onGround=false;p.coyote=0;p.fallTimer=0;
 p.jumpState=JumpState.Released;p.animPhase=2;
}
/** Andy's attic spring is push block 4 / collision 3, active in camera room 4. */
export function stepAndySpring(p:PlayerState,w:CollisionWorld,cameraZone:number):boolean{
 if(cameraZone!==4||!p.onGround)return false;
 const group=collisionGroupByObject(w,3);
 if(!p.contacts.some(c=>c.group===group&&c.normal.y<-.75))return false;
 springLaunch(p,p.stompImpact||p.stomp!==0?-3072:-2432);
 return true;
}
