/**
 * The level select's diorama: the 3D half of `FUN_00438a50`, decoded
 * 2026-09-08. The engine's "level 16" is `data/level06/level1.dat` with the
 * `level1t1.ngn` texture set — `FUN_00452fc0` takes ten off any level
 * number above ten, switches to the directory's `level1` scene and forces
 * texture set 1 (docs/FRONTEND.md "The level select") — an Etch A Sketch
 * with the fifteen levels' dioramas along it.
 *
 * Three things happen every tick, all in the scene's own paths (reached by
 * tag, docs/FORMATS.md):
 *
 *   - THE OBJECTS. Ids 0..99 are shown and 100..0x16e hidden, then for
 *     every open level a pair of lists in the executable (`0x4f6dc8`) hides
 *     the level's closed dressing and shows its open one. Ids 0x57..0x63
 *     are vehicles riding paths 7, 8 and 9 (`FUN_00438910`): a phase in
 *     eighths of a node steps 0x40 a tick and wraps five nodes before the
 *     end; the vehicle sits a lerp between two nodes and turns a quarter of
 *     the way toward its heading each tick.
 *   - THE CAMERA. Path 2 holds three camera nodes per level and path 1 the
 *     three points they look at. The camera picks one of the three at
 *     random each time it settles, flies toward it with an exponential
 *     ease, is nudged away from the boxes of path 3 on the way, and once
 *     there pushes in toward the look point a little and wobbles on three
 *     sine waves. Its pitch and yaw turn toward the node's look direction
 *     at a rate that falls with its speed; what the renderer gets is that
 *     eye eased by half each tick.
 *
 * Everything is integer arithmetic on game units (level units times 32),
 * as the routine's is.
 */
import { sin, yawOf, YAW_MASK } from '../sim/trig.ts';

export interface Vec3 { x: number; y: number; z: number }

/** The scene's paths the select reads, in LEVEL units, by their tag. */
export interface DioramaScene {
  /** Path 1: the look points, three per level position (index `3 * position + k`). */
  targets: Vec3[];
  /** Path 2: the camera nodes, three per position likewise. */
  nodes: Vec3[];
  /** Path 3: pairs of points, a centre and a corner, the camera is pushed out of. */
  boxes: Vec3[];
  /** Paths 7, 8 and 9: the vehicles' routes. */
  routes: ReadonlyMap<number, Vec3[]>;
}

export const DIORAMA = {
  /** Ids below this start shown, up to this one hidden. */
  shownBelow: 100,
  hiddenTo: 0x16e,
  /** The three vehicle groups: first id, how many, which path. */
  vehicles: [
    { first: 0x57, count: 2, route: 7 },
    { first: 0x59, count: 7, route: 8 },
    { first: 0x60, count: 4, route: 9 },
  ] as const,
  /** Where each vehicle starts on its route, in 256ths of a node. */
  phases: [0x3200, 0x6400, 0x9000, 0x5d00, 0x4d00, 0x4400, 0x2c00, 0x1000, 0xa00, 0x8b00, 0x6e00, 0x3800, 0x1000] as const,
  phaseStep: 0x40,
  /** A route wraps when the node passes `count - 5`. */
  routeTail: 5,
  /** The camera has arrived within this of its node, squared and shifted. */
  arrive: 0x4000001,
  /** How far it pushes toward the look point, in 1024ths of the way, and its rates. */
  pushMax: 14000,
  pushIn: 0x60,
  pushOut: 0x100,
  /** The wobble's three sine rates and shifts. */
  wobble: [[0x13, 5], [0x17, 4], [0x1d, 5]] as const,
  /** The eye's turn rate before it moves, and the constant its rate then falls from. */
  turnFirst: 0x10,
  turnOver: 0x2000,
  turnFloor: 0x100,
  /** The ease of the box push, and its cap. */
  pushScale: 0x800,
  pushCap: 0x180,
  /** `FUN_00451fd0`'s unit length. */
  unit: 0x1000,
} as const;

/** The i16 show and hide lists at `0x4f6dc8`, one pair per open level. */
export interface DioramaLists { hide: number[]; show: number[] }

/**
 * Read the lists out of the executable: the hide pointer sits four bytes
 * before the table and the show pointer at it, eight bytes a level, each
 * pointing at a -1-terminated run of i16 object ids.
 */
