import {buildLevelGeometry, type DatLevel} from '../formats/dat.ts';

/** FUN_004038e0 moves these scene objects from their storage position to Buzz. */
export const AIM_OBJECT_IDS = [0x2d, 0x2e, 0x2f] as const;
export function aimObjectIndices(level: DatLevel): number[] {
  return AIM_OBJECT_IDS.map(id=>level.objectIds[id] ?? -1).filter(i=>i>=0);
}

/** Original visor/arm pieces in camera space, at the retail half scale. */
export function buildAimModel(level: DatLevel) {
  const objects=aimObjectIndices(level).map(i=>({...level.objects[i]!,
    position:{x:0,y:0,z:0},rotation:{x:0,y:3072,z:0},
    scale:{x:2048,y:2048,z:2048},zone:null,
  }));
  return buildLevelGeometry({...level,objects});
}
