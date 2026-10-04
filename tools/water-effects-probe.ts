/** Installed water particles, transitions, shared gates and animation footfalls. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readEffectTable} from '../src/formats/effect-table.ts';
import {createEffects,liveEffects} from '../src/sim/effects.ts';
import {RandomStream} from '../src/sim/creatures.ts';
import {createPlayer} from '../src/sim/player.ts';
import {createAnimation,stepAnimation} from '../src/sim/player-animation.ts';
import {createWaterEffects,stepWaterEffects} from '../src/sim/water-effects.ts';
const tables=readEffectTable(readFileSync('Toy Story 2/toy2.exe'));
function fresh(){
 const effects=createEffects(tables.kinds,tables.modes,new RandomStream(new Uint8Array([0]))),p=createPlayer(0,-100,0),state=createWaterEffects(p.y),sounds:number[]=[];
 const world={cameraX:0,cameraY:0,cameraZ:0,playerX:0,playerY:0,playerZ:0,playerYaw:0,playerVx:0,playerVz:0,groundAt:()=>null,waterY:0 as number|null};
 const tick=(mask=0,surface=-1,camera=-100)=>stepWaterEffects(state,effects,world,p,mask,surface,camera,n=>sounds.push(n));
 const kind=(n:number)=>liveEffects(effects).filter(e=>e.kind===n);
 return {effects,p,state,world,sounds,tick,kind};
}
for(const hard of [false,true]){
 const {p,tick,kind,sounds}=fresh();p.y=1;p.fallTimer=hard?0x50:0;tick();
 assert.equal(kind(13).length,hard?20:5);assert(kind(13).every(e=>e.period===(hard?8:6)&&e.life===e.period*5));
 assert.deepEqual(sounds,[0x3a]);tick();assert.equal(kind(13).length,hard?20:5,'no repeated splash while submerged');
}
{
 const {p,tick,kind,effects}=fresh();p.y=100;effects.gate.sixteen=true;tick();assert.equal(kind(27).length,1);
 p.y=12288;tick();assert.equal(kind(27).length,1,'strict ripple depth limit');
 p.y=100;p.forwardSpeed=30;effects.gate.sixteen=true;effects.gate.four=false;tick();assert.equal(kind(27).length,1,'moving ripples need four gate');
 effects.gate.four=true;tick();assert.equal(kind(27).length,2);
 p.y=16000;p.inWater=true;effects.gate.seven=true;tick();assert.equal(kind(45).length,1);
 assert.equal(kind(45)[0]!.x,-2048);assert.equal(kind(45)[0]!.y,5760);assert.equal(kind(45)[0]!.z,-2048);
}
{
 const {p,tick,kind,state,world}=fresh();p.y=10;tick();p.y=-10;tick();assert.equal(state.dripTicks,180);
 p.onGround=true;p.coyote=6;tick(1);assert.equal(kind(32).length,1);assert.equal(kind(32)[0]!.x,1024);assert.equal(kind(32)[0]!.rotation,3072);
 tick(2);assert.equal(kind(32).length,2);assert.equal(kind(32)[1]!.x,-1024);
 tick(1,4);assert.equal(kind(32).length,2,'other surfaces do not inherit wet footprint');
 for(let i=0;i<180;i++)tick();tick(1);assert.equal(kind(32).length,2,'wet footprints expire');
 world.waterY=null;tick();assert.equal(state.dripTicks,0);
}
{
 const {p,tick,kind,effects,sounds}=fresh();p.y=-10;effects.gate.four=true;tick(0,-1,1);
 assert.equal(kind(57).length,1);assert(sounds.includes(0x5f));
}
{
 const animation=createAnimation(),p=createPlayer(0,0,0);p.onGround=true;p.coyote=6;let mask=0;
 for(let i=0;i<100;i++){stepAnimation(animation,p,true,700);mask|=animation.footfallMask;assert.equal(animation.footfallMask===0,animation.footfalls===0);}
 assert.equal(mask,3,'authored animation exposes both feet');
}
console.log('PASS: installed normal/hard entry splashes, sound, ripple depth/motion gates, bubbles, wet footprints/expiry, underwater ambience and both animation footfalls');
