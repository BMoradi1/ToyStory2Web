/**
 * Camera cuts: the scripted camera the boss fights and the talk box use,
 * decoded 2026-09-07 from `FUN_004020f0` / `FUN_00402290` (start one), the
 * head of `FUN_00402a10` (feed it each tick) and the tail of `FUN_00405860`
 * (blend the rendered camera). docs/CAMERA.md "Cuts".
 *
 * Three pieces of state, all the engine's:
 *
 *   - THE CUT (`DAT_0050a1f4` ticks left, eye `DAT_0050a520..28`, look
 *     `DAT_0050a500..08`). A level tick starts one and is free to keep
 *     moving its eye and look every tick — level 6 pans up and sideways
 *     through its boss's entrance that way.
 *   - THE SCRIPTED CAMERA RECORD (`0x52b7e8`): the eye actually used, easing
 *     an eighth of the way each tick toward the cut's eye, and a yaw and
 *     pitch easing a quarter of the way toward the direction from that eye
 *     to the look point (`FUN_00403640`). The talk box's flights use the
 *     same record.
 *   - THE OUTPUT (`DAT_0052adc0` and its angles): what the renderer gets.
 *     Whenever the "no control" bit flips, a counter (`DAT_0050a140`) is
 *     set to 64 and the output eases from where it was to the new source —
 *     the follow camera or the scripted one — by `counter / 64` a tick. So
 *     a cut blends in over 64 ticks and blends back over 64 more, and a
 *     talk box, which cuts hard on the way in, blends back the same way.
 *
 * A second counter, `DAT_0050a148`, ramps to 0x18 while a cut or talk is
 * up and decays after; the zone code reads it to let the camera's room lead
 * Buzz's (src/sim/zones.ts).
 *
 * The one approximation: the engine eases two ANGLES toward the look
 * direction and the port's renderer takes a look-at POINT, so the look
 * point is eased at the same quarter-a-tick rate instead.
 */
import { GAME_UNITS_PER_LEVEL_UNIT } from './player-constants.ts';
import { sin, yawOf, YAW_MASK } from './trig.ts';

export const CUT = {
  /** `DAT_0050a140` is set to this on every hand-over; the ease is n/64. */
  blend: 0x40,
  /** `DAT_0050a148` climbs to this during a cut, one a tick. */
  zoneBlendMax: 0x18,
  /** The scripted eye closes an eighth of its gap a tick; the look a quarter. */
  eyeShift: 3,
  lookShift: 2,
  /** A cut on the player looks 0x3000 above his feet. */
  headroom: 0x3000,
  /** ...from 0x4000 game units short of him, toward the camera. */
  playerBack: 0x4000,
} as const;

export interface Vec { x: number; y: number; z: number }
const copy = (v: Vec): Vec => ({ x: v.x, y: v.y, z: v.z });

export interface CutState {
  /** `DAT_0050a1f4`: ticks left, 0 when none is running. */
  ticks: number;
  /** The cut's own eye and look, which the level tick may keep moving. */
  eye: Vec;
  look: Vec;
  /** The scripted camera record: the eased eye, its target, the eased look. */
  script: { eye: Vec; eyeTarget: Vec; look: Vec; lookOut: Vec };
  /** `DAT_0052b816 & 1`, the cut's share of it: Buzz does not move. */
  noControl: boolean;
  /** `DAT_0050a140` and `DAT_0050a148`. */
  blend: number;
  zoneBlend: number;
  /** What the renderer was last given, or null before the first frame. */
  out: { eye: Vec; look: Vec } | null;
}

export function createCut(): CutState {
  const z = () => ({ x: 0, y: 0, z: 0 });
  return {
    ticks: 0, eye: z(), look: z(),
    script: { eye: z(), eyeTarget: z(), look: z(), lookOut: z() },
    noControl: false, blend: 0, zoneBlend: 0, out: null,
  };
}

/** `FUN_00402030`: point the scripted camera at a fresh eye and look, no ease. */
function setScript(state: CutState, eye: Vec, look: Vec): void {
  state.script.eye = copy(eye);
  state.script.eyeTarget = copy(eye);
  state.script.look = copy(look);
  state.script.lookOut = copy(look);
}

/**
 * `FUN_004020f0(look, ticks, distance)`: cut to a thing. The eye sits on
 * the line from Buzz to it, `distance` sixteenths of a sine unit short of
 * it (0x10 puts it 0x4000 game units away) at its height. Buzz is frozen,
 * and the output starts a 64-tick blend from wherever it was.
 */
