/** Level-owned movers: 00425f60/0048acc0 (lifts), 0042c2b0/0042c3e0 (airport).
 * Coordinates stay in game units until the collision/render boundary. */
import type { DatLevel, Vec3 } from '../formats/dat.ts';
import { captureCollisionGroup, collisionGroupByObject, transformCollisionGroup, type CollisionWorld } from '../formats/collision.ts';
import type { PlayerState } from './player.ts';
import { carryOnYawPlatform } from './moving-platform.ts';
import { standingSurface } from './stomp-props.ts';
import { toRadians } from './trig.ts';
const NEAR = [[24,28,29,30,31,49,52,53,54,58,59,60,74], [25,32,33,34,35,51,55,56,57,61,62,63,76]];
const FAR = [[26,36,37,38,39,48,64,65,66], [27,40,41,42,43,50,67,68,69]];
const HULLS = [[1,2,3,6,7,8,9,10], [0,11,12,13,14,15,16,17]];
const AIRPORT = [
  { hull:8, path:2, objects:[21,20], node:0, yaw:1024 },
  { hull:10, path:4, objects:[25,24], node:0, yaw:1024 },
  { hull:2, path:6, objects:[13,12], node:8, yaw:-1024 },
  { hull:5, path:7, objects:[15,14], node:0, yaw:-3072 },
  { hull:1, path:5, objects:[11,10], node:0, yaw:-1592 },
];
export function platformObjects(level:number):number[] {
  return level===10 ? [...NEAR.flat(),...FAR.flat(),18,19,20,75,77,70,71,72,73,78,79,80,81] : level===13 ? AIRPORT.flatMap(p=>p.objects) : [];
}
const game = (p:Vec3):Vec3 => ({x:p.x*32,y:p.y*32,z:p.z*32});
const minus = (a:Vec3,b:Vec3):Vec3 => ({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const plus = (a:Vec3,b:Vec3):Vec3 => ({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
function hull(world:CollisionWorld,id:number) { return captureCollisionGroup(world,collisionGroupByObject(world,id)); }
function path(dat:DatLevel,id:number) {
  const points=dat.paths.find(p=>p.id===id)?.points;
  if(!points?.length)throw Error(`Missing platform path ${id}`);
  return points.map(game);
}
export function createLevelPlatforms(level:number,dat:DatLevel,world:CollisionWorld) {
  if(level!==10&&level!==13)return null;
  const objects=platformObjects(level).filter(id=>(dat.objectIds[id]??-1)>=0).map(id=>{
    const index=dat.objectIds[id]!,o=dat.objects[index];
    if(!o)throw Error(`Missing platform artwork ${id}`);
    return {id,index,angles:[o.rotation.x,o.rotation.y,o.rotation.z] as const,rest:game({x:o.position.x*o.unitScale,y:o.position.y*o.unitScale,z:o.position.z*o.unitScale}),
      position:game({x:o.position.x*o.unitScale,y:o.position.y*o.unitScale,z:o.position.z*o.unitScale}),yaw:0,scale:1,scaleY:1};
  });
  const movers=level===13 ? AIRPORT.map(a=>({hulls:[hull(world,a.hull)],points:path(dat,a.path),node:a.node,yaw:a.yaw,
    position:{...path(dat,a.path)[a.node]!},velocity:{x:0,y:0,z:0},speed:0,phase:0,wait:0,objects:a.objects})) :
    HULLS.map((ids,i)=>({hulls:ids.map(id=>hull(world,id)),points:[path(dat,3)[i]!,game(hull(world,ids[0]!).origin)],node:0,yaw:0,
      position:game(hull(world,ids[0]!).origin),velocity:{x:0,y:0,z:0},speed:0,phase:0,wait:0,objects:NEAR[i]!}));
  const state={level,objects,movers,wires:[0,2,0],solved:false,success:false,barrier:level===10?hull(world,19):null,
    wirePoints:level===10?path(dat,9):[],ticks:0};
  if(level===13)for(const m of movers)place(state,m,world);
  if(level===10)for(const i of [1,4,7])state.wirePoints[i]!.y=-27220*32;
  updatePuzzleArtwork(state);
  return state;
}
export type LevelPlatforms=NonNullable<ReturnType<typeof createLevelPlatforms>>;
type Mover=LevelPlatforms['movers'][number];
function place(s:LevelPlatforms,m:Mover,w:CollisionWorld) {
  const delta=minus(m.position,game(m.hulls[0]!.origin));
  for(const h of m.hulls)transformCollisionGroup(w,h,plus(h.origin,{x:delta.x/32,y:delta.y/32,z:delta.z/32}),toRadians(m.yaw));
  for(const id of m.objects){const o=s.objects.find(o=>o.id===id);if(!o)continue;o.position=s.level===13?{...m.position}:plus(o.rest,delta);o.yaw=m.yaw;}
  if(s.level===10)s.objects.find(o=>o.id===75+s.movers.indexOf(m)*2)!.scaleY=(delta.y+0x4ee80)/0x4ee80;
  if(s.level===10)for(const id of FAR[s.movers.indexOf(m)]!){const o=s.objects.find(o=>o.id===id);if(!o)continue;o.position=plus(o.rest,delta);}
}
function updatePuzzleArtwork(s:LevelPlatforms) {
  if(s.level!==10)return;
  for(let i=0;i<3;i++)s.objects.find(o=>o.id===18+i)!.position={...s.wirePoints[i*3+s.wires[i]!]!};
  for(const id of [70,72,78])s.objects.find(o=>o.id===id)!.scale=s.solved?1:0;
  for(const id of [71,73,79])s.objects.find(o=>o.id===id)!.scale=s.solved?0:1;
  for(const id of [80,81])s.objects.find(o=>o.id===id)!.scale=s.solved?0:1;
}
/** Called after physics so a stomp's surface is the newly acquired floor. */
export function stepPlatformSwitches(s:LevelPlatforms,p:PlayerState,w:CollisionWorld) {
  s.success=false;
  if(s.level!==10||s.solved||!p.stompImpact)return;
  const button=standingSurface(p,w)-0x20;
  if(button<0||button>2)return;
  s.wires[button]=Math.max(0,s.wires[button]!-1);
  s.wires[(button+1)%3]=Math.min(2,s.wires[(button+1)%3]!+1);
  s.solved=s.wires.every(v=>v===1);s.success=s.solved;
  if(s.solved&&s.barrier){
    const indices=new Set(s.barrier.polys.map(p=>p.index));
    for(const [key,cell]of w.cells){const kept=cell.filter(i=>!indices.has(i));if(kept.length)w.cells.set(key,kept);else w.cells.delete(key);}
  }
  updatePuzzleArtwork(s);
}
export function stepLevelPlatforms(s:LevelPlatforms,w:CollisionWorld,p:PlayerState) {
  s.ticks++;
  if(s.level===10&&!s.solved)return;
  for(const m of s.movers){
    const before={...m.position};
    m.position=plus(m.position,m.velocity);
    let teleport=false;
    if(s.level===13){
      if(m.node>m.points.length-2){m.node=0;m.position={...m.points[0]!};m.velocity={x:0,y:0,z:0};teleport=true;}
      else {
        const d=minus(m.points[m.node]!,m.position);
        if(m.speed<125)m.speed+=4;
        if(Math.max(Math.abs(d.x),Math.abs(d.y),Math.abs(d.z))<0x4000)m.node++;
        const length=Math.hypot(d.x,d.y,d.z);
        m.velocity=length?{x:Math.trunc(d.x/length*4096)*m.speed>>10,y:Math.trunc(d.y/length*4096)*m.speed>>10,z:Math.trunc(d.z/length*4096)*m.speed>>10}:{x:0,y:0,z:0};
      }
    }else if(m.wait>0){m.wait--;m.velocity={x:0,y:0,z:0};}
    else {
      // 0048acc0 op4/op1, speed 18 / 12 level units, 32-tick ramps.
      const speed=s.movers.indexOf(m)===0?18:12;
      const d=minus(m.points[m.node]!,m.position),dist=Math.max(Math.abs(d.x),Math.abs(d.y),Math.abs(d.z))/32;
      if(dist<speed*4+48&&m.phase>0)m.phase=-64;
      m.phase=Math.min(64,m.phase+2);
      if(dist<speed+8||m.phase===0){m.velocity={x:0,y:0,z:0};m.node=1-m.node;// Fixed midpoint of the original random wait (base 96 or 32, plus 0..127).
        m.wait=m.node===1&&speed===18?159:95;m.phase=0;}
      else {const length=Math.hypot(d.x,d.y,d.z),v=Math.max(1,Math.trunc(Math.abs(m.phase)*speed/64))*32;
        m.velocity={x:Math.trunc(d.x/length*v),y:Math.trunc(d.y/length*v),z:Math.trunc(d.z/length*v)};}
    }
    place(s,m,w);
    // A seam can report two hull contacts from the same lift. Carry only once.
    const support=m.hulls.find(h=>p.climbGroup===h.groupIndex ||
      (p.onGround&&p.contacts.some(c=>c.group===h.groupIndex&&c.normal.y<-.5)));
    if(support&&!teleport)carryOnYawPlatform(p,support.groupIndex,before,m.position,0);
    else if(support){p.onGround=false;p.contacts=[];p.climb=0;p.climbGroup=-1;}
  }
}
export function restoreLevelPlatforms(s:LevelPlatforms,w:CollisionWorld){
  for(const h of [...s.movers.flatMap(m=>m.hulls),...(s.barrier?[s.barrier]:[])])transformCollisionGroup(w,h,h.origin,0);
}
