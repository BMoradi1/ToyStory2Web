/** Verify summary timing and every sprite against the local install. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSummary, stepSummary, SUMMARY } from '../src/front/summary.ts';
import { PAD, readFrontStrings } from '../src/front/screens.ts';
import { exeString } from '../src/sim/level-data.ts';
import { readSpriteTable } from '../src/formats/sprite-table.ts';
import { parseNgn, decodeBmp } from '../src/formats/ngn.ts';
const root = process.argv[2] ?? 'Toy Story 2';
const exe = readFileSync(`${root}/toy2.exe`);
const prompt = readFrontStrings(exe, exeString).pressJumpToExit;
const table = readSpriteTable(exe, 0);
const textures = new Map(parseNgn(readFileSync(`${root}/data/level00/levelt1.ngn`))
  .filter(t => t.slot !== null && SUMMARY.sheets.includes(t.slot as never))
  .map(t => [t.slot!, decodeBmp(t.bmp)!]));
const random = readFileSync(`${root}/data/rand.dat`);
let at = 0;
const rand = () => random[at++ % random.length]!;
const base = { position: 2, enteredWith: 1, tokens: 0b10111, coins: 7, powerUps: 16 };
const state = createSummary(base);
let was = 0;
const tick = (word = 0) => {
  const r = stepSummary(state, { now: word, was }, prompt, rand);
  was = word;
  for (const item of r.frame.items) {
    if (item.kind !== 'sprite') continue;
    const header = table[item.index];
    assert.ok(header, `sprite ${item.index} exists`);
    const frame = header.frames[item.frame], texture = textures.get(header.texture);
    assert.ok(frame && texture, `sprite ${item.index} frame ${item.frame} has art`);
    assert.ok(frame.u + header.width <= texture.width && frame.v + header.height <= texture.height);
  }
  assert.ok(state.sparks.length <= 64);
  return r;
};
const lit: number[] = [];
let previous = state.shownTokens;
for (let i = 0; i < 700; i++) {
  const r = tick();
  assert.equal(r.done, null, 'summary waits for input');
  if (state.shownTokens !== previous) { lit.push(state.ticks); previous = state.shownTokens; }
}
assert.deepEqual(lit, [122, 152, 182], 'new tokens light sequentially, retained tokens stay lit');
assert.equal(state.remaining, 180);
assert.equal(state.shownCoins, 7);
assert.equal(state.shownTokens, base.tokens);
const icons = tick().frame.items.filter((i): i is Extract<typeof i, { kind: 'sprite' }> => i.kind === 'sprite' && i.index === 0x51);
assert.equal(icons[3]!.colour, 255, 'grapple icon uses bit 16');
assert.equal(icons[4]!.colour, 0, 'hover icon uses bit 8');
tick(PAD.jump);
assert.equal(state.remaining, 24, 'finished tally exits on jump');
for (let i = 0; i < 23; i++) assert.equal(tick(PAD.jump).done, null);
assert.equal(tick(PAD.jump).done, 'exit');
assert.equal(state.fade.level, 0);

const skipped = createSummary({ ...base, coins: 99, enteredWith: 0, tokens: 31 });
for (let i = 0; i < 121; i++) stepSummary(skipped, { now: 0, was: 0 }, prompt, rand);
stepSummary(skipped, { now: PAD.jump, was: 0 }, prompt, rand);
assert.equal(skipped.remaining, 120);
assert.equal(skipped.shownTokens, 31);
assert.equal(skipped.shownCoins, 99);
for (let i = 0; i < 119; i++) assert.equal(stepSummary(skipped, { now: PAD.jump, was: PAD.jump }, prompt, rand).done, null);
assert.equal(stepSummary(skipped, { now: 0, was: PAD.jump }, prompt, rand).done, 'exit');
assert.equal(base.coins, 7, 'tally never mutates gameplay results');
console.log('Summary: new/retained tokens, sparks, coins, power-up bits, input gates, fades and original sprite bounds passed.');
