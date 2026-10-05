/** Proximity-controlled scenery at the start of 0041c640. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
export const CONSTRUCTION_SCENERY_OBJECTS=[63,64] as const;
export const CONSTRUCTION_SCENERY_POINT={x:0x51b97,y:-0x104fd,z:0x5e58e};
export function createConstructionScenery(dat:DatLevel){
  return {height:4096,near:false,objects:CONSTRUCTION_SCENERY_OBJECTS.map(id=>{
    const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing Construction scenery ${id}`);
    return {index,angles:[o.rotation.x,o.rotation.y,o.rotation.z] as const};
  })};
}
export type ConstructionScenery=ReturnType<typeof createConstructionScenery>;
export function stepConstructionScenery(s:ConstructionScenery,p:Vec3){
  // 0049f400 uses signed, downshifted game coordinates and a strict sphere.
  const at=CONSTRUCTION_SCENERY_POINT,dx=(at.x-p.x)>>8,dy=(at.y-p.y)>>8,dz=(at.z-p.z)>>8;
  s.near=dx*dx+dy*dy+dz*dz<250*250;
  s.height=Math.max(0,Math.min(4096,s.height+(s.near?-512:512)));
}
