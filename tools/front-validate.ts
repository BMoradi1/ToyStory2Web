/**
 * Check the front end's screens (src/front/screens.ts) against the rules
 * read out of `FUN_00437fb0`, `FUN_00437c40` and `FUN_00438a50`, with the
 * text and tables from the user's own executable.
 *
 *   npx tsx tools/front-validate.ts "Toy Story 2"
 */
import { readFileSync } from 'node:fs';
import { exeString } from '../src/sim/level-data.ts';
import {
  createListMenu, createSelect, createTitle, openLevels, PAD, readFrontStrings,
  stepListMenu, stepSelect, stepTitle, type PadWord,
} from '../src/front/screens.ts';
import { bigCell, layoutBigText, layoutMenuText, menuTextColour } from '../src/front/text.ts';
import { parseSaveFile } from '../src/formats/save-file.ts';

const dir = process.argv[2] ?? 'Toy Story 2';
const exe = new Uint8Array(readFileSync(`${dir}/toy2.exe`));
const strings = readFrontStrings(exe, exeString);
const SELECT_FLASH = 0xc0;
let bad = 0;
const check = (ok: boolean, what: string) => { if (!ok) { bad++; console.log(`FAIL ${what}`); } };

// --- the executable's text and tables ---------------------------------------
console.log('level names:', strings.levelNames.slice(1).join(' | '));
console.log('tokens wanted by count:', strings.tokensWanted.join(' '));
check(strings.levelNames.length === 16 && strings.levelNames.slice(1).every((s) => s.length > 0), 'fifteen level names');
check(strings.pressJump === 'press jump' && strings.needMoreTokens === 'you need more tokens', 'prompt text');
check(strings.tokensWanted[2] === 3 && strings.tokensWanted[5] === 10 && strings.tokensWanted[14] === 40, 'the boss levels want 3, 10, ..., 40');
check(strings.tokensWanted.filter((n) => n !== 0).length === 5, 'only the five boss slots want tokens');

// --- the fonts --------------------------------------------------------------
check(bigCell('a')?.u === 0 && bigCell('H')?.u === 224 && bigCell('i')?.v === 32, 'letters fill the rows');
check(bigCell('0')?.u === 64 && bigCell('0')?.v === 96 && bigCell('9')?.u === 96 && bigCell('9')?.v === 128, 'digits follow the letters');
check(bigCell("'")?.u === 224 && bigCell("'")?.v === 160 && bigCell(' ') === null, 'apostrophe and space');
const name = layoutBigText(strings.levelNames[2]!, 0x100, 0x20);
check(name.length === strings.levelNames[2]!.length - 1 && name[0]!.x === 0x100 - Math.trunc((strings.levelNames[2]!.length * 13) / 2), 'a name is centred, 13 apart, its space skipped');
check(layoutMenuText('start game').length === 9 && layoutMenuText('start game')[0]!.x === 0xa0 - 60, 'menu text centred on 160');
check(menuTextColour(0x80).alpha === 1 && menuTextColour(0).alpha === 1 && menuTextColour(0x7c).alpha < 0.03, 'the fade of "press jump"');

// --- the title ----------------------------------------------------------------
{
  const s = createTitle();
  const pad: PadWord = { now: 0, was: 0 };
  let done: string | null = null;
  for (let t = 0; t < 0x1e && done === null; t++) done = stepTitle(s, { now: PAD.jump, was: t === 0 ? 0 : PAD.jump }, strings).done;
  check(done === null && s.phase === 0, 'jump is ignored for the first 0x1e ticks');
  stepTitle(s, { now: 0, was: PAD.jump }, strings);
  const r = stepTitle(s, { now: PAD.jump, was: 0 }, strings);
  check(r.sounds.length === 1 && s.phase === 2 && s.wait === 0x17, 'jump after arming: the select sound and a 0x17 wait');
  let ticks = 0;
  while (done === null && ticks < 100) { done = stepTitle(s, pad, strings).done; ticks++; }
  check(done === 'menu' && ticks === 0x18, `the title hands over 0x18 ticks later (${ticks})`);
  const fresh = createTitle();
  done = null; ticks = 0;
  while (done === null && ticks < 2000) { done = stepTitle(fresh, pad, strings).done; ticks++; }
  check(done === 'timeout' && ticks === 901 + 0x18, `the attract timeout at 900 ticks (${ticks})`);
  check(fresh.fade.level === 0, 'faded to black by then');
}

