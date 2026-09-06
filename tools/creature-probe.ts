/**
 * Exercise the creature sim against a game install.
 *
 *   npx tsx tools/creature-probe.ts "Toy Story 2" [scene] [ticks]
 *
 * Every creature in every scene gets its own run with the player standing
 * beside it, because the engine only updates creatures within about 400 of
 * its 256-unit steps and a creature outside that radius simply freezes.
 *
 * What it asserts, per creature:
 *
 *   - it is updated at all, unless the constructor starts it dormant (type
 *     24, BPLANE, is built with health 0 — it exists only once something
 *     spawns it) or its placement carries the no-model flag, which the four
 *     stale 1998 lists in level07..10 do
 *   - it never leaves its home box, measured in the box's own rotated frame.
 *     The clamp in step 9 of the update is what guarantees this, and it is
 *     the single easiest thing to get wrong: a sign slip in the rotation
 *     lets enemies walk out of the level
 *   - its script makes progress, which is checked in a SECOND run with the
 *     player outside the home box. A creature that is chasing adds the tick
 *     back to its own wait timer, so its script is *supposed* to freeze on
 *     its blocking opcode until the player leaves — checking this with the
 *     player alongside would flag every hover bot in the game
 *
 * The player is moved in x and z only. Following a creature's height as well
 * feeds the chase standoff back into itself and sends the flyers climbing for
 * ever, which is a property of the test rig, not of the engine.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { GroupType, parseAll, readHitShapes } from '../src/formats/all.ts';
import { buildCollisionWorld, groundBelow, parseCollision } from '../src/formats/collision.ts';
import { unpackRaw } from '../src/formats/rnc.ts';
import {
  CREATURE_LIST_TYPE, parseCreatureList, parseCreatureModels, parseCreatureNames,
} from '../src/formats/creatures.ts';
import {
  CREATURE_FLAGS, CREATURE_HEALTH, RandomStream, attackFromPlayer, contactCreatures,
  createCreatureSim, creatureWorldFromCollision, setCreatureModels, stepCreatures,
  type CreatureModel,
} from '../src/sim/creatures.ts';
import { GAME_UNITS_PER_LEVEL_UNIT } from '../src/sim/player-constants.ts';
import { levelNumber } from '../src/sim/level-data.ts';

const rootArg = process.argv[2];
if (!rootArg) {
  console.error('usage: npx tsx tools/creature-probe.ts <game dir> [scene] [ticks]');
  process.exit(1);
}
const root: string = rootArg;
const onlyScene = process.argv[3];
const TICKS = Number(process.argv[4] ?? 300);
const S = GAME_UNITS_PER_LEVEL_UNIT;

const randPath = join(root, 'data', 'rand.dat');
if (!existsSync(randPath)) { console.error(`${randPath} is missing`); process.exit(1); }
const randBytes = readFileSync(randPath);
const cfgText = new TextDecoder('latin1').decode(readFileSync(join(root, 'data', 'creatures.cfg')));
const names = parseCreatureNames(cfgText);
const modelPaths = parseCreatureModels(cfgText);

/** Hit geometry per type, read from the model named in creatures.cfg. */
const models = new Map<number, CreatureModel>();
function modelFor(type: number): CreatureModel | null {
  if (models.has(type)) return models.get(type)!;
  const entry = modelPaths.get(type);
  if (!entry) return null;
  const path = join(root, entry.path);
  if (!existsSync(path)) return null;
  const groups = parseAll(readFileSync(path)).groups;
  const last = groups[groups.length - 1];
  if (!last || last.type !== GroupType.HitShapes || !last.hitSphere) return null;
  const shapes = readHitShapes(last);
  if (!shapes) return null;
  const model: CreatureModel = {
    offsetX: last.hitSphere.x, offsetY: last.hitSphere.y, offsetZ: last.hitSphere.z,
    hitRadius: last.hitSphere.radius, shapes,
  };
  models.set(type, model);
  return model;
}

/** The type the constructor deliberately starts dormant. */
const DORMANT_TYPE = 24;
/** Beyond this the second pass cannot get outside the box and stay in range. */
const OUTSIDE_REACH = 60_000;

const scenes: string[] = [];
for (let dir = 1; dir <= 10; dir++) {
  for (const name of ['level', 'level1']) {
    scenes.push(`level${String(dir).padStart(2, '0')}/${name}`);
  }
}

