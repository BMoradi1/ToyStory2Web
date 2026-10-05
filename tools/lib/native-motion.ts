/** Static audit support for Ghidra DumpAll and focused address dumps. */
export function parseNativeFunctions(source:string):Map<string,string>{
 const headers=[...source.matchAll(/^(?:\/\/\/\/ FUNC [^\n]*? @ |\/\/ )([\da-f]{8})(?:[ \t][^\n]*)?$/gmi)];
 const result=new Map<string,string>();
 for(let i=0;i<headers.length;i++){
  const h=headers[i]!,body=source.slice(h.index!+h[0].length,headers[i+1]?.index??source.length);
  if(body.includes('{')&&!body.includes('// decompile failed'))result.set(h[1]!.toLowerCase(),body);
 }
 return result;
}
const MUTATIONS=new Map([
 ['00487900','collision translation velocity'],['00487970','collision angular velocity'],
 ['00488510','collision position'],['00488aa0','collision rotation'],
 ['004878a0','collision enable'],['004878d0','collision disable'],
 ['004ccc70','render rotation'],['004cce30','render position'],['004ccb20','render scale / visibility'],
]);
export interface NativeMutation {caller:string;operation:string;object:string}
export function inspectNativeMotion(functions:ReadonlyMap<string,string>,tick:string){
 if(!functions.has(tick))throw Error(`Original tick ${tick} missing from decompile; define it before dumping`);
 const visited=new Set<string>(),missingHelpers=new Set<string>(),calls:NativeMutation[]=[];
 const inspect=(address:string)=>{
  if(visited.has(address))return;visited.add(address);
  const body=functions.get(address);
  if(body===undefined){missingHelpers.add(address);return;}
  for(const call of body.matchAll(/(?:FUN_|func_0x)([\da-f]{8})\(\s*([^,\n)]*)/gi)){
   const target=call[1]!.toLowerCase(),operation=MUTATIONS.get(target);
   if(operation){const arg=call[2]!.trim();calls.push({caller:address,operation,object:/^(0x[\da-f]+|\d+)$/i.test(arg)?String(Number(arg)):'computed: inspect original'});}
   // Deliberately bounded to known level-local code, not a whole-executable graph.
   if(target>='00417000'&&target<'00430000')inspect(target);
  }
 };
 inspect(tick);
 return {calls:[...new Map(calls.map(call=>[JSON.stringify(call),call])).values()],missingHelpers:[...missingHelpers].sort()};
}
