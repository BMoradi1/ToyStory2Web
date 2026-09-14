import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDat} from '../src/formats/dat.ts';
import {createPickups,stepPickups,PickupKind} from '../src/sim/pickups.ts';
import type {PlayerState} from '../src/sim/player.ts';
const fresh=()=>{
 const state=createPickups(parseDat(readFileSync('Toy Story 2/data/level01/level.dat')),1);
 const source=state.items[0]!;
 state.items=[PickupKind.Kind6,PickupKind.Kind7,PickupKind.HoverBoots,PickupKind.Coin].map((kind,i)=>({...source,x:i*20000,y:0,z:0,kind}));
 return state;
};
const at=(x:number)=>({x:x*32,y:7360,z:0}) as PlayerState;
const far=at(-20000);
for(const index of [0,1,2]){
 const s=fresh();stepPickups(s,at(s.items[index]!.x));
 assert.equal(s.reappearTicks,400);assert(s.items[index]!.collected);
 stepPickups(s,far,399);assert.equal(s.reappearTicks,1);assert(s.items[index]!.collected);
 stepPickups(s,far);assert(!s.items[index]!.collected);assert.deepEqual(s.reappeared,[index]);
 stepPickups(s,far);assert.deepEqual(s.reappeared,[]);
}
const s=fresh();stepPickups(s,at(0));assert.equal(s.pieces,5);
stepPickups(s,at(20000));assert.equal(s.pieces,0);assert.equal(s.discs,10);
assert(!s.items[0]!.collected);assert.deepEqual(s.reappeared,[0]);assert.equal(s.reappearIndex,1);
stepPickups(s,far,500);assert(!s.items[1]!.collected);
stepPickups(s,at(60000));stepPickups(s,far,500);assert(s.items[3]!.collected,'coins stay consumed');
const repeat=fresh();stepPickups(repeat,at(0));stepPickups(repeat,at(0),400);
assert.equal(repeat.pieces,10);assert.equal(repeat.reappearTicks,400,'can recollect on return tick');
assert.equal(fresh().reappearIndex,-1);
console.log('PASS: shared 400-tick respawn, all three categories, replacement restore, large dt, one-shot events, ordinary coins, recollection and reset.');
