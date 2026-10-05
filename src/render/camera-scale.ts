import type {PerspectiveCamera} from 'three';
import type {CameraScale} from '../sim/water-camera.ts';
/** Equivalent to scaling native view coordinates, without distorting the
 * camera's world basis used to orient sprites and calculate controls. */
export function applyCameraScale(camera:PerspectiveCamera,scale:CameraScale):void{
  camera.updateProjectionMatrix();
  const m=camera.projectionMatrix.elements;
  for(let column=0;column<3;column++)for(let row=0;row<4;row++)m[column*4+row]!*=scale[column]!;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}
