import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {parseCollision,buildCollisionWorld} from '../src/formats/collision.ts';
import {createPlayer,createRuntime,groundFromCollision,stepPlayer,NO_INPUT} from '../src/sim/player.ts';
import {createToyBarnSprings,stepToyBarnSprings} from '../src/sim/toy-barn-springs.ts';
import {sin,cos} from '../src/sim/trig.ts';
const dat=parseDat(readFileSync('Toy Story 2/data/level07/level.dat'));
const world=buildCollisionWorld(parseCollision(parseAll(readFileSync('Toy Story 2/data/level07/TERRAIN.ALL'))).groups);
for(const surface of [8,9])for(const stomp of [false,true]){
 const group=world.groups.find(g=>g.surface===surface)!;
 const poly=group.polys.map(i=>world.polys[i]!).find(p=>p.normal.y<-.99)!;
 const at=poly.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});
 const p=createPlayer(at.x,at.y-20000,at.z),rt=createRuntime(),ground=groundFromCollision(world),s=createToyBarnSprings(dat);
 p.stomp=stomp?1:0;let guides=0,sounds=0,landed=false,launchTick=-1,impactTick=-1;
 const host={guide:()=>guides++,sound:()=>sounds++};
 for(let t=0;t<100&&launchTick<0;t++){
  stepPlayer(p,NO_INPUT,rt,ground,0);
  if(p.onGround){landed=true;if(impactTick<0)impactTick=t;}
  stepToyBarnSprings(s,p,world,host);if(sounds)launchTick=t;
 }
 assert(landed,`surface ${surface}: failed physical landing`);
 if(surface===8&&!stomp){assert.equal(launchTick,-1);assert.equal(s.chair,0);continue;}
 assert(launchTick>=0);assert.equal(p.vy,stomp?-3072:-2432);assert.equal(p.onGround,false);assert.equal(p.stomp,0);
 if(surface===8){
  assert.equal(launchTick-impactTick,4);assert.equal(guides,1);assert(p.launched);
  assert.equal(p.vx,sin(0x81e)>>3);assert.equal(p.vz,cos(0x81e)>>3);assert.equal(p.yaw,0x81e);
 }else{assert.equal(launchTick,impactTick);assert.equal(guides,0);assert(!p.launched);}
 // Run the animation independently of another landing.
 p.onGround=false;p.contacts=[];
 let negativeScale=false;
 for(let t=0;t<80;t++){stepToyBarnSprings(s,p,world,host);negativeScale ||= s.objects[1]!.scale[1]<0;}
 assert.equal(sounds,1);assert.equal(s.chair,0);assert.equal(s.bounce,0);
 assert.equal(s.objects[2]!.scale[1],0);assert.equal(s.objects[1]!.scale[1],0);
 if(surface===9)assert(negativeScale,'bounce animation lost signed oscillation');
 const coil=s.objects[2]!;assert.equal(coil.scale[0],4096/coil.baseScale.x,'absolute native scale must undo authored non-unit scale');
 console.log(`PASS surface ${surface}, stomp ${stomp}: physical launch at`,at);
}
console.log('PASS installed spring landings/stomps, delayed/directional and immediate impulses, guide/sound, signed decay and reset scale');
