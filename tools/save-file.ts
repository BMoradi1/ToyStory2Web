/**
 * npx tsx tools/save-file.ts "Toy Story 2"
 *
 * Reads every Toy2NN.sav in the install root and the 1999 one in data/,
 * prints what they decode to, and checks the decode's predictions: the
 * container parses to the byte, a release-size game slot's fields are all
 * in range, and its token bits never use anything but bits 0..4 and 7.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LEVEL_SELECT_ORDER, parseSaveFile, tokenCount } from '../src/formats/save-file.ts';

const root = process.argv[2];
if (!root) { console.error('usage: npx tsx tools/save-file.ts <game dir>'); process.exit(1); }

const files: { path: string; slot: number }[] = [];
for (const dir of [root, join(root, 'data')]) {
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    const m = /^Toy2(\d\d)\.sav$/i.exec(name);
    if (m) files.push({ path: join(dir, name), slot: Number(m[1]) });
  }
}
let fail = 0;
for (const f of files) {
  const bytes = readFileSync(f.path);
  const save = parseSaveFile(bytes, f.slot);
  const head = `${f.path}: ${bytes.length} bytes, name "${save.name}", block ${save.block.length}${save.release ? '' : ' (older layout)'}`;
  if (!save.progress) { console.log(head + (f.slot === 99 ? ', the options slot' : ', no progress read')); continue; }
  const p = save.progress;
  const ok = p.lives <= 99 && p.level <= 14 && p.sfx <= 10 && p.bgm <= 10 && p.health <= 14
    && p.tokens.slice(1).every((t) => (t & ~0x9f) === 0);
  if (!ok) fail++;
  const held = p.tokens.map((t, n) => (n && (t & 0x1f)) ? `L${n}:${(t & 0x1f).toString(2).padStart(5, '0')}` : '').filter(Boolean).join(' ');
  console.log(head);
  console.log(`  lives ${p.lives}, select cursor ${p.level} (internal level ${LEVEL_SELECT_ORDER[p.level]}), health ${p.health}, power-ups ${p.powerUps.toString(2)}`);
  console.log(`  camera ${p.activeCamera ? 'active' : 'passive'}, sfx ${p.sfx}/10, bgm ${p.bgm}/10`);
  console.log(`  tokens ${tokenCount(p)}/50 ${held}`);
  console.log(`  completed ${p.completed.map((c, i) => c ? i : -1).filter((i) => i >= 0).join(',') || 'none'}; all tokens ${p.allTokens}; game beaten ${p.gameBeaten}${ok ? '' : '  FAIL: a field is out of range'}`);
}
console.log(fail === 0 ? `\n${files.length} files parse and every field is in range` : `\nFAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
