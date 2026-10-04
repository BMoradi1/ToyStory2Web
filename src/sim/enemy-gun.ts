/** FATBLOKE, 00406a90: a forward-limited shot with terrain-clipped lifetime. */
import { cos, sin, yawOf } from './trig.ts';
type Point={x:number;y:number;z:number};
export function enemyGunShot(c:Point&{heading:number},player:Point){
  const trace={x:c.x,y:c.y-0x3000,z:c.z};
  const muzzle={x:trace.x+sin(c.heading+0xe0),y:trace.y,z:trace.z+cos(c.heading+0xe0)};
  let heading=yawOf(player.x-muzzle.x,player.z-muzzle.z);
  if(((heading-c.heading+0x100)&4095)>0x200)heading=c.heading;
  return {muzzle,trace,heading,velocity:{x:sin(heading)>>3,y:0,z:cos(heading)>>3}};
}
export type EnemyGunShot=ReturnType<typeof enemyGunShot>&{puffs:number};
/** Original uses the dominant axis to avoid dividing by a near-zero component. */
export function enemyGunLife(shot:ReturnType<typeof enemyGunShot>,end:Point){
  const axis=Math.abs(shot.velocity.x)>Math.abs(shot.velocity.z)?'x':'z';
  return Math.max(1,Math.abs(Math.trunc((end[axis]-shot.trace[axis])/shot.velocity[axis]))*2-15);
}
