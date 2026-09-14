import type {Point} from './laser.ts';
import type {PointLight} from './point-light.ts';

/** Level 10, 00425f60..004260d0: white reserved light at nearest path-13
 * point. Camera culling happens before the distance from Buzz's head. */
export function level10Light(points:readonly Point[],camera:Point,player:Point):PointLight|null{
  let nearest=0x10000,light:PointLight|null=null;
  for(let i=0;i<points.length;i++){
    const p=points[i]!,x=p.x<<5,y=p.y<<5,z=p.z<<5;
    const view=((camera.x-x)>>8)**2+((camera.y-y)>>8)**2+((camera.z-z)>>8)**2;
    if(view>=1000000)continue;
    const distance=((player.x-x)>>8)**2+((player.y-y-8192)>>8)**2+((player.z-z)>>8)**2;
    if(distance>=nearest)continue;
    nearest=distance;
    // Stable identity stands in for the retail address of this path point.
    light={x,y,z,r:255,g:255,b:255,life:1,owner:-1000-i};
  }
  return light;
}
