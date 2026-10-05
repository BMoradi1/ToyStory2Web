/** Installed footstep banks, surface particles/residue and animation cadence. */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {readSoundTable} from '../src/audio/events.ts';
import {readEffectTable} from '../src/formats/effect-table.ts';
import {createEffects,liveEffects} from '../src/sim/effects.ts';
import {RandomStream} from '../src/sim/creatures.ts';
import {createPlayer} from '../src/sim/player.ts';
import {createAnimation,stepAnimation} from '../src/sim/player-animation.ts';
import {createWaterEffects,stepWaterEffects} from '../src/sim/water-effects.ts';
import {playerFootstep} from '../src/sim/player-footsteps.ts';
const exe=readFileSync('Toy Story 2/toy2.exe'),table=readEffectTable(exe);
const files=new Set(readdirSync('Toy Story 2/data/sfx').map(n=>n.toLowerCase()));
for(let level=1;level<=15;level++){
 const bank=readSoundTable(exe,level);
 for(const event of [0,1,3,4,5,0x43]){const name=bank.nameOf(event);assert(name);assert(files.has(`${name}.wav`.toLowerCase()));assert(bank.events[event]!.volume>0);}
}
for(const [surface,event,particle,count,residue] of [[0,1,30,4,31],[4,3,28,1,32],[5,4,29,4,33]]){
 const sim=createEffects(table.kinds,table.modes,new RandomStream(new Uint8Array([0]))),p=createPlayer(0,0,0),state=createWaterEffects();p.coyote=6;
 const world={cameraX:0,cameraY:0,cameraZ:0,playerX:0,playerY:0,playerZ:0,playerYaw:0,playerVx:0,playerVz:0,groundAt:()=>null,waterY:null};
 const heard:{event:number;at?:{x:number;y:number;z:number}}[]=[];
 const tick=(mask:number,type=surface!)=>stepWaterEffects(state,sim,world,p,mask,type,-100,(event,at)=>heard.push({event,at}));
 tick(1);assert.equal(heard.at(-1)!.event,event);assert.equal(heard.at(-1)!.at!.x,8192);
 assert.equal(liveEffects(sim).filter(e=>e.kind===particle).length,count);assert.equal(state.dripKind,residue);
 tick(2,13);assert.equal(heard.at(-1)!.event,event);assert.equal(heard.at(-1)!.at!.x,-8192);assert(liveEffects(sim).some(e=>e.kind===residue&&e.x===-1024));
 tick(1,-1);assert.equal(heard.at(-1)!.event,0,'ordinary untagged floor forces normal step');
 const n=heard.length;tick(0);assert.equal(heard.length,n);
 p.coyote=0;tick(1);assert.equal(heard.length,n,'airborne footfall is silent');p.coyote=6;
 for(let t=0;t<180;t++)tick(0,13);tick(1,13);assert.equal(heard.at(-1)!.event,0,'residue sound expires');
}
{
 const p=createPlayer(100,200,300);p.coyote=6;
 assert.equal(playerFootstep(p,3,13,{dripTicks:180,dripKind:54})!.event,5);
 assert.deepEqual(playerFootstep(p,3,13,{dripTicks:180,dripKind:54})!.at,{x:100-8192,y:200,z:300},'both bits use right foot once');
 const animation=createAnimation();let footfalls=0;
 for(let t=0;t<100;t++){stepAnimation(animation,p,true,700);if(playerFootstep(p,animation.footfallMask,-1,{dripTicks:0,dripKind:32}))footfalls++;}
 assert(footfalls>=4&&footfalls<20,'script cadence rather than every moving tick');
 p.pole=0;p.poleMotion=2;p.coyote=0;let climbing=0;
 for(let t=0;t<120;t++){stepAnimation(animation,p,true,0);climbing+=animation.sounds.filter(e=>e===0x43).length;}
 assert(climbing>=2,'authored climbing script emits footsteps');
}
console.log('PASS all 15 footstep banks/files, special-surface particles/residue, sound positions, normal-floor override, expiry, airborne/idle silence and walk/climb animation cadence');
