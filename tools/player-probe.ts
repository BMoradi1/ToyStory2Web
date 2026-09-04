/**
 * Run the character controller headlessly and check what it does against what
 * the constants say it should.
 *
 * The controller is a transcription of the original's per-tick update, so the
 * useful test is not "does it look right" but "does the motion it produces
 * match the closed-form values derived from the constants". Jump apex, time to
 * apex, top speed and stopping distance can all be predicted on paper from
 * docs/PLAYER.md; if the port drifts, one of these moves.
 *
 *   npx tsx tools/player-probe.ts
 */
import {
  createPlayer, createRuntime, flatGround, JumpState, NO_INPUT, stepPlayer,
  type PlayerInput, type PlayerState,
} from '../src/sim/player.ts';
import { MOVE_GROUND, VERTICAL } from '../src/sim/player-constants.ts';
import { YAW_FULL, yawDelta } from '../src/sim/trig.ts';

const FLOOR = 0;
const held = (over: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...over });

interface Run { ticks: number; peak: number; state: PlayerState }

/** Drop the player on the floor and settle, so tests start from a known state. */
function settled(): { p: PlayerState; rt: ReturnType<typeof createRuntime> } {
  const p = createPlayer(0, FLOOR - 1000, 0, 0);
  const rt = createRuntime();
  const ground = flatGround(FLOOR);
  for (let i = 0; i < 120; i++) stepPlayer(p, NO_INPUT, rt, ground, 0);
  return { p, rt };
}

/** Hold an input until the player is back on the ground; report the peak rise. */
function jumpRun(hold: (tick: number, p: PlayerState) => PlayerInput, limit = 400): Run {
  const { p, rt } = settled();
  const ground = flatGround(FLOOR);
  let peak = 0, ticks = 0;
  for (let i = 0; i < limit; i++) {
    stepPlayer(p, hold(i, p), rt, ground, 0);
    peak = Math.max(peak, FLOOR - p.y); // +Y is down, so a rise is a smaller y
    ticks = i + 1;
    if (i > 2 && p.onGround) break;
  }
  return { ticks, peak, state: p };
}

type Value = number | string | boolean;
const results: { name: string; got: Value; want: Value; ok: boolean }[] = [];
function check(name: string, got: Value, want: Value, tolerance = 0): void {
  const ok = typeof got === 'number' && typeof want === 'number'
    ? Math.abs(got - want) <= tolerance
    : got === want;
  results.push({ name, got, want, ok });
}

// --- vertical ---------------------------------------------------------------
// Apex. The textbook v^2/2g is NOT the right expectation: the original applies
// gravity on the jump tick as well (its first-jump branch clears the on-ground
// flag, and the gravity test runs after that), so the first step moves at
// v0 - g rather than v0. Summing the actual steps gives v0^2/2g - v0/2, which
// is 768 units lower. Predict the discrete sum, or this test enshrines a bug.
const g = VERTICAL.gravity();
const v0 = -VERTICAL.jumpImpulse;
const risingTicks = Math.floor(v0 / g);
let apex = 0;
for (let k = 1; k <= risingTicks; k++) apex += v0 - g * k;

const heldJump = jumpRun(() => held({ jump: true }));
check('full jump apex', heldJump.peak, apex);
check('full jump apex in body heights', +(heldJump.peak / (460 * 32)).toFixed(2), 1.2, 0.02);
check('ticks to land', heldJump.ticks, (2 * v0) / g, 3);

// Releasing at the first tick should cut the rise to well under half.
const tapJump = jumpRun((i) => held({ jump: i < 1 }));
check('tap jump is a short hop', tapJump.peak < heldJump.peak * 0.45, true);

// A double jump: hold, release at the apex, press again.
const apexTick = Math.round(v0 / g);
const doubleJump = jumpRun((i) => held({ jump: i < apexTick - 2 || i > apexTick }));
check('double jump goes higher', doubleJump.peak > heldJump.peak, true);
check(
  'double jump apex is the PC cap',
  doubleJump.peak,
  VERTICAL.doubleJumpApexAboveTakeoff,
  VERTICAL.doubleJumpApexAboveTakeoff * 0.08,
);

// Holding jump for the whole flight must not give a second jump.
check('no double jump while held', heldJump.peak, apex);

// Terminal velocity, falling from a great height with no floor.
{
  const p = createPlayer(0, 0, 0, 0);
  const rt = createRuntime();
  const ground = { floorAt: () => null };
  for (let i = 0; i < 600; i++) stepPlayer(p, NO_INPUT, rt, ground, 0);
  check('terminal velocity', p.vy, VERTICAL.terminalVelocity);
  check('hard fall flagged', p.fallTimer, 0x50);
}

