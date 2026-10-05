import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {basisFromCamera,walkPortals} from '../src/sim/portal-walk.ts';
import {parseDat} from '../src/formats/dat.ts';
import {createConstructionScenery,stepConstructionScenery,constructionPortals,CONSTRUCTION_SCENERY_POINT as at} from '../src/sim/construction-scenery.ts';
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
const original=JSON.stringify(dat.zones);
const outside=dat.zones.filter(p=>p.from===1),inside=dat.zones.filter(p=>p.from===2);
const door=outside.find(p=>p.to===2)!;
const centre=door.corners.reduce((a,v)=>({x:a.x+v.x*8,y:a.y+v.y*8,z:a.z+v.z*8}),{x:0,y:0,z:0});
const basis=basisFromCamera({...centre,z:centre.z-64000},centre);
stepConstructionScenery(s,{...at,x:at.x-1000000});
assert(!constructionPortals(s).some(p=>p.from===1&&p.to===2));
assert(!walkPortals(constructionPortals(s),1,basis).has(2),'closed doorway hides trailer from room 1');
stepConstructionScenery(s,at);
assert.equal(constructionPortals(s).filter(p=>p.from===1).at(-1),door);
assert(walkPortals(constructionPortals(s),1,basis).has(2),'open doorway exposes trailer through real portal walk');
const reordered=constructionPortals(s).filter(p=>p.from===2);
assert.deepEqual(reordered[0]!.corners,inside[1]!.corners);assert.equal(reordered[0]!.to,inside[0]!.to);
assert.deepEqual(reordered[1]!.corners,inside[0]!.corners);assert.equal(reordered[1]!.to,inside[1]!.to);
assert.equal(JSON.stringify(dat.zones),original,'source portals remain immutable across toggles');
assert(!constructionPortals(createConstructionScenery(dat)).some(p=>p.from===1&&p.to===2));
console.log('PASS: two installed scenery objects, strict 3D proximity, eight-tick collapse/restore, endpoint clamps, actual portal visibility, interior ordering, immutable source and fresh state');
