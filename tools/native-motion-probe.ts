/** Synthetic fixtures: do not commit original executable decompilations. */
import assert from 'node:assert/strict';
import {parseNativeFunctions,inspectNativeMotion} from './lib/native-motion.ts';
const source=`//// FUNC FUN_00417680 @ 00417680 size=200
void FUN_00417680(void) {
 FUN_00487900(1,0,0,0); func_0x004ccb20(0xd,0,0,0);
 FUN_00417700(); func_0x00417800(); FUN_00417900(); FUN_00440000();
}
// 00417700
void FUN_00417700(void) {
 func_0x00488510(2,0,0,0); FUN_00488aa0(2,0,0,0);
 FUN_004878a0(0x10); func_0x004878d0(0x10);
 FUN_004cce30(index,0,0,0); FUN_004ccc70(3,0,0,0);
 FUN_00487970(4,0,0,0); FUN_00417680();
}
//// FUNC FUN_00417900 @ 00417900 size=20
// decompile failed
// 00440000
void FUN_00440000(void) { FUN_004ccb20(99,0,0,0); }
`;
const functions=parseNativeFunctions(source),result=inspectNativeMotion(functions,'00417680');
assert.equal(functions.size,3);assert.equal(result.calls.length,9,'all nine mutation families and both call spellings');
assert.equal(result.calls.find(c=>c.operation==='render scale / visibility')!.object,'13');
assert.equal(result.calls.find(c=>c.operation==='render position')!.object,'computed: inspect original');
assert.deepEqual(result.missingHelpers,['00417800','00417900'],'missing and failed helpers must be visible');
assert(!result.calls.some(c=>c.object==='99'),'do not recurse into generic engine functions');
assert.throws(()=>inspectNativeMotion(functions,'004190c0'),/missing from decompile/);
assert.equal(parseNativeFunctions('// 00417680\nvoid f() {}').size,1);
assert.equal(parseNativeFunctions('unrelated text').size,0);
console.log('PASS native motion audit: both dump/call formats, nine mutation families, recursive cycle, computed IDs, missing/failed helpers and bounded traversal');
