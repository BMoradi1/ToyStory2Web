/**
 * The follow camera, from `FUN_004045e0` in toy2.exe.
 *
 * Not a full port. That function is 4.7 KB and interleaves the chase camera
 * with mode switching, auto-centring, look-ahead and level-specific cases.
 * What is here is its skeleton and its numbers: where the camera sits, how its
 * yaw lags the player's, and that it does not go through walls. The parts left
 * out are listed at the bottom so the next person knows what is missing rather
 * than guessing from behaviour.
 *
 * Game units, +Y down, 12-bit yaw — the same conventions as the controller.
 * The camera struct in the original lives right after the player block, at
 * 0x52f3a0; field offsets are given so values can be checked in a debugger.
 */
import { groundBelow, sweepSphere, type CollisionWorld } from '../formats/collision.ts';
import { GAME_UNITS_PER_LEVEL_UNIT } from './player-constants.ts';
import { cos, idiv, sin, YAW_MASK, yawDelta } from './trig.ts';
import type { PlayerState } from './player.ts';

const S = GAME_UNITS_PER_LEVEL_UNIT;

export const CAMERA = {
  /**
   * Distance behind the player. `+0x26` in the camera struct, initialised to
   * 0x4b0 = 1200 by `FUN_00403450`, which is in level units — the position
   * build multiplies by the 0x4000-scale sine and shifts right by 9, landing
   * in game units. 1,200 level units is about 2.6 of Buzz's body heights.
   */
  distance: 1200 * S,
  /** How fast the distance eases toward its target: `dt << 5` per tick. */
  distanceRate: 32 * S,
  /**
   * Height above the player. The initialiser clamps the camera to at least
   * 0x4000 game units above the player's origin, and that is the resting
   * framing.
   */
  height: 0x4000,
  /**
   * The camera looks this far above the player's origin — `player.y - 0x1000`
   * in the position build.
   */
  lookAbove: 0x1000,
  /**
   * Yaw lag. The camera turns toward the player's facing by `diff / (0x2a * 2)`
   * per tick, which is a little over one percent: slow enough that running in a
   * circle swings the view behind you rather than snapping it.
   */
  yawLag: 0x2a * 2,
  /** While skidding the lag is longer still, so a hard turn does not whip the view. */
  yawLagSkid: 0x60 * 2,
  /**
   * Past this the camera takes the short way round and hurries, at three times
   * the rate — the original's `if (|diff| > 0x600) diff = (±0x800 - diff) * 3`.
   */
  yawHurryThreshold: 0x600,
  /** Radius of the sphere the camera is swept as, so it cannot enter scenery. */
  radius: 200 * S / 32,

  /**
   * Swinging the camera by hand: `(dt << 5) / 2` per tick, the original's
   * "camera left" and "camera right".
   */
  manualTurn: 16,
  /** A hand turn resets the auto-centre timer to this, so it waits again. */
  centreAfterManual: 0x42,
  /**
   * Auto-centring. While the player is essentially stopped the camera does
   * NOT chase his facing — it holds where it is and a timer runs. Past
   * `centreDelay` it eases behind him, gathering pace over `centreRamp` ticks.
   * At 0xf0 the timer stops climbing. This is why standing still and turning
   * on the spot does not drag the view around with you.
   */
  centreDelay: 100,
  centreRamp: 8,
  centreDivisor: 0x180,
  centreTimerMax: 0xf0,
  /** Below this speed on both axes the player counts as stopped. */
  stillSpeed: 4,
} as const;

export interface CameraState {
  /** `+0x00`, `+0x04`, `+0x08`: where the camera is, game units. */
  x: number; y: number; z: number;
  /** `+0x28`: the camera's own yaw, which lags the player's. */
  yaw: number;
  /** `+0x26`: current follow distance, eased toward `CAMERA.distance`. */
  distance: number;
  /**
   * `DAT_0050a534`: how long the player has been standing still. Drives
   * auto-centring; reset by moving or by turning the camera by hand.
   */
  stillFor: number;
}

export function createCamera(p: PlayerState): CameraState {
  const camera: CameraState = {
    x: p.x, y: p.y, z: p.z, yaw: p.yaw, distance: CAMERA.distance, stillFor: 0,
  };
  place(camera, p);
  return camera;
}

/** Put the camera at its resting offset behind a facing, with no easing. */
function place(camera: CameraState, p: PlayerState): void {
  camera.x = p.x - idiv(sin(camera.yaw) * camera.distance, 0x4000);
  camera.z = p.z - idiv(cos(camera.yaw) * camera.distance, 0x4000);
  camera.y = p.y - CAMERA.height;
}

/**
 * Advance the camera one tick.
 *
 * `world` is optional: without it the camera ignores scenery, which is what the
 * offline tests want.
 */