export function startCut(state: CutState, look: Vec, ticks: number, distance: number, player: Vec): void {
  state.noControl = true;
  state.blend = CUT.blend;
  state.look = copy(look);
  const yaw = yawOf(look.x - player.x, look.z - player.z);
  state.eye = {
    x: ((sin((yaw - 0x800) & YAW_MASK) >> 4) * distance) + look.x,
    y: look.y,
    z: ((sin((yaw - 0x400) & YAW_MASK) >> 4) * distance) + look.z,
  };
  state.ticks = ticks;
  setScript(state, state.eye, state.look);
}

/**
 * `FUN_00402290(ticks)`: cut to Buzz himself, 0x3000 above his feet, from
 * 0x4000 short of him along the line from the camera's last position.
 */
export function startCutOnPlayer(state: CutState, ticks: number, player: Vec): void {
  state.noControl = true;
  state.blend = CUT.blend;
  state.look = { x: player.x, y: player.y - CUT.headroom, z: player.z };
  const from = state.out?.eye ?? state.look;
  const yaw = yawOf(player.x - from.x, player.z - from.z);
  state.eye = {
    x: sin((yaw - 0x800) & YAW_MASK) + state.look.x,
    y: state.look.y,
    z: sin((yaw - 0x400) & YAW_MASK) + state.look.z,
  };
  state.ticks = ticks;
  setScript(state, state.eye, state.look);
}

/** The head of `FUN_00402a10`: feed the record and count the cut down. */
export function stepCutClock(state: CutState, dt = 1): void {
  if (state.ticks <= 0) return;
  state.script.look = copy(state.look);
  state.script.eyeTarget = copy(state.eye);
  state.ticks -= dt;
  if (state.ticks < 1) {
    state.ticks = 0;
    state.noControl = false;
    state.blend = CUT.blend;
  }
}

/** The talk box has shut (`FUN_00402a10`'s other exit): blend back. */
export function releaseToFollow(state: CutState): void {
  state.blend = CUT.blend;
}

function ease(out: Vec, target: Vec, n: number): Vec {
  return {
    x: (((out.x - target.x) * n) >> 6) + target.x,
    y: (((out.y - target.y) * n) >> 6) + target.y,
    z: (((out.z - target.z) * n) >> 6) + target.z,
  };
}

/**
 * The tail of `FUN_00405860`: which camera the renderer gets this tick.
 *
 * `follow` is the follow camera's eye and look, stepped whether or not it
 * is in charge (the engine keeps stepping it so it is ready to blend back
 * to). `scripted` is the talk box's eye and look while a box is up, else
 * null; a running cut supplies its own through the record. Returns the eye
 * and look to render.
 */
export function stepCutCamera(
  state: CutState,
  follow: { eye: Vec; look: Vec },
  scripted: { eye: Vec; look: Vec } | null,
  dt = 1,
): { eye: Vec; look: Vec } {
  const held = state.noControl || scripted !== null;
  let target: { eye: Vec; look: Vec };
  if (!held) {
    if (state.zoneBlend > 0) state.zoneBlend = Math.max(0, state.zoneBlend - dt);
    target = follow;
  } else {
    if (state.zoneBlend < CUT.zoneBlendMax) state.zoneBlend = Math.min(CUT.zoneBlendMax, state.zoneBlend + dt);
    if (scripted && state.ticks <= 0) {
      // The talk box drives the record outright.
      target = scripted;
    } else {
      const s = state.script;
      s.eye = {
        x: ((s.eyeTarget.x - s.eye.x) >> CUT.eyeShift) + s.eye.x,
        y: ((s.eyeTarget.y - s.eye.y) >> CUT.eyeShift) + s.eye.y,
        z: ((s.eyeTarget.z - s.eye.z) >> CUT.eyeShift) + s.eye.z,
      };
      s.lookOut = {
        x: ((s.look.x - s.lookOut.x) >> CUT.lookShift) + s.lookOut.x,
        y: ((s.look.y - s.lookOut.y) >> CUT.lookShift) + s.lookOut.y,
        z: ((s.look.z - s.lookOut.z) >> CUT.lookShift) + s.lookOut.z,
      };
      target = { eye: s.eye, look: s.lookOut };
    }
  }

  let out: { eye: Vec; look: Vec };
  if (state.blend < 1 || !state.out) {
    out = { eye: copy(target.eye), look: copy(target.look) };
  } else {
    out = { eye: ease(state.out.eye, target.eye, state.blend), look: ease(state.out.look, target.look, state.blend) };
  }
  if (state.blend > 0) state.blend -= dt;
  state.out = out;
  return out;
}

/** Level units of the eye's move this tick, for a test to watch the pan. */
export function cutEyeSpeed(before: Vec | null, after: Vec): number {
  if (!before) return 0;
  return Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z) / GAME_UNITS_PER_LEVEL_UNIT;
}
