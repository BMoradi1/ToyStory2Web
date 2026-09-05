/**
 * Player physics constants, read from toy2.exe and cross-checked against the
 * PlayStation executable. See docs/PLAYER.md for where each one comes from
 * and how confident the reading is. Do not tune these by feel.
 *
 * Conventions, all inherited from the original:
 *   - the controller runs at a fixed 60 Hz; every rate is per tick
 *   - lengths are GAME units, 32 per level.dat unit
 *   - +Y is down, so upward velocities are negative
 *   - yaw is 12-bit, 4096 per revolution
 */

/** Controller tick rate. Timers and velocities below are per tick. */
export const TICK_HZ = 60;

/** Game-logic units per level.dat unit. Positions in the level file are `>> 5` of these. */
export const GAME_UNITS_PER_LEVEL_UNIT = 32;

/** Full revolution of the 12-bit yaw. */
export const YAW_FULL = 4096;

/** Buzz's mesh height in game units (460 level units), for scale sanity checks. */
export const BODY_HEIGHT = 460 * GAME_UNITS_PER_LEVEL_UNIT;

/**
 * Vertical. `k` is 2 on land and 4 in water; the original divides the raw
 * constants by k or k^2, which is how the water values below arise.
 */
export const VERTICAL = {
  /** +64 per tick while airborne. Water: 16. */
  gravity: (k = 2) => (256 / (k * k)) | 0,
  /** Falling speed cap. Water 0x400, slime 0x40. */
  terminalVelocity: 0x800,
  /** First jump from the ground (or within coyote time). */
  jumpImpulse: -0x600,
  jumpImpulseRocketBoots: -0x640,
  jumpImpulseHitStun: -0x3c0,
  jumpImpulseWater: -0x300,
  /** Coyote time: ticks after leaving the ground during which a jump still counts. */
  coyoteTicks: 6,
  /**
   * Releasing jump while rising in state 1 cuts the rise:
   *   if (vy < -800/k) vy += 0x180/k^2;  vy = vy/2 - 0x100/k^2
   */
  releaseCut: (vy: number, k = 2) => {
    if (vy < ((-800 / k) | 0)) vy += (0x180 / (k * k)) | 0;
    return ((vy / 2) | 0) - ((0x100 / (k * k)) | 0);
  },
  /** Double jump is allowed only once vy is above this: rising slower than 0x400 per tick, or falling (up is negative). */
  doubleJumpMinRise: -0x400,
  /** Fixed double-jump impulse: PSX always, PC when the first jump was not from the ground. */
  doubleJumpImpulse: (k = 2) => (-0x900 / k) | 0,
  /** PC only: the double jump tops out this far above takeoff regardless of timing. */
  doubleJumpApexAboveTakeoff: 0x6a80,
  doubleJumpImpulseMin: -0x74c,
  doubleJumpImpulseMax: -0x22a,
  /**
   * PC double jump from a ground jump: the impulse that would carry the player
   * exactly to `doubleJumpApexAboveTakeoff`, given `heightGained` since takeoff.
   */
  doubleJumpImpulsePC: (heightGained: number, k = 2) => {
    const g = (0x100 / (k * k)) | 0;
    const v = -Math.trunc(Math.sqrt(Math.max(0, 2 * g * (0x6a80 - heightGained))));
    return Math.min(-0x22a, Math.max(-0x74c, v));
  },
  /** Falling faster than this for `hardFallTicks` flags a hard landing. */
  hardFallSpeed: 0x80,
  hardFallTicks: 60,
  hardFallStunTicks: 70,
  /** Stomp: hang with velocity frozen, then drop at this speed. */
  stompHangTicks: 14,
  stompDropSpeed: 0x800,
  stompRecoveryTicks: 40,
} as const;

/**
 * Horizontal movement table. The original rebuilds this every tick from the
 * player's state; rows here are the base values and the overrides that were
 * read. All per tick with dt = 1.
 */
export interface MoveTable {
  /** Decay of the across-yaw component toward zero. */
  lateralFriction: number;
  /** Decay of the along-yaw component toward zero. Applied even with input. */
  forwardFriction: number;
  /** Net gain along yaw per tick with the stick held (the code adds accel + forwardFriction). */
  forwardAccel: number;
  jumpImpulse: number;
  /** Acceleration stops once forward speed reaches this; lateral is clamped to it. */
  topSpeed: number;
  /** Hard clamp on the forward component. */
  forwardClamp: number;
  /** Max yaw change per 8 ticks (turn per tick is min(|diff|, this) / 8). */
  turnRate: number;
}

export const MOVE_GROUND: MoveTable = {
  lateralFriction: 128,
  /** PC 48. The PSX build uses 32; this is the only balance change in the controller. */
  forwardFriction: 48,
  forwardAccel: 40,
  jumpImpulse: -0x600,
  topSpeed: 0x380,
  forwardClamp: 0x400,
  turnRate: 0x300,
};

export const MOVE_OVERRIDES = {
  airborne: { forwardFriction: 16 },
  hitStun: { lateralFriction: 16, forwardFriction: 8, forwardAccel: 20, jumpImpulse: -0x3c0 },
  ice: { lateralFriction: 16, forwardFriction: 8, forwardAccel: 20 },
  skidWithInput: { lateralFriction: 16, forwardFriction: 4 },
  noFriction: { lateralFriction: 0, forwardFriction: 0 },
  pushing: { topSpeed: 0x180 },
  launched: { lateralFriction: 0, forwardFriction: 0, topSpeed: 0xb80, forwardClamp: 0xb80 },
  water: { lateralFriction: 32, forwardFriction: 8, forwardAccel: 10, topSpeed: 0x280, jumpImpulse: -0x300 },
  slime: { lateralFriction: 16, forwardFriction: 8, forwardAccel: 20, topSpeed: 0x100, jumpImpulse: -0x300 },
  rocketBoots: { lateralFriction: 128, forwardFriction: 32, forwardAccel: 160, topSpeed: 0x800, forwardClamp: 0x800, jumpImpulse: -0x640 },
} as const satisfies Record<string, Partial<MoveTable>>;

