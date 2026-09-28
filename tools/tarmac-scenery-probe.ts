/** Read-only installed scenery/audio regression; no assets copied into the repo. */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {readSoundTable} from '../src/audio/events.ts';
import {createTarmacScenery,sceneryPoses,stepTarmacScenery,aircraftSoundPoint} from '../src/sim/tarmac-scenery.ts';
const root=process.argv[2]??'Toy Story 2';
const exe=readFileSync(`${root}/toy2.exe`);
const dat=parseDat(readFileSync(`${root}/data/level04/level1.dat`));
const state=createTarmacScenery(dat), rest=sceneryPoses(state);
assert.deepEqual(state.objects.map(o=>o.id),[69,70]);
for(let tick=1;tick<=4096;tick++){
  stepTarmacScenery(state);
  const sin=(n:number)=>exe.readInt16LE(0xfe788+(n&4095)*2);
  const carrier=sin(tick*11),yaw=Math.trunc(sin(tick*17)*carrier/0x200000),roll=Math.trunc(sin(tick*7)*carrier/0x400000);
  for(const pose of sceneryPoses(state)){
    const authored=dat.objects[pose.index]!.rotation;
    assert.deepEqual(pose.angles,[authored.x,(authored.y+yaw)&4095,(authored.z+roll)&4095]);
  }
  assert.deepEqual(sceneryPoses(state)[0]!.angles,sceneryPoses(state)[1]!.angles,'near/far agreement');
}
assert.equal(state.phase,0);assert.deepEqual(sceneryPoses(state),rest,'no accumulated drift');
assert.deepEqual(aircraftSoundPoint({x:101,y:-101,z:1},{x:0,y:0,z:-2}),{x:26,y:-26,z:-1});
const table=readSoundTable(exe,14),files=new Set(readdirSync(`${root}/data/sfx`).map(s=>s.toLowerCase()));
for(const [event,name]of [[0x6f,'RainLoop'],[0x70,'Thunder'],[0x9b,'Helicopt'],[0x9c,'proplane']] as const){
  assert.equal(table.nameOf(event),name);assert(files.has(name.toLowerCase()+'.wav'));
  assert.equal(table.events[event]!.sustained,event!==0x70);
}
assert.equal(table.nameOfEffect(88),null,'unused entry retains its slot');
assert.equal(table.nameOfEffect(92),null,'stop at null pointer before next bank');
const empty=Buffer.from(exe);empty.writeUInt32LE(0x4fdb28+8,0xfd0b8);
assert.equal(readSoundTable(empty,14).nameOfEffect(88),null);
assert.equal(readSoundTable(empty,14).nameOfEffect(91),'proplane','empty string is not a list terminator');
empty.writeUInt32LE(0,0xfd0b8);
assert.equal(readSoundTable(empty,14).nameOfEffect(91),null,'null pointer terminates');
for(let level=0;level<=16;level++){
  const table=readSoundTable(exe,level);
  const list=exe.readUInt32LE(0xfd140+level*8)-0x400000,base=exe.readUInt32LE(0xfd144+level*8);
  for(let i=0;i<64;i++){
    const p=exe.readUInt32LE(list+i*4);if(!p)break;
    const offset=p-0x400000;
    const raw=offset>=0&&offset<exe.length?exe.subarray(offset,exe.indexOf(0,offset)).toString('latin1'):'';
    const expected=/^[\x20-\x7e]+$/.test(raw)?raw:null;
    assert.equal(table.nameOfEffect(base+i),expected,`bank ${level}, effect ${base+i}`);
  }
}
console.log('PASS: all 4096 scenery phases against installed sine data, near/far/rest poses, sound interpolation, all 17 banks, sparse slots, terminators and Tarmac WAV mappings.');
