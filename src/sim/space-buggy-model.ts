/** Mode 0x31 drives model 25 (004124ba); 0042422c hides it when idle. */
import type {DatLevel} from '../formats/dat.ts';
import type {Effect} from './effects.ts';
export const SPACE_BUGGY_MODEL=25;
const hidden={x:-0x2a6d*32,y:-0x4962*32,z:0x25e1*32};
export function createSpaceBuggyModel(dat:DatLevel){
  const index=dat.objectIds[SPACE_BUGGY_MODEL]!,o=dat.objects[index];if(!o)throw Error('Missing Space Land buggy projectile model');
  return {index,rest:{x:o.position.x*o.unitScale*32,y:o.position.y*o.unitScale*32,z:o.position.z*o.unitScale*32},
    position:{...hidden},angles:[o.rotation.x,o.rotation.y,o.rotation.z] as [number,number,number],active:false};
}
export type SpaceBuggyModel=ReturnType<typeof createSpaceBuggyModel>;
export function stepSpaceBuggyModel(s:SpaceBuggyModel,effects:readonly Effect[]){
  s.active=false;
  // Every live record writes the same model; the final pool slot wins.
  for(const e of effects)if(e.kind===114&&e.life>0){
    s.active=true;s.position={x:e.x>>5<<5,y:e.y>>5<<5,z:e.z>>5<<5};
    s.angles=[0,(e.gravity+1024)&4095,e.pitch];
  }
  if(!s.active)s.position={...hidden};
}
