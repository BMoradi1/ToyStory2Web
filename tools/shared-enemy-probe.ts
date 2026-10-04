/** Shared late-game enemy hooks and installed projectile template. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCreature,createCreatureSim,CREATURE_HANDLERS,RandomStream,stepCreatures} from '../src/sim/creatures.ts';
import {enemyGunShot,enemyGunLife} from '../src/sim/enemy-gun.ts';
import {sin,cos} from '../src/sim/trig.ts';
import {readEffectTable,EFFECT} from '../src/formats/effect-table.ts';
import {createEffects,spawnEffect,stepEffects,touchPlayer} from '../src/sim/effects.ts';
import {sweepSphere,type CollisionWorld} from '../src/formats/collision.ts';
const c=buildCreature({slot:0,x:0,y:0,z:0,type:46,script:0,turnRate:0,facing:0,health:3,respawn:0,flags:1,
 rangeX:1000,rangeZ:1000,rangeYaw:0,vulnerable:1,accel:0,accelSide:0,speedMax:0,speed:0},true);
const sim=createCreatureSim([],{groundY:()=>null},new RandomStream(new Uint8Array([0,255,128])),13);
const args={bits:1,chasing:true,fwd:0,side:0,dt:1};
const handler=CREATURE_HANDLERS[c.handler!]!;
c.timer=1;handler(sim,c,args,{x:0,y:0,z:80000});assert.equal(c.timer,0);assert.equal(sim.gunShots.length,1);
assert.equal(sim.gunShots[0]!.puffs,5);assert.equal(sim.sounds[0]!.event,0x56);
handler(sim,c,args,{x:0,y:0,z:80000});assert.equal(sim.gunShots.length,1,'trigger consumed once');
for(const heading of [0,1,1024,2048,4095])for(const delta of [-257,-256,0,256,257,2048]){
 const base=enemyGunShot({...c,heading},{x:0,y:0,z:0});
 const target={x:base.muzzle.x+sin(heading+delta)*32,y:0,z:base.muzzle.z+cos(heading+delta)*32};
 const shot=enemyGunShot({...c,heading},target);
 assert.equal(shot.heading,Math.abs(delta)<=256?(heading+delta)&4095:heading,'forward aim cone including wrap');
 assert.equal(enemyGunLife(shot,{x:shot.trace.x+shot.velocity.x*80,y:shot.trace.y,z:shot.trace.z+shot.velocity.z*80}),145);
 assert.equal(enemyGunLife(shot,shot.trace),1);
}
const shot=enemyGunShot(c,{x:sin(224),y:0,z:100000});
const wall:CollisionWorld={polys:[{vertices:[{x:-10000,y:-30000,z:10000},{x:10000,y:-30000,z:10000},{x:0,y:10000,z:10000}],normal:{x:0,y:0,z:-1},walkable:false,group:0}],groups:[],cells:new Map(),cellSize:1000000,lowestY:1e6};
for(const x of [-1,0])for(const z of [-1,0])wall.cells.set(`${x},${z}`,[0]);
const hit=sweepSphere(wall,shot.trace,{x:0,y:0,z:shot.velocity.z*80},256,{scale:1,skin:0,passes:1,stopAtFirstContact:true});
assert(hit.touched);assert(enemyGunLife(shot,hit)<145,'wall shortens projectile life');
const bird={...c,type:41,timer:0,health:3};const buzzard=CREATURE_HANDLERS.LAB_00406c70!;
sim.sounds=[];buzzard(sim,bird,args);assert.equal(bird.animState,1);assert.equal(bird.timer,3);assert.deepEqual(sim.sounds.map(s=>s.event),[0x57]);
sim.sounds=[];bird.health=2;buzzard(sim,bird,{...args,chasing:false});assert.equal(bird.animState,0);assert.deepEqual(sim.sounds.map(s=>s.event),[0x58,0x57]);
sim.sounds=[];buzzard(sim,bird,args);assert.deepEqual(sim.sounds.map(s=>s.event),[0x57],'no repeated hurt cue');
stepCreatures(sim,{x:0,y:0,z:0});assert.equal(sim.gunShots.length,0,'requests cleared every frame');
const table=readEffectTable(readFileSync('Toy Story 2/toy2.exe'));
const effects=createEffects(table.kinds,table.modes,new RandomStream(new Uint8Array([128])));
const world={cameraX:0,cameraY:0,cameraZ:0,playerX:0,playerY:0,playerZ:30000,playerYaw:0,playerVx:0,playerVz:0,groundAt:()=>null,waterY:null};
const bullet=spawnEffect(effects,world,0,-12288,0,0,0,2048,0,0,0,0x61)!;assert(bullet);
stepEffects(effects,world);assert.equal(bullet.z,1024,'PC projectile velocity is halved');
world.playerZ=bullet.z;world.playerY=bullet.y+EFFECT.hitAbove;touchPlayer(effects,world);assert.notEqual(effects.hurt,null,'installed bullet damages Buzz');
console.log('PASS: shared gun trigger/aim/muzzle/terrain lifetime/projectile damage; buzzard chase and hurt cues; queue lifecycle');
