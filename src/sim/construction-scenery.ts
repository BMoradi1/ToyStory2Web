/** Proximity-controlled scenery at the start of 0041c640. */
import type {DatLevel,Vec3,Zone} from '../formats/dat.ts';
export const CONSTRUCTION_SCENERY_OBJECTS=[63,64] as const;
export const CONSTRUCTION_SCENERY_POINT={x:0x51b97,y:-0x104fd,z:0x5e58e};
export function createConstructionScenery(dat:DatLevel){
  // 0054f39c is the renderer's 32-byte-per-room portal list, not a
  // texture table. 0041c190 moves the room-1 -> room-2 entry to the end so
  // 0041c640 can terminate that list early while Buzz is far from the door.
  const outside=dat.zones.filter(p=>p.from===1),inside=dat.zones.filter(p=>p.from===2);
  const door=outside.map(p=>p.to).lastIndexOf(2),last=outside.length-1;
  if(door<0||inside.length<2)throw Error('Missing Construction trailer portals');
  [outside[door],outside[last]]=[outside[last]!,outside[door]!];
  const others=dat.zones.filter(p=>p.from!==1);
  const far:Zone[]=[...outside.slice(0,-1),...others];
  // Only the aperture IDs swap; each entry keeps its destination byte.
  const near:Zone[]=[...outside,...others.map(p=>p===inside[0]?{...p,corners:inside[1]!.corners}
    :p===inside[1]?{...p,corners:inside[0]!.corners}:p)];
  return {height:4096,near:false,portals:{near,far},objects:CONSTRUCTION_SCENERY_OBJECTS.map(id=>{
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

export function constructionPortals(s:ConstructionScenery):readonly Zone[]{return s.near?s.portals.near:s.portals.far;}
