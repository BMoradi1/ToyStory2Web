/**
 * The follow camera, ported from `FUN_004045e0` in toy2.exe.
 *
 * The decode is docs/CAMERA.md, which carries the whole function with its
 * numbers; this is that written out. The shape of it:
 *
 *   - a **yaw** that lags Buzz's facing while he moves and eases behind him
 *     once he has stood still long enough;
 *   - a **pitch** that rests at 0x40 and is pushed up or down by what three
 *     short rays find around the camera, which is also what slides the view
 *     sideways out of a corner rather than pulling it into Buzz's head;
 *   - a **distance** that a blocked line sets outright and that walks back
 *     out at 32 level units a tick;
 *   - two **height followers** that track Buzz upward and while he runs, but
 *     not while he falls, so stepping off a ledge leaves the camera high;
 *   - and a **position** that eases toward all of that at an eighth a tick
 *     rather than being placed on it, which is what makes the view calm.
 *
 * Game units (32 per level unit), +Y down, 12-bit yaw — the controller's
 * conventions — EXCEPT `distance`, which is in level units because the
 * original keeps it that way and every constant around it is in that space.
 * The camera struct in the original is at 0x52f3a0; field offsets are given
 * so values can be checked against a debugger.
 */
import { sweepSphere, type CollisionWorld } from '../formats/collision.ts';
import { GAME_UNITS_PER_LEVEL_UNIT } from './player-constants.ts';
import { cos, idiv, sin, YAW_MASK, yawDelta, yawOf } from './trig.ts';
import type { PlayerState } from './player.ts';

const S = GAME_UNITS_PER_LEVEL_UNIT;

export const CAMERA = {
  /**
   * Resting distance behind Buzz, LEVEL units. `DAT_0050a128`, set once to
   * 0x4b0 by `FUN_00403450` and never changed.
   */
  distance: 0x4b0,
  /** The distance walks back out at `dt << 5` level units a tick. */
  distanceRate: 32,
  /**
   * How close a blocked line may pull it in, level units. The engine's own
   * floor; safe here only because the side rays and the auto-turn below now
   * slide the view around a corner instead of into Buzz.
   */
  distanceFloor: 10,

  // --- yaw
  /** While moving, the yaw closes on the facing by `delta / yawLag` a tick. */
  yawLag: 0x2a * 2,
  /** Longer during a skid, so a hard turn does not whip the view. */
  yawLagSkid: 0x60 * 2,
  /** Past this the view swings the SHORT way round, at three times the rate. */
  yawHurryThreshold: 0x600,
  /**
   * A ledge grab, the rocket boots, a hang or the script flag pull the view
   * behind Buzz as well: the delta clamped to `swingClamp`, over `swingLag`.
   */
  swingClamp: 0x200,
  swingLag: 32,
  /** Camera left/right, by hand: `(dt << 5) / 2` a tick. */
  manualTurn: 16,

  // --- standing still and auto-centring
  /** Below this on both horizontal axes Buzz counts as standing. */
  stillSpeed: 4,
  /** `stillFor` jumps this far the first time it passes `settled`. */
  settled: 0x42,
  /** Centring starts here and gathers pace over `centreRamp` ticks. */
  centreDelay: 100,
  centreRamp: 8,
  centreDivisor: 0x180,
  centreTimerMax: 0xf0,
  /** The narrowest and widest centring window, and where it locks wide open. */
  centreWindow: 0x140,
  centreWindowHeld: 0x280,
  centreLocked: 0xa4,
  /** Passive mode centres at a flat rate once settled. */
  passiveCentre: 10,

  // --- pitch
  pitchRest: 0x40,
  pitchRate: 8,
  /** A ceiling overhead lifts it here; a wall in front drops it there. */
  pitchMax: 0x300,
  pitchMin: -0x200,

  // --- sliding out of a corner
  autoTurnRate: 8,
  autoTurnMax: 0x60,
  autoTurnDecay: 16,

  // --- heights
  /** Both followers converge on `player.y - headroom`. */
  headroom: 0x1000,
  /** `h1` may never be further than this from Buzz. */
  heightClamp: 0x4000,
  /** How far the eye sits below the second follower before the pitch lift. */
  eyeDrop: 0x2000,

  // --- easing
  /**
   * `DAT_0052ad98`. The position and the view angles ease by
   * `delta * dt / (smooth * 2 >> 2)`, so an eighth a tick at rest. Level 1's
   * tick sets 0x40 for a slow pull-back and it decays 2 a tick to 0x10.
   */
  smoothRest: 0x10,
  smoothDecay: 2,

  // --- rays
  /** Radius of the three short rays, game units. */
  rayRadius: 200,
  /** How far to either side, below and above the camera they are cast. */
  raySide: 0x800,
  rayDrop: 0xf00,
  rayLift: 0xc00,
  /** The standing ray's radius ramps from here to `standoffMax`. */
  standoffBase: 200,
  standoffStep: 0x50,
  standoffMax: 0xb18,
  /** The long ray leaves Buzz from here. */
  standingEye: 0x1f00,
  /** A side hit whose normal is at least this far down is a ceiling, 2.14. */
  ceilingNormal: 12000 / 0x4000,

  // --- what the camera looks at
  lookAbove: 0x1800,
  /** Inside this distance the view aims steeper, by `(reachNear - d) * 2`. */
  reachNear: 400,
  /** Within 400 level units of his head the camera is lifted onto that sphere. */
  tooCloseSq: 160000,
} as const;

