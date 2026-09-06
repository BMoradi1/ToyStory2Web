/**
 * The talk box: the tutorial signposts and every character's dialogue.
 *
 * Ported from `FUN_00402610` (a hint sign starts one), `FUN_004027f0` (a
 * character does), `FUN_00402a10` (the per-tick script) and `FUN_00401a00` /
 * `FUN_00401c30` (the box itself) in toy2.exe. docs/LEVELS.md, "Hint signs
 * and the talk box", is the written spec.
 *
 * While a talk is up the engine freezes Buzz, takes the camera off the follow
 * camera and flies it along a path in `level.dat`, and reveals the text a
 * character at a time. The script that drives all that is a short list of
 * words with its arguments patched in, and it is the same list for every
 * signpost in the game — only the path, the text and the yaws differ.
 *
 * What is faithful here: the script and its opcodes, the two-cursor camera
 * flight with its easing, the word wrap, the reveal rate, the paging and the
 * keys. What is not: the box is drawn by the caller however it likes, since
 * the original's sprite layer does not exist yet, and the sound events are
 * named rather than played through the event table.
 *
 * Units are the sim's: game units, 12-bit yaw. `dt` is ticks, normally 1.
 */

import { YAW_MASK, idiv, yawOf } from './trig.ts';

/** A path out of `level.dat`, converted to game units. */
export interface TalkPath {
  points: readonly { x: number; y: number; z: number }[];
}

/** The two scripts in the executable, as word lists (docs/LEVELS.md). */
export const TALK_SCRIPT = {
  /** 0x4df69c: stand Buzz on node 0, fly from node 2, hold. */
  hint: [1, -1, 0, 4, 2, 3, -1, 10, 7, -1, 8, -1] as const,
  /**
   * 0x4df6cc. `FUN_004027f0` patches four words in place before running it:
   * the path tag at 1, the creature at 6 and 12, Buzz's yaw at 10 and the
   * creature's at 13. `buildDialogueScript` does the same.
   */
  dialogue: [0, 0, 1, -1, 0, 1, 0, 1, 2, -1, 0, 2, 0, 0, 4, 2, 3, -1, 10, 7, -1, 8, -1] as const,
} as const;

/**
 * The dialogue script with its arguments filled in: the path they stand on,
 * which creature is speaking, and the two yaws. A `playerYaw` of -1 means
 * "face each other", which the face opcode works out from the path's first
 * two nodes.
 */
export function buildDialogueScript(
  pathTag: number, creature: number, playerYaw: number, creatureYaw: number,
): number[] {
  const words: number[] = [...TALK_SCRIPT.dialogue];
  words[1] = pathTag;
  words[6] = creature;
  words[10] = playerYaw;
  words[12] = creature;
  words[13] = creatureYaw;
  return words;
}

/** How the box is doing, for the caller to draw. */
export enum BoxPhase {
  /** Scaling open from its centre. */
  Opening,
  /** Revealing characters. */
  Revealing,
  /** A page is full and waiting for the jump button. */
  Waiting,
  /** All the text has been shown; jump or fire closes it. */
  Done,
  /** Scaling shut. */
  Closing,
}

/** What the caller has to do to Buzz, and to the creature, while a talk runs. */
export interface TalkPlayerRequest {
  /** Put him here, in game units. Null means leave him alone. */
  moveTo: { x: number; y: number; z: number } | null;
  /** Turn him to this 12-bit yaw. Null means leave it. */
  faceYaw: number | null;
  /**
   * The same for the creature the script names, when it names one: a
   * dialogue stands its speaker on node 1 and turns it to face Buzz.
   */
  creature: {
    index: number;
    moveTo: { x: number; y: number; z: number } | null;
    faceYaw: number | null;
  } | null;
}

export interface TalkState {
  /** The word list being run, with its arguments already patched in. */
  script: readonly number[];
  pc: number;
  /** The path the camera flies and the script teleports onto. */
  path: TalkPath | null;
  /** Ticks left on a wait; -1 means "until the flight ends". */
  wait: number;
  /** The token slot to reveal when the box closes, or -1. */
  slot: number;

  /** Segment index of each cursor, and how far along the target's it has run. */
  eyeSegment: number;
  targetSegment: number;
  run: number;
  segmentLength: number;
  nextLength: number;
  speed: number;
  flying: boolean;