// --- the list menu ------------------------------------------------------------
{
  const s = createListMenu();
  const idle: PadWord = { now: 0, was: 0 };
  let r = stepListMenu(s, idle, strings, false);
  check(r.frame.picture === 4 && r.frame.items.length === 7, 'the title picture, two cursor halves and five rows');
  const rows = r.frame.items.filter((i) => i.kind === 'menu') as { y: number; glyphs: unknown[] }[];
  check(rows.map((i) => i.y).join() === '120,140,160,180,200', 'rows 0x14 apart from 0x78');
  check(rows[0]!.glyphs.length === 9, '"start game" without its space');
  r = stepListMenu(createListMenu(), idle, strings, true);
  check((r.frame.items[2] as { glyphs: unknown[] }).glyphs.length === 12, '"continue game" once a game is going');
  for (let t = 0; t < 0x20; t++) stepListMenu(s, idle, strings, false);
  stepListMenu(s, { now: PAD.down, was: 0 }, strings, false);
  check(s.target === 0x8c && s.cursorY === 0x7a, 'down moves the target a row and the cursor two');
  const r2 = stepListMenu(s, { now: PAD.down, was: 0 }, strings, false);
  check(s.target === 0x8c && r2.sounds.length === 0, 'a press while the cursor slides is ignored');
  for (let t = 0; t < 12; t++) stepListMenu(s, idle, strings, false);
  check(s.cursorY === 0x8c, 'the cursor settles on the row');
  for (let i = 0; i < 4; i++) { stepListMenu(s, { now: PAD.down, was: 0 }, strings, false); for (let t = 0; t < 12; t++) stepListMenu(s, idle, strings, false); }
  check(s.target === 0xc8, 'the cursor stops at the last row');
  const r3 = stepListMenu(s, { now: PAD.jump, was: 0 }, strings, false);
  check(r3.done === 'exit', 'jump on "exit" leaves at once');
  const m = createListMenu();
  for (let t = 0; t < 0x20; t++) stepListMenu(m, idle, strings, false);
  stepListMenu(m, { now: PAD.jump, was: 0 }, strings, false);
  let done: string | null = null;
  let ticks = 0;
  while (done === null && ticks < 100) { done = stepListMenu(m, idle, strings, false).done; ticks++; }
  check(done === 'start' && ticks === 0x18, `"start game" after the wait (${ticks})`);
}