/** What the three short rays found. Kept so the passive turn can read it. */
export const RAY = { left: 1, right: 2, up: 4, ceiling: 8 } as const;

export interface CameraState {
  /** `+0x00`: where the camera is, game units. Eased toward `wanted`. */
  x: number; y: number; z: number;
  /** `+0x0c`: where it wants to be this tick. */
  wantX: number; wantY: number; wantZ: number;
  /** `+0x18`, `+0x1c`: Buzz's height, followed once and then again. */
  h1: number; h2: number;
  /** `+0x20`, `+0x22`: the direction the view looks, eased. */
  viewPitch: number; viewYaw: number;
  /** `+0x26`: follow distance, LEVEL units. */
  distance: number;
  /** `+0x28`: which side of Buzz the camera is on. */
  yaw: number;
  /** `+0x2e`: how high it sits. 0x40 at rest. */
  pitch: number;
  /** `+0x32`: what the rays found, as a `RAY` mask. */
  mode: number;
  /** `DAT_0050a534`: how long Buzz has stood still. */
  stillFor: number;
  /** `DAT_0050a4b4`: the sideways drift out of a corner. */
  autoTurn: number;
  /** `DAT_0050a4e4`: the centring window, latched when centring starts. */
  turnRate: number;
  /** `DAT_0052ad98`: how slowly the position and view angles follow. */
  smooth: number;
  /** `DAT_0050a12c`: last tick's ray mask, which passive mode reads. */
  rayFlags: number;
  /**
   * `DAT_0050a118`: a point a script asked the view to turn toward, taken
   * once and cleared.
   */
  lookAt: { x: number; y: number; z: number } | null;
  /** `DAT_0050a510`: a shake, which tilts the view as it decays. */
  shake: number;
}

export function createCamera(p: PlayerState): CameraState {
  const camera: CameraState = {
    x: p.x, y: p.y, z: p.z,
    wantX: p.x, wantY: p.y, wantZ: p.z,
    h1: p.y - CAMERA.headroom, h2: p.y - CAMERA.headroom,
    viewPitch: 0, viewYaw: p.yaw,
    distance: CAMERA.distance,
    yaw: p.yaw,
    pitch: CAMERA.pitchRest,
    mode: 0,
    stillFor: 0, autoTurn: 0, turnRate: CAMERA.centreWindow,
    smooth: CAMERA.smoothRest, rayFlags: 0, lookAt: null, shake: 0,
  };
  place(camera, p);
  camera.x = camera.wantX; camera.y = camera.wantY; camera.z = camera.wantZ;
  aim(camera, p, true);
  return camera;
}

