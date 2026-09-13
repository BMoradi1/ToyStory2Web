import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGameOver, stepGameOver, createCredits, stepCredits, CREDIT_TEXT, CREDIT_SLOTS } from '../src/front/endings.ts';
import { exeString } from '../src/sim/level-data.ts';
import { parseNgn, decodeBmp } from '../src/formats/ngn.ts';
const root = process.argv[2] ?? 'Toy Story 2';
const none = { now: 0, was: 0 }, press = { now: 0x4000, was: 0 };
const over = createGameOver();
for (let i = 0; i < 60; i++) stepGameOver(over, press);
assert.equal(over.remaining, 1140, 'first sixty ticks ignore presses');
stepGameOver(over, { now: 0x4000, was: 0x4000 });
assert.equal(over.remaining, 1139, 'held buttons cannot skip');
stepGameOver(over, press);
assert.equal(over.remaining, 24);
for (let i = 0; i < 23; i++) assert.equal(stepGameOver(over, none).done, null);
assert.equal(stepGameOver(over, none).done, 'exit');
assert.equal(over.fade.level, 0);
const timeout = createGameOver();
for (let i = 0; i < 1199; i++) assert.equal(stepGameOver(timeout, none).done, null);
assert.equal(stepGameOver(timeout, none).done, 'exit');
const ended = createGameOver();
stepGameOver(ended, none, true);
assert.equal(ended.remaining, 23);

const text = exeString(readFileSync(`${root}/toy2.exe`), CREDIT_TEXT);
assert.ok(text.length > 2000);
assert.ok(Math.max(...text.split('~').map(s => s.length)) < 64);
const credits = createCredits(text);
let ticks = 0, wraps = 0, last = 0;
for (; ticks < 10000; ticks++) {
  const r = stepCredits(credits, none);
  assert.equal(credits.rows.length, 40);
  assert.ok(r.frame.pictureAlpha! >= 0 && r.frame.pictureAlpha! <= 1);
  if (credits.backdrop !== last) { wraps++; last = credits.backdrop; }
  if (r.done) break;
}
assert.ok(ticks > 6000 && ticks < 10000, 'whole credit text scrolls then exits');
assert.ok(wraps >= 10, 'all ten backdrops cycle');
assert.equal(credits.fade.level, 0);
const skipped = createCredits(text);
for (let i = 0; i < 42; i++) stepCredits(skipped, press);
assert.equal(skipped.remaining, 4000);
stepCredits(skipped, press);
assert.equal(skipped.remaining, 53);
for (let i = 0; i < 52; i++) assert.equal(stepCredits(skipped, none).done, null);
assert.equal(stepCredits(skipped, none).done, 'exit');
for (const [bundle, wanted] of [['levelt1', [41, 89]], ['levelt3', CREDIT_SLOTS]] as const) {
  const textures = parseNgn(readFileSync(`${root}/data/level00/${bundle}.ngn`));
  const slots = textures.filter(t => t.slot !== null && wanted.includes(t.slot as never));
  assert.ok(slots.length >= (bundle === 'levelt3' ? 10 : 1));
  for (const t of slots) assert.ok(decodeBmp(t.bmp));
}
console.log(`Game-over input, timeout, music-end and fades passed; credits completed in ${ticks + 1} ticks with ${wraps} backdrop changes; original art decoded.`);
