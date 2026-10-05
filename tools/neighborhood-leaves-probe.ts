import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {readEffectTable} from '../src/formats/effect-table.ts';
import {createEffects,spawnChild,type EffectWorld} from '../src/sim/effects.ts';
import {RandomStream} from '../src/sim/creatures.ts';
import {createNeighborhoodLeaves,stepNeighborhoodLeaves} from '../src/sim/neighborhood-leaves.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level02/level.dat')),table=readEffectTable(readFileSync('Toy Story 2/toy2.exe')),fx=createEffects(table.kinds,table.modes,new RandomStream(new Uint8Array([128]))),s=createNeighborhoodLeaves(dat);
const ew:EffectWorld={cameraX:0,cameraY:0,cameraZ:0,playerX:0,playerY:0,playerZ:0,playerYaw:0,playerVx:0,playerVz:0,groundAt:()=>null,waterY:null};
let bytes=0,spawns=0,lastFloor=0;
const host={four:false,sixteen:false,byte:()=>{bytes++;return 128;},spawn:(at:{x:number;y:number;z:number})=>{spawns++;Object.assign(ew,{cameraX:at.x,cameraY:at.y,cameraZ:at.z});const e=spawnChild(fx,ew,at.x,at.y,at.z,55,19);assert(e);assert.equal(e.kind,55);return e;},ground:(at:{y:number})=>{assert.equal(at.y,-16384);return lastFloor||null;}};
for(let i=0;i<s.points.length;i++){
 const at=s.points[i]!;s.pending=true;stepNeighborhoodLeaves(s,{...at,y:at.y+0x7001},host);assert.equal(s.node,(i+1)%s.points.length);assert.equal(s.pending,false);
}
assert.equal(spawns,17);assert.equal(bytes,51);assert(fx.effects.filter(e=>e.kind===55&&e.life>0).every(e=>e.floor===0x1460&&e.spin===0));
const at=s.points[0]!;for(const delta of [0x7000,0x50000]){s.node=0;s.pending=true;const b:number=bytes;stepNeighborhoodLeaves(s,{...at,y:at.y+delta},host);assert.equal(bytes,b);assert(s.pending);}
s.node=0;s.pending=true;const b:number=bytes;stepNeighborhoodLeaves(s,{x:at.x+800*256,y:at.y+0x7001,z:at.z},host);assert.equal(bytes,b+2);assert(s.pending,'strict horizontal radius');
for(const [y,four,sixteen,want] of [[-0xbe00,true,false,true],[-0xbe01,true,false,false],[-0xbe01,false,true,true]] as const){s.pending=false;const before:number=bytes;stepNeighborhoodLeaves(s,{x:1e8,y,z:1e8},{...host,four,sixteen});assert.equal(bytes>before,want,'height-selected random gate');assert.equal(s.pending,want);}
s.node=0;s.pending=true;lastFloor=1234;stepNeighborhoodLeaves(s,{...at,y:at.y+0x7001},host);assert(fx.effects.some(e=>e.kind===55&&e.floor===1234));
s.node=0;s.pending=true;const before:number=bytes;stepNeighborhoodLeaves(s,{...at,y:at.y+0x7001},{...host,spawn:()=>null});assert.equal(bytes,before+3);assert.equal(s.pending,false);
console.log('PASS Neighborhood all 17 leaf nodes/templates, strict height/radius, height-dependent shared gates, pending search, ground/fallback, spin and culled RNG');