/** Where the camera wants to be, from its yaw, pitch, distance and height. */
function place(camera: CameraState, p: PlayerState): void {
  // `r = C(pitch) * distance >> 14` is the horizontal reach; the >> 9 against
  // the 0x4000 sine table is what turns level units into game units.
  const r = (cos(camera.pitch) * camera.distance) >> 14;
  camera.wantX = p.x - idiv(sin(camera.yaw) * r, 512);
  camera.wantZ = p.z - idiv(cos(camera.yaw) * r, 512);
  camera.wantY = camera.h2 - CAMERA.eyeDrop
    + idiv(sin((camera.pitch - 0x800) & YAW_MASK) * camera.distance, 512);
}

/**
 * Cast one of the camera's rays. Returns how much of `delta` was clear, as a
 * fraction, and the normal of whatever stopped it.
 *
 * The original's `FUN_0048c860` is a ray with a thickness — its fifth
 * argument, which it expands by 1.39 for the broadphase — so a swept sphere
 * of that radius is the same query.
 */
function cast(
  world: CollisionWorld,
  from: { x: number; y: number; z: number },
  delta: { x: number; y: number; z: number },
  radius: number,
): { fraction: number; normalY: number } {
  const whole = Math.hypot(delta.x, delta.y, delta.z);
  if (whole < 1) return { fraction: 1, normalY: 0 };
  const swept = sweepSphere(world, from, delta, radius, { scale: S, passes: 1 });
  const travelled = Math.hypot(swept.x - from.x, swept.y - from.y, swept.z - from.z);
  if (!swept.touched || travelled >= whole) return { fraction: 1, normalY: 0 };
  return { fraction: travelled / whole, normalY: swept.contacts[0]?.normal.y ?? 0 };
}

/**
 * Advance the camera one tick.
 *
 * `world` is optional: without it the camera ignores scenery, which is what
 * the offline tests want.
 */
export function stepCamera(
  camera: CameraState, p: PlayerState, world: CollisionWorld | null,
  input: { cameraLeft: boolean; cameraRight: boolean } = { cameraLeft: false, cameraRight: false },
  options: { passive?: boolean; centre?: boolean } = {},
): void {
  const dt = 1;
  const passive = options.passive ?? false;
  const centre = options.centre ?? false;

  // The distance always walks back out toward its resting value; a blocked
  // line below overwrites it. Easing the DISTANCE rather than moving the
  // camera is the whole trick: the camera never teleports when a line clears.
  if (camera.distance > CAMERA.distance) {
    camera.distance = Math.max(CAMERA.distance, camera.distance - CAMERA.distanceRate * dt);
  } else if (camera.distance < CAMERA.distance) {
    camera.distance = Math.min(CAMERA.distance, camera.distance + CAMERA.distanceRate * dt);
  }

  const manual = (input.cameraRight ? 1 : 0) - (input.cameraLeft ? 1 : 0);
  const still = Math.abs(p.vx) < CAMERA.stillSpeed && Math.abs(p.vz) < CAMERA.stillSpeed
    && p.coyote > 0;

  if (still) {
    standing(camera, p, world, manual, passive, centre, dt);
  } else {
    moving(camera, p, world, manual, passive, centre, dt);
  }

  // --- place, then ease toward it ------------------------------------------
  place(camera, p);
  if (camera.smooth > CAMERA.smoothRest) {
    camera.smooth = Math.max(CAMERA.smoothRest, camera.smooth - CAMERA.smoothDecay * dt);
  }
  if (centre) {
    camera.x = camera.wantX; camera.y = camera.wantY; camera.z = camera.wantZ;
  } else {
    const ease = (camera.smooth * 2) >> 2;
    camera.x -= idiv((camera.x - camera.wantX) * dt, ease);
    camera.y -= idiv((camera.y - camera.wantY) * dt, ease);
    camera.z -= idiv((camera.z - camera.wantZ) * dt, ease);
  }

  aim(camera, p, centre);

  // Moving only: if the line from the camera to Buzz is blocked, pull in.
  if (!still && world) {
    const head = { x: p.x, y: p.y - CAMERA.lookAbove, z: p.z };
    const delta = { x: head.x - camera.x, y: head.y - camera.y, z: head.z - camera.z };
    const { fraction } = cast(world, camera, delta, CAMERA.rayRadius);
    if (fraction < 1) {
      // Read from the machine code (docs/CAMERA.md): the cast shortens the
      // line to the wall, and what is subtracted is THAT length — how far
      // the camera is from the wall — so the new follow distance is the
      // wall's own distance from Buzz. Under 300 level units the camera is
      // also put on the wall this tick rather than easing there.
      const toWall = (Math.hypot(delta.x, delta.y, delta.z) * fraction) / S;
      camera.distance = Math.max(CAMERA.distanceFloor, camera.distance - Math.round(toWall));
      if (toWall < 300) {
        camera.x += delta.x * fraction;
        camera.y += delta.y * fraction;
        camera.z += delta.z * fraction;
      }
    }
  }

  // Too close to Buzz: put the camera on a sphere of radius 400 level units
  // around his head. `k = sqrt(400^2 - dx^2 - dz^2)` is the height that
  // does it, and the eye goes to `head - k`, above him. Read from the
  // machine code, which Ghidra had folded into a bare float conversion.
  const dx = (p.x - camera.x) >> 5, dy = (p.y - camera.y - CAMERA.headroom) >> 5;
  const dz = (p.z - camera.z) >> 5;
  if (dx * dx + dy * dy + dz * dz < CAMERA.tooCloseSq) {
    const k = Math.trunc(Math.sqrt(Math.max(0, CAMERA.tooCloseSq - dx * dx - dz * dz)));
    camera.y = p.y - CAMERA.headroom - k * S;
  }
}

