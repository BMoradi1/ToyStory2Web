/** Local executable data used by 004a16be..004a17e2; no bundled game table. */
export interface TokenRevealProfile { velocities:{x:number;y:number;z:number}[]; scales:number[] }
export function readTokenReveal(exe:Uint8Array):TokenRevealProfile{
  if(exe.byteLength<0x103a24)throw Error('Executable is missing token reveal data');
  const v=new DataView(exe.buffer,exe.byteOffset,exe.byteLength);
  const word=(va:number)=>v.getInt16(va-0x400000,true);
  const velocities=Array.from({length:16},(_,i)=>({x:Math.trunc(word(0x5039c4+i*6)/4),
    y:Math.trunc(word(0x5039c6+i*6)/4),z:Math.trunc(word(0x5039c8+i*6)/4)}));
  const scales=Array.from({length:133},(_,t)=>{
    if(t===0)return 1;
    if(t>96)return 0;
    if(t>=88)return Math.trunc(word(0x504688-t*256)/4)/4096;
    return (4096+((Math.trunc(word(0x4fe788+((t-4)&15)*512)/8)+512)>>(5-Math.trunc(t/16))))/4096;
  });
  return {velocities,scales};
}
