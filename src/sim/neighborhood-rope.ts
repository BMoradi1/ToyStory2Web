/** Extending Neighborhood rope, native 00418e50/004190c0. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import type {Pole} from './poles.ts';
import type {PlayerState} from './player.ts';
export const NEIGHBORHOOD_ROPE_OBJECTS=[25,27] as const;
export function createNeighborhoodRope(dat:DatLevel,poles:Pole[]){
 const pole=poles[0];if(!pole)throw Error('Missing Neighborhood rope');
 const objects=NEIGHBORHOOD_ROPE_OBJECTS.map(id=>{const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing rope artwork ${id}`);const rest={x:o.position.x*o.unitScale*32,y:o.position.y*o.unitScale*32,z:o.position.z*o.unitScale*32};return {id,index,rest,position:{...rest},angles:[o.rotation.x,o.rotation.y,o.rotation.z] as [number,number,number],base:{...o.scale},scale:[1,id===27?0x118/o.scale.y:1,1] as [number,number,number]};});
 const poleRest={...pole},length=pole.bottom-pole.top,height=objects[0]!.rest.y;
 pole.bottom=height;pole.top=height-length;
 return {objects,pole,poleRest,length,height,speed:0};
}
export type NeighborhoodRope=ReturnType<typeof createNeighborhoodRope>;
export function stepNeighborhoodRope(s:NeighborhoodRope,p:PlayerState,sound:(id:number,at:Vec3)=>void){
 if(p.pole===0&&s.speed===0){s.speed=2;s.pole.type=2;sound(0x21,p);}
 if(s.speed<=0)return;
 s.height+=s.speed;s.length+=s.speed;s.speed=Math.min(2048,s.speed+16);
 // Retail clamps the bottom but leaves the final length overshoot intact.
 if(s.height> -0x2500){s.height=-0x2500;s.pole.type=0;s.speed=-1;}
 s.pole.bottom=s.height;s.pole.top=s.height-s.length;
 s.objects[0]!.position.y=(s.height>>5)*32;
 const rope=s.objects[1]!;rope.scale=[4096/rope.base.x,Math.max(0,Math.min(4096,Math.trunc((s.height+0x5826c)*256/0x55d2)))/rope.base.y,4096/rope.base.z];
}
export function restoreNeighborhoodRope(s:NeighborhoodRope){Object.assign(s.pole,s.poleRest);}
