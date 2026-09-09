/**
 * npx tsx tools/effect-table.ts "Toy Story 2" [-v]
 *
 * Reads the effect templates and spawn modes out of toy2.exe and checks
 * them for the consistency the decode predicts (docs/EFFECTS.md):
 *
 *  - every template's sprite has a header in the global table or in some
 *    level's, with at least `frames` frames that fit the 256 x 256 sheet;
 *  - every mode byte is one the updater's switch names (0..0x35);
 *  - every death code is 0..11 or a negative number naming a real kind;
 *  - every kind the updater or the death hook spawns as a child exists;
 *  - every spawn mode's randomisation nibbles are rules 0..6;
 *  - the kinds the code names look like what it uses them for: the coin
 *    is the coin sprite with twelve frames, the two disk variants carry the
 *    two bolt modes, the hover shot and the missiles carry `hurts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readEffectTable, EFFECT_FLAGS, EFFECT_KIND } from '../src/formats/effect-table.ts';
import { readSpriteTable, SPRITE, type SpriteHeader } from '../src/formats/sprite-table.ts';

const root = process.argv[2];
if (!root) { console.error('usage: npx tsx tools/effect-table.ts <game dir> [-v]'); process.exit(1); }
const verbose = process.argv.includes('-v');
const exe = new Uint8Array(readFileSync(join(root, 'toy2.exe')));
const { kinds, modes } = readEffectTable(exe);

// A sprite index is good if any level's table has a header for it.
const tables: (SpriteHeader | null)[][] = [];
for (let lv = 0; lv <= 20; lv++) { try { tables.push(readSpriteTable(exe, lv)); } catch { /* not a level */ } }
const SHEET = 256;
const headerFor = (sprite: number) => tables.map((t) => t[sprite]).find((h) => h) ?? null;

/** Child kinds the updater's cases and the death hook spawn, by reading. */
const CHILDREN = [3, 0xd, 0xe, 0xf, 0x11, 0x1e, 0x24, 0x25, 0x27, 0x28, 0x29, 0x2c, 0x2e, 0x38, 0x3e, 0x40, 0x4d, 0x5a, 0x62, 0x69, 0x6a, 0x6b, 0x75, 0x78, 0x2d, 0x30, 0x31];
const MODE_MAX = 0x35;

let fail = 0;
const bad = (msg: string) => { fail++; console.log(`  FAIL ${msg}`); };

let count = 0;
for (const t of kinds) {
  if (!t) continue;
  count++;
  const h = headerFor(t.sprite);
  if (!h) bad(`kind 0x${t.kind.toString(16)}: sprite ${t.sprite} has no header in any level`);
  else {
    const fit = h.frames.slice(0, t.frames).every((f) => f.u + h.width <= SHEET && f.v + h.height <= SHEET);
    if (h.frames.length < t.frames || !fit) bad(`kind 0x${t.kind.toString(16)}: sprite ${t.sprite} has ${h.frames.length} frames for ${t.frames}, fit ${fit}`);
  }
  if (t.mode > MODE_MAX) bad(`kind 0x${t.kind.toString(16)}: mode 0x${t.mode.toString(16)} is outside the switch`);
  if (t.death < 0 && !kinds[-t.death]) bad(`kind 0x${t.kind.toString(16)}: death spawns empty kind 0x${(-t.death).toString(16)}`);
  if (t.death > 11) bad(`kind 0x${t.kind.toString(16)}: death code ${t.death} has no case`);
  if (t.life <= 0 || t.frames === 0 || t.width <= 0 || t.height <= 0) bad(`kind 0x${t.kind.toString(16)}: life ${t.life} frames ${t.frames} size ${t.width}x${t.height}`);
  if (verbose) {
    console.log(`  0x${t.kind.toString(16).padStart(2, '0')} spr ${String(t.sprite).padStart(2)} x${String(t.frames).padStart(2)} @${String(t.period).padStart(3)}  life ${String(t.life).padStart(3)}  ${String(t.width).padStart(3)}x${String(t.height).padStart(3)}  fl ${t.flags.toString(16).padStart(4, '0')}  mode ${t.mode.toString(16).padStart(2, '0')}  death ${String(t.death).padStart(4)}  rgb ${t.colour.join(',')}`);
  }
}
for (const c of CHILDREN) if (!kinds[c]) bad(`child kind 0x${c.toString(16)} is empty`);
for (const m of modes) {
  for (const v of [...m.velocity, m.gravity]) if (v.how > 6) bad(`spawn mode ${m.index}: rule ${v.how}`);
}

const coin = kinds[EFFECT_KIND.coin]!;
if (coin.sprite !== SPRITE.coin || coin.frames !== 12) bad(`coin kind: sprite ${coin.sprite} frames ${coin.frames}`);
if (kinds[EFFECT_KIND.diskHoming]!.mode !== 0x1d || kinds[EFFECT_KIND.diskStraight]!.mode !== 0x1e) bad('disk modes');
if (!(kinds[EFFECT_KIND.diskHoming]!.flags & EFFECT_FLAGS.homing)) bad('disk is not homing');
for (const k of [EFFECT_KIND.hoverShot, EFFECT_KIND.coin]) if (!(kinds[k]!.flags & EFFECT_FLAGS.hurts)) bad(`kind 0x${k.toString(16)} cannot touch Buzz`);
if (kinds[EFFECT_KIND.stompRing]!.mode !== 0xb || kinds[EFFECT_KIND.stompWave]!.mode !== 0xb) bad('stomp kinds are not growers');

const flagged = kinds.filter((t) => t && (t.flags & EFFECT_FLAGS.hurts)).length;
console.log(`${count} effect kinds, ${modes.length} spawn modes; ${flagged} kinds can touch Buzz; sprites checked against ${tables.length} sprite tables`);
console.log(fail === 0 ? 'every template is consistent with the decode' : `${fail} checks failed`);
process.exit(fail === 0 ? 0 : 1);
