/** Retail texture-region scrolls: FUN_0049b260 / FUN_004ce510 / FUN_004afd30. */
import { sin } from './trig.ts';
/** x/y are the destination; dx/dy locate the source relative to it. */
export interface TextureScroll { page:number; x:number; y:number; width:number; height:number; scrollX:number; scrollY:number; dx:number; dy:number }
export interface TexturePixels { data: Uint8Array | Uint8ClampedArray; width:number; height:number }
export function copyScrolledTexture(image: TexturePixels, r: TextureScroll): boolean {
  const {width:w,height:h,x,y,dx,dy}=r;
  if(w<=0||h<=0||x<0||y<0||x+dx<0||y+dy<0||x+w>image.width||y+h>image.height
    ||x+dx+w>image.width||y+dy+h>image.height||image.data.length<image.width*image.height*4)return false;
  // DirectDraw uses two non-overlapping source rectangles. A vertical scroll
  // takes precedence when both offsets are nonzero, just as the PC routine does.
  const sy=((r.scrollY%h)+h)%h, sx=r.scrollY!==0?0:((r.scrollX%w)+w)%w;
  const pixels=new Uint8Array(w*h*4);
  for(let row=0;row<h;row++)for(let col=0;col<w;col++){
    const from=((y+dy+(row+sy)%h)*image.width+x+dx+(col+sx)%w)*4;
    const to=(row*w+col)*4;
    for(let channel=0;channel<4;channel++)pixels[to+channel]=image.data[from+channel]!;
  }
  for(let row=0;row<h;row++)image.data.set(pixels.subarray(row*w*4,(row+1)*w*4),((y+row)*image.width+x)*4);
  return true;
}
export function createTextureAnimation(){return {ticks:0,phase:0};}
export function stepTextureAnimation(s:ReturnType<typeof createTextureAnimation>, level:number, cameraZone:number, playerZone:number):TextureScroll[]{
  const scroll=(page:number,x:number,y:number,width:number,height:number,scrollX:number,scrollY:number,dx:number,dy:number):TextureScroll=>({page,x,y,width,height,scrollX,scrollY,dx,dy});
  s.ticks++;
  switch(level){
    case 1:
      if(cameraZone!==6)return [];
      {const r=scroll(8,128,128,64,64,0,(sin(s.phase)>>11)&63,64,0);s.phase=(s.phase+32)&4095;return [r];}
    case 2:
      {const r=scroll(5,128,192,64,64,0,(sin(s.phase)>>9)&63,64,0);s.phase=(s.phase+8)&4095;return [r];}
    case 3:
      {const r=scroll(24,0,64,64,64,0,s.phase,0,64);s.phase=(s.phase-1)&63;return [r];}
    case 5:return [scroll(5,192,128,64,64,0,s.ticks&63,0,64)];
    case 8:
      {const r=scroll(5,0,0,64,64,0,s.phase>>1,0,64);s.phase=(s.phase+1)&127;return [r];}
    case 11:
      if(playerZone!==5)return [];
      {const r=scroll(7,128,160,32,32,0,(sin(s.phase)>>9)&31,32,0);s.phase=(s.phase+8)&4095;return [r];}
    case 13:return [scroll(5,0,0,64,64,0,(-1-(s.ticks&63))&63,0,64)];
    default:return [];
  }
}
