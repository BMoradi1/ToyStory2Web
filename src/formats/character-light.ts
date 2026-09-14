/** Reserved light 0: 0049f350 initializes RGB; 0049eee0 updates its offset.
 * Records are 20 bytes indexed by level 1..15 at VA 0050387c. The fourth
 * word is not part of this light's position or RGB. No game data is bundled. */
export interface CharacterLight {
  offset:{x:number;y:number;z:number};
  colour:readonly [number,number,number];
}
export function readCharacterLight(exe:Uint8Array,level:number):CharacterLight{
  if(!Number.isInteger(level)||level<1||level>15)throw Error('Character light requires level 1..15');
  const at=0x10387c+level*20;
  if(exe.byteLength<at+20)throw Error('Executable is missing the character light record');
  const view=new DataView(exe.buffer,exe.byteOffset,exe.byteLength);
  const colour=view.getUint32(at+16,true);
  return {offset:{x:view.getInt32(at,true)<<4,y:view.getInt32(at+4,true)<<4,z:view.getInt32(at+8,true)<<4},
    colour:[(colour>>>16)&255,(colour>>>8)&255,colour&255]};
}
