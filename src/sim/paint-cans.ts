/** Construction Yard outdoor lids, 0041bc20 and initialization 0041c190. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import {captureCollisionGroup,collisionGroupByObject,transformCollisionGroup,type CollisionWorld} from '../formats/collision.ts';
import type {Effect} from './effects.ts';
import type {RandomStream} from './creatures.ts';
export const PAINT_CAN_OBJECTS=[36,37,38,54,55,56] as const;
const distance2=(a:Vec3,b:Vec3)=>((a.x-b.x)>>8)**2+((a.y-b.y)>>8)**2+((a.z-b.z)>>8)**2;
export function createPaintCans(dat:DatLevel,w:CollisionWorld){
  const objects=PAINT_CAN_OBJECTS.map(id=>{
    const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing outdoor paint-can object ${id}`);
    const rest={x:o.position.x*o.unitScale*32,y:o.position.y*o.unitScale*32,z:o.position.z*o.unitScale*32};
    return {id,index,rest,position:{...rest},angles:[o.rotation.x,o.rotation.y,o.rotation.z] as const};
  });
  const cans=[10,12,11].map((collision,i)=>({collision,hull:captureCollisionGroup(w,collisionGroupByObject(w,collision)),
    lid:objects[i]!,shadow:objects[i+3]!,clock:i*33,velocity:0,drop:0,period:[300,327,349][i]!,active:true}));
  for(const c of cans){setCanActive(c,w,false);c.shadow.position={...c.lid.position};}
  return {objects,cans};
}
export type PaintCans=ReturnType<typeof createPaintCans>;
function setCanActive(c:PaintCans['cans'][number],w:CollisionWorld,active:boolean){
  if(c.active===active)return;
  c.active=active;
  if(active){transformCollisionGroup(w,c.hull,c.hull.origin,0);return;}
  const indices=new Set(c.hull.polys.map(p=>p.index));
  for(const [key,cell] of w.cells){const keep=cell.filter(i=>!indices.has(i));if(keep.length)w.cells.set(key,keep);else w.cells.delete(key);}
}
export function restorePaintCans(s:PaintCans,w:CollisionWorld){for(const c of s.cans)transformCollisionGroup(w,c.hull,c.hull.origin,0);}
export function stepPaintCans(s:PaintCans,p:Vec3,w:CollisionWorld,host:{
  rand:RandomStream;effect:(at:Vec3,kind:number,mode:number)=>Effect|null;
  sound:(event:number,at:Vec3)=>void;shake:(ticks:number)=>void;
},dt=1){
  for(const c of s.cans){
    if(distance2(c.lid.position,p)>=1152**2)continue;
    c.clock+=dt;const rest=c.lid.rest;
    if(c.clock<50){c.lid.position.y=rest.y-c.clock*1024;setCanActive(c,w,c.clock<5);}
    else if(c.clock<150){c.lid.position.y=rest.y-51200;c.drop=c.velocity=0;}
    else if(c.clock<250){
      c.velocity+=dt*384;c.drop+=c.velocity;
      if(c.drop>51200){
        c.drop=51200;
        if(c.velocity>3000){
          host.effect({...rest,y:rest.y-3072},25,2);host.sound(0x69,rest);
          for(let i=0;i<8;i++){
            const e=host.effect(rest,66,14),rotation=host.rand.byte()<<4,spin=host.rand.byte()-128;
            if(e){e.rotation=rotation;e.spin=spin;}
          }
          const d2=distance2(rest,p);if(d2<500**2)host.shake(40-(Math.trunc(Math.sqrt(d2+1))>>4));
        }
        c.velocity=-Math.trunc(c.velocity/4);
      }
      c.lid.position.y=rest.y-51200+c.drop;setCanActive(c,w,c.drop>=0xb401);
    }else if(c.clock>c.period){c.clock=0;host.sound(0x6a,rest);}
    c.shadow.position={...c.lid.position};
  }
}
