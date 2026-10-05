/** Underwater view scale: 004a328e -> 0044f820 -> 004ce050 / 004bbab0. */
export type CameraScale=readonly [number,number,number];
const UNIT:CameraScale=[1,1,1];
// The PC table is float sin(index * float(2*pi/65536)); it is separate
// from the gameplay's 4096-entry fixed-point sine table.
const ANGLE=Math.fround(2*Math.PI/65536),AMPLITUDE=Math.fround(.05);
export function waterCameraScale(phase:number,waterY:number|null,kind:number,cameraY:number):CameraScale{
  if(waterY===null||kind!==1||((waterY-cameraY)>>4)+128>0)return UNIT;
  const scale=(angle:number)=>Math.fround(1+Math.fround(Math.sin((angle&65535)*ANGLE))*AMPLITUDE);
  return [scale(phase),scale(phase-32768),scale(phase*2)];
}
/** 00441917 advances the PC phase by trunc(dt * 65536 / 360). */
export function advanceWaterCameraPhase(phase:number,dt=1):number{return (phase+Math.trunc(dt*65536/360))&65535;}
