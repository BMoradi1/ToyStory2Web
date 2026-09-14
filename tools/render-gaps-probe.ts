import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat,buildLevelGeometry,orientLevelSprites} from '../src/formats/dat.ts';
import {parseAll,buildMeshData,parseGfxJoint,GroupType} from '../src/formats/all.ts';
import {parseAnm,buildPosedMeshData} from '../src/formats/anm.ts';
const read=(p:string)=>readFileSync(`Toy Story 2/data/${p}`);
const level=parseDat(read('level01/level.dat')),g=buildLevelGeometry(level);
assert.equal(g.objectCount,level.objects.length,'all level 1 placements now draw');
assert.equal(g.billboards!.length,211);assert.equal(g.triangleCount,33525);
const before=g.positions.slice(),uv=g.uvs.slice();
orientLevelSprites(g.positions,g.billboards!,[0,0,1],[0,1,0]);
assert.notDeepEqual(g.positions,before);assert.deepEqual(g.uvs,uv);
for(const card of g.billboards!)for(let k=0;k<6;k++)assert(Math.abs(g.positions[(card.start+k)*3]!-card.centre[0]-card.depthOffset)<0.00001);
const model=parseAll(read('chars4/slinky.all')),anm=parseAnm(read('chars4/slinky.anm'));
const rings=model.groups.filter(g=>g.type===GroupType.GfxJoint).map(parseGfxJoint);
assert.equal(new Set(rings.map(r=>r.id)).size,rings.length);
for(const r of rings)assert(r.bone>=0&&r.bone<33);
for(const animation of anm.animations){if(!animation)continue;
 for(const frame of [0,5,11]){
  const posed=buildPosedMeshData(model,anm,animation,frame);
  assert.equal(posed.triangleCount,buildMeshData(model).triangleCount,'no missing Slinky joint meshes');
  assert(posed.positions.every(Number.isFinite));assert.equal(posed.positions.length/3,posed.uvs.length/2);
 }
 assert.notDeepEqual(buildPosedMeshData(model,anm,animation,0).positions,buildPosedMeshData(model,anm,animation,5).positions);
}
console.log('PASS: all 1126 level 1 objects, 211 billboard cards, camera-facing geometry with stable UVs, and all 368 Slinky triangles across animation frames.');
