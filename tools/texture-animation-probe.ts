import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNgn,decodeBmp } from '../src/formats/ngn.ts';
import { createTextureAnimation,stepTextureAnimation,copyScrolledTexture } from '../src/sim/texture-animation.ts';
const root=process.argv[2]??'Toy Story 2';
const r={page:0,x:0,y:0,width:3,height:2,scrollX:1,scrollY:0,dx:3,dy:0};
const data=Uint8Array.from({length:6*4*4},(_,i)=>Math.floor(i/4));
const original=data.slice(), image={data,width:6,height:4};
assert(copyScrolledTexture(image,r));
assert.deepEqual([data[0],data[4],data[8]],[4,5,3]);
assert.deepEqual([data[24],data[28],data[32]],[10,11,9]);
image.data.set(original);assert(copyScrolledTexture(image,{...r,scrollY:1}));
assert.deepEqual([data[0],data[4],data[8]],[9,10,11],'PC vertical path ignores horizontal offset');
image.data.set(original);assert(copyScrolledTexture(image,{...r,dx:0,dy:1,scrollX:-1}));
assert.deepEqual([data[0],data[4],data[8]],[8,6,7],'overlapping rectangles read a stable source');
const before=data.slice();assert(!copyScrolledTexture(image,{...r,dx:7}));assert.deepEqual(data,before);
for(const level of [1,2,3,5,8,11,13]){
 const name=`level${String(level>10?level-10:level).padStart(2,'0')}`;
 const textures=new Map(parseNgn(readFileSync(`${root}/data/${name}/${level>10?'level1':'level'}.ngn`)).map(t=>[t.slot,decodeBmp(t.bmp)]));
 const s=createTextureAnimation();let changes=0;
 for(let i=0;i<256;i++){
  const scrolls=stepTextureAnimation(s,level,6,5);assert.equal(scrolls.length,1);
  for(const scroll of scrolls){
   const t=textures.get(scroll.page)!;assert(t,`level ${level} page ${scroll.page}`);
   const old=t.rgba.slice();assert(copyScrolledTexture({data:t.rgba,width:t.width,height:t.height},scroll),`valid bounds level ${level}`);
   if(!old.every((v,i)=>v===t.rgba[i]))changes++;
   for(let y=0;y<t.height;y++)for(let x=0;x<t.width;x++){
    if(x>=scroll.x&&x<scroll.x+scroll.width&&y>=scroll.y&&y<scroll.y+scroll.height)continue;
    const p=(y*t.width+x)*4;
    for(let c=0;c<4;c++)assert.equal(t.rgba[p+c],old[p+c],`outside destination level ${level}`);
   }
  }
 }
 // Some PC replacement sheets contain a solid colour in this PSX-era region.
 if(level===1)assert(changes>1);
 console.log(`PASS level ${level}: authored texture bounds, scrolling and untouched surroundings (${changes} changed frames)`);
}
for(const [level,camera,player] of [[1,5,5],[11,6,4]] as const){
 const s=createTextureAnimation();for(let i=0;i<10;i++)assert.deepEqual(stepTextureAnimation(s,level,camera,player),[]);
 assert.equal(s.phase,0,'zone-gated phase holds');
}
console.log('PASS: rectangle wrapping, PC axis precedence, overlap, invalid bounds and zone gates.');
