/** Two crate-constrained rolling hoops, slots 10/11 in 00421340. */
import {CREATURE_FLAGS,killCreature,type Creature} from './creatures.ts';
export function createToyBarnHoops(){return {seen:[false,false]};}
export type ToyBarnHoops=ReturnType<typeof createToyBarnHoops>;
export function stepToyBarnHoops(s:ToyBarnHoops,creatures:readonly Creature[],crate:{x:number;z:number}){
 for(const [i,slot] of [10,11].entries()){
  const c=creatures.find(c=>c.slot===slot);if(!c)continue;
  // The original uses JAE for X and signed comparisons for the other bounds.
  if((c.x>>>0)<0xfff86271)c.x=0xfff86271|0;
  c.z=Math.max(c.z,-0x38c8);
  if(crate.z<0xae00)c.x=Math.min(c.x,crate.x-0x4800);
  else if(c.z>crate.z-0x9800&&c.x>crate.x-0x4800){c.z=crate.z-0x9800;c.vz=-0x900;}
  if(c.flags&CREATURE_FLAGS.awake)s.seen[i]=true;
  if(c.health>0&&s.seen[i]&&(c.z>0x47000||!(c.flags&CREATURE_FLAGS.awake))){
   s.seen[i]=false;
   if(!(c.flags&CREATURE_FLAGS.near))c.health=0;
   else killCreature(c,2);
  }
 }
}
