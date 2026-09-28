import type { DatLevel } from '../formats/dat.ts';
import { sin } from './trig.ts';

/** 0042ea97..0042eb79: synchronized near/far scenery, relative to authored angles. */
export const TARMAC_SCENERY_OBJECTS = [69, 70];
export function createTarmacScenery(dat: DatLevel) {
  return { phase: 0, objects: TARMAC_SCENERY_OBJECTS.map(id => {
    const index = dat.objectIds[id];
    const object = index === undefined ? undefined : dat.objects[index];
    if (!object || index === undefined) throw Error(`Missing Tarmac scenery object ${id}`);
    return { id, index, angles: [object.rotation.x, object.rotation.y, object.rotation.z] as const };
  }) };
}
export type TarmacScenery = ReturnType<typeof createTarmacScenery>;
export function sceneryPoses(state: TarmacScenery) {
  const carrier = sin(state.phase * 11);
  const yaw = Math.trunc(sin(state.phase * 17) * carrier / 0x200000);
  const roll = Math.trunc(sin(state.phase * 7) * carrier / 0x400000);
  // 004ccc70 adds these deltas to the original pose, never to the previous tick.
  return state.objects.map(o => ({ ...o,
    angles: [o.angles[0], (o.angles[1] + yaw) & 4095, (o.angles[2] + roll) & 4095] as const }));
}
export function stepTarmacScenery(state: TarmacScenery): void {
  state.phase = (state.phase + 1) & 4095;
}

/** 0042eded..0042eed6: plane and helicopter sources sit 3/4 toward the camera. */
export function aircraftSoundPoint(source: Point, eye: Point): Point {
  return { x: source.x + Math.trunc((eye.x-source.x)*3/4),
    y: source.y + Math.trunc((eye.y-source.y)*3/4),
    z: source.z + Math.trunc((eye.z-source.z)*3/4) };
}
type Point = { x: number; y: number; z: number };
