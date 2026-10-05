import {GUNSLINGER_HANDLERS} from '../src/sim/gunslinger.ts';
/** Reproducible inventory of all playable scenes. Reads an install; ships no assets.
 * node --import tsx tools/game-audit.ts 'Toy Story 2' [--json] [--decompile /tmp/toy2_levels.c]
 * Static coverage is not a gameplay pass. Unmapped collision groups are leads,
 * not proof of missing movement; some are intentionally fixed or level-owned.
 */
import { readFileSync } from 'node:fs';
import { parseDat } from '../src/formats/dat.ts';
import { parseAll } from '../src/formats/all.ts';
import { parseCollision } from '../src/formats/collision.ts';
import { unpackRaw } from '../src/formats/rnc.ts';
import { CREATURE_LIST_TYPE, parseCreatureList, parseCreatureNames } from '../src/formats/creatures.ts';
import { LEVEL_SELECT_ORDER } from '../src/formats/save-file.ts';
import { CREATURE_TYPES } from '../src/sim/creature-data.ts';
import { CREATURE_HANDLERS } from '../src/sim/creatures.ts';
import { FINALE_HANDLERS } from '../src/sim/finale.ts';
import { LEVEL_TASKS, PUSH_BLOCKS, sceneForLevel, exeString } from '../src/sim/level-data.ts';
import { stompObjects } from '../src/sim/stomp-props.ts';
import { readPoles } from '../src/sim/poles.ts';
import { readZipLines } from '../src/sim/zip-lines.ts';
import { readFrontStrings } from '../src/front/screens.ts';

const root = process.argv[2] ?? 'Toy Story 2';
// Original per-level ticks; IDs are internal, not selector positions.
const originalTicks = ['', '00417680', '004190c0', '0041aa10', '0041c640',
  '0041e880', '00420060', '00421340', '00423200', '00424490', '00425f60',
  '0042a130', '0042b3a0', '0042ca60', '0042e790', '0042fc50'];
