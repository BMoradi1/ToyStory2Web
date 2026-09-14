import type {Point} from './laser.ts';
import type {PointLight} from './point-light.ts';
import type {CharacterLight} from '../formats/character-light.ts';

/** Undefined means the retail script skips updating the existing slot. */
export function scriptedPathLight(level:number,paths:readonly {id:number;points:readonly Point[]}[],
  camera:Point,player:Point,cameraZone:number,flickerIntensity=0):PointLight|null|undefined{
  // 0042ad4d jumps past both assignment and disabling in camera zone 4.
  if(level===11&&cameraZone===4)return undefined;
  if(level===4){
    // 0041d916 skips assignment AND disabling at zero intensity.
    if(flickerIntensity===0)return undefined;
    const yellow=Math.min(128,flickerIntensity*2),blue=Math.max(0,flickerIntensity*2-128);
    return nearestPathLight(paths.find(p=>p.id===6)?.points??[],camera,player,[yellow,yellow,blue]);
  }
  if(level===14){
    const points=paths.find(p=>p.id===40)?.points??[];
    const outer=(player.x>>8)**2+(player.z>>8)**2>=0x8e5144;
    return nearestPathLight(points,camera,player,outer?[0,255,255]:[255,255,0],
      {cameraLimit:0x40000,start:outer?16:0,end:outer?points.length:16});
  }
  if(level===15)return nearestPathLight(paths.find(p=>p.id===0)?.points??[],camera,player,
    i=>i===2?[255,0,0]:[255,255,255],{cameraLimit:0x100000});
  const settings:Record<number,readonly [number,number,number,number]>={
    5:[17,128,96,64], // 0041fd41..0041fea3
    10:[13,255,255,255], // 00425f60..004260d0
    11:[19,127,127,127], // 0042ad4d..0042aeb9
    12:[0,255,255,255], // 0042b3b5..0042b528
    13:[10,111,127,143], // 0042d241..0042d3ae
  };
  const config=settings[level];if(!config)return null;
  const [path,r,g,b]=config;
  return nearestPathLight(paths.find(p=>p.id===path)?.points??[],camera,player,[r,g,b]);
}
/** Camera culling happens before the distance from Buzz's head. */
export function nearestPathLight(points:readonly Point[],camera:Point,player:Point,
  colour:readonly [number,number,number]|((index:number)=>readonly [number,number,number])=[255,255,255],
  options:{cameraLimit?:number;start?:number;end?:number}={}):PointLight|null{
  let nearest=0x10000,light:PointLight|null=null;
  for(let i=options.start??0;i<Math.min(points.length,options.end??points.length);i++){
    const p=points[i]!,x=p.x<<5,y=p.y<<5,z=p.z<<5;
    const view=((camera.x-x)>>8)**2+((camera.y-y)>>8)**2+((camera.z-z)>>8)**2;
    if(view>=(options.cameraLimit??1000000))continue;
    const distance=((player.x-x)>>8)**2+((player.y-y-8192)>>8)**2+((player.z-z)>>8)**2;
    if(distance>=nearest)continue;
    nearest=distance;
    // Stable identity stands in for the retail address of this path point.
    const rgb=typeof colour==='function'?colour(i):colour;
    light={x,y,z,r:rgb[0],g:rgb[1],b:rgb[2],life:1,owner:-1000-i};
  }
  return light;
}

/** 0041b525: normalize the vector from Buzz's feet to the authored lamp.
 * 00451fd0 normalizes to 4096 with truncation; the script then shifts >>2,
 * and the shared base-light host shifts <<4. */
export function slimeBaseLight(player:Point):CharacterLight{
  const x=(0x348d-player.x)>>7,y=((0xfffcc925|0)-player.y)>>7,z=((0xffffcf2b|0)-player.z)>>7;
  const length=Math.hypot(x,y,z);
  const component=(v:number)=>length?(Math.trunc(v*4096/length)>>2)<<4:0;
  return {offset:{x:component(x),y:component(y),z:component(z)},colour:[192,192,0]};
}
/** 0041b4ae: first live spit blob in pool order, including its last tick. */
export function slimeBlobLight(effects:readonly (Point&{kind:number;life:number})[]):PointLight|null{
  const blob=effects.find(e=>e.kind===0x3f&&e.life>0);
  return blob?{x:blob.x,y:blob.y,z:blob.z,r:0,g:255,b:0,life:1,owner:-3}:null;
}