/** Buzz is standing: hold the view, and ease behind him once he settles. */
function standing(
  camera: CameraState, p: PlayerState, world: CollisionWorld | null,
  manual: number, passive: boolean, centre: boolean, dt: number,
): void {
  camera.stillFor += dt;
  // The timer skips the first time it crosses `settled`, so the ramp below
  // starts from a standing position rather than from the moment you stop.
  if (camera.stillFor - dt < CAMERA.settled && camera.stillFor > CAMERA.settled - 1) {
    camera.stillFor += CAMERA.settled;
  }
  const settled = camera.stillFor > CAMERA.centreTimerMax - 1;
  if (settled) camera.stillFor = CAMERA.centreTimerMax;

  let turned = false;
  if (passive) {
    if (centre) camera.yaw = p.yaw;
    if (manual !== 0) {
      camera.yaw = (camera.yaw + manual * CAMERA.manualTurn * dt) & YAW_MASK;
      camera.stillFor = CAMERA.settled;
      turned = true;
    } else if (settled) {
      turned = ease(camera, p.yaw, CAMERA.passiveCentre * dt);
    }
  } else {
    // Active: the window is latched when the timer first reaches the delay,
    // widened while a camera button is held, and pinned wide once settled.
    const window = manual !== 0 ? CAMERA.centreWindowHeld : CAMERA.centreWindow;
    if (camera.stillFor >= CAMERA.centreDelay && camera.stillFor - dt < CAMERA.centreDelay) {
      camera.turnRate = yawDelta(p.targetYaw, camera.yaw);
    }
    if (Math.abs(camera.turnRate) < window) camera.turnRate = window;
    if (camera.stillFor > CAMERA.centreLocked) camera.turnRate = window;
    if (camera.stillFor >= CAMERA.centreDelay) {
      const stage = Math.min(CAMERA.centreRamp, camera.stillFor - CAMERA.centreDelay);
      const step = idiv(Math.abs(camera.turnRate) * stage, CAMERA.centreDivisor) * dt;
      if (step > 0) turned = ease(camera, p.targetYaw, step);
    }
  }
  if (turned) restPitch(camera, dt);

  // Heights: standing, both followers always run.
  camera.h1 -= (camera.h1 - p.y + CAMERA.headroom) >> 5;
  camera.h2 -= ((camera.h2 - camera.h1) * dt) >> 4;
  takeLookAt(camera, p);

  // One fat ray out to the RESTING distance. Its radius ramps as Buzz
  // settles, from a thin line to nearly three of his own widths, so a
  // camera that has come to rest sits well clear of the scenery.
  if (!world) return;
  const standoff = camera.stillFor < CAMERA.settled
    ? idiv(camera.stillFor, 2) * CAMERA.standoffStep + CAMERA.standoffBase
    : CAMERA.standoffMax;
  const r = (cos(camera.pitch) * CAMERA.distance) >> 14;
  const from = { x: p.x, y: p.y - CAMERA.standingEye, z: p.z };
  const delta = {
    x: -idiv(sin(camera.yaw) * r, 512),
    y: camera.h2 - p.y + idiv(sin((camera.pitch - 0x800) & YAW_MASK) * CAMERA.distance, 512),
    z: -idiv(cos(camera.yaw) * r, 512),
  };
  const { fraction } = cast(world, from, delta, standoff);
  if (fraction < 1) {
    // The distance becomes the length of the shortened line, in level units.
    const toWall = (Math.hypot(delta.x, delta.y, delta.z) * fraction) / S;
    camera.distance = Math.max(CAMERA.distanceFloor, Math.round(toWall));
  }
}

