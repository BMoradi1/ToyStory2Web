import type {Point} from './laser.ts';
import type {PointLight} from './point-light.ts';

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
  colour:readonly [number,number,number]=[255,255,255]):PointLight|null{
  let nearest=0x10000,light:PointLight|null=null;
  for(let i=0;i<points.length;i++){
    const p=points[i]!,x=p.x<<5,y=p.y<<5,z=p.z<<5;
    const view=((camera.x-x)>>8)**2+((camera.y-y)>>8)**2+((camera.z-z)>>8)**2;
    if(view>=1000000)continue;
    const distance=((player.x-x)>>8)**2+((player.y-y-8192)>>8)**2+((player.z-z)>>8)**2;
    if(distance>=nearest)continue;
    nearest=distance;
    // Stable identity stands in for the retail address of this path point.
    light={x,y,z,r:colour[0],g:colour[1],b:colour[2],life:1,owner:-1000-i};
  }
  return light;
}