export function stepCamera(
  camera: CameraState, p: PlayerState, world: CollisionWorld | null,
  input: { cameraLeft: boolean; cameraRight: boolean } = { cameraLeft: false, cameraRight: false },
): void {
  // --- yaw -----------------------------------------------------------------
  // Turning it by hand wins, and puts the auto-centre back on its timer.
  let manual = 0;
  if (input.cameraRight) manual += CAMERA.manualTurn;
  if (input.cameraLeft) manual -= CAMERA.manualTurn;
  if (manual !== 0) {
    camera.yaw = (camera.yaw + manual) & YAW_MASK;
    camera.stillFor = CAMERA.centreAfterManual;
  }

  const still = Math.abs(p.vx) < CAMERA.stillSpeed && Math.abs(p.vz) < CAMERA.stillSpeed
    && p.onGround;

  if (still) {
    // Standing: hold the view where it is and start counting. Only once the
    // timer is past the delay does the camera drift back behind the player,
    // and it gathers pace as the timer climbs. Turning on the spot therefore
    // does not drag the camera round with you, which is the whole point.
    camera.stillFor = Math.min(CAMERA.centreTimerMax, camera.stillFor + 1);
    if (camera.stillFor >= CAMERA.centreDelay && manual === 0) {
      const stage = Math.min(camera.stillFor - CAMERA.centreDelay, CAMERA.centreRamp);
      const offset = yawDelta(camera.yaw, p.yaw);
      const step = idiv(Math.abs(offset) * stage, CAMERA.centreDivisor);
      if (step > 0) {
        camera.yaw = Math.abs(offset) <= step
          ? p.yaw
          : (camera.yaw - Math.sign(offset) * step) & YAW_MASK;
      }
    }
  } else if (manual === 0) {
    camera.stillFor = 0;
    // Moving: lag toward the facing.
    let diff = yawDelta(camera.yaw, p.yaw);
    const lag = p.skid > 0 ? CAMERA.yawLagSkid : CAMERA.yawLag;
    if (Math.abs(diff) > CAMERA.yawHurryThreshold) {
      // Nearly behind us: swing round the short way and hurry.
      diff = ((diff > 0 ? 0x800 : -0x800) - diff) * 3;
    }
    camera.yaw = (camera.yaw - idiv(diff, lag)) & YAW_MASK;
  }

  // --- distance: ease back out after anything pulled it in -----------------
  const wanted = CAMERA.distance;
  if (camera.distance > wanted) camera.distance = Math.max(wanted, camera.distance - CAMERA.distanceRate);
  else if (camera.distance < wanted) camera.distance = Math.min(wanted, camera.distance + CAMERA.distanceRate);

  // --- position ------------------------------------------------------------
  const wantX = p.x - idiv(sin(camera.yaw) * camera.distance, 0x4000);
  const wantZ = p.z - idiv(cos(camera.yaw) * camera.distance, 0x4000);
  const wantY = p.y - CAMERA.height;

  if (!world) {
    camera.x = wantX; camera.y = wantY; camera.z = wantZ;
    return;
  }

  // Do not sit inside the scenery. The original ray-casts from the player out
  // to the camera and pulls it in when the line is blocked; this sweeps the
  // camera's own sphere along the same line, which also stops it grazing a
  // wall it is sliding past.
  const from = { x: p.x, y: p.y - CAMERA.lookAbove, z: p.z };
  const swept = sweepSphere(
    world,
    from,
    { x: wantX - from.x, y: wantY - from.y, z: wantZ - from.z },
    CAMERA.radius,
    { scale: S, passes: 1 },
  );
  camera.x = swept.x;
  camera.y = swept.y;
  camera.z = swept.z;

  // Keep it out of the floor it ended over, so it does not end up under a
  // step. The tolerance has to be small: `groundBelow` will happily return a
  // surface far ABOVE the query point, and with a generous one the camera gets
  // yanked up to the next storey the moment it passes under a landing.
  const floor = groundBelow(world, camera.x / S, camera.y / S, camera.z / S, CAMERA.radius / S);
  if (floor !== null) {
    const limit = floor.y * S - CAMERA.radius;
    if (camera.y > limit) camera.y = limit;
  }
}

/** Where the camera is pointing: the player, raised by the original's offset. */
export function cameraTarget(p: PlayerState): { x: number; y: number; z: number } {
  return { x: p.x, y: p.y - CAMERA.lookAbove, z: p.z };
}

/**
 * Not ported, and worth knowing before trusting this:
 *
 * - the camera **modes** (`FUN_00405860` switches between four, and the menu
 *   strings "camera mode", "camera left" and "camera right" belong to them)
 * - **look-ahead** and the height ramp `DAT_0050a4e0`, which rises to 0xc0 at
 *   2 per tick while the player is grounded and moving
 * - the pitch field `+0x2e`, eased toward 0x40 at 8 a tick, and the smoothed
 *   height in `+0x18`/`+0x1c`; a fixed height stands in for both, which is
 *   why the view does not tilt as Buzz climbs or drops
 * - every level-specific case, of which there are several in the original
 */