export function readDioramaLists(exe: Uint8Array, levels = 15): DioramaLists[] {
  const u32 = (a: number): number => (exe[a - 0x400000]! | (exe[a - 0x400000 + 1]! << 8) | (exe[a - 0x400000 + 2]! << 16) | (exe[a - 0x400000 + 3]! << 24)) >>> 0;
  const i16 = (a: number): number => ((exe[a - 0x400000]! | (exe[a - 0x400000 + 1]! << 8)) << 16) >> 16;
  const list = (at: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < 256; i++) {
      const v = i16(at + i * 2);
      if (v === -1) break;
      out.push(v);
    }
    return out;
  };
  const table = 0x4f6dc8;
  const out: DioramaLists[] = [];
  for (let i = 0; i < levels; i++) out.push({ hide: list(u32(table - 4 + i * 8)), show: list(u32(table + i * 8)) });
  return out;
}

/** Which object ids are hidden for `open` positions on offer (`FUN_004ccb20` at 0). */
export function hiddenObjects(lists: readonly DioramaLists[], open: number): Set<number> {
  const hidden = new Set<number>();
  for (let id = DIORAMA.shownBelow; id < DIORAMA.hiddenTo + 1; id++) hidden.add(id);
  for (let i = 0; i < open && i < lists.length; i++) {
    for (const id of lists[i]!.hide) hidden.add(id);
    for (const id of lists[i]!.show) hidden.delete(id);
  }
  return hidden;
}

export interface DioramaState {
  /** The camera's position (`local_c8`), its velocity and the eased eye the renderer gets. */
  cam: Vec3;
  vel: Vec3;
  eye: Vec3;
  /** The eye's angles, 12-bit, from `FUN_00438650`. */
  pitch: number;
  yaw: number;
  /** The eased look direction (`local_ec`) and its target, LEVEL units. */
  dir: Vec3;
  dirTarget: Vec3;
  /** How far in toward the look point (`local_144`), and the settle counter (`local_130`). */
  push: number;
  settle: number;
  /** Which of the position's three nodes (`local_114`). */
  pick: number;
  /** The vehicles' phases, in the order of `DIORAMA.vehicles`. */
  phases: number[];
  /** Each vehicle's position (game units) and yaw as the scene object holds them now. */
  vehicles: Map<number, { position: Vec3; yaw: number }>;
}

/** A vehicle's placing in the scene: LEVEL units and the engine's 12-bit yaw. */
export interface Placing { position: Vec3; yaw: number }

const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

/** The engine's floor-toward-zero shift of a signed value. */
const sar = (v: number, n: number): number => v >> n;
/** `(v + (v >> 31 & mask)) >> n`: division by a power of two toward zero. */
const div2 = (v: number, n: number): number => Math.trunc(v / (1 << n));

/** `FUN_00451fd0`: a 0x1000-long vector along `v`. */
function normalise(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len === 0) return v3();
  return v3(Math.trunc((v.x * DIORAMA.unit) / len), Math.trunc((v.y * DIORAMA.unit) / len), Math.trunc((v.z * DIORAMA.unit) / len));
}

/**
 * `FUN_00438650(record, rate)`: turn the yaw toward the direction's heading
 * and the pitch toward its rise, each by an eighth of the gap but no more
 * than `rate` a tick. The rise is an atan2 of the SQUARED components, sign
 * from the vertical, which is the engine's own oddity.
 */
function turnToward(s: DioramaState, dir: Vec3, rate: number, dt: number): void {
  const step = rate * dt;
  const yawTo = yawOf(dir.x, dir.z);
  let d = (yawTo - s.yaw) & YAW_MASK;
  if (d < 0x800) s.yaw += step <= d >> 3 ? step : d >> 3;
  else {
    const e = (0x1000 - d) >> 3;
    s.yaw -= e < step ? e : step;
  }
  s.yaw &= 0xffff;
  const h = dir.z * dir.z + dir.x * dir.x;
  const v = dir.y < 0 ? dir.y * dir.y : -(dir.y * dir.y);
  const rise = yawOf(v, h);
  d = -(rise + s.pitch) & YAW_MASK;
  if (d < 0x800) s.pitch += d >> 3 < step ? d >> 3 : step;
  else {
    const e = (0x1000 - d) >> 3;
    s.pitch -= e < step ? e : step;
  }
  s.pitch &= 0xffff;
}

/**
 * `FUN_00438790(position, velocity, path 3)`: for every box the camera is
 * inside — between its two heights and within the corner's radius of its
 * centre — push the velocity outward, harder toward the middle, up to
 * 0x180 a tick.
 */