// --- horizontal -------------------------------------------------------------
{
  const { p, rt } = settled();
  const ground = flatGround(FLOOR);
  let reached = -1;
  for (let i = 0; i < 200; i++) {
    stepPlayer(p, held({ moveY: 1 }), rt, ground, 0);
    if (reached < 0 && p.forwardSpeed >= MOVE_GROUND.topSpeed) reached = i + 1;
  }
  check('top speed', p.forwardSpeed, MOVE_GROUND.topSpeed, MOVE_GROUND.forwardFriction);
  check('ticks to top speed', reached, Math.ceil(MOVE_GROUND.topSpeed / MOVE_GROUND.forwardAccel), 2);
  // Straight forward at yaw 0 is +Z, and nothing should drift sideways.
  check('runs along +Z', p.vz > 0 && Math.abs(p.vx) < 2, true);

  let stop = 0;
  for (let i = 0; i < 200; i++) {
    stepPlayer(p, NO_INPUT, rt, ground, 0);
    if (p.forwardSpeed === 0) { stop = i + 1; break; }
  }
  check('ticks to stop', stop, Math.ceil(MOVE_GROUND.topSpeed / MOVE_GROUND.forwardFriction), 2);
}

// --- turning ----------------------------------------------------------------
{
  const { p, rt } = settled();
  const ground = flatGround(FLOOR);
  // Quarter turn: the approach is exponential, so measure a half-way point
  // rather than a total, and check it never overshoots.
  let overshot = false;
  for (let i = 0; i < 120; i++) {
    stepPlayer(p, held({ moveX: 1 }), rt, ground, 0);
    if (yawDelta(p.yaw, p.targetYaw) > 0) overshot = true;
  }
  // The approach truncates: min(|diff|, turnRate) / 8 is zero once the
  // difference drops under 8, so the yaw settles up to 7 units (0.6 degrees)
  // short and stays there. The original has the same residue.
  check('turn reaches the target', yawDelta(p.yaw, p.targetYaw), 0, 8);
  check('turn never overshoots', overshot, false);
  check('quarter turn target', p.targetYaw, YAW_FULL / 4, 1);
}

// A reversal beyond the snap threshold should snap and skid.
{
  const { p, rt } = settled();
  const ground = flatGround(FLOOR);
  for (let i = 0; i < 60; i++) stepPlayer(p, held({ moveY: 1 }), rt, ground, 0);
  let skidded = false;
  for (let i = 0; i < 10; i++) {
    stepPlayer(p, held({ moveY: -1 }), rt, ground, 0);
    if (p.skid > 0) skidded = true;
  }
  check('reversing skids', skidded, true);
  check('reversing snaps the yaw', p.targetYaw, YAW_FULL / 2, 1);
}

// --- state machine ----------------------------------------------------------
{
  const { p, rt } = settled();
  const ground = flatGround(FLOOR);
  check('starts grounded', p.jumpState, JumpState.Grounded);
  stepPlayer(p, held({ jump: true }), rt, ground, 0);
  check('jump enters Rising', p.jumpState, JumpState.Rising);
  stepPlayer(p, NO_INPUT, rt, ground, 0);
  check('release enters Released', p.jumpState, JumpState.Released);
  // Landing while still holding the button must not re-jump.
  let ticks = 0;
  while (!p.onGround && ticks++ < 200) stepPlayer(p, held({ jump: true }), rt, ground, 0);
  const yAfterLanding = p.y;
  for (let i = 0; i < 20; i++) stepPlayer(p, held({ jump: true }), rt, ground, 0);
  check('holding jump does not bunny hop', p.y, yAfterLanding, 1);
}

// --- coyote time ------------------------------------------------------------
{
  const { p, rt } = settled();
  // Step off a floor that vanishes, then jump a few ticks later.
  let hasFloor = true;
  const ground = { floorAt: () => (hasFloor ? { y: FLOOR, slopeY: -1 } : null) };
  hasFloor = false;
  for (let i = 0; i < 3; i++) stepPlayer(p, NO_INPUT, rt, ground, 0);
  const before = p.vy;
  stepPlayer(p, held({ jump: true }), rt, ground, 0);
  check('coyote jump works 3 ticks after a ledge', p.vy < before, true);
  check('coyote jump entered Rising', p.jumpState, JumpState.Rising);
}

// --- report -----------------------------------------------------------------
const width = Math.max(...results.map((r) => r.name.length));
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  const mark = r.ok ? 'ok  ' : 'FAIL';
  const detail = r.ok ? `${r.got}` : `${r.got}, expected ${r.want}`;
  console.log(`${mark} ${r.name.padEnd(width)}  ${detail}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