/** Buzz is moving: lag behind his facing, and read the walls around us. */
function moving(
  camera: CameraState, p: PlayerState, world: CollisionWorld | null,
  manual: number, passive: boolean, centre: boolean, dt: number,
): void {
  camera.stillFor = 0;

  // Heights. `h1` never strays far from Buzz, and follows him only while he
  // runs on the ground or RISES — so a jump brings the view up with him and
  // stepping off a ledge leaves it high enough to see the drop.
  if (camera.h1 + CAMERA.heightClamp < p.y) camera.h1 = p.y - CAMERA.heightClamp;
  if (p.y < camera.h1 - CAMERA.heightClamp) camera.h1 = p.y + CAMERA.heightClamp;
  if ((p.coyote > 0 && p.forwardSpeed !== 0) || p.y < camera.h1 + CAMERA.headroom) {
    camera.h1 -= (camera.h1 - p.y + CAMERA.headroom) >> 5;
  }
  camera.h2 -= ((camera.h2 - camera.h1) * dt) >> 4;

  // Yaw.
  if (passive) {
    if (manual !== 0) {
      // A wall on that side blocks the hand turn, which is what stops you
      // pushing the view into the scenery.
      const blocked = manual > 0
        ? (camera.rayFlags & (RAY.right | RAY.ceiling)) === (RAY.right | RAY.ceiling)
        : (camera.rayFlags & (RAY.left | RAY.ceiling)) === (RAY.left | RAY.ceiling);
      if (!blocked) camera.yaw = (camera.yaw + manual * CAMERA.manualTurn * dt) & YAW_MASK;
    }
    if (centre) camera.yaw = p.yaw;
  } else {
    let delta = yawDelta(camera.yaw, p.yaw);
    const lag = p.skid > 0 ? CAMERA.yawLagSkid : CAMERA.yawLag;
    if (Math.abs(delta) > CAMERA.yawHurryThreshold) {
      // Nearly behind us: go the short way, and hurry.
      delta = ((delta > 0 ? 0x800 : -0x800) - delta) * 3;
    }
    camera.yaw = (camera.yaw - idiv(delta * dt, lag)) & YAW_MASK;
  }

  // A ledge grab, the rocket boots, a hang, the grapple or a script flag also
  // pull the view behind Buzz, by the clamped delta over `swingLag`. None of
  // those moves exist yet, so there is nothing to test here.

  // --- the three short rays ------------------------------------------------
  let flags = 0;
  if (world) {
    const r = (cos(camera.pitch) * camera.distance) >> 14;
    const base = {
      x: p.x - idiv(sin(camera.yaw) * r, 512),
      y: camera.h2 + idiv(sin((camera.pitch - 0x800) & YAW_MASK) * camera.distance, 512),
      z: p.z - idiv(cos(camera.yaw) * r, 512),
    };
    const sideX = sin((camera.yaw + 0x400) & YAW_MASK) >> 3;
    const sideZ = sin((camera.yaw - 0x800) & YAW_MASK) >> 3;
    const side = (sign: number, bit: number) => {
      const from = {
        x: base.x + sign * sideX, y: base.y - CAMERA.rayDrop, z: base.z + sign * sideZ,
      };
      const delta = { x: -sign * sideX, y: 0, z: -sign * sideZ };
      const { fraction, normalY } = cast(world, from, delta, CAMERA.rayRadius);
      if (fraction >= 1) return;
      flags |= bit;
      if (normalY > CAMERA.ceilingNormal) flags |= RAY.ceiling;
    };
    side(-1, RAY.left);
    side(1, RAY.right);
    const up = { x: base.x, y: base.y + CAMERA.rayLift, z: base.z };
    if (cast(world, up, { x: 0, y: -CAMERA.rayLift, z: 0 }, CAMERA.rayRadius).fraction < 1) {
      flags |= RAY.up;
    }
  }
  camera.rayFlags = flags;
  camera.mode = modeFor(camera, p, flags);

  // --- what the mode does --------------------------------------------------
  const sides = camera.mode & 3;
  if (sides === 0) {
    // Nothing either side: let the drift die away.
    if (camera.autoTurn > 0) camera.autoTurn = Math.max(0, camera.autoTurn - CAMERA.autoTurnDecay * dt);
    else if (camera.autoTurn < 0) camera.autoTurn = Math.min(0, camera.autoTurn + CAMERA.autoTurnDecay * dt);
  } else {
    if (sides === 1) {
      if (camera.autoTurn > 0) camera.autoTurn = 0;
      camera.autoTurn = Math.max(-CAMERA.autoTurnMax, camera.autoTurn - CAMERA.autoTurnRate * dt);
    }
    if (sides === 2) {
      if (camera.autoTurn < 0) camera.autoTurn = 0;
      camera.autoTurn = Math.min(CAMERA.autoTurnMax, camera.autoTurn + CAMERA.autoTurnRate * dt);
    }
    camera.yaw = (camera.yaw + idiv(camera.autoTurn * dt, 2)) & YAW_MASK;
  }

  if ((camera.mode & RAY.up) !== 0) {
    camera.pitch = Math.max(CAMERA.pitchMin, camera.pitch - CAMERA.pitchRate * dt);
  }
  if ((camera.mode & RAY.ceiling) !== 0) {
    camera.pitch = Math.min(CAMERA.pitchMax, camera.pitch + CAMERA.pitchRate * dt);
  }
  if ((camera.mode & (RAY.up | RAY.ceiling)) === 0) restPitch(camera, dt);

  takeLookAt(camera, p);
}

