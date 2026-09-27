import { captureCollisionGroup, transformCollisionGroup } from '../src/formats/collision.ts';
import { carryOnYawPlatform } from '../src/sim/moving-platform.ts';
/** node --import tsx tools/ledge-probe.ts ["Toy Story 2"] */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAll } from '../src/formats/all.ts';
import { buildCollisionWorld, parseCollision, type CollisionWorld } from '../src/formats/collision.ts';
import { findLedge, CLIMB_TICKS } from '../src/sim/ledge.ts';
import { createPlayer, createRuntime, groundFromCollision, NO_INPUT, stepPlayer, JumpState } from '../src/sim/player.ts';
import { AnimState, createAnimation, stepAnimation } from '../src/sim/player-animation.ts';
import { yawOf, sin, cos } from '../src/sim/trig.ts';

type V = { x: number; y: number; z: number };
function fixture(ceiling = false, slope = false, moving = false): CollisionWorld {
  const polys: CollisionWorld['polys'] = [];
  function quad(v: number[][], normal: V) {
    for (const ids of [[0, 1, 2], [0, 2, 3]]) polys.push({
      vertices: ids.map(i => ({ x: v[i]![0]! / 32, y: v[i]![1]! / 32, z: v[i]![2]! / 32 })),
      normal, walkable: normal.y < -0.5, group: 0,
    });
  }
  quad([[-40000, 30000, -40000], [40000, 30000, -40000], [40000, 30000, 40000], [-40000, 30000, 40000]], { x: 0, y: -1, z: 0 });
  quad([[-20000, 0, 0], [20000, 0, 0], [20000, 0, 40000], [-20000, 0, 40000]], slope ? { x: 0, y: -0.8, z: 0.6 } : { x: 0, y: -1, z: 0 });
  quad([[-20000, 0, 0], [20000, 0, 0], [20000, 30000, 0], [-20000, 30000, 0]], { x: 0, y: 0, z: -1 });
  if (ceiling) quad([[-20000, -8000, -20000], [20000, -8000, -20000], [20000, -8000, 40000], [-20000, -8000, 40000]], { x: 0, y: 1, z: 0 });
  if (moving) for (const poly of polys.slice(2,6)) poly.group = 1;
  const cells = new Map<string, number[]>();
  for (const [i,poly] of polys.entries()) {
    const xs=poly.vertices.map(v=>v.x), zs=poly.vertices.map(v=>v.z);
    for(let x=Math.floor(Math.min(...xs)/1024);x<=Math.floor(Math.max(...xs)/1024);x++)
      for(let z=Math.floor(Math.min(...zs)/1024);z<=Math.floor(Math.max(...zs)/1024);z++) {
        const key=`${x},${z}`;cells.set(key,[...(cells.get(key)??[]),i]);
      }
  }
  const groups:CollisionWorld['groups']=[{objectNumber:-1,dynamic:false,polys:polys.flatMap((p,i)=>p.group===0?[i]:[])}];
  if(moving)groups.push({objectNumber:7,dynamic:true,position:{x:0,y:0,z:0},polys:[2,3,4,5]});
  return { polys, cells, cellSize: 1024, lowestY: 30000 / 32, groups };

}
const probe = { x: 0, y: 13700, z: -4400, yaw: 0, previousY: 13500 };
const world = fixture(), ground = groundFromCollision(world);
assert.ok(findLedge(world, probe), 'clear ledge is reachable');
assert.ok(findLedge(world, { ...probe, y: 15000 }), 'fast descent cannot skip the crossing');
assert.equal(findLedge(fixture(true), probe), null, 'low ceiling rejects climb');
assert.equal(findLedge(fixture(false, true), probe), null, 'steep top rejects climb');
assert.equal(findLedge(world, { ...probe, z: -10000 }), null, 'out of reach');
assert.equal(findLedge(world, { ...probe, previousY: 13700 }), null, 'hands already below edge');
assert.equal(findLedge(world, { ...probe, y: 13000 }), null, 'hands have not crossed edge');
assert.equal(findLedge(world, { ...probe, yaw: 2048 }), null, 'facing away');

