import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {aimObjectIndices,buildAimModel} from '../src/render/aim-model.ts';
import {sceneForLevel,levelNumber} from '../src/sim/level-data.ts';
for(let n=1;n<=15;n++) {
  const scene=sceneForLevel(n)!;
  assert.equal(levelNumber(scene),n);
  const level=parseDat(readFileSync(`Toy Story 2/data/${scene}.dat`));
  const indices=aimObjectIndices(level);
  assert.equal(indices.length,3,`three visor parts in level ${n}`);
  const before=JSON.stringify(indices.map(i=>level.objects[i]));
  const geometry=buildAimModel(level);
  assert(geometry.triangleCount>250,`visor geometry in level ${n}`);
  assert(geometry.positions.every(Number.isFinite));
  assert(Math.max(...geometry.positions.map(Math.abs))<2,'camera-local geometry, not storage location');
  assert.equal(JSON.stringify(indices.map(i=>level.objects[i])),before,'source placements unchanged');
}
console.log('PASS: all 15 playable scenes resolve and contain three camera-local visor parts without mutating stored placements.');
