/** Local retail data regression for sequence control flow and guide lifetime. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSoundSequences, startSequence, stepSequence } from '../src/audio/sequences.ts';
import { readSoundTable } from '../src/audio/events.ts';
import { parseDat } from '../src/formats/dat.ts';
import { readEffectTable } from '../src/formats/effect-table.ts';
import { RandomStream } from '../src/sim/creatures.ts';
import { createEffects, stepEffects, type EffectWorld } from '../src/sim/effects.ts';
import { createGuideSparkles, spendGuide, stepGuideSparkles } from '../src/sim/guide-sparkles.ts';
const root = process.argv[2] ?? 'Toy Story 2';
const exe = readFileSync(`${root}/toy2.exe`), table = readSoundSequences(exe);
const sounds = readSoundTable(exe, 4);
const at = { x: 0, y: 0, z: 0 };
function notes(id: number) {
  const voice = startSequence(table, id, at)!;
  const result: { tick: number; effect: number; volume: number }[] = [];
  for (let tick = 0; tick < 300 && voice.pc >= 0; tick++) {
    const note = stepSequence(table, voice);
    if (note) { assert(sounds.nameOfEffect(note.effect)); result.push({ tick, ...note }); }
  }
  return { voice, result };
}
const success = notes(-5), error = notes(-6);
assert.equal(success.voice.pc, -1); assert.equal(error.voice.pc, -1);
assert.deepEqual(error.result.map(n => n.volume), [64, 64, 16]);
assert.deepEqual(error.result.map(n => n.tick), [0, 11, 22]);
assert.equal(success.result[1]!.tick, 6);
assert(success.result.every(n => n.effect === 41));
assert.deepEqual(success.result.slice(-3).map(n => n.volume), [48, 32, 16]);
assert(notes(-3).voice.pc >= 0, 'looping cue stays active');
for (const id of [-1, -2, -4]) assert.equal(notes(id).voice.pc, -1);
assert.equal(startSequence(table, -7, at), null);
assert.throws(() => readSoundSequences(new Uint8Array(10)), /truncated/);
const malformed = { words: [-2, 0], starts: [0] };
const bad = startSequence(malformed, -1, at)!; stepSequence(malformed, bad); assert.equal(bad.pc, -1);

const dat = parseDat(readFileSync(`${root}/data/level04/level.dat`));
const path = dat.paths.find(p => p.id === 58)!.points;
const original = JSON.stringify(path), guides = createGuideSparkles(path);
assert.equal(guides.points.filter(p => p.kind === 0x71).length, 2);
assert.equal(guides.points.filter(p => p.kind === 0x73).length, 7);
const { kinds, modes } = readEffectTable(exe);
const effects = createEffects(kinds, modes, new RandomStream(new Uint8Array([0])));
const guide = guides.points.find(p => p.kind === 0x73 && p.index === 0)!;
const world: EffectWorld = { cameraX: guide.x, cameraY: guide.y, cameraZ: guide.z,
  playerX: 0, playerY: 0, playerZ: 0, playerYaw: 0, playerVx: 0, playerVz: 0, groundAt: () => null, waterY: null };
for (let i = 0; i < 15; i++) { stepEffects(effects, world); stepGuideSparkles(guides, effects, world); }
assert.equal(guides.phase, 0, 'no guide pass before tick 16');
for (let i = 0; i < 49; i++) { stepEffects(effects, world); stepGuideSparkles(guides, effects, world); }
const live = () => effects.effects.filter(e => e.life > 0 && e.kind === guide.kind && e.x === guide.x && e.y === guide.y && e.z === guide.z);
assert(live().length > 0, 'authored control guide is visible');
spendGuide(guides, effects, 0, true);
assert.equal(live().length, 0, 'existing guide removed immediately');
assert(guides.points.find(p => p.kind === 0x71 && p.index === 0 && !p.spent), 'primary index is independent');
for (let i = 0; i < 128; i++) { stepEffects(effects, world); stepGuideSparkles(guides, effects, world); }
assert.equal(live().length, 0, 'spent guide cannot respawn');
assert.equal(JSON.stringify(path), original, 'authored data is immutable');
assert(createGuideSparkles(path).points.every(p => !p.spent), 'fresh level restores guides');
console.log('PASS: retail sequence timing, shared error tail, looping cue, malformed input; authored guide cadence, retirement and reset.');
