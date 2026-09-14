import type { Path, Vec3 } from '../formats/dat.ts';
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

/** Level-tick path lights. Paths are in DAT units; camera/player are in game units.
 * Keep authored order: the renderer admits only eight visible sources.
 */
export function pathFlareSources(level:number,paths:readonly Path[],camera:Vec3,player:Vec3,cameraZone:number):FlareSource[]{
  const settings:Record<number,readonly [number,number,number,number,number]>={
    5:[17,64,48,32,128], // 0041fdc4
    10:[13,128,128,128,64], // 00425ff0
    11:[19,32,32,32,128], // 0042addd
    12:[0,128,128,128,64], // 0042b443
    13:[10,48,64,80,64], // 0042d2c3
    14:[40,128,128,0,128], // 0042f1e6
    15:[0,128,128,128,128], // 004307d1
  };
  const config=settings[level];
  if(!config||(level===11&&cameraZone===4))return [];
  const [id,r,g,b,size]=config,points=paths.find(p=>p.id===id)?.points??[];
  const outer=level===14&&(player.x>>8)**2+(player.z>>8)**2>=0x8e5144;
  const start=outer?16:0,end=level===14&&!outer?Math.min(16,points.length):points.length;
  const limit=level===14?0x40000:level===15?0x100000:0xf4240;
  const result:FlareSource[]=[];
  for(let i=start;i<end;i++){
    const p=points[i]!,x=p.x<<5,y=p.y<<5,z=p.z<<5;
    const dx=(camera.x-x)>>8,dy=(camera.y-y)>>8,dz=(camera.z-z)>>8;
    const distance=dx*dx+dy*dy+dz*dz;
    if(distance>=limit)continue;
    const source={x,y,z,r,g,b,size};
    if(level===14){
      const intensity=128-(Math.trunc(Math.sqrt(distance))>>2);
      source.r=outer?0:intensity;source.g=intensity;source.b=outer?intensity:0;
    }else if(level===15&&i===2){source.g=0;source.b=0;}
    result.push(source);
  }
  return result;
}
