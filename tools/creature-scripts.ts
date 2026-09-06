/**
 * Read the creature behaviour data back out: disassemble the scripts and
 * list what each scene places.
 *
 *   npx tsx tools/creature-scripts.ts [N]            script N, or all of them
 *   npx tsx tools/creature-scripts.ts "Toy Story 2" level01/level
 *
 * With an install and a scene, prints that scene's placements with the name
 * from creatures.cfg and the script each runs, then the scripts they use.
 * The opcode table is CREATURE_OPS in src/sim/creature-data.ts, decoded from
 * the interpreter in toy2.exe (docs/CREATURES.md).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AI_SCRIPTS, CREATURE_OPS, CREATURE_TYPES } from '../src/sim/creature-data.ts';
import { unpackRaw } from '../src/formats/rnc.ts';
import { CREATURE_LIST_TYPE, parseCreatureList, parseCreatureNames } from '../src/formats/creatures.ts';

export function disassemble(script: readonly number[]): string[] {
  const lines: string[] = [];
  for (let pc = 0; pc < script.length;) {
    const op = script[pc]!;
    const [count, name] = CREATURE_OPS[op] ?? [0, `op${op}`];
    const args = script.slice(pc + 1, pc + 1 + count);
    let note = '';
    if (name === 'ifSkip' && args[0] !== undefined) note = `  -> ${pc + 1 + args[0]}`;
    if (name === 'loopBack' && args[0] !== undefined) note = `  -> ${pc - args[0]}`;
    lines.push(`${String(pc).padStart(4)}: ${name}${args.length ? ' ' + args.join(', ') : ''}${note}`);
    pc += 1 + count;
  }
  return lines;
}

function printScript(n: number): void {
  const script = AI_SCRIPTS[n];
  if (!script) { console.log(`no script ${n}`); return; }
  console.log(`== script ${n} (${script.length} words)`);
  for (const line of disassemble(script)) console.log('  ' + line);
}

const [a, b] = process.argv.slice(2);
if (a === undefined) {
  for (let i = 0; i < AI_SCRIPTS.length; i++) printScript(i);
} else if (b === undefined) {
  printScript(Number(a));
} else {
  const root = a;
  const names = parseCreatureNames(readFileSync(join(root, 'data', 'creatures.cfg'), 'latin1'));
  const raw = readFileSync(join(root, 'data', `${b}.raw`));
  const record = unpackRaw(new Uint8Array(raw)).find((r) => r.type === CREATURE_LIST_TYPE);
  if (!record) { console.log(`${b}.raw has no creature list`); process.exit(1); }
  const list = parseCreatureList(record.data);
  const used = new Set<number>();
  for (const c of list) {
    used.add(c.script);
    const t = CREATURE_TYPES[c.type];
    console.log(`${String(c.slot).padStart(2)} ${(names.get(c.type) ?? '?').padEnd(9)} type ${String(c.type).padStart(2)}`
      + ` script ${String(c.script).padStart(2)} at ${c.x},${c.y},${c.z} flags 0x${(c.flags & 0xffff).toString(16)}`
      + ` hp ${c.health} respawn ${c.respawn} box ${c.rangeX}x${c.rangeZ}`
      + ` speed ${c.speed}/${c.speedMax}${t?.handler ? ` + ${t.handler}` : ''}`);
  }
  console.log();
  for (const n of [...used].sort((x, y) => x - y)) printScript(n);
}
