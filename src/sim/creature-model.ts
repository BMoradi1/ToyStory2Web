import { GroupType, readHitShapes, type AllFile } from '../formats/all.ts';
import type { CreatureModel } from './creatures.ts';

/** 0043b9b0 initializes every type before 0043aca0 loads optional hit data. */
export function creatureModelGeometry(model: AllFile): CreatureModel {
  const last = model.groups.at(-1);
  if (last?.type === GroupType.HitShapes && last.hitSphere) {
    const shapes = readHitShapes(last);
    if (shapes) return {
      offsetX: last.hitSphere.x, offsetY: last.hitSphere.y, offsetZ: last.hitSphere.z,
      hitRadius: last.hitSphere.radius, shapes,
    };
  }
  // Native default table at 004f6ea0. Missing hit data does not mean missing art.
  return { offsetX: 0, offsetY: 500, offsetZ: 0, hitRadius: 500,
    shapes: [{ offset: { x: 0, y: -250, z: 0 },
      scale: { x: 512, y: 256, z: 512 }, radius: 250 }] };
}
