/** Alley bubble machine and moving pole attachments, 0041e390/0041e880. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import {captureCollisionGroup,collisionGroupByObject,transformCollisionGroup,type CollisionWorld} from '../formats/collision.ts';
import {JumpState,type PlayerState} from './player.ts';
import type {Pole} from './poles.ts';
import {sin} from './trig.ts';
export const ALLEY_BUBBLE_OBJECTS=[10,11,12,13,16,17,18,19,20] as const;
const ORIGIN={x:-0xe4433,y:-0xc5a4,z:-0xab32d};
export function createAlleyBubbles(dat:DatLevel,w:CollisionWorld,poles:Pole[]){
 if(poles.length<2)throw Error('Missing Alley bubble attachment points');
 const objects=ALLEY_BUBBLE_OBJECTS.map(id=>{const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing Alley bubble artwork ${id}`);const rest={x:o.position.x*o.unitScale*32,y:o.position.y*o.unitScale*32,z:o.position.z*o.unitScale*32};return {id,index,rest,position:{...rest},angles:[o.rotation.x,o.rotation.y,o.rotation.z] as [number,number,number],scale:[1,1,1] as [number,number,number],baseScale:o.scale};});
 const bubbles=[0,1].map(i=>({phase:i===0?1:0,position:{...ORIGIN},vx:0,vy:0,vz:0,pole:poles[i]!,poleRest:{...poles[i]!},height:poles[i]!.bottom-poles[i]!.top,objects:[objects.find(o=>o.id===12+i*6)!,objects.find(o=>o.id===13+i*6)!],cycles:0}));
 for(const b of bubbles)for(const [i,o] of b.objects.entries()){const shift=i?7:5;o.position={x:(ORIGIN.x>>shift)*(1<<shift),y:(ORIGIN.y>>shift)*(1<<shift),z:(ORIGIN.z>>shift)*(1<<shift)};o.angles=[0,0,0];o.scale=[0,0,0];}
 return {objects,bubbles,button:captureCollisionGroup(w,collisionGroupByObject(w,4)),active:false,motor:0,spin:0,tilt:0,tiltSpeed:0,returning:false,pulse:0,guide:false,sounds:[] as {event:number;at:Vec3}[]};
}
export type AlleyBubbles=ReturnType<typeof createAlleyBubbles>;
export function stepAlleyBubbles(s:AlleyBubbles,w:CollisionWorld,p:PlayerState){
 s.sounds.length=0;s.guide=false;
 if(p.coyote!==0)for(const b of s.bubbles)b.pole.type=0;
 if(!s.active&&p.onGround&&(p.stompImpact||p.stomp!==0)&&p.contacts.some(c=>c.group===s.button.groupIndex&&c.normal.y<-.75)){
  s.active=true;s.guide=true;const o=s.button.origin;transformCollisionGroup(w,s.button,{x:o.x,y:o.y+3600/32,z:o.z},0);
  for(const id of [16,17]){const o=s.objects.find(o=>o.id===id)!;o.scale=[4096/o.baseScale.x,2400/o.baseScale.y,4096/o.baseScale.z];}
 }
 if(s.active){
  s.motor=Math.min(128,s.motor+1);s.spin+=s.motor;
  s.sounds.push({event:0xa3,at:s.objects.find(o=>o.id===10)!.rest});
  if(!s.returning){if(s.tilt<512)s.tiltSpeed=Math.min(32,s.tiltSpeed+1);else if(--s.tiltSpeed<0){s.returning=true;s.tiltSpeed=0;}s.tilt+=Math.trunc(s.tiltSpeed/8);}
  else{if(s.tilt<385){if(--s.tiltSpeed<0){s.returning=false;s.tiltSpeed=0;}}else s.tiltSpeed=Math.min(32,s.tiltSpeed+1);s.tilt-=Math.trunc(s.tiltSpeed/8);}
  for(const id of [10,11,20])s.objects.find(o=>o.id===id)!.angles=[0,-s.tilt,id===20?s.spin*-2:0];
  s.pulse=(s.pulse+1)&511;
  for(const [i,b] of s.bubbles.entries())if(s.pulse>32+i*256&&s.pulse<40+i*256&&b.phase===0){b.phase=1;s.sounds.push({event:0xa0,at:{...b.position}});}
 }
 for(const [i,b] of s.bubbles.entries()){
  if(b.phase<=0){
   b.pole.type=3;
   if(b.phase<0){
    b.phase=0;b.position={...ORIGIN};b.vx=b.vy=b.vz=0;b.cycles++;
    for(const [j,o] of b.objects.entries()){const shift=j?7:5;o.position={x:(b.position.x>>shift)*(1<<shift),y:(b.position.y>>shift)*(1<<shift),z:(b.position.z>>shift)*(1<<shift)};o.scale=[0,0,0];}
    if(p.pole===i){p.poleLock=i;p.pole=-1;p.jumpState=JumpState.Released;p.onGround=false;p.coyote=0;}
   }
   continue;
  }
  const amplitude=Math.trunc(sin((b.phase*3)&4095)/256)+4096;b.phase+=32;
  const wobble=Math.trunc(sin(b.phase&4095)/128);
  let xz=amplitude,y=4096;
  if(b.phase<4096){xz=Math.trunc(b.phase*amplitude/4096);y=b.phase;b.pole.type=3;}
  else{
   if(b.position.y> -0xecb4)b.pole.type=3;
   b.vy=b.position.y< -0x1d713?Math.min(512,b.vy+16):Math.max(-512,b.vy-16);
   if(Math.abs(b.position.y+0x1ccf0)<20000&&s.active)b.vx=Math.max(-700,b.vx-16);
   b.position.x+=b.vx;b.position.y+=b.vy;b.position.z+=b.vz;
   if(b.position.x< -0x108d51){xz=y=5500;b.phase=-1;s.sounds.push({event:0xb,at:{...s.bubbles[0]!.position}});}
  }
  for(const [j,o] of b.objects.entries()){
   o.scale=[xz/o.baseScale.x,y/o.baseScale.y,xz/o.baseScale.z];o.angles=[0,wobble,0];
   if(b.phase>=4096||b.phase<0){const shift=j?7:5;o.position={x:(b.position.x>>shift)*(1<<shift),y:(b.position.y>>shift)*(1<<shift),z:(b.position.z>>shift)*(1<<shift)};}
  }
  if(p.pole===i){p.x=b.position.x;p.z=b.position.z;p.y+=b.position.y-b.pole.top;b.pole.type=3;}
  b.pole.x=b.position.x;b.pole.z=b.position.z;b.pole.top=b.position.y;b.pole.bottom=b.position.y+b.height;
 }
}
export function restoreAlleyBubbles(s:AlleyBubbles,w:CollisionWorld){transformCollisionGroup(w,s.button,s.button.origin,0);for(const b of s.bubbles)Object.assign(b.pole,b.poleRest);}
