import assert from 'node:assert/strict';
import {nearestPathLight as level10Light,scriptedPathLight} from '../src/sim/scripted-light.ts';
import {createPointLights,setScriptedLight,addPointLight,stepPointLights} from '../src/sim/point-light.ts';
const camera={x:0,y:0,z:0},player={x:0,y:8192,z:0};
const points=[{x:8,y:0,z:0},{x:-8,y:0,z:0}];
const light=level10Light(points,camera,player)!;
assert.deepEqual(light,{x:256,y:0,z:0,r:255,g:255,b:255,life:1,owner:-1000});
assert.equal(level10Light([],camera,player),null);
assert.equal(level10Light([{x:0,y:0,z:0}],{x:256000,y:0,z:0},player),null,'strict camera cutoff');
assert.equal(level10Light([{x:0,y:0,z:0}],camera,{...player,x:65536}),null,'strict player cutoff');
assert(level10Light([{x:0,y:0,z:0}],camera,{...player,x:65535}));
const pool=createPointLights();setScriptedLight(pool,light);
stepPointLights(pool,player);assert.equal(pool.selected,-2);assert.equal(pool.remaining,63);
for(let i=0;i<64;i++)stepPointLights(pool,player);
assert.deepEqual(stepPointLights(pool,player)!.colour,[254,254,254]);
assert.equal(pool.scripted.life,1,'reserved slot does not age like a temporary light');
addPointLight(pool,{...light,owner:10,life:10,r:100});stepPointLights(pool,player);
assert.equal(pool.selected,-2,'reserved light wins an equal-distance tie');
addPointLight(pool,{...light,x:0,owner:11,life:2,r:80,g:0,b:0});
stepPointLights(pool,player);assert(pool.selected>=0,'closer temporary light wins immediately');
stepPointLights(pool,player);assert.equal(pool.selected,-2);assert.equal(pool.remaining,63);
for(const l of pool.slots)l.life=0;
for(let i=0;i<64;i++)stepPointLights(pool,player);
setScriptedLight(pool,null);stepPointLights(pool,player);
assert.equal(pool.selected,-1);assert.equal(pool.remaining,63);
for(let i=0;i<64;i++)stepPointLights(pool,player);
assert.equal(stepPointLights(pool,player),null,'disabled reserved light returns to base');
assert.equal(createPointLights().scripted.life,0,'fresh level has no stale scripted source');
console.log('PASS: level 10 path source, stable owner/ties, strict camera/player cutoffs, reserved lifetime, temporary competition and return transitions.');

for(const [level,path,r,g,b] of [[5,17,128,96,64],[10,13,255,255,255],[11,19,127,127,127],[12,0,255,255,255],[13,10,111,127,143]] as const){
  const paths=[{id:path,points}];
  const source=scriptedPathLight(level,paths,camera,player,0)!;
  assert.deepEqual([source.r,source.g,source.b],[r,g,b]);
  assert.equal(scriptedPathLight(level,[],camera,player,0),null,'missing path disables source');
  assert.equal(scriptedPathLight(level,paths,{x:300000,y:0,z:0},player,0),null,'camera rejection disables source');
}
const retained=createPointLights();
setScriptedLight(retained,scriptedPathLight(11,[{id:19,points}],camera,player,0)!);
const before={...retained.scripted};
const skipped=scriptedPathLight(11,[],{x:300000,y:0,z:0},player,4);
assert.equal(skipped,undefined,'zone 4 skips updating rather than disabling');
if(skipped!==undefined)setScriptedLight(retained,skipped);
assert.deepEqual(retained.scripted,before);
const disabled=scriptedPathLight(11,[],camera,player,0);
setScriptedLight(retained,disabled!);assert.equal(retained.scripted.life,0);
assert.equal(scriptedPathLight(1,[],camera,player,0),null);
console.log('PASS: levels 5/10/11/12/13 path and RGB selection, missing/rejected paths, level 11 zone-4 retention and disable on leaving it.');

const lamps=[{id:6,points}];
for(const [intensity,r,g,b] of [[1,2,2,0],[32,64,64,0],[64,128,128,0],[65,128,128,2],[128,128,128,128]] as const){
 const source=scriptedPathLight(4,lamps,camera,player,0,intensity)!;
 assert.deepEqual([source.r,source.g,source.b],[r,g,b]);
}
const flickerPool=createPointLights();
setScriptedLight(flickerPool,scriptedPathLight(4,lamps,camera,player,0,1)!);
const last={...flickerPool.scripted};
const dark=scriptedPathLight(4,[],{x:300000,y:0,z:0},player,0,0);
assert.equal(dark,undefined,'zero intensity skips source updates');
if(dark!==undefined)setScriptedLight(flickerPool,dark);
assert.deepEqual(flickerPool.scripted,last,'zero retains the last dim source');
assert.equal(scriptedPathLight(4,[],camera,player,0,1),null,'nonzero with no lamps disables');
assert.equal(scriptedPathLight(4,lamps,{x:300000,y:0,z:0},player,0,1),null);
console.log('PASS: level 4 yellow/white intensity ramp, zero-intensity retention, and nonzero missing/rejected sources.');
