/**
 * Buzz's character controller, ported from the original's per-tick update.
 *
 * This is a transcription, not an interpretation. Every branch and constant
 * comes from `FUN_00436220` and the functions it calls in `toy2.exe`, checked
 * against the same code in `psx.exe`; docs/PLAYER.md says which is which and
 * how each was read. Where the original does something odd it is kept and
 * explained rather than tidied.
 *
 * Two conventions carry through from the original and must not be changed
 * halfway:
 *   - positions and velocities are in GAME units, 32 per `level.dat` unit
 *   - **+Y is down**, so jumping is negative and gravity is positive
 *
 * The tick is fixed at 60 Hz. The original scaled every rate by a per-frame
 * tick count and divided it back out after moving; at a fixed rate that factor
 * is 1, so it is gone from here. See docs/PLAYER.md, "Time base".
 *
 * Scope: this is P2.2, the controller. Collision *response* is P2.3, and the
 * `Ground` interface below is the seam. Behind it now sit a floor query, a
 * wall slide and a death plane — enough to walk around a level without
 * leaving it — but not the original's mover, so there is no step height and
 * no ledge handling. See docs/PLAYER.md.
 */
import { sweepSphere, type CollisionWorld } from '../formats/collision.ts';
import {
  ATTACK, COLLISION, DEATH_PLANE_MARGIN, GAME_UNITS_PER_LEVEL_UNIT, MOVE_GROUND,
  MOVE_OVERRIDES, TURN, VERTICAL, type MoveTable,
} from './player-constants.ts';
import { cos, idiv, sin, YAW_MASK, yawDelta, yawOf } from './trig.ts';

/** Jump state, the original's field at `+0x8c`. */
export enum JumpState {
  Grounded = 0,
  Rising = 1,
  Released = 2,
  Falling = 3,
  DoubleJump = 5,
  DoubleJumpReleased = 6,
}

/**
 * What the controller needs of the world.
 *
 * `move` is the original's mover: it sweeps the player's sphere along the
 * velocity and reports where it ended up and what it touched. Note there is no
 * floor query here. In the original, being on the ground is not "is there a
 * floor under me" — it is "did the sweep touch something flatter than 60
 * degrees this tick", which is what makes ledges, steps and slopes behave.
 */
export interface Ground {
  move(
    from: { x: number; y: number; z: number },
    velocity: { x: number; y: number; z: number },
  ): {
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    onGround: boolean;
    groundNormal: { x: number; y: number; z: number } | null;
    /** Collision groups touched, with the face normal. Absent on the stubs. */
    contacts?: { group: number; normal: { x: number; y: number; z: number } }[];
  };
  /** Y past which the player counts as having fallen out of the level. */
  deathY?: number;
}

/** One frame of input. Stick components are -1..1, camera-relative. */
export interface PlayerInput {
  /** Stick right is +1. */
  moveX: number;
  /** Stick away from the camera is +1. */
  moveY: number;
  jump: boolean;
  spin: boolean;
  fire: boolean;
  /** Swing the camera by hand. The original's "camera left"/"camera right". */
  cameraLeft: boolean;
  cameraRight: boolean;
}

export const NO_INPUT: PlayerInput = {
  moveX: 0, moveY: 0, jump: false, spin: false, fire: false,
  cameraLeft: false, cameraRight: false,
};

/**
 * Mutable player state. Field comments give the original's byte offset in the
 * player block at 0x52f300, so a value can be checked against a debugger.
 */
