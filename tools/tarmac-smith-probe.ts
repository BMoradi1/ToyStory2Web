/** Focused combat regression, retail 0042d3e0/0042e790. Uses installed placement
 * and shared wordcode; injects hits, not a complete playable encounter. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unpackRaw} from '../src/formats/rnc.ts';
import {parseCreatureList} from '../src/formats/creatures.ts';
import {createCreatureSim, CREATURE_FLAGS, damageCreature, RandomStream, stepCreatures} from '../src/sim/creatures.ts';
import {createTasks, stepTasks} from '../src/sim/tasks.ts';
import {LEVEL_TASKS} from '../src/sim/level-data.ts';
const raw = unpackRaw(readFileSync('Toy Story 2/data/level04/level1.raw'));
const placement = parseCreatureList(raw.find(r=>r.type===0x23)!.data).find(c=>c.slot===46)!;
assert.equal(placement.type,58);
const fresh = () => createCreatureSim([placement],{groundY:()=>null},new RandomStream(new Uint8Array([0])),14);
let sim=fresh(), c=sim.creatures[0]!, tasks=createTasks();
const sounds:number[]=[];
const world={coins:0,found:0,rand:sim.rand,talking:false,x:c.x,y:c.y,z:c.z,
  level:14,cameraZone:0,playerZone:0,items:0,tokens:0,onGround:true,pathPoints:()=>null,
  sound:(event:number)=>{sounds.push(event);}};
const tick=(dt=1)=>stepTasks(tasks,{boss:LEVEL_TASKS[14]!.boss},slot=>slot===46?c:undefined,world,dt);
c.flags|=CREATURE_FLAGS.near;
assert.equal(tick()!.text,0x4f46d0);assert.equal(tasks.boss,1);
world.talking=true;tick(100);assert.equal(tasks.boss,1);
world.talking=false;tick();assert.equal(tasks.boss,2);assert.equal(c.pc,14);
assert.equal(c.record.facing,0);assert.equal(c.record.vulnerable,6);
const full=c.health;
damageCreature(sim,c,0,2);assert.equal(c.health,full,'spin is still blocked');
damageCreature(sim,c,0,4);tick();assert.equal(c.health,full-2);
assert.equal(c.record.vulnerable,4);assert.equal(tasks.bossHurt,59);
tick(59);assert.equal(tasks.bossHurt,0);assert.equal(c.record.vulnerable,4);
tick();assert.equal(c.record.vulnerable,6,'reopens only below zero');
while(c.health>9){c.stun=0;damageCreature(sim,c,0,4);tick();if(c.health>9)tick(60);}
assert.equal(c.health,9);assert.equal(c.pc,45);assert.equal(c.wait,0);
assert.equal(c.record.vulnerable,4);assert.equal(c.record.speed,16);
assert.equal(c.flags&(CREATURE_FLAGS.hurts|CREATURE_FLAGS.chase),0);
assert.deepEqual(sounds,[-2]);assert.equal(tasks.done&16,0);
// Execute the real defeat wordcode: ensure the entry is valid and the
// delayed award survives eventual model removal.
stepCreatures(sim,world);assert.equal(c.animState,2);
c.type=0;
while(tasks.boss<120)tick();
assert.equal(tasks.done&16,0);tick();assert.equal(tasks.done&16,16);
assert.equal(tasks.boss,200);tick(500);assert.deepEqual(sounds,[-2]);
sim=fresh();c=sim.creatures[0]!;tasks=createTasks();
assert.equal(tasks.bossHurt,0);assert.equal(tasks.bossHealthWas,-1);
assert.equal(tasks.done,0);assert.equal(c.health,full);
world.level=15;tasks.boss=2;c.health=9;tick();
assert.equal(tasks.boss,2);assert.equal(tasks.done,0,'finale is not handled by Tarmac');
console.log('PASS: installed blacksmith taunt, wake, spin gate, hit recovery boundary, defeat script, delayed reward after removal, one-shot sound, reset and finale isolation.');
