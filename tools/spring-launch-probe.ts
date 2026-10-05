import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision,collisionGroupByObject} from '../src/formats/collision.ts';
import {createPlayer,createRuntime,groundFromCollision,stepPlayer,NO_INPUT} from '../src/sim/player.ts';
import {createLevelPlatforms,stepLevelPlatforms,stepPlatformSwitches} from '../src/sim/level-platforms.ts';
import {stepAndySpring} from '../src/sim/spring-launch.ts';
function world(path:string){return buildCollisionWorld(parseCollision(parseAll(readFileSync(`Toy Story 2/data/${path}.ALL`))).groups);}
function point(w:ReturnType<typeof world>,group:number){const floor=w.groups[group]!.polys.map(i=>w.polys[i]!).filter(q=>q.normal.y<-.99).sort((a,b)=>a.vertices[0]!.y-b.vertices[0]!.y)[0]!;assert(floor);return floor.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});}
for(const stomp of [false,true]){
 const w=world('level01/TERRAIN'),group=collisionGroupByObject(w,3),at=point(w,group),p=createPlayer(at.x,at.y-3000,at.z),runtime=createRuntime(),ground=groundFromCollision(w);
 p.stomp=stomp?1:0;let launched=false;
 for(let t=0;t<120&&!launched;t++){stepPlayer(p,NO_INPUT,runtime,ground,0);assert(!stepAndySpring(p,w,3),'wrong room launched');launched=stepAndySpring(p,w,4);}
 assert(launched);assert.equal(p.vy,stomp?-3072:-2432);assert(!p.launched&&!p.onGround);assert.equal(p.stomp,0);
}
const dat=parseDat(readFileSync('Toy Story 2/data/level03/level1.dat'));
for(let which=0;which<5;which++)for(const stomp of [false,true]){
 const w=world('level03/TERR1'),s=createLevelPlatforms(13,dat,w)!,group=which<2?s.springs[which]!.group:s.movers[which]!.hulls[0]!.groupIndex,at=point(w,group);
 const p=createPlayer(at.x,at.y-3000,at.z),runtime=createRuntime(),ground=groundFromCollision(w);ground.beforeMove=()=>stepLevelPlatforms(s,w,p);
 p.stomp=stomp?1:0;let launched=false,landed=false;
 for(let t=0;t<150&&!launched;t++){stepPlayer(p,NO_INPUT,runtime,ground,0);landed ||= p.onGround&&p.contacts.some(c=>c.group===group);stepPlatformSwitches(s,p,w);launched=s.sounds.some(e=>e.event===0x1c);}
 assert(landed,`Airport landing ${which}`);assert.equal(launched,stomp,`Airport stomp gate ${which}`);
 if(stomp){assert.equal(p.vy,-3072);assert(!p.launched,'vertical spring enabled directional air control');assert.equal(s.springRoll,which<2?-480:-512);assert.equal(s.guidesSpent.length,which<2?1:0);if(which>=2)assert(!s.movers[which]!.exhaust);
 for(let i=0;i<16;i++)stepLevelPlatforms(s,w,p);assert.equal(s.springRoll,0);}
}
console.log('PASS real Andy ordinary/stomp spring landings and room gate; all five Airport stomp-only launches, normal air control, compression timing, guide/exhaust and recovery');
