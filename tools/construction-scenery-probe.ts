import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {createConstructionScenery,stepConstructionScenery,CONSTRUCTION_SCENERY_POINT as at} from '../src/sim/construction-scenery.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level04/level.dat')),s=createConstructionScenery(dat);
assert.equal(s.objects.length,2);
for(let i=1;i<=8;i++){stepConstructionScenery(s,at);assert.equal(s.height,4096-i*512);assert(s.near);}
stepConstructionScenery(s,at);assert.equal(s.height,0);
// Exact boundary excluded; all three axes participate in the native sphere.
for(const axis of ['x','y','z'] as const){stepConstructionScenery(s,{...at,[axis]:at[axis]-250*256});assert(!s.near);}
for(let i=0;i<8;i++)stepConstructionScenery(s,{...at,y:at.y-250*256});assert.equal(s.height,4096);
stepConstructionScenery(s,{...at,x:at.x-249*256});assert(s.near);assert.equal(s.height,3584);
stepConstructionScenery(s,{...at,x:at.x-200*256,z:at.z-200*256});assert(!s.near);assert.equal(s.height,4096);
assert.equal(createConstructionScenery(dat).height,4096);
console.log('PASS: two installed scenery objects, strict 3D proximity, eight-tick collapse/restore, endpoint clamps and fresh state');
