/** FUN_0044f200 / 0044f420 / 0044f580: visible light sources and sprite chain. */
export interface FlareSource { x:number; y:number; z:number; r:number; g:number; b:number; size:number }
export interface FlareEntry { sprite:number; scaleX:number; scaleY:number; r:number; g:number; b:number }
export interface FlareSprite { sprite:number; x:number; y:number; scaleX:number; scaleY:number; colour:readonly [number,number,number] }
export interface FlareProjection { x:number; y:number; depth:number }
/** The table stays in the user's executable; disabled entries still advance the chain. */
export function readLensFlareTable(exe:Uint8Array):FlareEntry[]{
  const offset=0x4f72d8-0x400000;
  if(exe.length<offset+17*12)throw new Error('Executable is missing the lens-flare table');
  const view=new DataView(exe.buffer,exe.byteOffset,exe.byteLength);
  return Array.from({length:17},(_,i)=>{
    const at=offset+i*12, read=(n:number)=>view.getInt16(at+n,true);
    return {sprite:read(0),scaleX:read(2),scaleY:read(4),r:read(6),g:read(8),b:read(10)};
  });
}
/** Visibility uses a ray ending 90 percent toward the source (avoids the light's own surface). */
export function flareRay(camera:{x:number;y:number;z:number},source:FlareSource){
  return {x:Math.trunc((source.x-camera.x)*9/10),y:Math.trunc((source.y-camera.y)*9/10),z:Math.trunc((source.z-camera.z)*9/10)};
}
export function buildLensFlares(sources:readonly FlareSource[],table:readonly FlareEntry[],
  project:(source:FlareSource)=>FlareProjection|null, blocked:(source:FlareSource)=>boolean):FlareSprite[]{
  const result:FlareSprite[]=[];let accepted=0;
  for(const source of sources){
    const p=project(source);
    if(!p||!Number.isFinite(p.x+p.y+p.depth)||p.depth<=0||p.depth>=1)continue;
    const x=Math.trunc(p.x),y=Math.trunc(p.y),depth=Math.trunc(50+47950*p.depth);
    if(x<0||x>512||y<0||y>256||depth<=352||blocked(source))continue;
    if(accepted++>=8)break;
    const dx=256-x,dy=128-y;
    const strength=0x103ff-Math.min(0xffff,dx*dx+dy*dy);
    const size=Math.trunc(strength/(Math.trunc(depth/2)+1))+source.size;
    let px=x*8,py=y*8;
    for(const entry of table){
      if(entry.sprite!==0){
        const scaleX=entry.scaleX*size,scaleY=entry.scaleY*size;
        result.push({sprite:entry.sprite,x:(px>>3)-Math.trunc(scaleX/256),y:(py>>3)-Math.trunc(scaleY/256),scaleX,scaleY,
          colour:[Math.imul(Math.imul(source.r,strength),entry.r)>>23,Math.imul(Math.imul(source.g,strength),entry.g)>>23,Math.imul(Math.imul(source.b,strength),entry.b)>>23]});
      }
      px+=dx;py+=dy;
    }
  }
  return result;
}
/** The unconditional source in the Slime Boss arena (0041b3dd). */
export function levelFlareSources(level:number):FlareSource[]{
  return level===3?[{x:0x3889,y:0xfffc9f67|0,z:0xffffe044|0,r:128,g:128,b:128,size:128}]:[];
}