function pushOutOfBoxes(cam: Vec3, vel: Vec3, boxes: readonly Vec3[]): void {
  const cy = div2(cam.y, 5), cz = div2(cam.z, 5), cx = div2(cam.x, 5);
  for (let i = 0; i + 1 < boxes.length; i += 2) {
    const c = boxes[i]!, k = boxes[i + 1]!;
    if (!(cy < c.y && k.y < cy)) continue;
    const rz = sar(k.z - c.z, 2), rx = sar(k.x - c.x, 2);
    const r2 = rz * rz + rx * rx;
    const dx = cx - c.x;
    const dz = cz - c.z;
    const d2 = sar(dz, 2) * sar(dz, 2) + sar(dx, 2) * sar(dx, 2);
    if (d2 >= r2) continue;
    let ox = dx, oz = dz;
    while (Math.abs(ox) > 0x4000 || Math.abs(oz) > 0x4000) { ox = sar(ox, 1); oz = sar(oz, 1); }
    const n = normalise(v3(ox, 0, oz));
    const push = Math.min(DIORAMA.pushCap, DIORAMA.pushScale - Math.trunc((d2 * DIORAMA.pushScale) / r2));
    vel.x += sar(n.x * push, 12);
    vel.z += sar(n.z * push, 12);
  }
}

/**
 * Start the diorama on the camera node the last visit left
 * (`DAT_0055a0e4`, zeroed when the cursor is past the open levels) with
 * the eye looking from that node toward the position shown.
 */
export function createDiorama(
  scene: DioramaScene, camNode: number, position: number, placedOf: (id: number) => Placing | null,
): DioramaState {
  const at = scene.nodes[camNode * 3 + 1] ?? v3();
  const eye = v3(at.x << 5, at.y << 5, at.z << 5);
  const target = scene.targets[position * 3 + 1] ?? v3();
  const node = scene.nodes[position * 3 + 1] ?? v3();
  const dir = v3(target.x - node.x, target.y - node.y, target.z - node.z);
  const s: DioramaState = {
    cam: { ...eye }, vel: v3(), eye: { ...eye }, pitch: 0, yaw: 0,
    dir: { ...dir }, dirTarget: { ...dir }, push: 0, settle: 3, pick: 1,
    phases: [...DIORAMA.phases], vehicles: new Map(),
  };
  for (const group of DIORAMA.vehicles) {
    for (let i = 0; i < group.count; i++) {
      const placing = placedOf(group.first + i);
      if (!placing) continue;
      const q = placing.position;
      s.vehicles.set(group.first + i, { position: v3(q.x << 5, q.y << 5, q.z << 5), yaw: placing.yaw });
    }
  }
  turnToward(s, s.dirTarget, DIORAMA.turnFirst, 1);
  return s;
}

export interface VehiclePose { id: number; position: Vec3; yaw: number }

export interface DioramaFrame {
  /** The eye and a point it looks at, game units. */
  eye: Vec3;
  look: Vec3;
  pitch: number;
  yaw: number;
  /** Where each vehicle is now, LEVEL units, and its yaw. */
  vehicles: VehiclePose[];
}

/**
 * One tick, for the position shown, the select's tick counter (its wobble
 * rides it) and the random table's next byte when the camera settles.
 */
