import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unpackRaw} from '../src/formats/rnc.ts';
import {parseCreatureList} from '../src/formats/creatures.ts';
import {sceneForLevel} from '../src/sim/level-data.ts';
import {CREATURE_TYPES} from '../src/sim/creature-data.ts';
import {createCreatureSim,CREATURE_HANDLERS,CREATURE_FLAGS,RandomStream} from '../src/sim/creatures.ts';
import {readEffectTable} from '../src/formats/effect-table.ts';
import {createEffects,spawnEffect,stepEffects,type EffectWorld} from '../src/sim/effects.ts';
const cases=[
 [1,'FUN_00416a60',null,0],[2,'FUN_00418610',0x48,128],
 [4,'FUN_0041bb80',0x6b,90],[5,'FUN_0041dec0',0xa2,60],
 [7,'FUN_00420ed0',0x77,60],[8,'FUN_00422c70',0x80,300],
 [10,'FUN_004259b0',0x8e,90],[11,'FUN_00428650',0x96,60],
 [13,'FUN_0042c150',0x6b,90],[14,'FUN_0042d620',null,0],
] as const;
const args={bits:1,chasing:true,fwd:0,side:0,dt:1};
function fresh(level:number,handler:string,values=[255]){
 const raw=unpackRaw(readFileSync(`Toy Story 2/data/${sceneForLevel(level)}.raw`));
 const record=parseCreatureList(raw.find(r=>r.type===35)!.data).find(c=>c.health===102&&(c.flags&8192)===0&&CREATURE_TYPES[c.type]?.handler===handler)!;assert(record);
 const sim=createCreatureSim([record],{groundY:()=>null},new RandomStream(new Uint8Array(values)),level),c=sim.creatures[0]!;
 let bytes=0;sim.rand.byte=()=>values[bytes++%values.length]!;
 c.flags=CREATURE_FLAGS.drawn;c.timer=1;
 return {sim,c,bytes:()=>bytes,run:()=>CREATURE_HANDLERS[handler]!(sim,c,args)};
}
for(const [level,handler,event,base] of cases){
 const {sim,c,run,bytes}=fresh(level,handler);
 if(level===2)continue;
 run();
 if(event===null){assert.equal(sim.sounds.length,0);assert.equal(bytes(),0);assert.equal(c.timer,1);continue;}
 assert.deepEqual(sim.sounds.map(s=>s.event),[event]);assert.equal(c.timer,base+127);assert.equal(bytes(),1);
 sim.sounds.length=0;for(let t=0;t<base+126;t++)run();assert.equal(sim.sounds.length,0);run();assert.deepEqual(sim.sounds.map(s=>s.event),[event]);
}
for(let byte=0;byte<4;byte++){
 const {sim,c,run,bytes}=fresh(2,'FUN_00418610',[byte]);c.timer=100;
 sim.effectGates={four:false,eight:false,thirtyTwo:true};run();assert.equal(bytes(),1);assert.equal(sim.sounds.length,byte===0?1:0);
 if(byte===0)assert.equal(sim.sounds[0]!.event,0x48);
}
for(const awake of [false,true]){
 const {sim,c,run,bytes}=fresh(2,'FUN_00418610',[255,0,44,55]);if(awake)c.flags|=CREATURE_FLAGS.awake;
 run();assert.equal(c.timer,255);assert.equal(bytes(),awake?4:1);assert.equal(sim.rescueProjectiles.length,awake?1:0);
 if(awake){const e=sim.rescueProjectiles[0]!;assert.deepEqual(e,{x:c.x,y:c.y-4096,z:c.z,vx:-512,vy:-3072,vz:-128,gravity:96,spin:-512,kind:121,sound:0x60});
  const tables=readEffectTable(readFileSync('Toy Story 2/toy2.exe')),fx=createEffects(tables.kinds,tables.modes,new RandomStream(new Uint8Array([128])));
  const world:EffectWorld={cameraX:e.x,cameraY:e.y,cameraZ:e.z,playerX:e.x,playerY:e.y,playerZ:e.z,playerYaw:0,playerVx:0,playerVz:0,groundAt:()=>null,waterY:null};
  const particle=spawnEffect(fx,world,e.x,e.y,e.z,e.vx,e.vy,e.vz,e.gravity,0,e.spin,e.kind)!;assert(particle);assert.equal(particle.vx,-256);assert.equal(particle.gravity,24);
  stepEffects(fx,world);assert(particle.y<e.y);assert.equal(particle.mode,51);
 }
}
{
 const {sim,c,run,bytes}=fresh(2,'FUN_00418610');c.flags|=CREATURE_FLAGS.awake|CREATURE_FLAGS.touched;
 run();assert.equal(sim.foundCount,1);assert.equal(c.health,0);assert.equal(sim.rescueProjectiles.length,0);assert.equal(bytes(),1,'pickup precedes awake emission gate');
}
for(const level of [5,10,13]){
 const entry=cases.find(c=>c[0]===level)!,{sim,c,run,bytes}=fresh(level,entry[1]);c.health=999;run();assert.equal(bytes(),0);assert.equal(sim.sounds.length,0);assert.equal(c.timer,level===10?1:0);
}
console.log('PASS ten installed rescue types: native idle cues/timers/silence, health gates, soldier 32-tick chance, visibility/RNG/projectile and collection ordering');