  /** Where the camera is and what it looks at, game units. */
  eye: { x: number; y: number; z: number };
  look: { x: number; y: number; z: number };
  /** 12-bit, as the engine stores them. */
  cameraYaw: number;
  cameraPitch: number;

  /** The wrapped text, at most fifteen rows of thirty-six columns. */
  lines: readonly string[];
  /** Which highlight state each character of each row is in (`^` toggles it). */
  marks: readonly boolean[][];
  /** The two rows on screen, and how much of the second is revealed. */
  topRow: number;
  shown: number;
  phase: BoxPhase;
  /** 0 to 0x1000 as the box opens, back to 0 as it shuts. */
  scale: number;
  /** Counts down to the next character. */
  revealDelay: number;
  /** Sound events raised this tick, for the caller. */
  sounds: string[];
  /** Set once the talk is over. */
  finished: boolean;
}

/** Rows and columns of the wrap buffer, from `FUN_00401a00`. */
export const TALK_BOX = {
  columns: 36,
  rows: 15,
  /** Rows visible at once. */
  window: 2,
  /** Ticks between revealed characters. */
  revealTicks: 2,
  /** The box scales open by this much a tick, to 0x1000. */
  openStep: 0x100,
  full: 0x1000,
} as const;

/**
 * Word-wrap as `FUN_00401a00` does it: break at spaces inside 36 columns,
 * and do not count the `^` characters, which toggle a highlight rather than
 * being drawn. Returns the rows and, per row, which characters are inside a
 * `^...^` pair.
 */
export function wrapTalkText(text: string): { lines: string[]; marks: boolean[][] } {
  const lines: string[] = [];
  const marks: boolean[][] = [];
  let line = '';
  let mark: boolean[] = [];
  let highlighted = false;

  const flush = () => {
    lines.push(line);
    marks.push(mark);
    line = '';
    mark = [];
  };

  for (const word of text.split(' ')) {
    // A word's printed width ignores the markers.
    const width = word.replace(/\^/g, '').length;
    const printed = line.replace(/\^/g, '').length;
    if (printed > 0 && printed + 1 + width > TALK_BOX.columns) flush();
    else if (printed > 0) { line += ' '; mark.push(highlighted); }
    for (const ch of word) {
      if (ch === '^') { highlighted = !highlighted; continue; }
      line += ch;
      mark.push(highlighted);
    }
  }
  if (line.length > 0) flush();
  return { lines: lines.slice(0, TALK_BOX.rows), marks: marks.slice(0, TALK_BOX.rows) };
}

/** Start a talk. `script` is one of `TALK_SCRIPT`, already patched. */
export function startTalk(
  script: readonly number[],
  path: TalkPath | null,
  text: string,
  slot = -1,
): TalkState {
  const { lines, marks } = wrapTalkText(text);
  return {
    script, pc: 0, path, wait: 0, slot,
    eyeSegment: 0, targetSegment: 0, run: 0, segmentLength: 0, nextLength: 0,
    speed: 0, flying: false,
    eye: { x: 0, y: 0, z: 0 },
    look: { x: 0, y: 0, z: 0 },
    cameraYaw: 0, cameraPitch: 0,
    lines, marks,
    topRow: 0, shown: 0,
    phase: BoxPhase.Opening, scale: 0, revealDelay: TALK_BOX.revealTicks,
    sounds: ['TEXTBOX1'],
    finished: false,
  };
}

/** One frame of input, as the box reads it: new presses only. */
export interface TalkInput { jump: boolean; fire: boolean }

const GAME_UNITS_PER_LEVEL_UNIT = 32;

function node(t: TalkState, index: number): { x: number; y: number; z: number } {
  const p = t.path?.points[index];
  return p ? { x: p.x, y: p.y, z: p.z } : { x: 0, y: 0, z: 0 };
}

function segmentLength(t: TalkState, index: number): number {
  const a = t.path?.points[index];
  const b = t.path?.points[index + 1];
  if (!a || !b) return 0;
  // Level units, as the engine measures the run.
  const dx = (b.x - a.x) / GAME_UNITS_PER_LEVEL_UNIT;
  const dy = (b.y - a.y) / GAME_UNITS_PER_LEVEL_UNIT;
  const dz = (b.z - a.z) / GAME_UNITS_PER_LEVEL_UNIT;
  return Math.trunc(Math.sqrt(dx * dx + dy * dy + dz * dz));
}

