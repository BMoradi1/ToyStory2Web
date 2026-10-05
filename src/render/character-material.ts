import * as THREE from 'three';
import type { MeshGroup } from '../formats/all.ts';
import { GameMaterial } from './game-material.ts';

/** Keep solid body parts in the opaque pass and draw glass after them. */
export function characterMaterial(group: MeshGroup, map?: THREE.Texture, side: THREE.Side = THREE.DoubleSide): GameMaterial {
  const material = new GameMaterial({ map: map ?? null, vertexColors: true, side, alphaTest: 0.5 });
  if (group.blend == null) return material;
  material.transparent = true;
  material.depthWrite = false;
  material.alphaTest = 0;
  // Avoid drawing both sides of the dome as two layers of highlights.
  material.forceSinglePass = true;
  switch (group.blend) {
    case 0: material.opacity = 0.5; break;
    case 1: material.blending = THREE.AdditiveBlending; break;
    case 2:
      material.blending = THREE.CustomBlending;
      material.blendEquation = THREE.ReverseSubtractEquation;
      material.blendSrc = THREE.SrcAlphaFactor;
      material.blendDst = THREE.OneFactor;
      break;
    case 3:
      material.blending = THREE.AdditiveBlending;
      material.opacity = 0.25;
      break;
  }
  return material;
}
