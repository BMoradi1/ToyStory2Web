import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {waterCameraScale,advanceWaterCameraPhase} from '../src/sim/water-camera.ts';
import {applyCameraScale} from '../src/render/camera-scale.ts';
for(const y of [-2048,0,2032])assert.deepEqual(waterCameraScale(16384,0,1,y),[1,1,1]);
for(const y of [2033,2048,2049,100000]){
 const [x,v,z]=waterCameraScale(16384,0,1,y);
 assert(Math.abs(x-1.05)<1e-6&&Math.abs(v-.95)<1e-6&&Math.abs(z-1)<1e-6);
}
for(const kind of [0,2,3])assert.deepEqual(waterCameraScale(16384,0,kind,99999),[1,1,1]);
assert.deepEqual(waterCameraScale(16384,null,1,99999),[1,1,1]);
assert.equal(advanceWaterCameraPhase(0),182);assert.equal(advanceWaterCameraPhase(65500),146);
for(let phase=0;phase<65536;phase+=137){
 const scales=waterCameraScale(phase,0,1,2048);for(const n of scales)assert(n>=.9499999&&n<=1.0500001);
 assert.deepEqual(waterCameraScale(phase+65536,0,1,2048),scales);
 // P*S*view is the original view-coordinate scale, including depth.
 const camera=new PerspectiveCamera(60,4/3,.1,1000),before=camera.projectionMatrix.clone();
 applyCameraScale(camera,scales);
 const at=new Vector3(2,3,-15),actual=at.clone().applyMatrix4(camera.projectionMatrix);
 const expected=at.clone().multiply(new Vector3(...scales)).applyMatrix4(before);
 assert(actual.distanceTo(expected)<1e-12);
 assert(camera.projectionMatrix.clone().multiply(camera.projectionMatrixInverse).elements.every((v,i)=>Math.abs(v-(i%5===0?1:0))<1e-12));
 applyCameraScale(camera,[1,1,1]);assert.deepEqual(camera.projectionMatrix.elements,before.elements);
}
console.log('PASS underwater view scale: depth boundary, water-only, native phase wrap, bounded waves, view-space projection equivalence, inverse and restoration');
