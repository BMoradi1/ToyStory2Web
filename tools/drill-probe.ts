/** Installed jackhammer arena, damage windows, debris and task reward. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unpackRaw} from '../src/formats/rnc.ts';
import {parseCreatureList} from '../src/formats/creatures.ts';
import {createCreatureSim,RandomStream,CREATURE_FLAGS,damageCreature,stepCreatures} from '../src/sim/creatures.ts';
import {createDrill,readDrillArena,stepDrill,stepDrillLevel,drillBar,drillDebrisVelocity} from '../src/sim/drill.ts';
import {createTasks,stepTasks} from '../src/sim/tasks.ts';
import {LEVEL_TASKS} from '../src/sim/level-data.ts';
import {readEffectTable,EFFECT} from '../src/formats/effect-table.ts';
import {createEffects,spawnEffect,stepEffects,stepEffectGates,touchPlayer} from '../src/sim/effects.ts';
const exe=readFileSync('Toy Story 2/toy2.exe'),arena=readDrillArena(exe);
const raw=unpackRaw(readFileSync('Toy Story 2/data/level04/level.raw'));
const p=parseCreatureList(raw.find(r=>r.type===35)!.data).find(c=>c.type===22)!;
function fresh(){
 const sim=createCreatureSim([p],{groundY:()=>null},new RandomStream(new Uint8Array([0,192])),4),c=sim.creatures[0]!,s=createDrill(c,arena);
 const sounds:number[]=[],shakes:number[]=[],fx:any[]=[],shots:any[]=[];
 const w={x:c.x+20000,y:-640000,z:c.z,phase:2,disksActive:false,shake:0,gateFour:false,gateThirtyTwo:false,rand:sim.rand,
  setShake:(n:number)=>shakes.push(n),sound:(n:number)=>sounds.push(n),
  effect:(at:any,kind:number,mode:number)=>{const e:any={...at,kind,mode};fx.push(e);return e;},
  projectile:(at:any,velocity:any,gravity:number,kind:number)=>{const e:any={...at,velocity,gravity,kind};shots.push(e);return e;}};
 return {sim,c,s,w,sounds,shakes,fx,shots};
}
for(const prior of [0,1,16,17]){
 const {c,s,w}=fresh();s.cell=prior;c.x=Math.trunc((arena.x[0]!+arena.x[1]!)/2)-100;c.z=Math.trunc((arena.z[0]!+arena.z[1]!)/2)-100;
 const x=c.x,z=c.z;stepDrill(s,c,w);
 assert.equal(c.x,prior&1?x:arena.snapX[0]);assert.equal(c.z,prior&16?z:arena.snapZ[0]);assert.equal(s.cell,prior);
}
{
 const {sim,c,s,w,sounds,shakes,fx,shots}=fresh();
 stepDrill(s,c,w);assert(sounds.includes(0x99));assert(shakes.includes(20));assert.equal(c.record.vulnerable,4);
 const health=c.health;damageCreature(sim,c,0,2);assert.equal(c.health,health,'spin cannot hurt without an active disk');
 w.disksActive=true;stepDrill(s,c,w);assert.equal(c.record.vulnerable,5);c.stun=0;damageCreature(sim,c,0,2);assert(c.health<health);
 stepDrill(s,c,w);assert.equal(s.hurt,60);assert.equal(c.record.vulnerable,5,'disk gate overrides recovery mask');
 stepDrill(s,c,w);assert.equal(s.hurt,59);const flash=s.flash;stepDrill(s,c,w);assert.notEqual(s.flash,flash);
 w.phase=1;stepDrill(s,c,w);assert.equal(c.record.vulnerable,4);assert(!s.flash);
 w.phase=2;w.shake=10;w.x=c.x;w.y=c.y;w.z=c.z;stepDrill(s,c,w);assert(shakes.includes(40));
 c.flags|=CREATURE_FLAGS.touched;stepDrill(s,c,w);assert(!(c.flags&CREATURE_FLAGS.touched));assert(sounds.includes(0x9a));
 c.y=-639967;stepDrill(s,c,w);assert.equal(c.y,-0x9c3e0);
 w.x=c.x+64000;w.y=-640000;w.z=c.z;w.gateFour=w.gateThirtyTwo=true;stepDrill(s,c,w);
 assert.equal(fx.at(-1).kind,4);assert.equal(fx.at(-1).life,32);assert.equal(shots.length,1);assert.equal(shots[0].kind,84);assert.equal(shots[0].width,100);assert.equal(shots[0].spin,64);
 w.rand=new RandomStream(new Uint8Array([3,0]));stepDrill(s,c,w);assert.equal(fx.at(-1).kind,84);assert.equal(fx.at(-1).mode,14);assert.equal(fx.at(-1).spin,-128);
 const count=shots.length+fx.length;w.phase=3;stepDrill(s,c,w);assert.equal(shots.length+fx.length,count,'defeat suppresses debris');
}
assert.equal(drillDebrisVelocity({x:0,y:0,z:0},{x:0,y:0,z:0}),null);
assert.deepEqual(drillDebrisVelocity({x:0,y:0,z:0},{x:64000,y:0,z:0}),{x:1500,y:-2730,z:0});
{
 const {sim,c,s}=fresh(),tasks=createTasks();tasks.drill=s;c.flags|=CREATURE_FLAGS.near;
 const world={x:c.x,y:-640000,z:c.z,level:4,coins:0,found:0,rand:sim.rand,talking:false,cameraZone:0,playerZone:0,items:0,tokens:0,onGround:true,pathPoints:()=>null};
 const tick=(dt=1)=>stepTasks(tasks,{boss:LEVEL_TASKS[4]!.boss},i=>i===c.slot?c:undefined,world,dt);
 assert(tick(),'height and proximity trigger');assert.equal(tasks.boss,1);world.talking=true;tick();assert.equal(tasks.boss,1);
 world.talking=false;tick();assert.equal(tasks.boss,2);assert.equal(c.pc,12);assert.equal(drillBar(s,c),54);assert.equal(c.bodyRadius,3800);
 c.health=15;tick();assert.equal(drillBar(s,c),27);world.y=0;tick(90);assert.equal(drillBar(s,c),-1);assert.equal(c.bodyRadius,1800);
 world.y=-640000;tick();c.health=2;c.stun=0;damageCreature(sim,c,0,4);stepCreatures(sim,world);assert.equal(c.type,0);
 tick();assert.equal(tasks.boss,4);assert.equal(drillBar(s,c),0);while(tasks.boss<120)tick();assert.equal(tasks.done&16,0);tick();assert.equal(tasks.done&16,16);assert.equal(tasks.boss,200);
}
const table=readEffectTable(exe),pool=createEffects(table.kinds,table.modes,new RandomStream(new Uint8Array([128])));
const ew={cameraX:0,cameraY:0,cameraZ:0,playerX:100000,playerY:0,playerZ:0,playerYaw:0,playerVx:0,playerVz:0,groundAt:()=>null,waterY:null};
const e=spawnEffect(pool,ew,0,0,0,1500,-2730,0,128,0,0,84)!;assert(e);stepEffects(pool,ew);assert(e.x>0&&e.y<0);
ew.playerX=e.x;ew.playerY=e.y+EFFECT.hitAbove;ew.playerZ=e.z;touchPlayer(pool,ew);assert.notEqual(pool.hurt,null);
{
 const {c,s,w,shots}=fresh();
 for(let i=0;i<64;i++){stepEffectGates(pool);w.gateThirtyTwo=pool.gate.thirtyTwo;stepDrill(s,c,w);}
 assert.equal(shots.length,2,'native ca divider is 32 ticks, not 16');
}
console.log('PASS: installed drill arena entry axes, disk vulnerability, flash/sounds/shake, debris/random branches and damage, intro/bar/height, removal and delayed token');
