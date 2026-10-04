import assert from 'node:assert/strict';
import {createKiteTail,stepKiteTail,collideTailRoof} from '../src/sim/kite-tail.ts';
const at={x:0,y:0,z:0},tail=createKiteTail(at);
assert.equal(tail.points.length,16);assert.equal(tail.points[15]!.y,15*4096);
stepKiteTail(tail,at,at,2);assert(tail.visible);assert.deepEqual(tail.points[0],at);
assert.equal(tail.velocities[1]!.y,96);assert.equal(tail.points[1]!.y,4096);
const frozen=JSON.stringify(tail.points);stepKiteTail(tail,at,{x:800*256,y:0,z:0},2);
assert(!tail.visible);assert.equal(JSON.stringify(tail.points),frozen,'strict range gate freezes off-camera chain');
for(let i=0;i<600;i++){
 const anchor={x:Math.trunc(Math.sin(i/30)*10000),y:-500000,z:240000};
 stepKiteTail(tail,anchor,anchor,2);
 assert.deepEqual(tail.points[0],anchor);
 assert(tail.points.every(p=>Object.values(p).every(Number.isFinite)));
 assert(tail.velocities.every(p=>Object.values(p).every(v=>v>=-32768&&v<=32767)));
}
assert(tail.points.some(p=>p.x!==tail.points[0]!.x));
const v={x:0,y:0,z:0},roof={x:150000,y:-450000,z:200000};collideTailRoof(roof,v);assert.equal(roof.y,-0x722c6);
const outside={x:0,y:0,z:0};collideTailRoof(outside,v);assert.deepEqual(outside,{x:0,y:0,z:0});
const edge={x:0x3234f,y:-450000,z:240000};collideTailRoof(edge,v);assert.equal(edge.x,0x32450);assert.equal(v.y,-144);
stepKiteTail(tail,at,at,200);assert(!tail.visible);assert.equal(createKiteTail(at).velocities[1]!.y,0);
console.log('PASS: kite tail initialization, strict camera freeze, anchored motion, signed velocities, roof surface/edge response and defeat hide');