// --- the level select -----------------------------------------------------------
{
  const idle: PadWord = { now: 0, was: 0 };
  const fresh = new Array<number>(16).fill(0);
  check(openLevels(fresh, strings.tokensWanted).count === 0, 'a fresh record has nothing open');
  let s = createSelect(fresh, strings, 0, 0);
  check(s.open === 1 && s.pos === 1 && s.held === 0 && s.wanted === 0, 'one level on offer');
  let r = stepSelect(s, idle, strings);
  const names = r.frame.items.filter((i) => i.kind === 'big');
  check(names.length === 3, 'the name and the two prompts');
  const prompt = names[1] as { glyphs: { x: number }[] };
  check(prompt.glyphs[0]!.x === -293 - Math.trunc((14 * 13) / 2), 'the prompts are centred on -293, off screen, as the PC build draws them');
  check(!r.frame.items.some((i) => i.kind === 'sprite' && i.index === 57), 'no arrows with one level');
  while (s.ticks < 0x3c) stepSelect(s, { now: PAD.jump, was: 0 }, strings);
  check(s.phase === 0, 'jump is ignored for the first 0x3c ticks');
  r = stepSelect(s, { now: PAD.jump, was: 0 }, strings);
  check(s.phase === 2 && r.sounds[0] === 1, 'and picks on the next');
  let done: string | null = null;
  let ticks = 0;
  while (done === null && ticks < 100) { done = stepSelect(s, idle, strings).done; ticks++; }
  check(done === 'pick' && ticks === 0x1a && s.fade.level === 0x80 - 3 * 0x1a, `picked 0x1a ticks on, three greys darker a tick (${ticks}, grey ${s.fade.level})`);

  // Two levels cleared with a token each: the boss wants three.
  const two = fresh.slice();
  two[1] = 0x81; two[2] = 0x81;
  s = createSelect(two, strings, 0, 0);
  check(s.open === 3 && s.held === 2 && s.wanted === 3, 'two open, two held, the boss wants three');
  check(s.pos === 2, 'a level cleared for the first time moves the cursor on');
  s = createSelect(two, strings, 0, 0x81);
  check(s.pos === 1, 'not when it was entered with tokens already');
  for (let t = 0; t < 0x3d; t++) stepSelect(s, idle, strings);
  stepSelect(s, { now: PAD.right, was: 0 }, strings); stepSelect(s, idle, strings);
  stepSelect(s, { now: PAD.right, was: 0 }, strings); stepSelect(s, idle, strings);
  check(s.pos === 3, 'right twice');
  const r4 = stepSelect(s, { now: PAD.right, was: 0 }, strings);
  check(s.pos === 3 && r4.sounds.length === 0, 'and no further');
  r = stepSelect(s, { now: PAD.jump, was: 0 }, strings);
  check(s.phase === 0 && s.flash === SELECT_FLASH - 1 && r.sounds[0] === 1, 'short of tokens: the flash, not a pick');
  const sign = r.frame.items.filter((i) => i.kind === 'sprite' && (i.index === 55 || (i.index === 58 && i.x === 0xf4)));
  check(sign.length === 2, 'the sign and the number wanted');
  let redTicks = 0;
  let textTicks = 0;
  for (let t = 0; t < 0xc0; t++) {
    const f = stepSelect(s, idle, strings).frame;
    if (f.items.some((i) => i.kind === 'sprite' && i.index === 58 && typeof i.colour !== 'number')) redTicks++;
    if (f.items.some((i) => i.kind === 'big' && i.glyphs.length === 17)) textTicks++;
  }
  check(s.flash <= 0, 'the flash runs out');
  // The count is red while `(flash & 0x3f) >= 0x19` before the tick's
  // decrement, the text up while `> 0x18` after it: 39 of every 64 ticks,
  // the text one tick behind and gone with the flash.
  check(redTicks === 3 * 39 && textTicks === 3 * 39 - 1, `red for 39 of every 64 ticks (${redTicks}, text ${textTicks})`);
  const back = createSelect(two, strings, 2, 0x81);
  for (let t = 0; t < 0x3d; t++) stepSelect(back, idle, strings);
  const r5 = stepSelect(back, { now: PAD.cancel, was: 0 }, strings);
  check(back.phase === 2 && back.cancelled && r5.sounds[0] === 3, 'cancel: the sound and the fade');
  done = null; ticks = 0;
  while (done === null && ticks < 100) { done = stepSelect(back, { now: PAD.cancel, was: PAD.cancel }, strings).done; ticks++; }
  check(done === 'cancel' && ticks === 0x1a, `cancelled after the fade (${ticks})`);

  // The repeat: a held direction fires again after 0x20 ticks, then every sixteen.
  const all = fresh.map((_, i) => (i === 0 ? 0 : 0x80));
  s = createSelect(all, strings, 0, 0x80);
  check(s.open === 15 && s.pos === 1, 'every level visited: fifteen on offer');
  const held: PadWord = { now: PAD.right, was: 0 };
  for (let t = 0; t < 60; t++) { stepSelect(s, held, strings); held.was = held.now; }
  check(s.pos === 5, `held right 60 ticks moves four (${s.pos})`);

  // The install's own record, if it has one.
  try {
    const save = parseSaveFile(readFileSync(`${dir}/Toy200.sav`), 0);
    if (save.progress) {
      const o = openLevels(save.progress.tokens, strings.tokensWanted);
      console.log(`Toy200.sav: ${o.count} open, ${o.held} tokens held, next wants ${o.wanted}`);
    }
  } catch { /* no save in the install */ }
}

console.log(bad === 0 ? 'front end: every check passed' : `front end: ${bad} checks failed`);
process.exit(bad === 0 ? 0 : 1);