function falling() {
  const p = createPlayer(probe.x, probe.y, probe.z, probe.yaw), rt = createRuntime();
  p.vy = 200; p.jumpState = JumpState.Falling; rt.previousY = probe.previousY;
  return { p, rt };
}
for (const blocked of ['rising', 'grounded', 'stunned', 'dying', 'spin', 'hardFall'] as const) {
  const { p, rt } = falling();
  if (blocked === 'rising') p.vy = -200;
  if (blocked === 'grounded') { p.onGround = true; p.coyote = 6; }
  if (blocked === 'stunned') p.hitStun = 90;
  if (blocked === 'dying') p.dying = true;
  if (blocked === 'spin') p.spin = 10;
  if (blocked === 'hardFall') p.fallTimer = 0x50;
  stepPlayer(p, NO_INPUT, rt, ground, 0);
  assert.equal(p.climb, 0, `${blocked} must not grab`);
}
const { p, rt } = falling();
stepPlayer(p, NO_INPUT, rt, ground, 0);
assert.equal(p.climb, CLIMB_TICKS);
assert.deepEqual(p.events, [0x17]);
const anchor = [p.x, p.y, p.z], anim = createAnimation();
for (let i = 0; i < CLIMB_TICKS; i++) {
  if (i) stepPlayer(p, { ...NO_INPUT, moveY: 1, jump: true, spin: true, fire: true }, rt, ground, 0);
  const pose = stepAnimation(anim, p, true, 0);
  assert.equal(anim.state, AnimState.Climb);
  assert.equal(pose.slotA, 10); assert.equal(pose.slotB, 10);
  assert.deepEqual([p.x, p.y, p.z], anchor, 'input cannot move climb anchor');
  assert.equal(p.laserFired, null);
}
for (let i = 0; i < 30; i++) stepPlayer(p, NO_INPUT, rt, ground, 0);
assert.equal(p.climb, 0); assert.ok(p.onGround, 'climb ends standing on the top');
assert.ok(Math.abs(p.y - 192) < 10);
const interrupted = falling();
stepPlayer(interrupted.p, NO_INPUT, interrupted.rt, ground, 0);
interrupted.p.hitStun = 90;
stepPlayer(interrupted.p, NO_INPUT, interrupted.rt, ground, 0);
assert.equal(interrupted.p.climb, 0, 'damage releases climb');
assert.equal(createPlayer().climb, 0, 'respawn clears climb');
const running = createPlayer(0, 30192, -16000), runTime = createRuntime();
for (let i = 0; i < 10; i++) stepPlayer(running, NO_INPUT, runTime, ground, 0);
let grabbed = false;
for (let i = 0; i < 160; i++) {
  stepPlayer(running, { ...NO_INPUT, moveY: 1, jump: i < 25 }, runTime, ground, 0);
  if (running.climb) { grabbed = true; break; }
}
assert.ok(grabbed, 'normal running jump reaches and automatically grabs the ledge');
// Acquire through the real ledge probe, then translate/rotate its collision hull.
// The climb must tick the world once each frame, including its final handoff.
for(const interruption of ['none','damage','death'] as const) {
  const movingWorld=fixture(false,false,true), rest=captureCollisionGroup(movingWorld,1);
  const g=groundFromCollision(movingWorld), {p:passenger,rt:runtime}=falling();
  let ticks=0, origin={x:0,y:0,z:0};
  g.beforeMove=()=>{
    const from=origin;origin={x:from.x+64,y:from.y-8,z:from.z+128};ticks++;
    transformCollisionGroup(movingWorld,rest,{x:origin.x/32,y:origin.y/32,z:origin.z/32},ticks*8*Math.PI/2048);
    carryOnYawPlatform(passenger,1,from,origin,8);
  };
  assert.equal(findLedge(movingWorld,probe)?.group,1,'grab remembers the moving top');
  stepPlayer(passenger,NO_INPUT,runtime,g,0);
  assert.equal(passenger.climbGroup,1);
  const local=()=>{
    const a=ticks*8*Math.PI/2048,c=Math.cos(a),sn=Math.sin(a);
    const x=passenger.x-origin.x,z=passenger.z-origin.z;
    return {x:x*c-z*sn,y:passenger.y-origin.y,z:x*sn+z*c};
  };
  const anchor=local();
  const originalPosition=[passenger.x,passenger.y,passenger.z];
  carryOnYawPlatform(passenger,0,{x:0,y:0,z:0},{x:100000,y:100000,z:100000},1024);
  assert.deepEqual([passenger.x,passenger.y,passenger.z],originalPosition,'an unrelated platform cannot carry the climb');
  const climbFrames=interruption==='none'?CLIMB_TICKS:10;
  for(let i=1;i<climbFrames;i++) {
    stepPlayer(passenger,{...NO_INPUT,moveY:1,jump:true},runtime,g,0);
    assert.equal(ticks,i+1,'world continues exactly once per climb tick');
    assert.equal(passenger.climbGroup,1);
    const at=local();assert(Math.hypot(at.x-anchor.x,at.y-anchor.y,at.z-anchor.z)<20,'anchor follows platform in local coordinates');
  }
  if(interruption==='damage')passenger.hitStun=90;
  if(interruption==='death')passenger.dying=true;
  stepPlayer(passenger,NO_INPUT,runtime,g,0);
  assert.equal(passenger.climb,0);assert.equal(passenger.climbGroup,-1,'completion or interruption clears attachment');
  assert.equal(ticks,climbFrames+1);
  if(interruption==='none') {
    for(let i=0;i<20;i++)stepPlayer(passenger,NO_INPUT,runtime,g,0);
    assert(passenger.onGround&&passenger.contacts.some(c=>c.group===1),'climb hands off to the moving top');
  }
}
assert.equal(createPlayer().climbGroup,-1,'respawn clears moving attachment');
console.log('PASS: static/moving ledge acquisition, anchor, world ticking, input lock, landing, damage/death release and reset');

if (process.argv[2]) {
  const level = buildCollisionWorld(parseCollision(parseAll(readFileSync(join(process.argv[2], 'data/level01/TERRAIN.ALL')))).groups);
  let found = 0;
  for (const poly of level.polys) {
    if (poly.normal.y >= -15000 / 16384) continue;
    for (let e = 0; e < 3; e++) {
      const a = poly.vertices[e]!, b = poly.vertices[(e + 1) % 3]!;
      const mx = (a.x + b.x) * 16, my = (a.y + b.y) * 16, mz = (a.z + b.z) * 16;
      for (const sign of [-1, 1]) {
        const yaw = yawOf((b.z - a.z) * sign, (a.x - b.x) * sign);
        const sample = { x: mx - sin(yaw) / 16384 * 4400, y: my + 13700,
          z: mz - cos(yaw) / 16384 * 4400, yaw, previousY: my + 13500 };
        const target = findLedge(level, sample);
        if (target) { if (!found) console.log('Level 1 example:', JSON.stringify({ sample, target })); found++; }
      }
    }
  }
  assert.ok(found > 0, 'real level has reachable ledges');
  console.log(`Level 1: ${found} reachable ledge samples pass original probe geometry`);
}