/**
 * Which of the camera's modes the rays add up to. Bit 8 (a ceiling found by a
 * side ray) counts as both sides; 3 and 7 — boxed in — fall back to how far
 * the view has drifted from Buzz's facing.
 */
function modeFor(camera: CameraState, p: PlayerState, flags: number): number {
  const boxed = (flags & RAY.ceiling) !== 0 ? 3 : flags & 7;
  switch (boxed) {
    case 0: return 0;
    case 1: return RAY.left;
    case 2: return RAY.right;
    case 4: return RAY.ceiling;
    case 5: return (camera.mode & RAY.left) !== 0 ? camera.mode : RAY.ceiling;
    case 6: return (camera.mode & RAY.right) !== 0 ? camera.mode : RAY.ceiling;
    default: break;
  }
  const delta = yawDelta(camera.yaw, p.yaw);
  const size = Math.abs(delta);
  if (size > 0x400) return delta < 1 ? RAY.ceiling | RAY.right : RAY.ceiling | RAY.left;
  if (size > 0x200) return delta < 1 ? RAY.right : RAY.left;
  // Rising fast: look down at him rather than up past him.
  return p.vy < -0x80 ? RAY.up : RAY.ceiling;
}

/** Ease the pitch back to its resting value, snapping the last step. */
function restPitch(camera: CameraState, dt: number): void {
  if (camera.pitch < CAMERA.pitchRest + 1) {
    camera.pitch += CAMERA.pitchRate * dt;
    if (camera.pitch > CAMERA.pitchRest - 1) camera.pitch = CAMERA.pitchRest;
  } else {
    camera.pitch -= CAMERA.pitchRate * dt;
    if (camera.pitch < CAMERA.pitchRest + 1) camera.pitch = CAMERA.pitchRest;
  }
}

