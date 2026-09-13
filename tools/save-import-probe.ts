import assert from 'node:assert/strict';
import { importProgress, exportProgress } from '../src/loader/save.ts';
import { encodeSaveFile, freshBlock, SAVE } from '../src/formats/save-file.ts';
const valid = encodeSaveFile('default.cfg', freshBlock());
const loaded = importProgress(valid);
assert.equal(loaded.p.lives, 5);
assert.deepEqual(exportProgress(loaded), valid);
loaded.block[0] = 123;
assert.notEqual(valid[4 + 'default.cfg'.length], 123, 'import owns its block');
for (const bad of [new Uint8Array(), new Uint8Array([255,255,255,255]), new Uint8Array(5000), valid.slice(0,-1)]) {
  assert.throws(() => importProgress(bad));
}
for (const [offset, bad] of [[SAVE.level,15],[SAVE.health,15],[SAVE.sfx,11],[SAVE.bgm,11],[SAVE.powerUps,32],[SAVE.lives,255]]) {
  const block = freshBlock(); block[offset!] = bad!;
  assert.throws(() => importProgress(encodeSaveFile('',block)));
}
console.log('Save import: round trip, owned bytes, truncation, size and progress ranges passed.');
