/** Landing-triggered block slide, 00423e98..00423f27. */
import type {PlayerState} from './player.ts';
import type {PushState} from './push-blocks.ts';
import {sin} from './trig.ts';
export const SPACE_ROCKING_BOX={xMin:0x693fc,xMax:0x753fc,zMin:0x4b2ec,zMax:0x536ec,yMax:-0x1ab05} as const;
export function createSpaceRockingBlock(){return {tipped:false,pitch:0};}
export type SpaceRockingBlock=ReturnType<typeof createSpaceRockingBlock>;
export function stepSpaceRockingBlock(s:SpaceRockingBlock,p:Pick<PlayerState,'x'|'y'|'z'|'onGround'>,
  zone:number,frame:number,blocks:PushState){
  if(zone!==4||s.tipped)return;
  s.pitch=sin((frame&255)*64)>>7;
  const b=SPACE_ROCKING_BOX;
  if(p.onGround&&p.y<b.yMax&&p.x>b.xMin&&p.x<b.xMax&&p.z>b.zMin&&p.z<b.zMax){
    // 0053c6e6 = push-block base 0053c680 + 2*40 + 0x16 (tipPoint).
    const block=blocks.blocks.find(b=>b.index===2&&b.sceneObject===19);
    if(!block)throw Error('Missing Space Land rocking push block');
    block.tipPoint=-1;s.tipped=true;s.pitch=0;
  }
}
