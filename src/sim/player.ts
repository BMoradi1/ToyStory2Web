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
 * The `Ground` interface connects the controller to swept-sphere collision
 * and the automatic ledge-climb probes. See docs/PLAYER.md for the remaining
 * differences from the original mover.
 */
import { sweepSphere, type CollisionWorld } from '../formats/collision.ts';
import {
  ATTACK, COLLISION, DEATH_PLANE_MARGIN, GAME_UNITS_PER_LEVEL_UNIT, MOVE_GROUND,
  MOVE_OVERRIDES, TURN, VERTICAL, type MoveTable,
} from './player-constants.ts';
import { cos, idiv, sin, YAW_MASK, yawDelta, yawOf } from './trig.ts';
import { stepZipLine, type ZipLine } from './zip-lines.ts';
import { stepPole, type Pole } from './poles.ts';
import { CLIMB_TICKS, findLedge, type LedgeProbe, type LedgeTarget } from './ledge.ts';

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
  poles?: readonly Pole[];
  zipLines?: readonly ZipLine[];
  /** Moving props resolve after acceleration, before the collision sweep. */
  beforeMove?(player: PlayerState, input: PlayerInput): void;
  /** Optional on test worlds; real collision checks reach and body clearance. */
  ledge?(probe: LedgeProbe): LedgeTarget | null;
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
  /** Retail stomp timer: positive wind-up/drop, negative landing recovery. */
  stomp: number;
  stompImpact: boolean;
  /** Prop launch uses the faster, frictionless movement table until landing. */
  launched: boolean;
  /** Path-61 pole index, -1 when detached. */
  pole: number;
  /** Path-62 line index and phase: 0 detached, 1 catching, 2 riding. */
  zipLine: number;
  zipPhase: number;
  zipDistance: number;
  zipSpeed: number;
  zipTicks: number;
  zipCooldown: number;
  /** Released pole blocked until Buzz leaves its horizontal regrab radius. */
  poleLock: number;
  poleTicks: number;
  /** Retail animation flags: 2 climbing, 4 sliding, 0 holding. */
  poleMotion: number;
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
  /** DAT_0053c660: edge-climb ticks remaining; animation state 9. */
  climb: number;

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
   * The charge the weapon went off at this tick, or null. The caller chooses
   * the ordinary beam (`FUN_004a5d30`) or, with ammo, the disk launcher
   * (`FUN_004a4960`); see docs/EFFECTS.md.
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
  /**
   * Sound EVENTS raised this tick, by the engine's own number. The caller
   * resolves them through the level's sound table, which is what carries the
   * volume and the sustained flag; `sounds` above is the older by-name list.
   */
  events: number[];
}

export function createPlayer(x = 0, y = 0, z = 0, yaw = 0): PlayerState {
  return {
    stomp: 0, stompImpact: false, launched: false,
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
    climb: 0,
    zipLine: -1, zipPhase: 0, zipDistance: 0, zipSpeed: 0, zipTicks: 0, zipCooldown: 0,
    pole: -1, poleLock: -1, poleTicks: 0, poleMotion: 0,
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
    events: [],
  };
}

/** Previous input and pre-move height (+0x60), for button and ledge crossings. */
export interface PlayerRuntime {
  previous: PlayerInput;
  previousY: number | null;
}

export function createRuntime(): PlayerRuntime {
  return { previous: { ...NO_INPUT }, previousY: null };
}