export interface PlayerState {
  /** +0x00, +0x04, +0x08. Game units, +Y down. */
  x: number; y: number; z: number;
  /** +0x68, +0x6c, +0x70. Game units per tick. */
  vx: number; vy: number; vz: number;
  /** +0x0e, 12-bit. */
  yaw: number;
  /** +0x48, 12-bit: where the stick points, in world space. */
  targetYaw: number;
  /** +0x74 along the facing, +0x78 across it. Kept between ticks by the original. */
  forwardSpeed: number;
  lateralSpeed: number;
  /** +0x8c. */
  jumpState: JumpState;
  /** +0x8e: the mover found floor this tick. */
  onGround: boolean;
  /** +0x08/+0x0c of the collision record: the ground contact's normal, or null. */
  groundNormal: { x: number; y: number; z: number } | null;
  /** +0x9c: reloads to 6 on the ground, counts down in the air. */
  coyote: number;
  /**
   * The collision groups this tick's move touched, with the normal of the
   * face that stopped him. The push-block code reads it to work out which
   * block he is leaning on, which is what the engine's per-object contact
   * records are for (docs/LEVELS.md).
   */
  contacts: { group: number; normal: { x: number; y: number; z: number } }[];
  /** +0x98: reduces jump and acceleration while nonzero. */
  /**
   * The hit reaction, `+0x94`: 90 on a blow that costs health, counting down.
   * It is what stops a second hit landing while the first is playing, and
   * what picks the knocked-back animation.
   *
   * The original keeps a second counter beside it at `+0x98`, which gates
   * whether a blow can hurt at all; only one is ported, so this does both
   * jobs. The movement table's "hit stun" row is keyed off it either way.
   */
  hitStun: number;
  /** Out of health: the death animation runs and the level puts Buzz back. */
  dying: boolean;
  /** +0x90: animation phase the controller asks for. */
  animPhase: number;

  /** `DAT_0053c838`: counts up while falling; 0x50 once the fall is long enough to hurt, negative while stunned on landing. */
  fallTimer: number;
  /** `DAT_0053c61c`: this airborne period began with a jump from the ground. */
  jumpedFromGround: boolean;
  /** `DAT_0053c674`: Y at takeoff, for the PC's height-capped double jump. */
  takeoffY: number;

  /** `DAT_0053c5d4`: skid after a hard turn. */
  skid: number;
  /** `DAT_0053c650` spin active, `DAT_0053c83c` spin charge / charged-spin countdown. */
  spin: number;
  spinCharge: number;
  /** `DAT_0053c620` laser phase, `DAT_0053c840` charge. */
  laser: number;
  laserCharge: number;
  /**
   * The charge the laser went off at this tick, or null. `FUN_004a4960` is
   * what the original calls here; the bolt itself is an effect
   * (docs/EFFECTS.md), which the caller spawns.
   */
  laserFired: number | null;

  /**
   * `DAT_0052f34c`: the last place the player stood on ground flat enough to
   * be safe. The original respawns here rather than at the level's spawn, so
   * a fall costs you the ledge you fell from, not the whole level.
   */
  safeX: number; safeY: number; safeZ: number;
  safeYaw: number;

  /**
   * The player has fallen past the level's death plane and should be put back.
   * The controller does not know where the spawn is, so it raises this and the
   * caller decides; the original calls its own respawn from the same place.
   */
  fellOut: boolean;

  /** Set for one tick when the controller fires a sound event. Named as in the effect table. */
  sounds: string[];
}

export function createPlayer(x = 0, y = 0, z = 0, yaw = 0): PlayerState {
  return {
    x, y, z,
    vx: 0, vy: 0, vz: 0,
    yaw, targetYaw: yaw,
    forwardSpeed: 0, lateralSpeed: 0,
    jumpState: JumpState.Grounded,
    onGround: false,
    groundNormal: null,
    coyote: 0,
    contacts: [],
    hitStun: 0,
    dying: false,
    animPhase: 0,
    fallTimer: 0,
    jumpedFromGround: false,
    takeoffY: y,
    skid: 0,
    spin: 0,
    spinCharge: 0,
    laser: 0,
    laserCharge: 0,
    laserFired: null,
    safeX: x, safeY: y, safeZ: z,
    safeYaw: yaw,
    fellOut: false,
    sounds: [],
  };
}

/** Edge detection, standing in for the original's previous-buttons word at 0x52f2fe. */
export interface PlayerRuntime {
  previous: PlayerInput;
}

export function createRuntime(): PlayerRuntime {
  return { previous: { ...NO_INPUT } };
}

