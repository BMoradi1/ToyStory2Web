/** Compare the PC fixed-point lookup and original menu labels/limits. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gammaByte, gammaModulate, gammaRGB, getGamma, setGamma } from '../src/render/gamma.ts';
import { createOptions, stepOptions } from '../src/front/options.ts';
import { DEFAULT_KEYS } from '../src/sim/input.ts';
import { exeString } from '../src/sim/level-data.ts';
const exe=readFileSync(`${process.argv[2]??'Toy Story 2'}/toy2.exe`);
assert.equal(exe.readFloatLE(0x4dc028-0x400000),65536);
assert.equal(exe.readFloatLE(0x508d78-0x400000),2);
for(const gain of [2,2.5,3] as const){
 let fixed=0;
 for(let byte=0;byte<256;byte++,fixed+=gain*65536)assert.equal(gammaByte(byte,gain),Math.min(255,fixed>>16));
 assert.equal(gammaModulate(2,gain),1,'clamp before texture multiplication');
 assert.equal(gammaModulate(0,gain),0);
}
for(const invalid of [NaN,Infinity,0,2.7,4]){setGamma(invalid);assert.equal(getGamma(),2);}
assert.equal(gammaRGB(0x101010,2),0x202020,'level 14 normal fog');
assert.equal(gammaRGB(0x101010,2.5),0x282828,'level 14 medium fog');
assert.equal(gammaRGB(0x101010,3),0x303030,'level 14 high fog');
assert.equal(gammaRGB(0x018040,2.5),0x02ffa0,'independent RGB channels and saturation');
const s=createOptions({sfx:8,bgm:6,activeCamera:true,detail:1,keys:DEFAULT_KEYS});
s.page=3;s.subrow=1;
const labels=new Set<string>();
const text=(a:number)=>{const t=exeString(exe,a<0?exe.readUInt32LE(-a-0x400000):a);labels.add(t);return t;};
const tick=(now=0)=>stepOptions(s,{now,was:0},text);
const move=(now:number)=>{tick(now);for(let i=0;i<16;i++)tick();};
move(128);assert.equal(s.value.gamma,2);
move(32);assert.equal(s.value.gamma,2.5);
move(32);assert.equal(s.value.gamma,3);
move(32);assert.equal(s.value.gamma,3);
assert(!tick().frame.items.some(i=>i.kind==='sprite'&&i.index===56&&i.frame===2),'no right arrow at high');
for(const label of ['normal','medium','high'])assert(labels.has(`gamma correction ${label}`));
tick(0x1000);assert.equal(s.value.gamma,2,'cancel restores default');
console.log('PASS: all 768 retail gamma lookup entries, clamping, invalid preferences, original labels, limits and cancellation.');
