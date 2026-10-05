/** 0041d680..0041d712: ground-level mud volume, game units. */
import type {Vec3} from '../formats/dat.ts';
export const CONSTRUCTION_MUD={xMin:-0x5c801,xMax:0x15f9f,zMin:-0x83718,zMax:-0x10e28,ceiling:-0x8d8a,surface:-0x7a78} as const;
export function constructionMudY(p:Vec3):number|null{
  const b=CONSTRUCTION_MUD;
  return p.x>b.xMin&&p.x<b.xMax&&p.z>b.zMin&&p.z<b.zMax&&p.y>=b.ceiling?b.surface:null;
}