/** Turn the yaw toward `want` by at most `step`, snapping on overshoot. */
function ease(camera: CameraState, want: number, step: number): boolean {
  const delta = yawDelta(camera.yaw, want);
  if (delta === 0 || step <= 0) return false;
  camera.yaw = Math.abs(delta) <= step
    ? want
    : (camera.yaw - Math.sign(delta) * step) & YAW_MASK;
  return true;
}

/** A script asked the view to turn toward a point: take an eighth of it. */
function takeLookAt(camera: CameraState, p: PlayerState): void {
  if (!camera.lookAt) return;
  const want = yawOf(camera.lookAt.x - p.x, camera.lookAt.z - p.z);
  camera.yaw = (camera.yaw - (yawDelta(camera.yaw, want) >> 3)) & YAW_MASK;
  camera.lookAt = null;
}

/**
 * Where the view points, eased. The original does not look straight at Buzz:
 * it aims along angles that follow him at the same rate the position does,
 * and it flattens the pitch by comparing SQUARES — `atan2(±dy², reach²)` —
 * which is why the view stays level through a jump instead of tilting after
 * him.
 */
function aim(camera: CameraState, p: PlayerState, snap: boolean): void {
  const dropIn = camera.distance < CAMERA.reachNear
    ? (CAMERA.reachNear - camera.distance) * 2
    : 0;
  const reach = CAMERA.distance - dropIn;
  const bearing = yawOf(p.x - camera.x, p.z - camera.z);
  const rx = (sin(bearing) * reach) >> 14;
  const rz = (cos(bearing) * reach) >> 14;
  const dy = (p.y - camera.y - CAMERA.lookAbove) >> 5;

  let shakeTilt = 0;
  if (camera.shake > 0) {
    const phase = ((camera.shake * -3) & 0x1f) * 0x80;
    shakeTilt = idiv(sin(phase & YAW_MASK), (camera.shake - 0x32) * 0x10);
    camera.shake = Math.max(0, camera.shake - 1);
  }

  const wantPitch = yawOf(-Math.abs(dy) * dy, rx * rx + rz * rz);
  const wantYaw = bearing;
  const ease = Math.max(1, camera.smooth >> 1);
  if (snap) {
    camera.viewPitch = (wantPitch + shakeTilt) & YAW_MASK;
    camera.viewYaw = wantYaw;
    return;
  }
  camera.viewPitch = (camera.viewPitch
    + idiv(yawDelta(camera.viewPitch, (wantPitch + shakeTilt) & YAW_MASK) * -1, ease)) & YAW_MASK;
  camera.viewYaw = (camera.viewYaw
    + idiv(yawDelta(camera.viewYaw, wantYaw) * -1, ease)) & YAW_MASK;
}

/**
 * Where the view is pointing, as a point in front of the camera.
 *
 * The original hands the renderer an eye and two angles; ours takes an eye
 * and a look-at, so the angles are walked out one follow distance.
 */
export function cameraTarget(
  p: PlayerState, camera?: CameraState,
): { x: number; y: number; z: number } {
  if (!camera) return { x: p.x, y: p.y - CAMERA.headroom, z: p.z };
  const reach = CAMERA.distance * S;
  const flat = (cos(camera.viewPitch) * reach) >> 14;
  return {
    x: camera.x + idiv(sin(camera.viewYaw) * flat, 0x4000),
    y: camera.y - idiv(sin(camera.viewPitch) * reach, 0x4000),
    z: camera.z + idiv(cos(camera.viewYaw) * flat, 0x4000),
  };
}
