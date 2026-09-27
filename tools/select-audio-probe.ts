/** Selector sound mapping and asynchronous loop lifecycle. Install is read-only. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { readSoundTable } from '../src/audio/events.ts';
import { SoundBank } from '../src/audio/sfx.ts';
import type { GameDir } from '../src/loader/gamedir.ts';

const root = process.argv[2] ?? 'Toy Story 2';
const exe = readFileSync(`${root}/toy2.exe`);
const front = readSoundTable(exe, 16);
const files = new Set(readdirSync(`${root}/data/sfx`).map(n => n.toLowerCase()));
assert.deepEqual([1, 2, 3].map(n => front.nameOfEffect(n)), ['Select', 'Switch', 'Cancel']);
for (let pos = 1; pos <= 15; pos++) {
  const name = `Level${String(pos).padStart(2, '0')}`;
  assert.equal(front.nameOfEffect(pos + 7), name);
  assert(files.has(`${name.toLowerCase()}.wav`), `${name} exists in install`);
}
assert.equal(readSoundTable(exe, 1).nameOfEffect(8), 'BUZJMP1', 'gameplay bank unchanged');

const sources: FakeSource[] = [];
class FakeNode {
  gain = { value: 1 };
  connect() {}
  disconnect() {}
}
class FakeSource extends FakeNode {
  buffer: unknown; loop = false; starts = 0; stops = 0;
  start() { this.starts++; }
  stop() { this.stops++; }
}
class FakeContext {
  state = 'running'; destination = new FakeNode();
  createGain() { return new FakeNode(); }
  createBufferSource() { const s = new FakeSource(); sources.push(s); return s; }
  async decodeAudioData(bytes: ArrayBuffer) { return { bytes }; }
  async resume() { this.state = 'running'; }
}
Object.assign(globalThis, { window: { AudioContext: FakeContext } });
const reads = new Map<string, (bytes: Uint8Array) => void>();
const dir: GameDir = new Map(['a', 'b', 'c', 'd'].map(name => [`data/sfx/${name}.wav`, {
  path: `data/sfx/${name}.wav`, name, size: 1,
  read: () => new Promise<Uint8Array>(resolve => reads.set(name, resolve)),
}]));
const bank = new SoundBank(dir);
const finish = async (name: string) => {
  reads.get(name)!(new Uint8Array([1]));
  await new Promise(resolve => setImmediate(resolve));
};
await bank.start();
bank.setAmbience('a'); bank.setAmbience('b');
await finish('b'); bank.setAmbience('b', 0.7);
assert.equal(bank.ambienceName, 'b');
assert.equal(sources.length, 1); assert(sources[0]!.loop);
await finish('a');
for (let i = 0; i < 60; i++) bank.setAmbience('B', 0.5);
assert.equal(sources.length, 1, 'hover does not restart the loop; late old read cannot play');
bank.setAmbience('a');
assert.equal(sources[0]!.stops, 1); assert.equal(bank.ambienceName, 'a');
bank.setAmbience('c');
assert.equal(sources[1]!.stops, 1, 'switch stops old loop before new file is ready');
bank.setAmbience(null); await finish('c');
assert.equal(bank.ambienceName, null, 'late load cannot play after leaving selector');
assert.equal(sources.length, 2);
bank.setAmbience('c'); bank.stop();
assert.equal(sources[2]!.stops, 1, 'mute stops loop');
bank.setAmbience('b'); assert.equal(sources.length, 3, 'muted hover stays silent');
await bank.start(); bank.setAmbience('b');
assert.equal(bank.ambienceName, 'b', 'unmute restores current preview');
bank.setAmbience('d'); bank.stop(); await finish('d');
assert.equal(bank.ambienceName, null, 'mute during loading stays silent');
await bank.start(); bank.setAmbience('missing');
await new Promise(resolve => setImmediate(resolve));
bank.setAmbience('missing'); assert.equal(bank.ambienceName, null, 'missing file is silent');
console.log('PASS: 15 installed selector previews, menu/gameplay banks, loop reuse, switching, stale reads, exit, mute and missing files.');
