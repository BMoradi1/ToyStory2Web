import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSpaceBallPit,spaceBallPitY,stepSpaceBallPit,SPACE_BALL_PIT as b} from '../src/sim/space-ball-pit.ts';
import {createPlayer,createRuntime,stepPlayer,NO_INPUT,NO_GROUND} from '../src/sim/player.ts';
import {readEffectTable} from '../src/formats/effect-table.ts';
import {createEffects,liveEffects,spawnChild,type EffectWorld} from '../src/sim/effects.ts';
import {RandomStream} from '../src/sim/creatures.ts';
import {createWaterEffects,stepWaterEffects} from '../src/sim/water-effects.ts';
const exe=readFileSync('Toy Story 2/toy2.exe'),s=createSpaceBallPit(exe),tables=readEffectTable(exe);
const at={x:(b.xMin+b.xMax)/2,y:b.surface,z:(b.zMin+b.zMax)/2};
for(const [axis,n] of [['x',b.xMin],['x',b.xMax],['z',b.zMin],['z',b.zMax]] as const)assert.equal(spaceBallPitY({...at,[axis]:n}),null);
assert.equal(spaceBallPitY({...at,y:-1e8}),b.surface,'pit volume has no height gate');
for(const [y,wet,gravity] of [[b.surface,false,64],[b.surface+1,true,16]] as const){
 const p=createPlayer(at.x,y,at.z);stepPlayer(p,NO_INPUT,createRuntime(),{...NO_GROUND,waterY:b.surface,waterKind:3},0);
 assert.equal(p.inBallPit,wet);assert(!p.inWater&&!p.inMud);assert.equal(p.vy,gravity);
}
{
 const p=createPlayer(at.x,b.surface+100,at.z),rt=createRuntime(),g={...NO_GROUND,waterY:b.surface,waterKind:3 as const};
 for(let i=0;i<180;i++)stepPlayer(p,{...NO_INPUT,moveY:1},rt,g,0);
 assert.equal(p.vy,64);assert(p.forwardSpeed>=248&&p.forwardSpeed<=276);
 stepPlayer(p,{...NO_INPUT,jump:true},rt,g,0);assert.equal(p.vy,-752);assert(p.jumpedFromGround);
 stepPlayer(p,NO_INPUT,rt,{...g,waterY:null},0);assert(!p.inBallPit&&!p.inWater&&!p.inMud);
}
for(let colour=0;colour<4;colour++){
 const effects=createEffects(tables.kinds,tables.modes,new RandomStream(new Uint8Array([128])));
 const p=createPlayer(at.x,b.surface+100,at.z);p.inBallPit=true;
 const world:EffectWorld={cameraX:at.x,cameraY:b.surface,cameraZ:at.z,playerX:p.x,playerY:p.y,playerZ:p.z,
  playerYaw:0,playerVx:0,playerVz:0,groundAt:()=>null,waterY:b.surface,waterKind:3};
 let draws=0;const host={gateFour:true,randomByte:()=>{draws++;return colour;},
  effect:(p:any,kind:number,mode:number)=>spawnChild(effects,world,p.x,p.y,p.z,kind,mode)};
 p.forwardSpeed=32;p.vy=32;stepSpaceBallPit(s,p,host);assert.equal(draws,0);
 p.forwardSpeed=33;host.gateFour=false;stepSpaceBallPit(s,p,host);assert.equal(draws,0);
 host.gateFour=true;stepSpaceBallPit(s,p,host);assert.equal(draws,1);
 const e=liveEffects(effects)[0]!;assert.equal(e.kind,95);assert.equal(e.y,b.surface);assert.deepEqual([e.r,e.g,e.b],s.colours[colour]);
 p.forwardSpeed=0;p.vy=-33;stepSpaceBallPit(s,p,host);assert.equal(draws,2,'vertical movement also scatters balls');
 // Water and mud presentation must never run against a ball-pit plane.
 const wet=createWaterEffects(b.surface-100),sounds:number[]=[];
 effects.gate.four=effects.gate.sixteen=effects.gate.seven=true;
 stepWaterEffects(wet,effects,world,p,1,13,b.surface+100,id=>sounds.push(id));
 assert.equal(liveEffects(effects).length,2);assert.deepEqual(sounds,[]);assert.equal(wet.dripTicks,0);
 world.cameraX=1e8;stepSpaceBallPit(s,p,host);assert.equal(draws,3,'culled scatter still consumes its colour byte');
}
console.log('PASS: strict pit/depth bounds, type-3 movement/sink cap/escape jump, exit reset, installed coloured scatter, speed/vertical/cadence gates and isolation from water/mud effects');
