import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {unpackRaw} from '../src/formats/rnc.ts';
import {parseCreatureList} from '../src/formats/creatures.ts';
import {createCreatureSim,RandomStream,CREATURE_FLAGS,stepCreatures} from '../src/sim/creatures.ts';
import {createTasks,stepTasks} from '../src/sim/tasks.ts';
import {LEVEL_TASKS} from '../src/sim/level-data.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level08/level.dat'));
const placements=parseCreatureList(unpackRaw(readFileSync('Toy Story 2/data/level08/level.raw')).find(r=>r.type===35)!.data);
const route=dat.paths.find(p=>p.id===13)!.points;
function fresh(){
 const sim=createCreatureSim([placements.find(p=>p.slot===1)!],{groundY:()=>null},new RandomStream(new Uint8Array([128])),8);
 const tasks=createTasks(),sounds:number[]=[];
 const w={level:8,x:-20000,y:-120000,z:-300000,coins:0,found:0,items:0,tokens:0,rand:sim.rand,
  talking:false,onGround:true,coyote:6,playerZone:1,cameraZone:1,
  pathPoints:(id:number)=>dat.paths.find(p=>p.id===id)?.points??null,sound:(id:number)=>sounds.push(id)};
 const creature=()=>sim.creatures[0]!;
 const tick=()=>stepTasks(tasks,{reachBox:LEVEL_TASKS[8]!.reachBox},i=>i===1?creature():undefined,w);
 const accept=()=>{creature().flags|=CREATURE_FLAGS.touched|CREATURE_FLAGS.near;assert(tick());assert.equal(tasks.saucer.phase,1);assert(!(creature().flags&CREATURE_FLAGS.drawn));};
 return {sim,tasks,w,creature,tick,accept,sounds};
}
{
 const f=fresh();f.accept();f.w.talking=true;for(let i=0;i<40;i++)f.tick();assert.equal(f.tasks.saucer.progress,0);
 f.w.talking=false;f.tick();assert.equal(f.tasks.saucer.progress,17);assert.equal(f.tasks.saucer.phase,2);
 for(let i=0;i<200;i++)f.tick();assert.equal(f.tasks.saucer.speed,3000);assert(f.sounds.includes(0x7e));
 const first=f.creature().x;assert.notEqual(first,route[0]!.x*32);
 const limit=(route.length-1)*65536-1;
 let ticks=0;while(Number(f.tasks.saucer.phase)!==4&&ticks++<3000)f.tick();
 assert(ticks<3000);assert.equal(f.tasks.saucer.progress,limit);assert(f.creature().flags&CREATURE_FLAGS.drawn);assert.equal(f.tasks.done&4,0);
 assert.equal(f.creature().homeX,f.creature().x);assert.equal(f.creature().targetZ,f.creature().z);
 f.creature().flags&=~CREATURE_FLAGS.near;f.tick();assert.equal(f.tasks.saucer.phase,0);assert.equal(f.creature().health,0);
 for(let i=0;i<12;i++)stepCreatures(f.sim,{x:1e7,y:1e7,z:1e7});
 assert(f.creature().health>0,'failed saucer must respawn from its installed record');f.accept();assert.equal(f.tasks.saucer.speed,0);
}
// Being airborne cannot win or fail until the original coyote word becomes nonzero.
for(const coyote of [0,1,6]){
 const f=fresh();f.accept();Object.assign(f.w,{x:-430000,y:-90000,z:90000,onGround:false,coyote});f.tick();
 assert.equal(f.tasks.saucer.phase,coyote?3:2);assert.equal(f.tasks.done&4,coyote?4:0);
 if(coyote){const progress=f.tasks.saucer.progress;for(let i=0;i<200;i++)f.tick();assert(f.tasks.saucer.progress>progress,'winning must not stop saucer path');}
}
for(const p of [
 {x:-430000,y:-0x1419a,z:90000}, // inclusive height failure
 {x:-0x7265c,y:-90000,z:90000}, // strict finish X edge
 {x:-430000,y:-90000,z:0x129c8}, // strict finish Z edge
 {x:-0x924c,y:-90000,z:-300000}, // strict start X edge
 {x:-20000,y:-90000,z:-0x3db94}, // strict start Z edge
 {x:0,y:-90000,z:0},
]){
 const f=fresh();f.accept();Object.assign(f.w,p);f.tick();assert.equal(f.tasks.saucer.phase,4);assert.equal(f.tasks.done&4,0);
}
console.log('PASS: installed saucer path/acceleration/deadline, dialogue wait, strict start/finish/height bounds, coyote gate, post-win movement and failed-run respawn/retry');
