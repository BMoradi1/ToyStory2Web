/** Original three-press light puzzle, using only the supplied random data. */
import { aircraftSoundPoint } from '../src/sim/tarmac-scenery.ts';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RandomStream} from '../src/sim/creatures.ts';
import {createTarmacLights,stepTarmacLights,pressLight,lightScales,LIGHT_PUZZLE_CENTRE as at,lightsMatch} from '../src/sim/tarmac-lights.ts';
const root=process.argv[2]??'Toy Story 2';
const random=new RandomStream(readFileSync(`${root}/data/rand.dat`));
const byte=()=>random.byte();
const solve=(bits:number)=>{
  for(let a=0;a<4;a++)for(let b=0;b<4;b++)for(let c=0;c<4;c++) {
    let next=bits;for(const pad of[a,b,c])next=pressLight(next,pad).bits;
    if((next&15)===(next>>4))return[a,b,c];
  }
  throw Error('unsolvable scramble');
};
for(let trial=0;trial<200;trial++) {
  const s=createTarmacLights(byte);
  assert(!lightsMatch(s));solve(s.bits);
  stepTarmacLights(s,at,false,-1,byte,false);
  assert(s.entered);assert.equal(s.attempts,3);
  const initial=s.bits;
  stepTarmacLights(s,at,false,32,byte,false);assert.equal(s.bits,initial,'normal landing ignored');
  stepTarmacLights(s,at,true,31,byte,false);assert.equal(s.bits,initial,'unrelated stomp ignored');
  stepTarmacLights(s,{x:0,y:0,z:0},true,32,byte,false);assert.equal(s.bits,initial,'remote stomp ignored');
  let used=0;
  for(const pad of solve(initial)) {
    stepTarmacLights(s,at,true,32+pad,byte,false);used++;
    assert.equal(s.attempts,3-used);assert.equal(s.flash,11);
    const shown=lightScales(s);assert.equal(shown.get(76+pad),0);assert.equal(shown.get(80+pad),1);
    if(lightsMatch(s))break;
    for(let i=0;i<11;i++)stepTarmacLights(s,at,false,-1,byte,false);
    assert.equal(s.flash,0);assert.equal(lightScales(s).get(76+pad),1);
  }
  assert(lightsMatch(s));
  let starts=0,success=0;
  for(let i=0;i<375;i++) {
    stepTarmacLights(s,at,false,-1,byte,false);
    starts+=Number(s.startCamera);success+=Number(s.sequence===-5);
    assert.equal(s.height,(i+1)*128);
    assert.equal(s.trackCamera,i<300);
  }
  assert.equal(starts,1);assert.equal(success,1);assert.equal(s.cameraTicks,-1);
  stepTarmacLights(s,at,true,32,byte,false);assert.equal(s.height,48000,'lowering stops at original limit');
}
for(const busy of[false,true]) {
  const s=createTarmacLights(byte);stepTarmacLights(s,at,false,-1,byte,false);
  const losing=Array.from({length:4},(_,i)=>i).find(pad=>{
    let bits=s.bits;for(let i=0;i<3;i++)bits=pressLight(bits,pad).bits;
    return(bits&15)!==(bits>>4);
  })!;
  for(let i=0;i<3;i++)stepTarmacLights(s,at,true,32+losing,byte,false);
  assert.equal(s.attempts,0);
  for(let i=0;i<60;i++)stepTarmacLights(s,at,false,-1,byte,busy);
  assert.equal(s.attempts,-60);assert.equal(s.sequence,null);
  stepTarmacLights(s,at,false,-1,byte,busy);
  assert.equal(s.attempts,3);assert.equal(s.sequence,busy?null:-6);
  assert.equal(s.height,0);solve(s.bits);
}
assert.deepEqual(aircraftSoundPoint({x:101,y:-101,z:0},{x:0,y:0,z:0}),{x:26,y:-26,z:0});
console.log('PASS: 200 solvable puzzles, real surface/range gates, lamp/pad meshes, three tries, retry timing, lowering, one-shot cut/sequence and spatial sound origin');