/** Is the player in a plain state — no attack, no stun, nothing special? */
function isPlain(p: PlayerState): boolean {
  return p.stomp === 0 && p.zipLine < 0 && p.pole < 0 && p.climb === 0 && p.spin === 0 && p.spinCharge === 0 && p.laser === 0 && p.hitStun <= 0 && p.fallTimer >= 0;
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
  if (p.launched) Object.assign(t, MOVE_OVERRIDES.launched);

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

/**
 * The sound events the spin raises (`FUN_00434eb0`), by the number the engine
 * uses. Resolved through the level's own table, they are BUZTSPIN, BUZPWRUP,
 * BUZWHIRL and BUZDIZZY. Two of them are sustained, which is why they are
 * events and not names: raising a sustained event every tick keeps one sound
 * running, where playing it by name would restart it 60 times a second.
 */
export const SPIN_EVENT = {
  /** The spin goes off. */
  start: 0x11,
  /** Held down, winding up. Sustained. */
  charging: 0x27,
  /** The charged spin, whirling. Sustained. */
  whirl: 0x26,
  /** Once, when the whirl gives out and he staggers. */
  dizzy: 0x18,
} as const;

/** Spin attack and its charge. `FUN_00434eb0`, trimmed to the parts that move the player. */
function spinAttack(p: PlayerState, input: PlayerInput, prev: PlayerInput): void {
  if (p.spin > 0) p.spin = Math.max(0, p.spin - 1);

  const pressed = input.spin && !prev.spin;
  if (pressed && p.onGround && p.spin === 0 && p.spinCharge === 0 && p.skid === 0 && isPlain(p)) {
    p.spin = ATTACK.spinTicks;
    p.spinCharge = 1;
    p.laser = 0;
    p.events.push(SPIN_EVENT.start);
    return;
  }

  if (input.spin && p.spinCharge > 0) {
    // Charging, and whining about it every tick. The event is sustained, so
    // raising it repeatedly keeps one sound going rather than restarting it.
    p.spinCharge = Math.min(ATTACK.spinChargeTicks, p.spinCharge + 1);
    p.events.push(SPIN_EVENT.charging);
    return;
  }

  if (p.spinCharge < 0) {
    // The charged spin: 181 ticks whirling, then 119 dizzy, counting up to 0.
    // The dizzy sound fires ONCE, on the tick the whirl gives out — the
    // original tests the value from BEFORE the step against the same
    // threshold it tests after it.
    const wasWhirling = p.spinCharge < -0x77;
    p.spinCharge += 1;
    if (p.spinCharge < -0x77) p.events.push(SPIN_EVENT.whirl);
    else if (wasWhirling) p.events.push(SPIN_EVENT.dizzy);
    if (p.spinCharge >= 0) p.spinCharge = 0;
    return;
  }

  // Released with a full charge: the spin goes off. The original gates this
  // on its state word carrying nothing but "grounded", NOT on the same
  // `isPlain` the press uses — `isPlain` insists the charge is zero, and the
  // charge is 60 here by construction, so asking for both meant the charged
  // spin could never launch at all.
  const busy = p.spin !== 0 || p.laser !== 0 || p.hitStun > 0 || p.fallTimer < 0;
  if (p.spinCharge >= ATTACK.spinChargeTicks && !busy) {
    p.spinCharge = -ATTACK.chargedSpinTicks + ATTACK.spinChargeTicks;
    return;
  }
  p.spinCharge = 0;
}

/** Basic laser phase/charge from `FUN_00434990`, without power-up autofire. */
function laser(p: PlayerState, input: PlayerInput, prev: PlayerInput): void {
  p.laserFired = null;
  const pressed = input.fire && !prev.fire;
  if (pressed && isPlain(p) && p.laser === 0) {
    p.laser = 1;
    p.laserCharge = 0;
    return;
  }
  if (p.laser === 0) return;
  let fired: number | null = null;
  if (p.laser < ATTACK.laserWindupTicks) {
    // Releasing early does not cancel the arm raise or fire from idle.
    p.laser += 1;
    if (p.laser === ATTACK.laserWindupTicks) fired = 0;
  } else {
    p.laser += 1;
    if (input.fire) {
      p.laserCharge = Math.min(ATTACK.laserChargeTicks, p.laserCharge + 1);
      if (pressed) {
        if (p.laser < 0x35) fired = 0;
        else p.laser = 0x40 - p.laser;
      } else if (p.laser > 0x33) {
        p.laser -= 0x28;
      }
    } else {
      if (p.laserCharge > 0x24) p.laser = 0x34;
      if (p.laserCharge === ATTACK.laserChargeTicks) fired = p.laserCharge;
      p.laserCharge = 0;
    }
    if (p.laser > 0x3f) p.laser = 0;
  }
  if (fired === null) return;
  p.sounds.push(fired >= ATTACK.laserChargeTicks ? 'BUZYLASR' : 'BUZLASER');
  p.laserFired = fired;
  p.laser = ATTACK.laserWindupTicks;
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
  p.events.length = 0;
  const prev = runtime.previous;
  p.laserFired = null;
  const previousY = runtime.previousY;
  runtime.previousY = p.y;
  p.stompImpact = false;
  if (p.dying || p.hitStun > 0) { p.stomp = 0; p.launched = false; }
  // FUN_00434d20: a fresh spin press during a jump starts the stomp.
  if (input.spin && !prev.spin && !p.onGround && p.coyote === 0
      && p.stomp === 0 && p.zipLine < 0 && p.pole < 0 && p.climb === 0
      && p.spin === 0 && p.spinCharge === 0 && p.hitStun <= 0 && p.fallTimer >= 0 && p.fallTimer !== 0x50
      && !p.dying && (p.jumpState === JumpState.Rising || p.jumpState === JumpState.Released || p.animPhase === 8)) {
    p.stomp = 1; p.launched = false; p.laser = p.laserCharge = 0;
    p.fallTimer = 0; p.events.push(0x17);
  }
  if (p.stomp < 0) p.stomp++;
  const stomping = p.stomp > 0 || p.stomp < -VERTICAL.stompHangTicks;
  if (p.stomp > 0) {
    p.stomp++;
    p.vy = p.stomp > VERTICAL.stompHangTicks ? VERTICAL.stompDropSpeed : 0;
    p.stomp = Math.min(p.stomp, VERTICAL.stompHangTicks);
  } else if (stomping) {
    p.vy = Math.min(p.vy + VERTICAL.gravity(), VERTICAL.stompDropSpeed);
  }
  if (stomping) p.vx = p.vz = p.forwardSpeed = p.lateralSpeed = 0;
  const zipMoved = !stomping && stepZipLine(p, input, prev, ground.zipLines ?? []);
  const poleMoved = !stomping && !zipMoved && p.zipLine < 0 && stepPole(p, input, prev, ground.poles ?? [], cameraYaw);
  if (!stomping && !zipMoved && !poleMoved) {
    if (p.dying || p.hitStun > 0) p.climb = 0;
    else if (p.climb > 0) p.climb--;
    else if (p.stomp === 0 && p.zipLine < 0 && p.vy > 0 && !p.onGround && p.coyote === 0 && p.fallTimer !== 0x50
        && p.spin === 0 && p.spinCharge === 0 && p.hitStun <= 0
        && p.fallTimer >= 0 && previousY !== null) {
      const edge = ground.ledge?.({ x: p.x, y: p.y, z: p.z, yaw: p.yaw, previousY });
      if (edge) {
        p.x = edge.x; p.y = edge.y; p.z = edge.z; p.targetYaw = edge.yaw;
        p.climb = CLIMB_TICKS;
        p.laser = 0; p.laserCharge = 0;
        p.fallTimer = 0;
        p.events.push(0x17);
      }
    }
    if (p.climb > 0) {
      // The animation contains the pull-up displacement relative to the new
      // ledge anchor. Moving the controller as well would apply it twice.
      p.yaw = (p.yaw + idiv(yawDelta(p.targetYaw, p.yaw), 16)) & YAW_MASK;
      p.vx = p.vy = p.vz = p.forwardSpeed = p.lateralSpeed = 0;
      p.onGround = false; p.coyote = 0; p.groundNormal = null; p.contacts = [];
      p.animPhase = 9;
      runtime.previousY = p.y;
      runtime.previous = { ...input };
      return;
    }

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
    vertical(p, p.launched ? { ...input, jump: false } : input, table);
    turn(p, table, hasInput);
    accelerate(p, table, hasInput);
    if (p.zipPhase === 1) p.vx = p.vz = p.forwardSpeed = p.lateralSpeed = 0;
  }
  ground.beforeMove?.(p, input);

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
    p.launched = false;
    if (p.stomp > 0) {
      p.stomp = -VERTICAL.stompRecoveryTicks; p.stompImpact = true;
      p.fallTimer = 0; p.events.push(0x0f);
    }
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
  } else if (p.stomp === 0 && !p.onGround && p.vy > VERTICAL.hardFallSpeed) {
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
export function groundFromCollision(world: CollisionWorld, poles: readonly Pole[] = [], zipLines: readonly ZipLine[] = []): Ground {
  const scale = GAME_UNITS_PER_LEVEL_UNIT;
  return {
    poles, zipLines,
    ledge: probe => findLedge(world, probe),
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
