import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision,sweepSphere} from '../src/formats/collision.ts';
import {createAndyMachinery,stepAndyMachinery,restoreAndyMachinery,type AndyMachineryWorld} from '../src/sim/andy-machinery.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level01/level.dat'));
const w=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level01/TERRAIN.ALL'))).groups);
let s=createAndyMachinery(dat,w),bytes=0;
const sounds:number[]=[],children:{kind:number;mode:number;x:number;y:number;z:number}[]=[];
const host:AndyMachineryWorld={cameraZone:2,gateTwo:1,byte:()=>{bytes++;return 128;},child:(at,kind,mode)=>{children.push({...at,kind,mode});return null;},sound:id=>sounds.push(id)};
const p={...s.objects[0]!.rest};
const tick=()=>stepAndyMachinery(s,w,p,host);
const before=JSON.stringify(s);host.cameraZone=1;tick();assert.equal(JSON.stringify(s),before);host.cameraZone=2;
p.x+=640*256;tick();assert.deepEqual(s.objects[0]!.scale,[1,1,1],'strict proximity boundary');Object.assign(p,s.objects[0]!.rest);
s.phase=1984;tick();assert.equal(s.objects[0]!.scale[1],.25);
s.phase=6080;tick();assert.equal(s.objects[0]!.scale[1],1.25);assert(sounds.includes(0x24));assert(children.some(c=>c.kind===25&&c.y===p.y+0x4800));assert(children.some(c=>c.kind===26&&c.y===p.y+0x6000));assert(children.some(c=>c.kind===24&&c.mode===9));assert(bytes>0);
function cast(index:number){const h=s.barriers[index]!.hull,poly=w.polys[h.polys[0]!.index]!,n=poly.normal,at=poly.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});return sweepSphere(w,{x:at.x+n.x*2000,y:at.y+n.y*2000,z:at.z+n.z*2000},{x:-n.x*4000,y:-n.y*4000,z:-n.z*4000},100,{groups:new Set([h.groupIndex])}).contacts.length;}
for(let i=0;i<2;i++){
 Object.assign(p,s.objects[i+3]!.rest);assert(cast(i)>0);
 s.phase=(960-i*4096)&8191;tick();assert(!s.barriers[i]!.enabled);assert.equal(cast(i),0,'barrier still collides after opening');
 s.phase=(5056-i*4096)&8191;tick();assert(s.barriers[i]!.enabled);assert(cast(i)>0,'closed barrier has no collision');assert(sounds.includes(0x25));
 s.phase=(6080-i*4096)&8191;tick();assert(children.some(c=>c.mode===13&&c.kind===24));
 const o=s.objects[i+3]!;assert.equal(o.position.y,o.rest.y);
 s.phase=(960-i*4096)&8191;tick();assert.equal(cast(i),0);
}
restoreAndyMachinery(s,w);assert(cast(0)>0&&cast(1)>0);
s=createAndyMachinery(dat,w);assert.equal(s.phase,0);assert(s.objects.every(o=>o.position.y===o.rest.y&&o.scale[1]===1));
for(const o of s.objects){Object.assign(p,o.rest);const poses=new Set<string>();for(let i=0;i<256;i++){tick();poses.add(JSON.stringify([o.angles,o.position,o.scale]));}assert(poses.size>16);}
console.log('PASS Andy machinery: installed objects, room/proximity gates, authored scales/positions, paired real collision swaps, burst/spray/audio, full cycles and restoration');
