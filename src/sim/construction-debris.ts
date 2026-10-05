/** Construction Yard path-authored debris, 0041cc00..0041cf79. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import type {Effect} from './effects.ts';
import type {RandomStream} from './creatures.ts';
import {sin,cos,yawOf} from './trig.ts';
const game=(p:Vec3):Vec3=>({x:p.x*32,y:p.y*32,z:p.z*32});
const near=(a:Vec3,b:Vec3,r:number)=>((a.x-b.x)>>8)**2+((a.z-b.z)>>8)**2<r*r;
export function createConstructionDebris(dat:DatLevel){
  const rolling=dat.paths.find(p=>p.id===0)?.points.map(game)??[];
  const thrown=dat.paths.find(p=>p.id===1)?.points.map(game)??[];
  return {rolling,thrown,rollingClock:0,throwClock:0,node:0};
}
export type ConstructionDebris=ReturnType<typeof createConstructionDebris>;
export function constructionThrow(from:Vec3,to:Vec3):Vec3|null{
  const dx=(from.x-to.x)>>8,dz=(from.z-to.z)>>8,distance=Math.trunc(Math.hypot(dx,dz));
  if(!distance)return null;
  const speed=distance*3,flight=Math.trunc(distance*4096/speed),yaw=(yawOf(dx,dz)-2048)&4095;
  return {x:Math.trunc(sin(yaw)*speed/8192),y:Math.trunc((to.y-from.y)*32/flight)-Math.trunc(flight*144/64),z:Math.trunc(cos(yaw)*speed/8192)};
}
export function stepConstructionDebris(s:ConstructionDebris,p:Vec3,w:{
  rand:RandomStream;effect:(at:Vec3,kind:number,mode:number)=>Effect|null;
  projectile:(at:Vec3,v:Vec3,gravity:number,spin:number,kind:number)=>Effect|null;
},dt=1){
  if(s.rollingClock<0){
    const at=s.rolling[s.node],to=s.rolling[s.node+1];
    if(at&&to&&near(at,p,1280)&&at.y<p.y&&p.y-at.y<204800){
      const e=w.effect(at,67,19),spin=(w.rand.byte()&1)*128-64;
      if(e){
        e.spin=spin;
        if(Math.abs(at.z-to.z)<Math.abs(at.x-to.x))e.vx=to.x<at.x?-384:384;
        else e.vz=to.z<at.z?-384:384;
      }
    }
    s.rollingClock=(w.rand.byte()&31)+16;s.node+=2;
    // Retail permits one visit at count before wrapping. Keep that idle visit,
    // but never interpret the following path's header as a position.
    if(s.node>s.rolling.length)s.node=0;
  }
  s.rollingClock-=dt;
  if(s.throwClock<0){
    const centre={x:0x783b,y:-0x7d05b,z:-0x742c4};
    if(near(centre,p,900)&&centre.y<p.y+0x25800&&p.y-0x19000<centre.y){
      const node=w.rand.byte()&14,at=s.thrown[node],to=s.thrown[node+1];
      const v=at&&to?constructionThrow(at,to):null,spin=(w.rand.byte()&1)*128-64;
      if(at&&v)w.projectile(at,v,144,spin,84);
    }
    s.throwClock=(w.rand.byte()&31)+64;
  }
  s.throwClock-=dt;
}
