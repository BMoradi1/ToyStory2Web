import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {readEffectTable} from '../src/formats/effect-table.ts';
import {createEffects,spawnEffect,spawnChild,type EffectWorld} from '../src/sim/effects.ts';
import {RandomStream} from '../src/sim/creatures.ts';
import {createAndyEffects,stepAndyEffects,ANDY_EMITTER_CENTRE,ANDY_STEAM_CENTRE,type AndyEffectWorld} from '../src/sim/andy-effects.ts';
const exe=readFileSync('Toy Story 2/toy2.exe'),dat=parseDat(readFileSync('Toy Story 2/data/level01/level.dat'));
const s=createAndyEffects(dat,exe),table=readEffectTable(exe),fx=createEffects(table.kinds,table.modes,new RandomStream(new Uint8Array([128])));
const ew:EffectWorld={cameraX:0,cameraY:0,cameraZ:0,playerX:0,playerY:0,playerZ:0,playerYaw:0,playerVx:0,playerVz:0,groundAt:()=>null,waterY:null};
let bytes=0,hits=0;const nodes:number[]=[],bursts:number[]=[];
const world:AndyEffectWorld={cameraZone:4,player:{...ANDY_EMITTER_CENTRE},gate64:true,gate8:false,gateTwo:0,byte:()=>{bytes++;return 128;},hurt:()=>hits++,
 projectile:(at,v,spin)=>{nodes.push(s.node);const target=s.points[s.node]!;assert((target.x-at.x)*v.x+(target.z-at.z)*v.z>0,'lob aimed away from target');assert(v.y<0);Object.assign(ew,{cameraX:at.x,cameraY:at.y,cameraZ:at.z});const e=spawnEffect(fx,ew,at.x,at.y,at.z,v.x,v.y,v.z,128,0,spin,12);assert(e);assert.equal(e.kind,12);return e;},
 child:(at,kind,mode)=>{Object.assign(ew,{cameraX:at.x,cameraY:at.y,cameraZ:at.z});if(kind===34)bursts.push(s.emitter);return spawnChild(fx,ew,at.x,at.y,at.z,kind,mode);}};
for(let i=0;i<25;i++)stepAndyEffects(s,world);assert.deepEqual(nodes,Array.from({length:25},(_,i)=>i+1));assert.equal(s.node,1);assert.equal(bytes,50);
world.gate64=false;s.timer=0;for(let i=0;i<120;i++)stepAndyEffects(s,world);assert.deepEqual(bursts,[]);stepAndyEffects(s,world);assert.deepEqual(bursts,[1]);for(let i=0;i<240;i++)stepAndyEffects(s,world);assert.deepEqual(bursts,[1,2,0]);
world.gateTwo=2;world.gate8=true;stepAndyEffects(s,world);assert(fx.effects.some(e=>e.kind===16&&e.life===32));assert(fx.effects.some(e=>e.kind===17&&e.spin===0));
const frozen=JSON.stringify(s),b=bytes;world.cameraZone=3;stepAndyEffects(s,world);assert.equal(JSON.stringify(s),frozen);assert.equal(bytes,b);
world.cameraZone=4;world.gateTwo=0;world.gate8=false;world.player={...ANDY_EMITTER_CENTRE,x:ANDY_EMITTER_CENTRE.x+640*256};stepAndyEffects(s,world);assert.equal(JSON.stringify(s),frozen,'strict emitter radius');
for(const [distance,expected] of [[30,0],[29,1],[0,1]]){world.player={...ANDY_STEAM_CENTRE,x:ANDY_STEAM_CENTRE.x+distance!*256};const before=hits;stepAndyEffects(s,world);assert.equal(hits-before,expected,'steam squared-distance damage boundary');}
const miss=createAndyEffects(dat,exe);let missedBytes=0;stepAndyEffects(miss,{...world,player:ANDY_EMITTER_CENTRE,gate64:true,gate8:true,gateTwo:2,byte:()=>{missedBytes++;return 255;},projectile:()=>null,child:()=>null});assert.equal(missedBytes,5,'culled effects changed native random consumption');assert.equal(miss.node,17);
console.log('PASS Andy all 25 lob targets and installed effect kinds, shared gates, three-emitter cadence, random lifetime/spin, room/proximity and steam-damage boundaries, culled RNG and reset');