/** Is the player in a plain state — no attack, no stun, nothing special? */
function isPlain(p: PlayerState): boolean {
  return p.spin === 0 && p.spinCharge === 0 && p.laser === 0 && p.hitStun <= 0 && p.fallTimer >= 0;
}

/**
 * Build this tick's movement table.
 *
 * The original rebuilds all seven values every tick from the current state
 * and passes them down as an array; the overrides here are the same ones in
 * the same order, so a later state wins over an earlier one exactly as the
 * sequence of `if`s does there.
 */
function moveTableFor(p: PlayerState, analog: number): MoveTable {
  const t: MoveTable = { ...MOVE_GROUND };
  if (p.hitStun > 0) Object.assign(t, MOVE_OVERRIDES.hitStun);
  // The airborne row only replaces forward friction; the original applies it
  // whenever the coyote counter has run out, not merely when off the ground,
  // so a player one tick into a fall still turns with ground authority.
  if (p.coyote === 0) Object.assign(t, MOVE_OVERRIDES.airborne);
  if (p.skid > 0) Object.assign(t, MOVE_OVERRIDES.skidWithInput);

  // Analog magnitude scales the TOP SPEED, not the acceleration: the engine
  // does `top = magnitude * top >> 14` on the way into the turn routine. A
  // half-pressed stick therefore reaches half speed at the same rate.
  t.topSpeed = idiv(analog * t.topSpeed, TURN.stickFullScale);
  return t;
}

/**
 * Turn toward the stick. `FUN_004346c0`.
 *
 * Yaw closes on the target by `min(|diff|, turnRate) / 8` per tick, an
 * exponential approach. Beyond `snapThreshold` it gives up and snaps, which is
 * what produces the skid when you reverse at speed.
 */
function turn(p: PlayerState, t: MoveTable, hasInput: boolean): void {
  if (!hasInput) return;
  const diff = yawDelta(p.targetYaw, p.yaw);
  const size = Math.abs(diff);
  if (size >= TURN.snapThreshold) {
    p.yaw = p.targetYaw;
    // A snap on the ground in a plain state costs a skid. The original gates
    // this on its whole state word being exactly 1 (grounded, nothing else).
    if (p.onGround && isPlain(p) && p.skid === 0) {
      p.skid = TURN.skidTicks;
      p.sounds.push('BUZSKID');
    }
    return;
  }
  const step = idiv(Math.min(size, t.turnRate), TURN.divisor);
  p.yaw = (p.yaw + Math.sign(diff) * step) & YAW_MASK;
}

/**
 * Friction, acceleration and the speed clamps. `FUN_004343d0`.
 *
 * Velocity is decomposed along and across the facing, each component is dragged
 * toward zero, the along component takes the input, both are clamped, and the
 * pair is recomposed. Acceleration adds `accel + forwardFriction` because the
 * friction above has already been taken off, so the net gain with the stick
 * held is exactly `accel`.
 */
function accelerate(p: PlayerState, t: MoveTable, hasInput: boolean): void {
  const s = sin(p.yaw), c = cos(p.yaw);
  // Project. The original works in the sine table's fixed point throughout.
  let forward = idiv(p.vx * s + p.vz * c, 0x4000);
  let lateral = idiv(p.vx * c - p.vz * s, 0x4000);

  if (lateral < 0) lateral = Math.min(0, lateral + t.lateralFriction);
  else if (lateral > 0) lateral = Math.max(0, lateral - t.lateralFriction);

  if (forward < 0) forward = Math.min(0, forward + t.forwardFriction);
  else if (forward > 0) forward = Math.max(0, forward - t.forwardFriction);

  if (hasInput && forward < t.topSpeed) forward += t.forwardAccel + t.forwardFriction;

  lateral = Math.max(-t.topSpeed, Math.min(t.topSpeed, lateral));
  forward = Math.max(-t.forwardClamp, Math.min(t.forwardClamp, forward));
  p.forwardSpeed = forward;
  p.lateralSpeed = lateral;

  p.vx = idiv(lateral * c + forward * s, 0x4000);
  p.vz = idiv(forward * c - lateral * s, 0x4000);
}