let failures = 0;
let creaturesRun = 0;
for (const scene of scenes) {
  if (onlyScene && scene !== onlyScene) continue;
  const [dir, name] = scene.split('/') as [string, string];
  const rawPath = join(root, 'data', dir, `${name}.raw`);
  const terrainPath = join(root, 'data', dir, name === 'level1' ? 'TERR1.ALL' : 'TERRAIN.ALL');
  if (!existsSync(rawPath) || !existsSync(terrainPath)) continue;

  let placements;
  try {
    const record = unpackRaw(readFileSync(rawPath)).find((r) => r.type === CREATURE_LIST_TYPE);
    if (!record) continue;
    placements = parseCreatureList(record.data);
  } catch (err) {
    console.log(`${scene.padEnd(16)} creature list failed: ${(err as Error).message}`);
    failures++;
    continue;
  }
  if (placements.length === 0) continue;

  const world = buildCollisionWorld(parseCollision(parseAll(readFileSync(terrainPath))).groups);
  const ground = creatureWorldFromCollision((x, y, z) => {
    const hit = groundBelow(world, x / S, y / S, z / S);
    return hit ? hit.y * S : null;
  });
  const level = levelNumber(scene) ?? 0;

  // Hit geometry for every type this scene uses, so the near test and the
  // contact test see the radii the original does.
  const sceneModels = new Map<number, CreatureModel>();
  for (const type of new Set(placements.map((p) => p.type))) {
    const model = modelFor(type);
    if (model) sceneModels.set(type, model);
  }

  let escaped = 0, idle = 0, stuck = 0, wrongTouch = 0;
  let touchable = 0;
  const notes: string[] = [];
  for (const target of placements) {
    // A fresh sim per creature, so one run cannot disturb the next.
    const sim = createCreatureSim(placements, ground, new RandomStream(randBytes), level);
    setCreatureModels(sim, sceneModels);
    const c = sim.creatures.find((q) => q.slot === target.slot)!;
    const player = { x: c.x + 400, y: c.y, z: c.z + 400 };
    const cursors = new Set<number>();
    let updated = 0, left = 0;

    for (let t = 0; t < TICKS; t++) {
      player.x = c.x + 400;
      player.z = c.z + 400;
      stepCreatures(sim, player);
      if ((c.flags & CREATURE_FLAGS.near) !== 0) updated++;
      cursors.add(c.pc);
      const dx = c.x - c.homeX, dz = c.z - c.homeZ;
      const a = (c.record.rangeYaw * 8 * 2 * Math.PI) / 4096;
      const bs = Math.sin(a), bc = Math.cos(a);
      // One unit of slack: the clamp works in fixed point and lands on the edge.
      if (Math.abs(dx * bc - dz * bs) > c.record.rangeX * 256 + 64
        || Math.abs(dz * bc + dx * bs) > c.record.rangeZ * 256 + 64) left++;
    }

    creaturesRun++;
    const label = `${names.get(c.type) ?? `type ${c.type}`} slot ${c.slot}`;
    if (left > 0) { escaped++; notes.push(`${label} left its home box on ${left} ticks`); }
    // A creature with no model is excused: the engine drops those from the
    // near list too, and the four stale 1998 lists are full of them.
    const excused = c.type === DORMANT_TYPE || (c.flags & CREATURE_FLAGS.noModel) !== 0;
    if (updated === 0 && !excused) { idle++; notes.push(`${label} was never updated`); }

    // Second pass, with the player outside the home box so nothing chases.
    // A script of one held pose is legitimate — the cast stands still — so
    // only scripts with somewhere to go are checked.
    const away = target.rangeX * 256 + 8000;
    if (!excused && c.script.length > 6 && away < OUTSIDE_REACH) {
      const sim2 = createCreatureSim(placements, ground, new RandomStream(randBytes), level);
      setCreatureModels(sim2, sceneModels);
      const c2 = sim2.creatures.find((q) => q.slot === target.slot)!;
      const seen = new Set<number>();
      let ran = 0;
      for (let t = 0; t < TICKS; t++) {
        stepCreatures(sim2, { x: c2.homeX + away, y: c2.homeY, z: c2.homeZ });
        if ((c2.flags & CREATURE_FLAGS.near) !== 0) ran++;
        seen.add(c2.pc);
      }
      if (ran > 0 && seen.size === 1) {
        stuck++;
        notes.push(`${label} never moved its script cursor off word ${c2.pc} with nothing chasing`);
      }
    }

    // Third run: stand on it, idle, and see what a touch does. A creature
    // that hurts on touch must hurt; a harmless one must never.
    if (!excused && sceneModels.has(c.type)) {
      const sim3 = createCreatureSim(placements, ground, new RandomStream(randBytes), level);
      setCreatureModels(sim3, sceneModels);
      const c3 = sim3.creatures.find((q) => q.slot === target.slot)!;
      const idlePlayer = { x: c3.x, y: c3.y, z: c3.z };
      let touched = 0, wrong = 0;
      for (let t = 0; t < 60; t++) {
        idlePlayer.x = c3.x + 200; idlePlayer.y = c3.y; idlePlayer.z = c3.z + 200;
        stepCreatures(sim3, idlePlayer);
        // Read the flag now: a script can set or clear "hurts on touch" as it
        // runs, so the placement's initial value is not what contact sees.
        const hurtsNow = (c3.flags & CREATURE_FLAGS.hurts) !== 0;
        for (const touch of contactCreatures(sim3, idlePlayer, attackFromPlayer({ spin: 0, spinCharge: 0 }))) {
          // Only this creature: standing on one often touches its neighbours,
          // and their reactions say nothing about this one's flag.
          if (sim3.creatures[touch.index] !== c3) continue;
          touched++;
          // Idle Buzz: hurt exactly when the creature hurts on touch.
          if (((touch.reaction & 2) !== 0) !== hurtsNow) wrong++;
        }
      }
      if (touched > 0) {
        touchable++;
        if (wrong > 0) {
          wrongTouch++;
          notes.push(`${label} hurt Buzz on ${wrong} of ${touched} touches against its own "hurts" flag`);
        }
      }
    }
  }

  const bad = escaped + idle + stuck + wrongTouch;
  failures += bad;
  console.log(
    `${scene.padEnd(16)} ${String(placements.length).padStart(3)} creatures, `
    + `${String(sceneModels.size).padStart(2)} models, ${String(touchable).padStart(3)} touchable  `
    + `${bad === 0 ? 'ok' : `${bad} PROBLEM(S)`}`);
  for (const note of notes) console.log(`    ${note}`);
}

console.log(`\n${creaturesRun} creature runs of ${TICKS} ticks`);
if (failures) { console.log(`${failures} problem(s)`); process.exit(1); }
console.log('all patrol inside their home boxes and run their scripts');
