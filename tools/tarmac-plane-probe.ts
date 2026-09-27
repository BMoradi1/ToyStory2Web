import { carryOnYawPlatform } from '../src/sim/moving-platform.ts';
/** Read-only install probe: plane poses, collision indexing, passenger physics and wheel hazards. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDat } from '../src/formats/dat.ts';
import { parseAll } from '../src/formats/all.ts';
import { buildCollisionWorld, parseCollision, transformCollisionGroup, groundBelow } from '../src/formats/collision.ts';
import { createTarmacPlane, planePoses, stepTarmacPlane, planeWheelHit, restorePlaneCollision } from '../src/sim/tarmac-plane.ts';
import { createPlayer, createRuntime, groundFromCollision, stepPlayer, NO_INPUT } from '../src/sim/player.ts';
const root = process.argv[2] ?? 'Toy Story 2';
const dat = parseDat(readFileSync(`${root}/data/level04/level1.dat`));
const world = buildCollisionWorld(parseCollision(parseAll(readFileSync(`${root}/data/level04/TERR1.ALL`))).groups);
const plane = createTarmacPlane(dat, world);
assert.equal(plane.objects.length, 33);
assert(!plane.objects.some(o => o.id === 3));
const start = planePoses(plane);
plane.angle = 1024;
const quarter = planePoses(plane);
for (const p of quarter) {
  const rest = start.find(o => o.id === p.id)!;
  assert(Math.abs(p.position.x - rest.position.z) < 512, `quarter orbit x ${p.id}`);
  assert(Math.abs(p.position.z + rest.position.x) < 512, `quarter orbit z ${p.id}`);
  assert.equal(p.position.y, rest.position.y);
}
for (const [near, far] of [[0,16],[8,23],[9,24],[10,25],[11,26],[13,28]]) {
  const a=quarter.find(p=>p.id===near)!, b=quarter.find(p=>p.id===far)!;
  assert.deepEqual(a.angles,b.angles,`LOD angles ${near}`);
  assert(Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z)<512);
}
for (const p of quarter.filter(p=>p.hazard)) {
  assert.notEqual(planeWheelHit(plane,p.hazard!),null);
  assert.equal(planeWheelHit(plane,{...p.hazard!,y:p.hazard!.y-0x6000}),null);
}
const originalCells=world.cells.size;
for (let turn=0;turn<3;turn++) for(let i=0;i<16;i++)
  transformCollisionGroup(world,plane.hull,{...plane.hull.origin,x:plane.hull.origin.x+i*200},i*Math.PI/8);
restorePlaneCollision(plane,world);
for(const p of plane.hull.polys) {
  for(let i=0;i<p.vertices.length;i++) for(const axis of ['x','y','z'] as const)
    assert(Math.abs(world.polys[p.index]!.vertices[i]![axis]-p.vertices[i]![axis])<1e-9);
}
assert.equal(world.cells.size,originalCells,'vacated cells removed');
for(const cell of world.cells.values())assert.equal(cell.length,new Set(cell).size,'no duplicate spatial entries');
plane.angle=0;
const floor=plane.hull.polys.filter(p=>p.normal.y<-.99).sort((a,b)=>a.vertices[0]!.y-b.vertices[0]!.y)[0]!;
const centre=floor.vertices.reduce((s,v)=>({x:s.x+v.x/3,y:s.y+v.y/3,z:s.z+v.z/3}),{x:0,y:0,z:0});
assert(groundBelow(world,centre.x,centre.y-10,centre.z));
const player=createPlayer(centre.x*32,centre.y*32-5000,centre.z*32);
const runtime=createRuntime(),ground=groundFromCollision(world);
ground.beforeMove=()=>stepTarmacPlane(plane,world,player);
for(let i=0;i<100;i++)stepPlayer(player,NO_INPUT,runtime,ground,0);
assert(player.onGround&&player.contacts.some(c=>c.group===plane.hull.groupIndex),'lands on moving aircraft');
const relativeRadius=()=>Math.hypot(player.x-plane.position.x,player.z-plane.position.z);
const radius=relativeRadius();
for(let i=0;i<240;i++)stepPlayer(player,NO_INPUT,runtime,ground,0);
assert(player.onGround&&player.contacts.some(c=>c.group===plane.hull.groupIndex),'stays aboard moving aircraft');
assert(Math.abs(relativeRadius()-radius)<100,'passenger has no orbit drift');
for(let i=0;i<6;i++)stepPlayer(player,{...NO_INPUT,moveY:1},runtime,ground,0);
assert(player.onGround&&player.forwardSpeed>0,'can walk on the moving aircraft');
stepPlayer(player,{...NO_INPUT,jump:true},runtime,ground,0);
assert(!player.onGround&&player.vy<0,'jump leaves platform');
const airborne={x:player.x,y:player.y,z:player.z};
carryOnYawPlatform(player,plane.hull.groupIndex,plane.position,{x:0,y:0,z:0},1024);
assert.deepEqual({x:player.x,y:player.y,z:player.z},airborne,'airborne passenger not attached');
player.onGround=true;player.contacts=[{group:plane.hull.groupIndex,normal:{x:1,y:0,z:0}}];
carryOnYawPlatform(player,plane.hull.groupIndex,plane.position,{x:0,y:0,z:0},1024);
assert.deepEqual({x:player.x,y:player.y,z:player.z},airborne,'wall contact does not carry a passenger');
plane.angle=4095;stepTarmacPlane(plane,world,player);
assert.equal(plane.angle,0,'angle wraps without accumulating turns');
assert.deepEqual(planePoses(plane),start,'render pose returns exactly after a revolution');
console.log('PASS: original orbit/LOD rotations, wheel hazards, collision reset/indexing, landing, riding and jump release');
