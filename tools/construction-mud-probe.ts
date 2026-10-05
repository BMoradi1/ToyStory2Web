import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constructionMudY,CONSTRUCTION_MUD as b} from '../src/sim/construction-mud.ts';
import {createPlayer,createRuntime,stepPlayer,NO_INPUT,NO_GROUND} from '../src/sim/player.ts';
import {readEffectTable} from '../src/formats/effect-table.ts';
import {createEffects,liveEffects,type EffectWorld} from '../src/sim/effects.ts';
import {RandomStream} from '../src/sim/creatures.ts';
import {createWaterEffects,stepWaterEffects} from '../src/sim/water-effects.ts';
const at={x:(b.xMin+b.xMax)/2,y:b.ceiling,z:(b.zMin+b.zMax)/2};
assert.equal(constructionMudY(at),b.surface);assert.equal(constructionMudY({...at,y:b.ceiling-1}),null);
for(const [axis,n] of [['x',b.xMin],['x',b.xMax],['z',b.zMin],['z',b.zMax]] as const)assert.equal(constructionMudY({...at,[axis]:n}),null);
for(const [y,mud,gravity] of [[b.surface,false,64],[b.surface+1,true,16]] as const){
 const p=createPlayer(at.x,y,at.z),rt=createRuntime();stepPlayer(p,NO_INPUT,rt,{...NO_GROUND,waterY:b.surface,waterKind:2},0);
 assert.equal(p.inMud,mud);assert.equal(p.inWater,false);assert.equal(p.vy,gravity);
}
{
 const p=createPlayer(at.x,b.surface+100,at.z),rt=createRuntime(),g={...NO_GROUND,waterY:b.surface,waterKind:2 as const};
 for(let i=0;i<180;i++)stepPlayer(p,{...NO_INPUT,moveY:1},rt,g,0);
 assert.equal(p.vy,64,'mud sink cap');assert(p.forwardSpeed>=248&&p.forwardSpeed<=276,'mud speed around 256');
 assert(p.coyote>0,'mud refreshes jump permission while sinking');
 stepPlayer(p,{...NO_INPUT,jump:true},rt,g,0);assert.equal(p.vy,-752,'mud allows shallow ground-style jump without floor contact');
 p.y=b.surface-100;p.vy=0;stepPlayer(p,NO_INPUT,rt,g,0);assert(!p.inMud);assert.equal(p.vy,64);
}
const tables=readEffectTable(readFileSync('Toy Story 2/toy2.exe'));
for(const hard of [false,true]){
 const effects=createEffects(tables.kinds,tables.modes,new RandomStream(new Uint8Array([0]))),p=createPlayer(at.x,b.surface+1,at.z);
 const state=createWaterEffects(b.surface-1),sounds:number[]=[];
 const world:EffectWorld={cameraX:at.x,cameraY:b.surface+100,cameraZ:at.z,playerX:p.x,playerY:p.y,playerZ:p.z,playerYaw:0,playerVx:0,playerVz:0,groundAt:()=>null,waterY:b.surface,waterKind:2};
 const tick=(mask=0)=>stepWaterEffects(state,effects,world,p,mask,13,b.surface+100,n=>sounds.push(n));
 const kind=(n:number)=>liveEffects(effects).filter(e=>e.kind===n);
 p.fallTimer=hard?80:0;tick();assert.equal(kind(53).length,hard?20:5);assert(kind(53).every(e=>e.period===(hard?8:6)));assert.deepEqual(sounds,[0x4e]);
 effects.gate.four=true;p.forwardSpeed=50;tick();assert.equal(kind(51).length,0,'mud movement still uses sixteen gate');
 effects.gate.sixteen=true;tick();assert.equal(kind(51).length,1);assert.equal(kind(57).length,0,'mud does not emit underwater camera particles');assert(!sounds.includes(0x5f));
 p.inMud=true;effects.gate.seven=true;tick();assert.equal(kind(53).length,(hard?20:5)+1);assert.equal(kind(53).at(-1)!.y,b.surface);
 p.inMud=false;p.y=b.surface-1;tick();assert.equal(state.dripTicks,180);assert.equal(state.dripKind,54);
 p.coyote=6;tick(1);assert.equal(kind(54).length,1);assert.equal(kind(32).length,0);
 world.waterY=null;tick();assert.equal(state.dripKind,54);assert.equal(state.dripTicks,179,'region exit refreshes muddy footprint timer');
 for(let i=0;i<180;i++)tick();tick(1);assert.equal(kind(54).length,1,'mud footprints expire');
}
console.log('PASS: strict mud region/depth boundaries, slowed movement/sinking and escape jump, normal/hard installed splashes, sound, mud ripple/droplet gates, muddy footprints/expiry and water isolation');