/** Point the camera at what it is looking at, the way `FUN_00402030` does. */
function aimCamera(t: TalkState): void {
  const dx = (t.look.x - t.eye.x) / GAME_UNITS_PER_LEVEL_UNIT;
  const dy = (t.look.y - t.eye.y) / GAME_UNITS_PER_LEVEL_UNIT;
  const dz = (t.look.z - t.eye.z) / GAME_UNITS_PER_LEVEL_UNIT;
  t.cameraYaw = yawOf(dx, dz);
  // The original squares both terms before the atan2, so the pitch comes out
  // flatter than the true angle. Kept as it is rather than corrected.
  const flat = dx * dx + dz * dz;
  t.cameraPitch = -yawOf(dy < 0 ? dy * dy : -(dy * dy), flat);
}

/**
 * Run the talk for one tick: the script, then the flight, then the box.
 * Returns what to do with Buzz this tick.
 */
export function stepTalk(t: TalkState, input: TalkInput, dt = 1): TalkPlayerRequest {
  const request: TalkPlayerRequest = { moveTo: null, faceYaw: null, creature: null };
  if (t.finished) return request;

  // --- the script. Opcodes run back to back until one waits.
  if (t.wait > 0) {
    t.wait -= dt;
  } else if (t.wait === 0 || (t.wait === -1 && !t.flying)) {
    if (t.wait === -1) {
      // The flight has ended: the engine steps over the spare word that
      // always follows a wait.
      t.wait = 0;
      t.pc += 1;
    }
    let guard = 0;
    for (; guard < 64; guard++) {
      const op = t.script[t.pc];
      if (op === undefined) break;
      if (op === 0) { t.pc += 2; continue; }          // select path: the caller supplied it
      if (op === 1) {                                  // teleport
        const who = t.script[t.pc + 1]!;
        const n = t.script[t.pc + 2]!;
        if (who === -1) request.moveTo = node(t, n);
        else {
          request.creature = { index: who, moveTo: node(t, n), faceYaw: request.creature?.faceYaw ?? null };
        }
        t.pc += 3;
        continue;
      }
      if (op === 2) {                                  // face
        const who = t.script[t.pc + 1]!;
        const yaw = t.script[t.pc + 2]!;
        if (who === -1) {
          // -1 means "at the other one": Buzz faces node 1 from node 0, plus
          // a half turn, which is the engine's own convention.
          request.faceYaw = yaw >= 0 ? yaw & YAW_MASK
            : (yawOf(node(t, 0).x - node(t, 1).x, node(t, 0).z - node(t, 1).z) + 0x800) & YAW_MASK;
        } else {
          // The creature faces the other way down the same pair of nodes.
          const facing = yaw >= 0 && t.script[t.pc + 2] !== 0
            ? yaw & YAW_MASK
            : yawOf(node(t, 0).x - node(t, 1).x, node(t, 0).z - node(t, 1).z) & YAW_MASK;
          request.creature = {
            index: who,
            moveTo: request.creature?.moveTo ?? null,
            faceYaw: facing,
          };
        }
        t.pc += 3;
        continue;
      }
      if (op === 3) {                                  // the target node
        const n = t.script[t.pc + 1]!;
        const last = Math.max(0, (t.path?.points.length ?? 1) - 1);
        t.targetSegment = n < 0 ? t.eyeSegment + ((last - t.eyeSegment) >> 1) : n;
        t.pc += 2;
        continue;
      }
      if (op === 4) { t.eyeSegment = t.script[t.pc + 1]!; t.pc += 2; continue; }
      if (op === 7) {                                  // wait
        const ticks = t.script[t.pc + 1]!;
        t.pc += 2;
        if (ticks < 0) { t.wait = -1; } else { t.wait = ticks; }
        break;
      }
      if (op === 10) {                                 // cut and start flying
        t.eye = node(t, t.eyeSegment);
        t.look = node(t, t.targetSegment);
        aimCamera(t);
        t.run = 0;
        t.speed = 0;
        t.segmentLength = Math.max(1, segmentLength(t, t.targetSegment));
        t.nextLength = segmentLength(t, t.targetSegment + 1);
        t.flying = true;
        t.pc += 1;
        continue;
      }
      if (op === -1) break;                            // hold until the box closes
      // Anything else is not in the engine's jump table; stop rather than spin.
      break;
    }
  }

  // --- the flight: two cursors at the same fraction of their own segments.
  if (t.flying && t.path) {
    const last = t.path.points.length - 2;
    t.speed -= idiv((t.speed - t.nextLength) * dt, 16);
    if (t.speed < 0x80) t.speed = 0x80;
    t.run += idiv(t.speed * dt, 32);
    if (t.run >= t.segmentLength) {
      if (t.targetSegment >= last) {
        t.run = t.segmentLength - 1;
        t.flying = false;
      } else {
        t.run -= t.segmentLength;
        t.eyeSegment += 1;
        t.targetSegment += 1;
        t.segmentLength = Math.max(1, segmentLength(t, t.targetSegment));
        t.nextLength = t.targetSegment >= last ? 0 : segmentLength(t, t.targetSegment + 1);
      }
    }
    const f = Math.min(1, t.run / t.segmentLength);
    const lerp = (seg: number) => {
      const a = node(t, seg);
      const b = node(t, seg + 1);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
    };
    t.eye = lerp(t.eyeSegment);
    t.look = lerp(t.targetSegment);
    aimCamera(t);
  }

  stepTalkBox(t, input, dt);
  return request;
}