export function stepDiorama(
  s: DioramaState, scene: DioramaScene, position: number, ticks: number,
  rand: () => number, dt = 1,
): DioramaFrame {
  // --- the vehicles ------------------------------------------------------
  const vehicles: VehiclePose[] = [];
  let slot = 0;
  for (const group of DIORAMA.vehicles) {
    const route = scene.routes.get(group.route) ?? [];
    for (let i = 0; i < group.count; i++, slot++) {
      const id = group.first + i;
      let phase = s.phases[slot]! + DIORAMA.phaseStep;
      if (route.length - DIORAMA.routeTail < phase >> 8) phase = 0;
      s.phases[slot] = phase;
      const n = phase >> 8, f = phase & 0xff, g = 0xff - f;
      const a = route[n], b = route[n + 1];
      if (!a || !b) continue;
      // Lerped in 256ths and rounded toward zero, as the engine's shifts are.
      const x = a.x * g + b.x * f, y = a.y * g + b.y * f, z = a.z * g + b.z * f;
      const position = v3(div2(x, 8), div2(y, 8), div2(z, 8));
      const held = s.vehicles.get(id);
      if (!held) continue;
      // The heading is measured from where the object is NOW — where it
      // was put last tick, or its placing on the first — in game units.
      const heading = yawOf(div2(z, 3) - held.position.z, held.position.x - div2(x, 3));
      const d = (held.yaw - heading - 0x800) & YAW_MASK;
      held.yaw = (held.yaw + (d < 0x801 ? -(d >> 2) : (0x1000 - d) >> 2)) & 0xffff;
      held.position = v3(div2(x, 3), div2(y, 3), div2(z, 3));
      vehicles.push({ id, position, yaw: held.yaw & YAW_MASK });
    }
  }

  // --- the camera --------------------------------------------------------
  const node = position * 3 + s.pick;
  const at = scene.nodes[node] ?? v3();
  const t = v3(
    div2(s.push * s.dir.x, 10) + at.x * 0x20 - s.cam.x,
    div2(s.push * s.dir.y, 10) + at.y * 0x20 - s.cam.y,
    div2(s.push * s.dir.z, 10) + at.z * 0x20 - s.cam.z,
  );
  const sx = sar(t.x, 7), sy = sar(t.y, 7), sz = sar(t.z, 7);
  const far = sx * sx + sy * sy + sz * sz;
  while (Math.abs(t.x) > 0x4000 || Math.abs(t.y) > 0x4000 || Math.abs(t.z) > 0x4000) {
    t.x = sar(t.x, 1); t.y = sar(t.y, 1); t.z = sar(t.z, 1);
  }
  let arrived: boolean;
  if (t.z * t.z + t.y * t.y + t.x * t.x < DIORAMA.arrive) {
    arrived = true;
    s.settle += dt;
    if ((s.settle & 0xff) < 3) {
      s.settle |= 3;
      s.pick = rand() % 3;
    }
    const [wx, wy, wz] = DIORAMA.wobble;
    t.x += sar(sin((ticks * wx[0]) & YAW_MASK), wx[1]);
    t.y += sar(sin((ticks * wy[0]) & YAW_MASK), wy[1]);
    t.z += sar(sin((ticks * wz[0]) & YAW_MASK), wz[1]);
    s.vel = v3(sar(t.x * dt, 4), sar(t.y * dt, 4), sar(t.z * dt, 4));
  } else {
    arrived = false;
    const n = normalise(t);
    s.settle = 3;
    s.vel.x += sar((sar(n.x, 1) - s.vel.x) * dt, 5);
    s.vel.y += sar((sar(n.y, 1) - s.vel.y) * dt, 4);
    s.vel.z += sar((sar(n.z, 1) - s.vel.z) * dt, 5);
  }
  pushOutOfBoxes(s.cam, s.vel, scene.boxes);
  s.cam.x += s.vel.x; s.cam.y += s.vel.y; s.cam.z += s.vel.z;

  const target = scene.targets[node] ?? v3();
  s.dirTarget = v3(target.x - at.x, target.y - at.y, target.z - at.z);
  s.dir.x += sar(s.dirTarget.x - s.dir.x, 4);
  s.dir.y += sar(s.dirTarget.y - s.dir.y, 4);
  s.dir.z += sar(s.dirTarget.z - s.dir.z, 4);
  if (arrived) s.push = Math.min(DIORAMA.pushMax, s.push + dt * DIORAMA.pushIn);
  else s.push = Math.max(0, s.push - dt * DIORAMA.pushOut);

  // The turn rate falls as the camera has further to go: the dropped
  // float here is the square root of the shifted distance.
  const speed = Math.trunc(Math.sqrt(far));
  turnToward(s, s.dirTarget, Math.trunc(DIORAMA.turnOver / (speed + DIORAMA.turnFloor)), dt);
  s.eye.x += sar(s.cam.x - s.eye.x, 1);
  s.eye.y += sar(s.cam.y - s.eye.y, 1);
  s.eye.z += sar(s.cam.z - s.eye.z, 1);

  // The renderer takes a point to look at: one along the eye's pitch and
  // yaw (yaw 0 is +Z, positive pitch looks down, +Y being down).
  const pitch = s.pitch & YAW_MASK, yaw = s.yaw & YAW_MASK;
  const cp = Math.cos((pitch * Math.PI) / 0x800), sp = Math.sin((pitch * Math.PI) / 0x800);
  const reach = 0x10000;
  const look = v3(
    s.eye.x + Math.round(cp * Math.sin((yaw * Math.PI) / 0x800) * reach),
    s.eye.y + Math.round(sp * reach),
    s.eye.z + Math.round(cp * Math.cos((yaw * Math.PI) / 0x800) * reach),
  );
  return { eye: { ...s.eye }, look, pitch, yaw, vehicles };
}

/** Pull the select's paths out of a parsed scene, or null if it has none. */
export function dioramaScene(paths: readonly { id: number; points: Vec3[] }[]): DioramaScene | null {
  const by = new Map(paths.map((p) => [p.id, p.points]));
  const targets = by.get(1), nodes = by.get(2);
  if (!targets || !nodes) return null;
  const routes = new Map<number, Vec3[]>();
  for (const route of [7, 8, 9]) routes.set(route, by.get(route) ?? []);
  return { targets, nodes, boxes: by.get(3) ?? [], routes };
}