const decompileArg = process.argv.indexOf('--decompile');
if (decompileArg >= 0 && !process.argv[decompileArg + 1]) throw Error('--decompile requires a DumpAll.java output file');
const originalFunctions = new Map<string, string>();
if (decompileArg >= 0) {
  const source = readFileSync(process.argv[decompileArg + 1]!, 'utf8');
  for (const block of source.split(/^\/\/\/\/ FUNC /m).slice(1)) {
    const address = /^[^\n]+ @ ([0-9a-f]+)/.exec(block)?.[1];
    if (address) originalFunctions.set(address, block.slice(block.indexOf('\n')));
  }
}
const mutations = new Map([
  ['00487900', 'collision translation velocity'], ['00487970', 'collision angular velocity'],
  ['004ccc70', 'render rotation'], ['004cce30', 'render position'],
]);
function originalMotion(tick: string) {
  if (decompileArg < 0) return undefined;
  if (!originalFunctions.has(tick)) throw Error(`Original tick ${tick} missing from decompile; define it before dumping`);
  const visited = new Set<string>();
  const found: { caller: string; operation: string; object: string }[] = [];
  const inspect = (address: string) => {
    if (visited.has(address)) return;
    visited.add(address);
    for (const call of (originalFunctions.get(address) ?? '').matchAll(/FUN_([0-9a-f]{8})\(\s*([^,\n)]*)/g)) {
      const target = call[1]!;
      if (mutations.has(target)) {
        const arg = call[2]!.trim();
        found.push({ caller: address, operation: mutations.get(target)!,
          object: /^(0x[\da-f]+|\d+)$/.test(arg) ? String(Number(arg)) : 'computed: inspect original' });
      }
      // Follow level-local helpers only; this is deliberately not a whole-program call graph.
      if (target >= '00417000' && target < '00430000') inspect(target);
    }
  };
  inspect(tick);
  return [...new Map(found.map(f => [JSON.stringify(f), f])).values()];
}
const exe = readFileSync(`${root}/toy2.exe`);
const names = parseCreatureNames(readFileSync(`${root}/data/creatures.cfg`, 'latin1'));
const strings = readFrontStrings(exe, exeString);
const rows = LEVEL_SELECT_ORDER.map((level, index) => {
  const scene = sceneForLevel(level)!;
  try {
    const dat = parseDat(readFileSync(`${root}/data/${scene}.dat`));
    const terrain = scene.replace(/\/level1$/, '/TERR1.ALL').replace(/\/level$/, '/TERRAIN.ALL');
    const collision = parseCollision(parseAll(readFileSync(`${root}/data/${terrain}`)));
    const raw = unpackRaw(readFileSync(`${root}/data/${scene}.raw`));
    const record = raw.find(r => r.type === CREATURE_LIST_TYPE);
    if (!record) throw Error('missing creature placement record');
    const creatures = parseCreatureList(record.data);
    const typesWithoutSharedDefinition = [...new Set(creatures.map(c => c.type))]
      .filter(type => !CREATURE_TYPES[type]);
    const handlers = [...new Set(creatures.map(c => c.type))].flatMap(type => {
      const levelHandler=level===14&&type===58?'FUN_0042d3e0':level===8&&type===47?'FUN_00422660':level===2&&type===12?'FUN_00418ce0':level===2&&type===15?'FUN_004189c0':level===7&&type===26?'FUN_00420af0':level===4&&type===22?'FUN_0041b780':level===5&&type===32?'FUN_0041ddb0':level===15?FINALE_HANDLERS[type]:level===13&&type===61?'FUN_0042be60':((level===10&&type===31)||(level===11&&type===45))?GUNSLINGER_HANDLERS[level]:undefined;
      const handler = levelHandler??CREATURE_TYPES[type]?.handler;
      return handler ? [{ type, name: names.get(type), handler,
        implemented: !!levelHandler || handler in CREATURE_HANDLERS,
        slots: creatures.filter(c => c.type === type).map(c => c.slot) }] : [];
    });
    const pushes = PUSH_BLOCKS[level] ?? [];
    const dynamic = collision.groups.filter(g => g.dynamic && g.objectNumber >= 0).map(g => g.objectNumber);
    const tasks = LEVEL_TASKS[level];
    const paths = (id: number) => dat.paths.find(p => p.id === id)?.points ?? [];
    return {
      position: index + 1, level, name: strings.levelNames[index + 1], scene,
      originalTick: originalTicks[level],
      originalMotion: originalMotion(originalTicks[level]!),
      parsed: true, objects: dat.objects.length, creatures: creatures.length, typesWithoutSharedDefinition,
      handlers, unimplementedHandlers: handlers.filter(h => !h.implemented),
      dynamicCollision: [...new Set(dynamic)],
      collisionWithoutMappedController: [...new Set(dynamic)].filter(n => !pushes.some(p => p.collisionObject === n) && !(level===5&&[1,2,3,4,5,6,7,8,9,10,11,12,18,19].includes(n)) && !(level===7&&[0,1,2,3,4,7,8,9,10,11,12,13,14,15,18].includes(n)) && !(level === 14 && n === 0) && !(level===10&&[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,19].includes(n)) && !(level===13&&[1,2,5,8,10].includes(n)) && !(level===4&&[1,2,3,4,6,7,8,9,10,11,12,14,15,16,17,21,22,23,24,26].includes(n)) && !(level===11&&[1,2,3,4,17,18,5,11,10,6,7,8,9,12,13,14,15,16,22,23,25,26].includes(n))),
      motionControllers: level===5?['alley-platforms.ts (eight lane platforms, collision 5–12)', 'alley-traversal.ts (seesaws and spring, collision 1–3)', 'alley-bubbles.ts (machine switch, collision 4, moving pole attachments)', 'alley-bridge.ts (push trigger/collision swap, collision 18/19)']:level===7?['toy-barn-platforms.ts (six scripted platforms, collision 7–9/11–13)', 'toy-barn-rotors.ts (four rotors, collision 1–4)', 'toy-barn-launch-platforms.ts (boarding rides, collision 10/14)', 'toy-barn-springs.ts (surfaces 8/9)', 'toy-barn-barrier.ts (fetch barrier, collision 18)', 'toy-barn-cannon.ts (timed cannon/switch, collision 0/15)']:level===4?['paint-cans.ts (outdoor lids, collision 10/11/12)', 'construction-bridge.ts (stomp drawbridge, collision 26)', 'construction-shuttles.ts (scripted shuttles, collision 14–17)', 'construction-lifts.ts (linked tilting lifts, collision 1–4/6–9)', 'construction-scenery.ts (proximity artwork/portals)', 'construction-stomp-lift.ts (switches 22–24 and lift 21)']:level === 14 ? ['tarmac-plane.ts (collision 0)', 'tarmac-helicopter.ts (artwork/pickup motion)', 'tarmac-lights.ts (pads/lowering)', 'tarmac-scenery.ts (near/far sway)', 'tarmac-weather.ts (rain/lightning/thunder)'] : level===10 ? ['level-platforms.ts (lifts)', 'elevator-fans.ts (rotors, switches, airflow)'] : level===13 ? ['level-platforms.ts (lifts / airport routes; partial parity)'] : level===11 ? ['penthouse.ts (hazards, water / floats, train, spring / doors, scenery)'] : level===15 ? ['finale.ts (entrance bounce/rotation)'] : [],
      pushBlocks: pushes.length, stompObjectIds: stompObjects(level),
      poles: readPoles(paths(61)).length, zipLines: readZipLines(paths(62)).length,
      taskFeatures: tasks ? Object.keys(tasks) : [],
      bossController: level===14?'creatures.ts Smith attack + tasks.ts combat/reward':level===8?'buggy.ts + tasks.ts reward':level===2?'neighborhood.ts + tasks.ts reward':level===7?'dinosaur.ts + tasks.ts reward':level===4?'drill.ts + tasks.ts reward':level===5?'clown.ts + tasks.ts reward':level===10||level===11?'gunslinger.ts + tasks.ts reward':level === 13 ? 'prospector.ts + tasks.ts reward' : level === 3 ? 'slime-boss.ts' : level === 9 ? 'pod-boss.ts' : level === 12 ? 'zurg-boss.ts'
        : tasks?.bossFight ? 'tasks.ts stepBossFight' : level === 15 ? 'finale.ts (stage + three fighters)'
        : tasks?.boss ? 'taunt/reward hooks; inspect per-creature combat' : 'none',
    };
  } catch (e) {
    return { position: index + 1, level, name: strings.levelNames[index + 1], scene,
      parsed: false, error: (e as Error).message };
  }
});
if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 2));
else {
  console.log('# Generated game coverage inventory\n');
  console.log('Regenerate: `node --import tsx tools/game-audit.ts "Toy Story 2"`. Internal level IDs 3 and 6 differ from play order.\n');
  if (decompileArg >= 0) console.log('This snapshot includes `--decompile /path/to/toy2_levels.c` motion evidence. Supply a fresh local DumpAll.java output to regenerate that section.\n');
  console.log('This is static inventory, **not** a completed playthrough or parity score. Missing handlers are absent shared or known level-owned dispatch entries; level controllers may own related behavior. Unmapped dynamic collision objects need review, not automatic movement. Mapped controllers currently include push blocks, the Tarmac plane, Elevator Hop lifts/barrier, and Airport routes.\n');
  console.log('| Play order | Level | Scene parses | Creature hooks absent | Dynamic collision IDs without mapped controller | Poles / zip lines | Boss controller |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of rows) {
    console.log(`| ${r.position} (${r.level}) | ${r.name} | ${r.parsed ? 'yes' : r.error} | ${r.unimplementedHandlers?.map(h => `${h.name} (${h.type})`).join(', ') || '—'} | ${r.collisionWithoutMappedController?.join(', ') || '—'} | ${r.poles ?? '—'} / ${r.zipLines ?? '—'} | ${r.bossController ?? '—'} |`);
  }
  console.log('\n## Missing shared behavior hooks\n');
  for (const r of rows) for (const h of r.unimplementedHandlers ?? []) {
    console.log(`- ${r.name}: ${h.name}, type ${h.type}, slots ${h.slots.join(', ')} → ${h.handler}.`);
  }
  for (const r of rows) if (r.typesWithoutSharedDefinition?.length) console.log(`- ${r.name}: types without a shared creature definition ${r.typesWithoutSharedDefinition.map(t => `${names.get(t) ?? '?'} (${t})`).join(', ')}; may be NPCs, props or level-owned, not automatically missing behavior.`);
  console.log('\n## Existing task and prop coverage (implementation presence only)\n');
  for (const r of rows) console.log(`- ${r.name}: tasks ${r.taskFeatures?.join(', ') || 'none'}; ${r.pushBlocks ?? 0} push blocks; motion ${r.motionControllers?.join(', ') || 'none mapped'}; stomp-driven object IDs ${r.stompObjectIds?.join(', ') || 'none'}.`);
  if (decompileArg >= 0) {
    console.log('\n## Original motion call inventory\n');
    console.log('Static call sites from each tick and available level-local helpers. Conditions, speed, timing, indirect calls and port parity require review. Zero calls does not prove no movement.\n');
    for (const r of rows) {
      console.log(`\n### ${r.name} (tick ${r.originalTick})\n`);
      for (const m of r.originalMotion ?? []) console.log(`- ${m.caller}: ${m.operation}; object ${m.object}.`);
    }
  }
}
if (rows.some(r => !r.parsed)) process.exitCode = 1;
