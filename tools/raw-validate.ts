/**
 * Unpack every `.raw` container in the install and report what is inside.
 *
 *   npx tsx tools/raw-validate.ts "Toy Story 2" [--creatures]
 *
 * Exit 1 if any record fails to decode to its declared size or CRC. A
 * creature list with types outside creatures.cfg is reported as stale (the
 * 1998-dated twins under level05-level10 have them) and is not a failure.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { unpackRaw } from '../src/formats/rnc.ts';
import { CREATURE_LIST_TYPE, parseCreatureList } from '../src/formats/creatures.ts';

const root = process.argv[2] ?? 'Toy Story 2';
const showCreatures = process.argv.includes('--creatures');
const only = process.argv.slice(3).find((a) => !a.startsWith('--'));

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.raws?$/i.test(name)) yield p;
  }
}

const names = readFileSync(join(root, 'data', 'creatures.cfg'), 'latin1')
  .split(/\r?\n/).map((l) => /^CREATURE\s+(\d+)\s+(\S+)/.exec(l)).filter(Boolean)
  .reduce((m, r) => m.set(Number(r![1]), r![2]!), new Map<number, string>());

let failures = 0;
let stale = 0;
const typeCounts = new Map<number, number>();
for (const file of walk(join(root, 'data'))) {
  if (only && !file.includes(only)) continue;
  const bytes = new Uint8Array(readFileSync(file));
  let records;
  try {
    records = unpackRaw(bytes);
  } catch (e) {
    console.log(`${file}: FAIL ${(e as Error).message}`);
    failures++;
    continue;
  }
  const summary = records.map((r) => `0x${r.type.toString(16)}:${r.unpackedSize}`).join(' ');
  console.log(`${file.slice(root.length + 1)}: ${records.length} records  ${summary}`);
  for (const r of records) {
    typeCounts.set(r.type, (typeCounts.get(r.type) ?? 0) + 1);
    if (!r.crcOk) { console.log(`  record at ${r.offset}: CRC mismatch`); failures++; }
    if (r.type !== CREATURE_LIST_TYPE) continue;
    const list = parseCreatureList(r.data);
    const unknown = list.filter((c) => !names.has(c.type)).map((c) => c.type);
    if (unknown.length) { console.log(`  stale creature list: types ${unknown.join(' ')} are not in creatures.cfg`); stale++; }
    for (const c of list) {
      const name = names.get(c.type);
      if (showCreatures) {
        console.log(`  ${String(c.slot).padStart(2)} ${(name ?? '?').padEnd(9)} t${c.type} s${c.script}`
          + ` at ${c.x},${c.y},${c.z} yaw ${c.yaw} hp ${c.health} rs ${c.respawn}`
          + ` box ${c.rangeX}x${c.rangeZ}@${c.rangeYaw} spd ${c.speed}/${c.speedMax} acc ${c.accel},${c.accelSide}`
          + ` turn ${c.turnRate} face ${c.facing} raw ${Buffer.from(c.raw).toString('hex')}`);
      }
    }
    console.log(`  ${list.length} creatures: ${[...new Set(list.map((c) => names.get(c.type) ?? c.type))].join(' ')}`);
  }
}
console.log('record types:', [...typeCounts].map(([t, n]) => `0x${t.toString(16)} x${n}`).join(', '));
if (stale) console.log(`${stale} stale creature lists`);
if (failures) { console.log(`${failures} failures`); process.exit(1); }
console.log('all records decoded and CRC-checked');