/**
 * The mover's shape and thresholds, from FUN_00484380 / FUN_00482a00 /
 * FUN_00481fb0 and their PSX twins. Game units; normals are 2.14 fixed point
 * with 0x4000 as 1.0, and +Y is down so an up-facing normal has negative y.
 * See docs/PLAYER.md, "Collision: the mover".
 */
export const COLLISION = {
  /** Swept-sphere radius, written into every collision-object record at level load. */
  radius: 4000,
  /** The sphere centre sits this much above the origin in addition to the radius. */
  centreLift: 0xc0,
  /** Edge and vertex tests use radius + this. */
  edgeRadiusExtra: 0x40,
  /** Contact normal y (2.14) below this is ground, at or above it is a wall: cos 60 deg. */
  groundNormalY: -0x2000,
  /** Standing on ground with normal y at or above this (steeper than 42.9 deg) adds a slide push. */
  slideNormalY: -11999,
  /** Past this (steeper than 75.5 deg) the slide divisor uses 0x1000 in place of -n.y. */
  steepNormalY: -0x1000,
  /** Added to the step length in the slide divisor. */
  slideLengthBias: 0xc80,
  /** A step with |v|^2 above this is done as two half-steps. */
  splitStepSq: 0x400000,
  /** Broadphase reach is L + this + (radius * 8000 >> 12). */
  broadphaseBias: 0x1880,
  /** Response passes: this many if fewer than 11 candidate polys, one fewer otherwise. */
  passes: 4,
  passesWhenCrowded: 3,
  /** Contact skin: start and end distances are pulled back by these, then >> 3. */
  skinStart: 0x20,
  skinEnd: 0x60,
  skinEndMoving: 0x80,
  /** Ticks pressed motionless against a wall before the mover reports a touch. */
  stuckTicks: 0x14,
  /** Ground flatter than this (2.14) on a normal surface records the respawn position. */
  safeNormalY: -0xf3c,
} as const;

/**
 * How far below the level's lowest collision the player may fall before the
 * original gives up and puts them back. From the last branch of the player
 * update: `if (levelLowestY + 0x2000 < player.y) respawn`, where the level
 * value is the largest Y in the terrain, computed once at load.
 */
export const DEATH_PLANE_MARGIN = 0x2000;

export const TURN = {
  /**
   * Yaw approaches the target by min(|diff|, turnRate) / 8 per tick. The
   * division truncates, so the approach stalls once the difference is under 8
   * and the facing settles up to 7 units (0.6 degrees) short. That residue is
   * in the original too.
   */
  divisor: 8,
  /** A target further away than this (132 degrees) snaps the yaw instantly. */
  snapThreshold: 0x5dd,
  /** A snap on the ground starts a skid this long, with BUZSKID. */
  skidTicks: 0x1a,
  /**
   * Analog stick: per-axis dead zone and full-scale magnitude. The magnitude
   * scales the movement table's TOP SPEED, not its acceleration.
   */
  stickDeadZone: 0x1800,
  stickFullScale: 0x4000,
} as const;

export const ATTACK = {
  spinTicks: 48,
  spinChargeTicks: 60,
  chargedSpinTicks: 300,
  chargedSpinActiveTicks: 181,
  chargedSpinDizzyTicks: 119,
  laserWindupTicks: 12,
  laserChargeTicks: 64,
} as const;

export const POWERUP = {
  hoverFuelTicks: 600,
  hoverHeightMin: 0x2000,
  hoverHeightMax: 0xc000,
  hoverHeightRate: 0x400,
  hoverVerticalAccel: 0x20,
  hoverVerticalCap: 0x180,
  hoverLowFuelTicks: 120,
  rocketBootsTicks: 250,
} as const;

export const ZIPLINE = {
  /** Attach when the squared horizontal distance in LEVEL units (game >> 5) is under this. */
  attachDistanceSq: 0x2000,
  /** Speed along the line ramps 1 per tick to this. */
  maxSpeed: 0x30,
  /** Letting go: this vertical impulse, horizontal along yaw at the run clamp. */
  releaseImpulse: -0x5c0,
  regrabLockoutTicks: 0x1e,
} as const;

export const POLE = {
  /** Holding up: fixed climb speed (negative is up). */
  climbSpeed: -0x100,
  /** Holding down: slide accelerates by this per tick, spiralling the yaw by vy/16 per tick. */
  slideAccel: 32,
  slideMax: 0x400,
  /** Neither held: vertical speed decays toward zero by this per tick. */
  slideDecay: 64,
  /** Left/right: yaw change per tick. */
  rotatePerTick: 0x20,
  /** Jump off: this vertical impulse, horizontal along yaw at the run clamp. */
  letGoImpulse: -0x400,
  /** Jump from the very top: straight up. */
  topJumpImpulse: -0x600,
  /** Type-2 poles are slides: gravity 16 per tick up to 0x800. */
  slideTypeGravity: 16,
  slideTypeTerminal: 0x800,
} as const;
