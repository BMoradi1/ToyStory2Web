/** Grab-triggered room-2 rope lowering, 004171d0/00417680. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import type {Pole} from './poles.ts';
import type {PlayerState} from './player.ts';
export const ANDY_ROPE_OBJECT=6;
export function createAndyRope(dat:DatLevel,poles:Pole[]){
 const index=dat.objectIds[ANDY_ROPE_OBJECT]!,o=dat.objects[index],pole=poles[8];
 if(!o||!pole)throw Error('Missing Andy lowering rope');
 const rest={x:o.position.x*o.unitScale*32,y:o.position.y*o.unitScale*32,z:o.position.z*o.unitScale*32};
 return {index,rest,position:{...rest},angles:[o.rotation.x,o.rotation.y,o.rotation.z] as [number,number,number],pole,poleRest:{...pole},height:rest.y,target:rest.y+0xb800,speed:0};
}
export type AndyRope=ReturnType<typeof createAndyRope>;
export function stepAndyRope(s:AndyRope,p:PlayerState,cameraZone:number,sound:(id:number,at:Vec3)=>void){
 if(cameraZone!==2)return;
 if(p.pole===8&&s.speed===0){s.speed=2;sound(0x21,p);}
 if(s.speed<=0)return;
 s.height+=s.speed;
 if(s.height>s.target){s.height=s.target;s.speed=-1;}
 s.pole.bottom=s.poleRest.bottom+s.height-s.rest.y;
 s.pole.top=s.poleRest.top+s.height-s.rest.y;
 s.position.y=(s.height>>5)*32;
 // Retail adds acceleration even after assigning the -1 terminal sentinel.
 s.speed+=32;
}
export function restoreAndyRope(s:AndyRope){Object.assign(s.pole,s.poleRest);}
