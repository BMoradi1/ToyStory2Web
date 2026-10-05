/** Toy Barn surface-8 stomp launcher and surface-9 bounce pad, 00421340. */
import type {DatLevel} from '../formats/dat.ts';
import type {CollisionWorld} from '../formats/collision.ts';
import {JumpState,type PlayerState} from './player.ts';
import {standingSurface} from './stomp-props.ts';
import {sin,cos} from './trig.ts';
export const TOY_BARN_SPRING_OBJECTS=[2,3,30] as const;
export function createToyBarnSprings(dat:DatLevel){
 const objects=TOY_BARN_SPRING_OBJECTS.map(id=>{const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing Toy Barn spring ${id}`);return {id,index,angles:[o.rotation.x,o.rotation.y,o.rotation.z] as [number,number,number],scale:[1,1,1] as [number,number,number],baseScale:o.scale};});
 for(const o of objects)if(o.id!==2)o.scale=[4096/o.baseScale.x,0,4096/o.baseScale.z];
 return {objects,chair:0,bounce:0};
}
export type ToyBarnSprings=ReturnType<typeof createToyBarnSprings>;
function launch(p:PlayerState,vy:number){p.stomp=0;p.stompImpact=false;p.vy=vy;p.onGround=false;p.coyote=0;p.fallTimer=0;p.jumpState=JumpState.Released;p.animPhase=2;}
export function stepToyBarnSprings(s:ToyBarnSprings,p:PlayerState,w:CollisionWorld,host:{guide:()=>void;sound:()=>void}){
 const surface=standingSurface(p,w),chair=s.objects[0]!,coil=s.objects[2]!,bounce=s.objects[1]!;
 // These two artwork writes precede the launcher's timer update in retail.
 chair.angles=[0,0,Math.abs(s.chair)*32];
 coil.scale=[4096/coil.baseScale.x,Math.abs(s.chair)*128/coil.baseScale.y,4096/coil.baseScale.z];
 if(s.chair===0&&surface===8&&p.stompImpact){s.chair=2;host.guide();}
 if(s.chair<0)s.chair=Math.min(0,s.chair+1);
 else if(s.chair>0){
  const before=s.chair++;
  if(before<7&&s.chair>=7){launch(p,-3072);p.vx=sin(0x81e)>>3;p.vz=cos(0x81e)>>3;p.yaw=p.targetYaw=0x81e;p.launched=true;host.sound();}
  if(s.chair>32)s.chair=-32;
 }
 if(surface===9){const stomp=p.stompImpact||p.stomp!==0;launch(p,stomp?-3072:-2432);p.launched=false;s.bounce=1;host.sound();}
 if(s.bounce!==0){
  if(s.bounce<=0x3000){bounce.scale=[1,(sin(s.bounce&4095)>>(((s.bounce>>11)&14)+3))/4096,1];s.bounce+=256;}
  else{s.bounce=0;bounce.scale=[1,0,1];}
 }
}
