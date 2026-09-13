import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOptions,stepOptions} from '../src/front/options.ts';
import {createMovieScreen,stepMovieScreen,movieChoices} from '../src/front/movies.ts';
import {DEFAULT_KEYS} from '../src/sim/input.ts';
import {exeString} from '../src/sim/level-data.ts';
import {freshBlock,encodeSaveFile,parseSaveFile} from '../src/formats/save-file.ts';
import {readSpriteTable} from '../src/formats/sprite-table.ts';
import {parseNgn,decodeBmp} from '../src/formats/ngn.ts';
const root=process.argv[2]??'Toy Story 2';const exe=readFileSync(`${root}/toy2.exe`);
const text=(a:number)=>exeString(exe,a<0?exe.readUInt32LE(-a-0x400000):a);
function checker(bundle:string,level:number){
 const table=readSpriteTable(exe,level),textures=new Map(parseNgn(readFileSync(`${root}/data/${bundle}.ngn`)).map(t=>[t.slot,decodeBmp(t.bmp)]));
 return (items:ReturnType<typeof stepOptions>['frame']['items'])=>{for(const item of items){if(item.kind!=='sprite')continue;const h=table[item.index],f=h?.frames[item.frame],t=h&&textures.get(h.texture);assert.ok(h&&f&&t,`missing sprite ${item.index}/${item.frame}`);assert.ok(f.u+h.width<=t.width&&f.v+h.height<=t.height,`sprite bounds ${item.index}/${item.frame}`);}};
}
const verifyOptions=checker('level00/levelt2',0);
const initial={sfx:8,bgm:6,activeCamera:true,detail:1,keys:DEFAULT_KEYS};
const s=createOptions(initial);let was=0;
const tick=(now=0)=>{const r=stepOptions(s,{now,was},text);was=now;verifyOptions(r.frame.items);return r;};
for(let i=0;i<70;i++)tick();tick(64);for(let i=0;i<35;i++)tick();tick(0x4000);tick();assert.equal(s.page,1);
tick(128);tick();assert.equal(s.value.bgm,5);tick(0x1000);tick();assert.equal(s.value.bgm,6);
tick(0x4000);tick();for(let i=0;i<15;i++){tick(32);tick();}assert.equal(s.value.bgm,10);
for(let i=0;i<40;i++)tick();tick(0x4000);tick();tick(0x1000);
for(let i=0;i<43;i++)assert.equal(tick().done,null);assert.equal(tick().done,'exit');
assert.equal(initial.bgm,6);
const verifyMovies=checker('level06/level1t2',16);
const p=parseSaveFile(encodeSaveFile('',freshBlock()),0).progress!;p.shown.fill(true);p.allTokens=true;p.gameBeaten=true;
const choices=movieChoices(exe,p,[],()=>true);
for(const choice of choices){const m=createMovieScreen(choices,choice.index);for(let i=0;i<80;i++)verifyMovies(stepMovieScreen(m,{now:0,was:0},'').frame.items);}
console.log('Retail menus: all movie thumbnails and option sprite bounds, navigation, volume clamping/rollback and exit timing passed.');
