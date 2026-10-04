/** Level-owned movers: 00425f60/0048acc0 (lifts), 0042c2b0/0042c3e0 (airport).
 * Coordinates stay in game units until the collision/render boundary. */
import type { DatLevel, Vec3 } from '../formats/dat.ts';
import { sweepSphere, captureCollisionGroup, collisionGroupByObject, transformCollisionGroup, type CollisionWorld } from '../formats/collision.ts';
import { JumpState, type PlayerState } from './player.ts';
import { carryOnYawPlatform } from './moving-platform.ts';
import { standingSurface } from './stomp-props.ts';
import { COLLISION } from './player-constants.ts';
import { sin, cos, toRadians } from './trig.ts';
import {createElevatorFans,stepElevatorFans,stepFanSwitches,restoreElevatorFans,ELEVATOR_FAN_OBJECTS} from './elevator-fans.ts';
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
  return level===10 ? [...ELEVATOR_FAN_OBJECTS,...NEAR.flat(),...FAR.flat(),18,19,20,75,77,70,71,72,73,78,79,80,81] : level===13 ? [...AIRPORT.flatMap(p=>p.objects),9,28] : [];
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
      position:game({x:o.position.x*o.unitScale,y:o.position.y*o.unitScale,z:o.position.z*o.unitScale}),yaw:o.rotation.y,roll:0,scale:1,scaleY:1};
  });
  const movers=level===13 ? AIRPORT.map(a=>({hulls:[hull(world,a.hull)],points:path(dat,a.path),node:a.node,yaw:a.yaw,
    position:{...path(dat,a.path)[a.node]!},velocity:{x:0,y:0,z:0},speed:0,phase:0,wait:0,exhaust:true,blocked:false,objects:a.objects})) :
    HULLS.map((ids,i)=>({hulls:ids.map(id=>hull(world,id)),points:[path(dat,3)[i]!,game(hull(world,ids[0]!).origin)],node:0,yaw:0,
      position:game(hull(world,ids[0]!).origin),velocity:{x:0,y:0,z:0},speed:0,phase:0,wait:0,exhaust:true,blocked:false,objects:NEAR[i]!}));
  const state={level,objects,movers,fans:level===10?createElevatorFans(dat,world):null,wires:[0,2,0],solved:false,success:false,barrier:level===10?hull(world,19):null,
    wirePoints:level===10?path(dat,9):[],ticks:0,barrierScale:4096,pulse:0,warning:false,
    springObject:-1,springRoll:0,sounds:[] as {event:number;at:Vec3}[],
    exhaust:[] as Vec3[],guidesSpent:[] as number[],warningLight:false,
    springs:level===13?[{group:collisionGroupByObject(world,0),object:9,guide:0},{group:collisionGroupByObject(world,14),object:28,guide:1}]:[]};
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
  for(const id of [70,72,78])s.objects.find(o=>o.id===id)!.scale=s.solved&&s.warning?1:0;
  for(const id of [71,73,79])s.objects.find(o=>o.id===id)!.scale=s.solved&&s.warning?0:1;
  for(const id of [80,81])s.objects.find(o=>o.id===id)!.scaleY=s.barrierScale/4096;
}
/** Called after physics so a stomp's surface is the newly acquired floor. */
export function stepPlatformSwitches(s:LevelPlatforms,p:PlayerState,w:CollisionWorld) {
  s.success=false;
  if(s.fans){
    stepFanSwitches(s.fans,p,w);s.guidesSpent.push(...s.fans.guides);
    for(const o of s.objects){const angles=s.fans.angles.get(o.id);if(angles)o.angles=angles;}
  }
  if(s.level===13){
    if(!p.stompImpact)return;
    const floor=(group:number)=>p.contacts.some(c=>c.group===group&&c.normal.y<-.5);
    const fixed=s.springs.find(a=>floor(a.group));
    const vehicle=s.movers.find(m=>m.yaw!==1024&&floor(m.hulls[0]!.groupIndex));
    if(!fixed&&!vehicle)return;
    p.stomp=0;p.stompImpact=false;p.vy=-0xc00;p.onGround=false;p.coyote=0;
    p.jumpState=JumpState.Released;p.animPhase=2;p.fallTimer=0;p.launched=true;
    if(s.springObject>=0)s.objects.find(o=>o.id===s.springObject)!.roll=0;
    s.springObject=fixed?.object??vehicle!.objects[0]!;s.springRoll=-512;
    s.objects.find(o=>o.id===s.springObject)!.roll=s.springRoll;
    if(vehicle)vehicle.exhaust=false;
    if(fixed)s.guidesSpent.push(fixed.guide);
    s.sounds.push({event:0x1c,at:{x:p.x,y:p.y,z:p.z}});
    return;
  }
  if(s.level!==10||s.solved||!p.stompImpact)return;
  const button=standingSurface(p,w)-0x20;
  if(button<0||button>2)return;
  s.wires[button]=Math.max(0,s.wires[button]!-1);
  s.wires[(button+1)%3]=Math.min(2,s.wires[(button+1)%3]!+1);
  s.guidesSpent.push(2,3,1);
  s.solved=s.wires.every(v=>v===1);s.success=s.solved;
  if(s.solved)s.warning=true;
  if(s.solved&&s.barrier){
    const indices=new Set(s.barrier.polys.map(p=>p.index));
    for(const [key,cell]of w.cells){const kept=cell.filter(i=>!indices.has(i));if(kept.length)w.cells.set(key,kept);else w.cells.delete(key);}
  }
  updatePuzzleArtwork(s);
}
export function stepLevelPlatforms(s:LevelPlatforms,w:CollisionWorld,p:PlayerState,randomByte:()=>number=()=>0,spin=0) {
  s.ticks++;s.sounds.length=0;s.exhaust.length=0;s.guidesSpent.length=0;s.warningLight=false;
  if(s.fans){
    stepElevatorFans(s.fans,p,spin);
    for(const o of s.objects){const angles=s.fans.angles.get(o.id);if(angles)o.angles=angles;}
    for(const at of s.fans.sounds)s.sounds.push({event:0x8c,at});
  }
  if(s.springRoll<0){s.springRoll=Math.min(0,s.springRoll+32);s.objects.find(o=>o.id===s.springObject)!.roll=s.springRoll;}
  if(s.level===10&&s.solved){
    s.barrierScale=Math.max(0,s.barrierScale-32);s.pulse=(s.pulse+1)&63;
    const warning=s.pulse<41;s.warningLight=warning&&!s.warning;s.warning=warning;
    updatePuzzleArtwork(s);
  }
  if(s.level===10&&!s.solved)return;
  for(const m of s.movers){
    const before={...m.position},index=s.movers.indexOf(m);
    // 00559e80 is the acquired ledge, not the standing floor. Paired trucks
    // freeze together while either is grabbed; lifts freeze as a compound unit.
    const grabbed=(other:Mover)=>p.climbGroup>=0&&other.hulls.some(h=>h.groupIndex===p.climbGroup);
    if(grabbed(m)||(s.level===13&&(index===2||index===3)&&(grabbed(s.movers[2]!)||grabbed(s.movers[3]!))))continue;
    const ownGroups=new Set(m.hulls.map(h=>h.groupIndex));
    const incoming=s.level===13?sweepSphere(w,{x:p.x,y:p.y-COLLISION.radius-COLLISION.centreLift,z:p.z},
      {x:-m.velocity.x,y:-m.velocity.y,z:-m.velocity.z},COLLISION.radius,{groups:ownGroups}).contacts:[];
    m.blocked=[...p.contacts,...incoming].some(c=>m.hulls.some(h=>h.groupIndex===c.group)&&c.normal.y>(s.level===10?.5:-.5)&&
      c.normal.x*m.velocity.x+c.normal.y*m.velocity.y+c.normal.z*m.velocity.z>0);
    if(!m.blocked)m.position=plus(m.position,m.velocity);
    let teleport=false;
    if(s.level===13){
      if(m.node>m.points.length-2){m.node=0;m.position={...m.points[0]!};m.velocity={x:0,y:0,z:0};teleport=true;}
      else {
        const d=minus(m.points[m.node]!,m.position);
        if(m.speed<125)m.speed+=4;
        if(m.blocked&&m.speed>62){
          m.speed=-125;
          if(index===2||index===3){
            const other=s.movers[index===2?3:2]!;other.speed=-125;
            if(m.position.x>other.position.x){other.position.x=m.position.x-0x4d648;place(s,other,w);}
          }
        }
        if(Math.max(Math.abs(d.x),Math.abs(d.y),Math.abs(d.z))<0x4000)m.node++;
        const length=Math.hypot(d.x,d.y,d.z);
        m.velocity=length?{x:Math.trunc(d.x/length*4096)*m.speed>>10,y:Math.trunc(d.y/length*4096)*m.speed>>10,z:Math.trunc(d.z/length*4096)*m.speed>>10}:{x:0,y:0,z:0};
      }
    }else if(m.wait>0){m.wait--;m.velocity={x:0,y:0,z:0};}
    else {
      if(m.phase===0)s.sounds.push({event:0x90,at:{...m.position}});
      // 0048acc0 op4/op1, speed 18 / 12 level units, 32-tick ramps.
      const speed=s.movers.indexOf(m)===0?18:12;
      const d=minus(m.points[m.node]!,m.position),dist=Math.max(Math.abs(d.x),Math.abs(d.y),Math.abs(d.z))/32;
      if(dist<speed*4+48&&m.phase>0)m.phase=-64;
      m.phase=Math.min(64,m.phase+2);
      if(dist<speed+8||m.phase===0){m.velocity={x:0,y:0,z:0};m.node=1-m.node;
        m.wait=(m.node===1&&speed===18?96:32)+(randomByte()&127);m.phase=0;
        s.sounds.push({event:0x90,at:{...m.position}});}
      else {const length=Math.hypot(d.x,d.y,d.z),v=Math.max(1,Math.trunc(Math.abs(m.phase)*speed/64))*32;
        m.velocity={x:Math.trunc(d.x/length*v),y:Math.trunc(d.y/length*v),z:Math.trunc(d.z/length*v)};}
    }
    if(s.level===10&&(m.velocity.x||m.velocity.y||m.velocity.z))s.sounds.push({event:0x8f,at:{...m.position}});
    if(s.level===13&&m.yaw!==1024&&m.exhaust){
      s.exhaust.push({x:m.position.x+sin(m.yaw+1024),y:m.position.y-0x4000,z:m.position.z+cos(m.yaw+1024)});
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
  if(s.fans)restoreElevatorFans(s.fans,w);
  for(const h of [...s.movers.flatMap(m=>m.hulls),...(s.barrier?[s.barrier]:[])])transformCollisionGroup(w,h,h.origin,0);
}
