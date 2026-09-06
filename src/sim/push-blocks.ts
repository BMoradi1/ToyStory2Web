/**
 * Push blocks: the crates Buzz shoves along a rail, and drops off ledges.
 *
 * Ported from `FUN_004335d0` (the level's table), `FUN_004334d0` (the segment
 * fields) and `FUN_00433700` (the per-tick push) in toy2.exe. docs/LEVELS.md,
 * "Push blocks", is the written spec and says where each field came from.
 *
 * A block rides a path out of `level.dat`. Segment `n` runs node `n` to node
 * `n + 1`; the block sits at some distance along the current segment and is
 * pushed forward or back by 12 level units a tick while Buzz leans on it.
 * Where a path turns vertical the block tips over the edge and falls to the
 * next node down, which is how the crates in Andy's room get to the floor.
 *
 * Both the collision and the drawn object move with the block. This module
 * only keeps the state and says how far it moved; the caller applies that to
 * the world.
 *
 * Units: game units for positions, level units for `run` and the segment
 * lengths, 12-bit yaw. `dt` is ticks, normally 1.
 */

import { YAW_MASK, yawDelta, yawOf } from './trig.ts';
import type { PushBlock as PushBlockTable } from './level-data.ts';

const GAME_UNITS_PER_LEVEL_UNIT = 32;

/** How the engine's constants read, all per tick. */
export const PUSH = {
  /** Level units a held block runs each tick. */
  speed: 12,
  /** Level units a tipping block slides on its own. */
  tipSpeed: 24,
  /** The push direction has to be within this of the segment to count. */
  alignment: 8,
  /** ...and Buzz has to face within this of straight into the block. */
  facing: 0x180,
  /** Gravity while falling, and its cap. */
  gravity: 64,
  terminal: 0x800,
  /** Ticks Buzz is held still after a block tips. */
  freezeTicks: 10,
  /** Ticks before the push sound can play again. */
  soundCooldown: 0x28,
} as const;

export interface PushBlock {
  /** Index in the level's table, which is also its sparkle point. */
  index: number;
  /** The `.ngn` object drawn for it, or -2 for none. */
  sceneObject: number;
  /** The number of its dynamic collision group (docs/FORMATS.md). */
  collisionObject: number;
  /** Which group that resolved to in the collision world, or -1. */
  group: number;
  pathTag: number;
  /** The rail, in game units. */
  path: readonly { x: number; y: number; z: number }[];

  /** Game units. */
  x: number; y: number; z: number;
  /** Unit vector of the current segment, 0x1000 = 1. */
  dirX: number; dirZ: number;
  /** Nonzero while dropping. */
  fallSpeed: number;
  /** Where along the segment it tips, level units; -1 while tipping. */
  tipPoint: number;
  /** Distance run along the segment, level units. */
  run: number;
  segLen: number;
  segYaw: number;
  seg: number;
  /** The lowest segment it can be pulled back to. */
  floorSeg: number;
}

export interface PushState {
  blocks: PushBlock[];
  /** The block being pushed, as index + 1. Zero means none, like the engine. */
  held: number;
  /** The direction Buzz is pushing, 12-bit. */
  pushYaw: number;
  /** Where Buzz stands relative to the block, level units. */
  offsetX: number; offsetZ: number;
  soundCooldown: number;
  /** While positive Buzz is held still, after a block tips away from him. */
  freeze: number;
  /** Sound effects raised this tick. */
  sounds: string[];
  /** Sparkle points spent this tick, by block index. */
  sparksSpent: number[];
}

/** What the caller should do to the world after a tick. */
export interface PushResult {
  /** Blocks that moved, with how far, in game units. */
  moved: { index: number; dx: number; dy: number; dz: number }[];
  /** Velocity to give Buzz so he keeps station against the block, or null. */
  playerVelocity: { x: number; z: number } | null;
}

/** The player state this needs. */
export interface PushPlayer {
  x: number; y: number; z: number;
  yaw: number;
  onGround: boolean;
  /** True when Buzz is doing something that rules a push out. */
  busy: boolean;
  contacts: readonly { group: number; normal: { x: number; y: number; z: number } }[];
}

function node(b: PushBlock, i: number): { x: number; y: number; z: number } {
  return b.path[i] ?? b.path[b.path.length - 1] ?? { x: 0, y: 0, z: 0 };
}

/**
 * Fill the segment fields from `seg` (`FUN_004334d0`): the direction, its
 * length, its bearing, and where along it the block tips.
 *
 * A block tips when the segment after the next one is vertical — same x and
 * z, so the path steps straight down — and then it goes over at half the
 * segment's length.
 */