/**
 * Jump, double jump and gravity. `FUN_004340d0`.
 *
 * `k` is 2 on land and 4 in water; the original divides every vertical
 * constant by it. Only land is implemented here — nothing has parsed which
 * surfaces are water yet.
 */
function vertical(p: PlayerState, input: PlayerInput, t: MoveTable, k = 2): void {
  if (!input.jump) {
    if (p.onGround) p.jumpState = JumpState.Grounded;
    if (p.jumpState === JumpState.Rising) {
      // Releasing early cuts the rise. This is the whole of the game's
      // short-hop control; without it every jump is the full 1.25 body heights.
      if (p.vy < 0) p.vy = VERTICAL.releaseCut(p.vy, k);
      p.jumpState = JumpState.Released;
    }
    if (p.jumpState === JumpState.DoubleJump) p.jumpState = JumpState.DoubleJumpReleased;
  } else {
    const canDouble =
      (p.jumpState === JumpState.Released &&
        p.vy > VERTICAL.doubleJumpMinRise &&
        p.spinCharge >= 0 &&
        p.coyote === 0 &&
        p.hitStun < 1 &&
        p.fallTimer >= 0) ||
      // The rescue case: walking off a ledge without jumping still allows one
      // jump once the fall has been flagged as long.
      (p.jumpState === JumpState.Grounded && p.fallTimer === 0x50);

    if (canDouble) {
      p.fallTimer = 0;
      const gained = p.takeoffY - p.y; // +Y is down, so a rise is positive here
      p.vy = p.jumpedFromGround && gained > 0
        ? VERTICAL.doubleJumpImpulsePC(gained, k)
        : VERTICAL.doubleJumpImpulse(k);
      p.jumpState = JumpState.DoubleJump;
      p.animPhase = 8;
      p.sounds.push('BUZJMP3');
    }

    if (p.jumpState === JumpState.Rising || p.jumpState >= 4) {
      // Landing with the button still held parks in state 5, so the button
      // has to be released before another jump. No bunny hopping.
      if (p.onGround) p.jumpState = JumpState.DoubleJump;
      else if (p.jumpState === JumpState.DoubleJumpReleased) p.jumpState = JumpState.Falling;
    } else if (p.coyote === 0 || p.spin !== 0 || p.fallTimer === 0x50) {
      if (p.jumpState === JumpState.Released) p.jumpState = JumpState.Falling;
    } else {
      p.vy = t.jumpImpulse;
      p.jumpState = JumpState.Rising;
      p.onGround = false;
      p.coyote = 0;
      p.animPhase = 2;
      p.takeoffY = p.y;
      p.jumpedFromGround = true;
      p.sounds.push('BUZJMP1');
    }
  }

  if (!p.onGround) p.vy += VERTICAL.gravity(k);
  if (p.vy > VERTICAL.terminalVelocity) p.vy = VERTICAL.terminalVelocity;
}

/** Spin attack and its charge. `FUN_00434eb0`, trimmed to the parts that move the player. */
function spinAttack(p: PlayerState, input: PlayerInput, prev: PlayerInput): void {
  if (p.spin > 0) p.spin = Math.max(0, p.spin - 1);

  const pressed = input.spin && !prev.spin;
  if (pressed && p.onGround && p.spin === 0 && p.spinCharge === 0 && p.skid === 0 && isPlain(p)) {
    p.spin = ATTACK.spinTicks;
    p.spinCharge = 1;
    p.laser = 0;
    p.sounds.push('BUZSPIN');
    return;
  }

  if (input.spin && p.spinCharge > 0) {
    // Charging. The original starts reporting the charge whine after 12 ticks.
    p.spinCharge = Math.min(ATTACK.spinChargeTicks, p.spinCharge + 1);
    return;
  }

  if (p.spinCharge < 0) {
    // Charged spin running: 181 ticks spinning then 119 dizzy, counting up to 0.
    p.spinCharge += 1;
    if (p.spinCharge >= -0x77) p.sounds.push('BUZDIZZY');
    if (p.spinCharge >= 0) p.spinCharge = 0;
    return;
  }

  if (p.spinCharge >= ATTACK.spinChargeTicks && isPlain(p)) {
    p.spinCharge = -ATTACK.chargedSpinTicks + ATTACK.spinChargeTicks;
    p.sounds.push('BUZTSPIN');
    return;
  }
  p.spinCharge = 0;
}

