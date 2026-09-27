import type { DatLevel } from '../formats/dat.ts';
import type { PickupState } from './pickups.ts';
import { sin } from './trig.ts';

/** FUN_0042e1d0: five near parts, two quarter-scale far parts, and token 0x74.
 * This helper moves artwork/pickup coordinates, not a collision hull. */
export const TARMAC_HELICOPTER_OBJECTS = [3, 48, 49, 50, 66, 67, 68, 116];
export function createTarmacHelicopter(dat: DatLevel) {
  return { phase: 0, nextPhase: 0, ticks: 0,
    // DAT_0052ff7c: initially zero; the separate light puzzle lowers it.
    height: 0,
    objects: TARMAC_HELICOPTER_OBJECTS.map(id => {
      const index = dat.objectIds[id];
      const object = index === undefined ? undefined : dat.objects[index];
      if (!object || index === undefined) throw Error(`Missing helicopter object ${id}`);
      return { id, index, scale: object.unitScale, rest: { ...object.position },
        angles: [object.rotation.x, object.rotation.y, object.rotation.z] as const };
    }),
  };
}
export type TarmacHelicopter = ReturnType<typeof createTarmacHelicopter>;

/** Positions are level units in the original axes. Preserve the helper's
 * truncating division, arithmetic shifts, and distinct token hover amplitude. */
export function helicopterPoses(state: TarmacHelicopter) {
  const wave = sin(state.phase);
  const hover = Math.trunc(wave / 2) + state.height;
  return state.objects.map(o => {
    const delta = o.id === 116 ? Math.trunc(wave / 4) + state.height - 0xa000
      : o.scale === 4 ? hover >> 2 : hover;
    const position = { x: o.rest.x * o.scale,
      y: ((o.rest.y * 32 + delta) >> 5) * o.scale, z: o.rest.z * o.scale };
    return { ...o, position, angles: o.id === 48 || o.id === 50
      ? [0, (state.phase * 21) & 4095, 0] as const : o.angles };
  });
}

export function stepTarmacHelicopter(state: TarmacHelicopter) {
  state.phase = state.nextPhase;
  state.nextPhase = (state.nextPhase + 0x21) & 4095;
  state.ticks++;
}

/** The original also updates the live pickup record's Y unless collected. */
export function syncHelicopterToken(state: TarmacHelicopter, pickups: PickupState) {
  const pose = helicopterPoses(state).find(o => o.id === 116)!;
  const item = pickups.items.find(i => i.id === 116);
  if (item && !item.collected) Object.assign(item, pose.position);
}
