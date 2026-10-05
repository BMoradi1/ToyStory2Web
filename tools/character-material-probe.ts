import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AdditiveBlending} from 'three';
import {parseAll,buildMeshData} from '../src/formats/all.ts';
import {parseAnm,buildPosedMeshData} from '../src/formats/anm.ts';
import {characterMaterial} from '../src/render/character-material.ts';
const model=parseAll(readFileSync('Toy Story 2/data/chars/buzz.all'));
const anm=parseAnm(readFileSync('Toy Story 2/data/chars/buzz.anm'));
function check(mesh:ReturnType<typeof buildMeshData>){
  const glass=mesh.groups.filter(g=>g.blend!=null);
  assert.equal(glass.length,1);
  assert.equal(glass[0]!.count,147,'49 authored helmet triangles');
  assert.equal(glass[0]!.page,16);
  const material=characterMaterial(glass[0]!);
  assert.equal(material.blending,AdditiveBlending);
  assert.equal(material.transparent,true);
  assert.equal(material.depthWrite,false);
  material.dispose();
  for(const group of mesh.groups.filter(g=>g.blend==null)){
    const opaque=characterMaterial(group);
    assert.equal(opaque.transparent,false);
    assert.equal(opaque.depthWrite,true);
    opaque.dispose();
  }
  assert.equal(mesh.groups.reduce((n,g)=>n+g.count,0),mesh.positions.length/3);
}
check(buildMeshData(model));
let poses=0;
for(const animation of anm.animations){
  if(!animation)continue;
  // Some authored animations deliberately hide parts; validate fully visible poses.
  if(animation.trackOffsets[13]!<0)continue;
  for(const frame of [0,Math.max(0,animation.frameCount-1)]){
    check(buildPosedMeshData(model,anm,animation,frame));poses++;
  }
}
assert(poses>0);
console.log(`PASS: opaque body and additive helmet in rest mesh and ${poses} Buzz poses`);