/** Laser charge. `FUN_00434990`, reduced to its timers. */
function laser(p: PlayerState, input: PlayerInput, prev: PlayerInput): void {
  p.laserFired = null;
  const pressed = input.fire && !prev.fire;
  if (pressed && isPlain(p) && p.laser === 0) {
    p.laser = 1;
    p.laserCharge = 0;
    return;
  }
  if (p.laser === 0) return;
  if (input.fire) {
    if (p.laser < ATTACK.laserWindupTicks) p.laser += 1;
    else p.laserCharge = Math.min(ATTACK.laserChargeTicks, p.laserCharge + 1);
    return;
  }
  p.sounds.push(p.laserCharge >= ATTACK.laserChargeTicks ? 'BUZYLASR' : 'BUZLASER');
  p.laserFired = p.laserCharge;
  p.laser = 0;
  p.laserCharge = 0;
}

/**
 * Advance one 60 Hz tick.
 *
 * `cameraYaw` is the camera's bearing to the player, which is what makes the
 * controls camera-relative: the stick angle is added to it to get the target
 * facing, exactly as `FUN_00433f40` does.
 */
export function stepPlayer(
  p: PlayerState,
  input: PlayerInput,
  runtime: PlayerRuntime,
  ground: Ground,
  cameraYaw: number,
): void {
  p.sounds.length = 0;
  const prev = runtime.previous;

  // --- stick to target yaw and magnitude -----------------------------------
  // The engine's dead zone is per axis on the raw pad value, and its magnitude
  // is clamped to full scale. Its 8-sector angle remap table turned out to be
  // the identity, so the angle is a plain atan2 plus the camera bearing.
  const raw = TURN.stickFullScale;
  let sx = Math.round(input.moveX * raw);
  let sy = Math.round(input.moveY * raw);
  if (Math.abs(sx) < TURN.stickDeadZone) sx = 0;
  if (Math.abs(sy) < TURN.stickDeadZone) sy = 0;
  const analog = Math.min(raw, Math.round(Math.hypot(sx, sy)));
  const hasInput = analog > 0;
  if (hasInput) p.targetYaw = (yawOf(sx, sy) + cameraYaw) & YAW_MASK;

  const table = moveTableFor(p, hasInput ? analog : raw);

  // --- attacks -------------------------------------------------------------
  laser(p, input, prev);
  spinAttack(p, input, prev);
  if (p.skid > 0) p.skid -= 1;
  if (p.hitStun > 0) p.hitStun -= 1;

  // --- vertical, then turn, then horizontal --------------------------------
  // The order matters: the original turns after resolving the jump, so a jump
  // and a hard turn on the same tick both take effect this tick.
  vertical(p, input, table);
  turn(p, table, hasInput);
  accelerate(p, table, hasInput);

  // --- move ----------------------------------------------------------------
  // The mover. The sphere centre sits radius + centreLift above the origin, so
  // lift into that space, sweep, and lower back; standing therefore leaves the
  // origin centreLift below the surface, which is what the original does.
  const wasOnGround = p.onGround;
  const lift = COLLISION.radius + COLLISION.centreLift;
  const swept = ground.move(
    { x: p.x, y: p.y - lift, z: p.z },
    { x: p.vx, y: p.vy, z: p.vz },
  );

  p.x = Math.round(swept.x);
  p.y = Math.round(swept.y + lift);
  p.z = Math.round(swept.z);
  p.vx = Math.round(swept.vx);
  p.vz = Math.round(swept.vz);
  p.groundNormal = swept.groundNormal;
  p.contacts = swept.contacts ?? [];

  if (swept.onGround) {
    // Landing. A flagged hard fall costs velocity and control on the way down.
    if (!wasOnGround && p.fallTimer === 0x50) {
      p.fallTimer = -VERTICAL.hardFallStunTicks;
      p.vx = 0; p.vz = 0;
      p.animPhase = 0x1a;
      p.sounds.push('SPLAT');
    } else if (p.fallTimer > 0) {
      p.fallTimer = 0;
    }
    // Downward velocity is spent: the sweep already slid it along the surface.
    p.vy = 0;
    p.onGround = true;
    p.coyote = VERTICAL.coyoteTicks;
    p.jumpedFromGround = false;
  } else {
    p.vy = Math.round(swept.vy);
    p.onGround = false;
    if (p.coyote > 0) p.coyote -= 1;
  }

  // --- fall and stun timers ------------------------------------------------
  if (p.fallTimer < 0) {
    // Stunned after a hard landing, counting back up to zero.
    p.fallTimer += 1;
  } else if (!p.onGround && p.vy > VERTICAL.hardFallSpeed) {
    p.fallTimer += 1;
    if (p.fallTimer > VERTICAL.hardFallTicks) {
      if (p.fallTimer !== 0x50) p.sounds.push('BUZFALL1');
      p.fallTimer = 0x50;
    }
  } else if (p.fallTimer !== 0x50 || p.onGround) {
    p.fallTimer = 0;
  }

  // Remember where it is safe to come back to. The original records this
  // whenever you are standing on ground flatter than 76 degrees on an ordinary
  // surface, and its respawn reads it instead of the level's spawn point.
  if (p.onGround && p.groundNormal !== null
      && p.groundNormal.y < COLLISION.safeNormalY / 0x4000
      && isPlain(p)) {
    p.safeX = p.x; p.safeY = p.y; p.safeZ = p.z; p.safeYaw = p.yaw;
  }

  // Falling out of the level. The original tests the player against the
  // lowest point of the terrain plus a margin and respawns them; without it a
  // player who leaves the collision falls for ever, because there is nothing
  // outside it to land on.
  if (ground.deathY !== undefined && p.y > ground.deathY) p.fellOut = true;

  runtime.previous = { ...input };
}