export function setPushSegment(b: PushBlock): void {
  const a = node(b, b.seg);
  const c = node(b, b.seg + 1);
  const dx = (c.x - a.x) / GAME_UNITS_PER_LEVEL_UNIT;
  const dz = (c.z - a.z) / GAME_UNITS_PER_LEVEL_UNIT;
  b.segYaw = yawOf(dx, dz) & YAW_MASK;
  const length = Math.sqrt(dx * dx + dz * dz);
  b.segLen = Math.trunc(length);
  b.dirX = length === 0 ? 0 : Math.trunc((dx / length) * 0x1000);
  b.dirZ = length === 0 ? 0 : Math.trunc((dz / length) * 0x1000);
  b.tipPoint = 0;
  if (b.floorSeg < b.path.length - 2) {
    const next = node(b, b.seg + 2);
    if (c.x === next.x && c.z === next.z) b.tipPoint = Math.trunc(b.segLen / 2);
  }
}

/** Put a block where its segment and run say it is. Game units, 32-unit steps. */
function placeBlock(b: PushBlock): { x: number; y: number; z: number } {
  const a = node(b, b.seg);
  return {
    x: (((b.dirX * b.run) >> 7) & ~0x1f) + a.x,
    y: b.y,
    z: (((b.dirZ * b.run) >> 7) & ~0x1f) + a.z,
  };
}

/** Build the level's blocks from its table and the scene's paths. */
export function createPushBlocks(
  table: readonly PushBlockTable[],
  pathFor: (tag: number) => readonly { x: number; y: number; z: number }[] | null,
  groupFor: (collisionObject: number) => number,
  level = 0,
): PushState {
  const blocks: PushBlock[] = [];
  table.forEach((entry, index) => {
    const path = pathFor(entry.pathTag);
    if (!path || path.length < 2) return;
    // Level 12's block on tag 0x1d starts two segments in; every other block
    // starts at node 0 of segment 0.
    const seg = level === 12 && entry.pathTag === 0x1d ? 2 : 0;
    const start = path[seg]!;
    const block: PushBlock = {
      index,
      sceneObject: entry.sceneObject,
      collisionObject: entry.collisionObject,
      group: groupFor(entry.collisionObject),
      pathTag: entry.pathTag,
      path,
      x: start.x, y: start.y, z: start.z,
      dirX: 0, dirZ: 0,
      fallSpeed: 0, tipPoint: 0, run: 0, segLen: 0, segYaw: 0,
      seg, floorSeg: seg,
    };
    setPushSegment(block);
    blocks.push(block);
  });
  return {
    blocks, held: 0, pushYaw: 0, offsetX: 0, offsetZ: 0,
    soundCooldown: 0, freeze: 0, sounds: [], sparksSpent: [],
  };
}

/**
 * One tick of pushing (`FUN_00433700`).
 *
 * While Buzz holds a direction on the ground with nothing else going on, any
 * resting block he is leaning on side-on, and facing into, becomes the held
 * one. After that the block runs along its segment with him, and he is given
 * the velocity that keeps him at the offset he started at.
 */