/** The box itself (`FUN_00401c30`): open, reveal, page, close. */
function stepTalkBox(t: TalkState, input: TalkInput, dt: number): void {
  if (t.phase === BoxPhase.Opening) {
    t.scale += TALK_BOX.openStep * dt;
    if (t.scale >= TALK_BOX.full) { t.scale = TALK_BOX.full; t.phase = BoxPhase.Revealing; }
    return;
  }
  if (t.phase === BoxPhase.Closing) {
    t.scale -= TALK_BOX.openStep * dt;
    if (t.scale <= 0) { t.scale = 0; t.finished = true; }
    return;
  }

  // Fire closes it wherever it is.
  if (input.fire) { t.phase = BoxPhase.Closing; t.sounds.push('PICKUP5'); return; }

  if (t.phase === BoxPhase.Waiting) {
    if (input.jump) {
      t.topRow += TALK_BOX.window;
      t.shown = 0;
      t.phase = BoxPhase.Revealing;
      t.sounds.push('PICKUP1');
    }
    return;
  }
  if (t.phase === BoxPhase.Done) {
    if (input.jump) { t.phase = BoxPhase.Closing; t.sounds.push('PICKUP5'); }
    return;
  }

  // Revealing. Jump shows the rest of the page at once.
  const rowsLeft = t.lines.length - t.topRow;
  const pageRows = Math.min(TALK_BOX.window, rowsLeft);
  const pageLength = t.lines.slice(t.topRow, t.topRow + pageRows).reduce((n, l) => n + l.length, 0);
  if (input.jump) {
    t.shown = pageLength;
  } else {
    t.revealDelay -= dt;
    while (t.revealDelay <= 0 && t.shown < pageLength) {
      t.shown += 1;
      t.revealDelay += TALK_BOX.revealTicks;
    }
    if (t.revealDelay < 0) t.revealDelay = 0;
  }
  if (t.shown >= pageLength) {
    t.shown = pageLength;
    t.phase = t.topRow + TALK_BOX.window >= t.lines.length ? BoxPhase.Done : BoxPhase.Waiting;
  }
}

/** The two rows on screen, cut to what has been revealed. */
export function talkVisibleRows(t: TalkState): { text: string; marks: boolean[] }[] {
  const out: { text: string; marks: boolean[] }[] = [];
  let budget = t.shown;
  for (let i = 0; i < TALK_BOX.window; i++) {
    const row = t.lines[t.topRow + i];
    if (row === undefined) break;
    const take = Math.max(0, Math.min(row.length, budget));
    budget -= row.length;
    out.push({ text: row.slice(0, take), marks: (t.marks[t.topRow + i] ?? []).slice(0, take) });
  }
  return out;
}