/**
 * Adapt a parsed collision hull to the controller's units.
 *
 * The hull is in the file's own units and the controller runs 32x finer, so
 * the query converts on the way in and the answer on the way out. Both sides
 * already agree that +Y is down, so nothing is flipped here.
 */
export function groundFromCollision(world: CollisionWorld): Ground {
  const scale = GAME_UNITS_PER_LEVEL_UNIT;
  return {
    move(from, velocity) {
      return sweepSphere(world, from, velocity, COLLISION.radius, {
        scale,
        groundNormalY: COLLISION.groundNormalY / 0x4000,
      });
    },
    deathY: world.lowestY * scale + DEATH_PLANE_MARGIN,
  };
}

/** Empty space, for testing the controller in isolation. */
export const NO_GROUND: Ground = {
  move: (from, v) => ({
    x: from.x + v.x, y: from.y + v.y, z: from.z + v.z,
    vx: v.x, vy: v.y, vz: v.z, onGround: false, groundNormal: null,
  }),
};

/**
 * An endless flat floor that the player's origin comes to rest on at `y`.
 *
 * The plane the sphere actually touches is one `centreLift` above that, since
 * the origin sits that far inside the surface when standing.
 */
export function flatGround(y: number): Ground {
  const restCentre = y - COLLISION.radius - COLLISION.centreLift;
  return {
    move(from, v) {
      const end = { x: from.x + v.x, y: from.y + v.y, z: from.z + v.z };
      if (end.y < restCentre) {
        return { ...end, vx: v.x, vy: v.y, vz: v.z, onGround: false, groundNormal: null };
      }
      return {
        x: end.x, y: restCentre, z: end.z,
        vx: v.x, vy: restCentre - from.y, vz: v.z,
        onGround: true, groundNormal: { x: 0, y: -1, z: 0 },
      };
    },
  };
}