export function stepPushBlocks(
  state: PushState,
  player: PushPlayer,
  holdingDirection: boolean,
  dt = 1,
): PushResult {
  state.sounds.length = 0;
  state.sparksSpent.length = 0;
  const result: PushResult = { moved: [], playerVelocity: null };

  if (state.soundCooldown > 0) state.soundCooldown = Math.max(0, state.soundCooldown - dt);
  if (state.freeze > 0) {
    state.freeze -= dt;
    result.playerVelocity = { x: 0, z: 0 };
  }

  // --- pick one up, or drop the one held.
  if (!holdingDirection || player.busy || !player.onGround) {
    state.held = 0;
  } else if (state.held === 0) {
    for (const b of state.blocks) {
      if (b.fallSpeed !== 0 || b.tipPoint < 0 || b.group < 0) continue;
      // Leaning on its side: a contact with this group whose face is upright.
      const contact = player.contacts.find((c) => c.group === b.group && Math.abs(c.normal.y) < 0.5);
      if (!contact) continue;
      // The direction the block would go: away from the face Buzz is on,
      // which is the contact normal turned half round. He has to be facing
      // within 0x180 of it for the push to take.
      const away = yawOf(-contact.normal.x, -contact.normal.z) & YAW_MASK;
      if (Math.abs(yawDelta(away, player.yaw)) > PUSH.facing) continue;

      state.held = b.index + 1;
      state.pushYaw = away;
      state.offsetX = (player.x - b.x) / GAME_UNITS_PER_LEVEL_UNIT;
      state.offsetZ = (player.z - b.z) / GAME_UNITS_PER_LEVEL_UNIT;
      if (state.soundCooldown === 0) {
        state.sounds.push('BUZPUSH1');
        state.soundCooldown = PUSH.soundCooldown;
      }
      state.sparksSpent.push(b.index);
      break;
    }
  }

  // --- everything already tipping or falling keeps going on its own.
  for (const b of state.blocks) {
    const before = { x: b.x, y: b.y, z: b.z };
    if (b.fallSpeed !== 0) {
      b.fallSpeed = Math.min(PUSH.terminal, b.fallSpeed + PUSH.gravity * dt);
      b.y += b.fallSpeed * dt;
      const landing = node(b, b.seg);
      if (b.y >= landing.y) {
        b.y = landing.y;
        b.fallSpeed = 0;
        b.run = 0;
        b.floorSeg = b.seg;
        setPushSegment(b);
        state.sounds.push('BOXFALL');
      }
      const now = { x: b.x, y: b.y, z: b.z };
      if (now.y !== before.y) result.moved.push({ index: b.index, dx: 0, dy: now.y - before.y, dz: 0 });
      continue;
    }
    if (b.tipPoint < 0) {
      // Sliding the rest of the segment on its own, then over the edge.
      b.run += PUSH.tipSpeed * dt;
      if (b.run >= b.segLen) {
        b.run = 0;
        // Skip the vertical segment: the block is in the air now.
        b.seg += 2;
        b.fallSpeed = 2;
        setPushSegment(b);
      }
      const now = placeBlock(b);
      b.x = now.x; b.z = now.z;
      if (now.x !== before.x || now.z !== before.z) {
        result.moved.push({ index: b.index, dx: now.x - before.x, dy: 0, dz: now.z - before.z });
      }
    }
  }

  // --- the held block.
  if (state.held !== 0) {
    const b = state.blocks[state.held - 1];
    if (!b || b.fallSpeed !== 0 || b.tipPoint < 0) { state.held = 0; return result; }
    const before = { x: b.x, z: b.z };
    const forward = Math.abs(yawDelta(state.pushYaw, b.segYaw)) < PUSH.alignment;
    const backward = Math.abs(yawDelta(state.pushYaw, (b.segYaw + 0x800) & YAW_MASK)) < PUSH.alignment;

    if (forward) {
      b.run += PUSH.speed * dt;
      if (b.run > b.segLen) {
        if (b.seg + 2 < b.path.length) { b.run -= b.segLen; b.seg += 1; setPushSegment(b); }
        else b.run = b.segLen;
      }
    } else if (backward) {
      b.run -= PUSH.speed * dt;
      if (b.run < 0) {
        if (b.seg > b.floorSeg) { b.seg -= 1; setPushSegment(b); b.run += b.segLen; }
        else b.run = 0;
      }
    }

    if (forward || backward) {
      const now = placeBlock(b);
      b.x = now.x; b.z = now.z;
      const dx = now.x - before.x, dz = now.z - before.z;
      if (dx !== 0 || dz !== 0) {
        result.moved.push({ index: b.index, dx, dy: 0, dz });
        state.sounds.push('BUZPUSH1');
      }
      // Buzz keeps the offset he started with.
      const wantX = b.x + state.offsetX * GAME_UNITS_PER_LEVEL_UNIT;
      const wantZ = b.z + state.offsetZ * GAME_UNITS_PER_LEVEL_UNIT;
      result.playerVelocity = { x: wantX - player.x, z: wantZ - player.z };
    }

    // Over the tipping point: let go, hold Buzz still and let it slide away.
    if (b.tipPoint > 0 && b.run >= b.tipPoint) {
      b.tipPoint = -1;
      state.held = 0;
      state.freeze = PUSH.freezeTicks;
      state.sounds.push('BUZCLIMB');
      result.playerVelocity = { x: 0, z: 0 };
    }
  }

  return result;
}

/** Where a block is, for drawing. Game units. */
export function pushBlockPosition(b: PushBlock): { x: number; y: number; z: number } {
  return { x: b.x, y: b.y, z: b.z };
}

/** The yaw a block's segment runs along, for a caller that wants to draw it. */
export function pushBlockYaw(b: PushBlock): number {
  return b.segYaw;
}
