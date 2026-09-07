/**
 * Dump and check the sound event table (src/audio/events.ts).
 *
 *   npx tsx tools/sound-events.ts "Toy Story 2" [level]
 *
 * Every non-empty event has to resolve to an effect name, and every name has
 * to be a file the install actually holds. Anything that does not is either a
 * misread table or a sound this copy of the game is missing, and the two look
 * the same from inside the browser — hence this.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { readSoundTable } from '../src/audio/events.ts';

const dir = process.argv[2] ?? 'Toy Story 2';
const only = process.argv[3] !== undefined ? Number(process.argv[3]) : null;
const exe = readFileSync(`${dir}/toy2.exe`);

const onDisc = new Set<string>();
try {
  for (const f of readdirSync(`${dir}/data/sfx`)) {
    if (f.toLowerCase().endsWith('.wav')) onDisc.add(f.slice(0, -4).toLowerCase());
  }
} catch { /* no sfx directory: only the table is checked */ }

/** Effects nothing supplies on any level: the speech the PC build dropped. */
const SPEECH_FIRST = 62;
const SPEECH_LAST = 86;

let speech = 0;
let unused = 0;
let broken = 0;
let missing = 0;
const missingNames = new Set<string>();
const brokenAt: string[] = [];

for (let level = 0; level <= 16; level++) {
  if (only !== null && level !== only) continue;
  const table = readSoundTable(exe, level);
  let used = 0;
  let named = 0;
  let levelSpeech = 0;
  let levelUnused = 0;
  for (let event = 0; event < table.events.length; event++) {
    const record = table.events[event]!;
    if (record.effect < 1) continue;
    used++;
    const name = table.nameOf(event);
    if (!name) {
      // Two kinds of gap are expected. The block from 62 to 86 is the
      // characters' speech, which no table on the PC supplies at all. Above
      // that, an event can name an effect past the end of THIS level's own
      // list — the table is shared, and a level only carries the names it
      // raises.
      if (record.effect >= SPEECH_FIRST && record.effect <= SPEECH_LAST) { speech++; levelSpeech++; }
      else if (record.effect > SPEECH_LAST) { unused++; levelUnused++; }
      else { broken++; brokenAt.push(`level ${level} event 0x${event.toString(16)} effect ${record.effect}`); }
      continue;
    }
    named++;
    if (onDisc.size > 0 && !onDisc.has(name.toLowerCase())) {
      missing++;
      missingNames.add(name);
    }
    if (only !== null) {
      console.log(
        `  ${event.toString(16).padStart(3)}  effect ${String(record.effect).padStart(3)}  ` +
        `${name.padEnd(9)} vol ${String(record.volume).padStart(3)} pri ${String(record.priority).padStart(2)}` +
        `${record.sustained ? ' sustained' : ''}` +
        `${onDisc.size > 0 && !onDisc.has(name.toLowerCase()) ? '   NOT ON DISC' : ''}`,
      );
    }
  }
  console.log(
    `level ${String(level).padStart(2)}: ${used} events, ${named} named, ` +
    `${levelSpeech} speech, ${levelUnused} not on this level`,
  );
}

if (onDisc.size > 0) console.log(`${onDisc.size} effect files on disc`);
if (missingNames.size > 0) console.log(`named but absent: ${[...missingNames].join(' ')}`);
console.log(`${speech} events name the dropped speech, ${unused} name an effect their level does not carry`);
for (const line of brokenAt.slice(0, 10)) console.log(`unexplained: ${line}`);
const bad = broken + missing;
console.log(bad === 0
  ? 'every effect resolves to a file on disc, or is one of the two known gaps'
  : `${bad} do not resolve`);
process.exitCode = bad === 0 ? 0 : 1;
