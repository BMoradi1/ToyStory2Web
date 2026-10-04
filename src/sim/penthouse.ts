/** Penthouse prop controllers, independent of its creature-owned gunslinger. */
import type {DatLevel,Vec3} from '../formats/dat.ts';
import {captureCollisionGroup,collisionGroupByObject,transformCollisionGroup,type CollisionWorld} from '../formats/collision.ts';
import type {PlayerState} from './player.ts';
import type {RandomStream} from './creatures.ts';
import type {CutHandle} from './tasks.ts';
import type {ZurgShot} from './zurg-boss.ts';
import {carryOnYawPlatform} from './moving-platform.ts';
import {sin,cos,yawOf} from './trig.ts';
export function readPenthouseTables(exe:Uint8Array){
  const v=new DataView(exe.buffer,exe.byteOffset,exe.byteLength);
  if(exe.length<0xf4045)throw Error('Executable is missing Penthouse prop tables');
  return {hazards:Array.from({length:6},(_,i)=>({
    models:Array.from({length:4},(_,j)=>v.getInt32(0xf3e74+i*16+j*4,true)),
    button:Array.from({length:4},(_,j)=>v.getUint8(0xf3fb4+i*4+j)),
    zone:[3,2,2,5,4,1][i]!,
  })),mechanisms:Array.from({length:7},(_,i)=>Array.from({length:7},(_,j)=>v.getInt16(0xf3f48+i*14+j*2,true))),
  routes:Array.from({length:13},(_,i)=>Array.from({length:4},(_,j)=>v.getInt16(0xf3df8+i*8+j*2,true))),
  trainButtons:Array.from({length:3},(_,i)=>Array.from({length:4},(_,j)=>v.getUint8(0xf3fdc+i*4+j))),
  waterButtons:Array.from({length:4},(_,i)=>({
    collision:v.getUint8(0xf3fac+i*2),art:v.getUint8(0xf3fad+i*2),
    bit:v.getUint8(0xf3fcd+i*4),target:-1600*v.getUint8(0xf3fce+i*4)||0,guide:v.getUint8(0xf3fcf+i*4),
  })),waterPlanes:Array.from({length:5},(_,i)=>({
    threshold:v.getInt32(0xf3fe8+i*12,true),art:v.getInt32(0xf3fec+i*12,true),
  }))};
}
export type PenthouseTables=ReturnType<typeof readPenthouseTables>;
export function penthouseObjects(t:PenthouseTables){return [...new Set([...t.hazards.flatMap(h=>[...h.models,h.button[1]!,h.button[2]!]),...t.waterButtons.map(b=>b.art),...t.waterPlanes.map(p=>p.art),39,40,41,42,44,91,38,80,49,...t.mechanisms.flatMap(m=>m.slice(1,4)),...t.trainButtons.map(b=>b[2]!)])];}
const near=(a:Vec3,b:Vec3,r:number)=>((a.x-b.x)>>8)**2+((a.y-b.y)>>8)**2+((a.z-b.z)>>8)**2<r*r;
interface PenthouseObject {id:number;index:number;rest:Vec3;position:Vec3;angles:readonly[number,number,number];scale:readonly[number,number,number]}
export function createPenthouse(dat:DatLevel,w:CollisionWorld,t:PenthouseTables){
  const objects=new Map(penthouseObjects(t).map(id=>{
    const index=dat.objectIds[id]!,o=dat.objects[index];if(!o)throw Error(`Missing Penthouse object ${id}`);
    const rest={x:o.position.x*o.unitScale*32,y:o.position.y*o.unitScale*32,z:o.position.z*o.unitScale*32};
    return [id,{id,index,rest,position:{...rest},angles:[o.rotation.x,o.rotation.y,o.rotation.z] as readonly[number,number,number],scale:[1,1,1] as readonly[number,number,number]}] as [number,PenthouseObject];
  }));
  const hazards=t.hazards.map(h=>({...h,timer:0,yaw:objects.get(h.models[0]!)!.angles[1],
    hull:captureCollisionGroup(w,collisionGroupByObject(w,h.button[0]!))}));
  for(const h of hazards){for(const id of h.models.slice(2))objects.get(id)!.scale=[0,0,0];objects.get(h.button[2]!)!.scale=[0,0,0];}
  const water={offset:0,target:0,y:null as number|null,selected:0,clock:0,blink:false,bubble:0,
    buttons:t.waterButtons.map(b=>({...b,hull:captureCollisionGroup(w,collisionGroupByObject(w,b.collision))})),
    planes:t.waterPlanes,
    floats:[13,14,15,16].map((id,i)=>({art:39+i,threshold:i===2?-66600:-2600,
      hull:captureCollisionGroup(w,collisionGroupByObject(w,id)),velocity:0,displacement:0,step:0,y:w.groups[collisionGroupByObject(w,id)]!.position!.y*32})),
  };
  for(const id of [...water.planes.map(p=>p.art),44,91])objects.get(id)!.scale=[0,0,0];
  const paths=new Map(dat.paths.filter(p=>p.id>=1&&p.id<=12).map(p=>[p.id,p.points.map(q=>({x:q.x*32,y:q.y*32,z:q.z*32}))]));
  const finishGroup=collisionGroupByObject(w,27);
  const finish=finishGroup<0?null:captureCollisionGroup(w,finishGroup);
  const train={mask:0,clock:0,blink:false,routes:t.routes.map(r=>[...r]),mechanisms:t.mechanisms,
    buttons:t.trainButtons.map(b=>({collision:b[0]!,guide:b[1]!,art:b[2]!,toggle:b[3]!,hull:captureCollisionGroup(w,collisionGroupByObject(w,b[0]!))})),
    paths,path:1,node:6,reverse:false,position:{...paths.get(1)![6]!},yaw:0,speed:256,whistle:256,wait:0,blocked:false,finish,
    flash:0,flashArt:8,
  };
  for(const m of train.mechanisms)for(const id of m.slice(1,3))objects.get(id)!.scale=[0,0,0];
  objects.get(49)!.scale=[0,0,0];
  const indices=new Set(finish?.polys.map(p=>p.index)??[]);
  for(const [key,cell]of w.cells){const kept=cell.filter(i=>!indices.has(i));if(kept.length)w.cells.set(key,kept);else w.cells.delete(key);}
  const state={objects,hazards,water,train,clock:0,blinkClock:0,blink:false,disabled:0};
  selectPenthouseWater(state,w,16);
  setPenthouseTracks(state,0x25);
  drawPenthouseTrain(state);
  return state;
}
export type Penthouse=ReturnType<typeof createPenthouse>;
export interface PenthouseWorld {
  camera?:Vec3;gateFour?:boolean;cameraY?:number;zone:number;rand:RandomStream;gateSeven:boolean;cut?:CutHandle;
  sound?:(event:number,at?:Vec3)=>void;touch?:(angle:number,reaction:number)=>void;
  projectile?:(shot:ZurgShot)=>void;effect?:(at:Vec3,kind:number,mode:number,spin:boolean)=>void;
  guide?:(id:number)=>void;
}
/** 00428700: x87 distance includes two random offsets absent from decompiler C. */
export function penthouseShot(at:Vec3,yaw:number,p:Vec3,rand:RandomStream):ZurgShot|null{
  const dx=(at.x-p.x+(rand.byte()-128)*128)>>5,dz=(at.z-p.z+(rand.byte()-128)*128)>>5;
  const distance=Math.trunc(Math.sqrt(dx*dx+dz*dz));if(distance<2000)return null;
  const speed=Math.trunc(distance*2/3),flight=Math.trunc(distance*4096/speed),y=at.y-16384;
  return {x:at.x,y,z:at.z,vx:Math.trunc(cos(yaw)*speed/16384),
    vy:Math.trunc((p.y-y)*128/flight)-Math.trunc(flight/2),vz:Math.trunc(sin(yaw-2048)*speed/16384),
    gravity:128,rotation:0,spin:0,kind:92};
}
/** Runs after the player's collision pass, so real stomp contacts own switches. */
export function stepPenthouse(s:Penthouse,p:PlayerState,w:CollisionWorld,host:PenthouseWorld){
  stepPenthouseWater(s,p,w,host);
  stepPenthouseTrain(s,p,w,host);
  for(const h of s.hazards){
    if(h.timer!==0)continue;
    const button=s.objects.get(h.button[1]!)!,flash=s.objects.get(h.button[2]!)!;
    if(near(button.position,p,1120)){
      const lit=near(button.position,p,992)&&s.blinkClock>768;
      if(lit&&!s.blink){s.blink=true;flash.position={...button.position};button.scale=[0,0,0];flash.scale=[1,1,1];}
      else if(!lit&&s.blink&&(s.blinkClock<768||!near(button.position,p,992))){s.blink=false;button.scale=[1,1,1];flash.scale=[0,0,0];}
    }
    if(p.stompImpact&&p.contacts.some(c=>c.group===h.hull.groupIndex&&c.normal.y<-.5)){
      button.scale=[1,.5,1];flash.scale=[0,0,0];h.timer=60;
      transformCollisionGroup(w,h.hull,{...h.hull.origin,y:h.hull.origin.y+3600/32},0);
      const at=s.objects.get(h.models[0]!)!.position;
      host.cut?.start(at,180,32);
      if(host.cut){host.cut.look.y-=8192;host.cut.eye.y-=16384;}
      host.guide?.(h.button[3]!);
    }
  }
  s.clock++;if(s.clock>300)s.clock+=1000;s.blinkClock=(s.blinkClock+32)&1023;
  for(let i=0;i<s.hazards.length;i++){
    const h=s.hazards[i]!,body=s.objects.get(h.models[0]!)!,at=body.position;
    if(host.zone!==h.zone||!near(at,p,1152))continue;
    if(near(at,p,50))host.touch?.(yawOf(p.x-at.x,p.z-at.z),(s.disabled&(1<<i))?1:3);
    if(!(s.disabled&(1<<i))){
      let dx=p.x-at.x,dz=p.z-at.z;while(Math.abs(dx)>16384||Math.abs(dz)>16384){dx>>=1;dz>>=1;}
      const want=yawOf(-dz,dx),delta=(want-h.yaw)&4095;
      h.yaw=(h.yaw+(delta<2048?Math.min(delta,8):-Math.min(4096-delta,8)))&4095;
      for(const id of h.models.slice(0,2))s.objects.get(id)!.angles=[0,h.yaw,0];
      if(s.clock>1000){const shot=penthouseShot(at,h.yaw,p,host.rand);if(shot){host.projectile?.(shot);host.sound?.(0x92,at);}}
    }else if(host.gateSeven)host.effect?.({...at,y:at.y-8192},17,26,true);
  }
  if(s.clock>1000)s.clock-=1300;
  for(let i=0;i<s.hazards.length;i++){
    const h=s.hazards[i]!;if(h.timer<=0||--h.timer>0)continue;
    h.timer=-1;s.disabled|=1<<i;
    for(const id of h.models.slice(0,2))s.objects.get(id)!.scale=[0,0,0];
    for(const id of h.models.slice(2)){const o=s.objects.get(id)!;o.scale=[1,1,1];o.angles=[0,h.yaw,0];}
    const at=s.objects.get(h.models[0]!)!.position;
    for(let j=0;j<4;j++)host.effect?.({...at,y:at.y-12288},35,14,true);
    host.sound?.(-2,at);
  }
}
export function restorePenthouse(s:Penthouse,w:CollisionWorld){
  for(const h of [...s.hazards,...s.water.buttons,...s.water.floats,...(s.train.finish?[{hull:s.train.finish}]:[])])transformCollisionGroup(w,h.hull,h.hull.origin,0);
}

/** 004292c0: one depressed selector at a time; transforms are from captured rest. */
function selectPenthouseWater(s:Penthouse,w:CollisionWorld,bit:number){
  const water=s.water;
  for(const b of water.buttons){
    const selected=b.bit===bit,was=b.bit===water.selected;
    if(selected===was)continue;
    transformCollisionGroup(w,b.hull,{...b.hull.origin,y:b.hull.origin.y+(selected?3600/32:0)},0);
    s.objects.get(b.art)!.scale=[1,selected?2400/4096:4094/4096,1];
  }
  water.selected=bit;
}
/** Apply last tick's float velocity before player sweeps, carrying floor passengers. */
export function movePenthouseFloats(s:Penthouse,w:CollisionWorld,p:PlayerState){
  for(const f of s.water.floats){
    const before={x:f.hull.origin.x*32,y:f.y,z:f.hull.origin.z*32};
    f.y+=f.step;
    transformCollisionGroup(w,f.hull,{...f.hull.origin,y:f.y/32},0);
    carryOnYawPlatform(p,f.hull.groupIndex,before,{...before,y:f.y},0);
  }
}
/** Water section of 0042a130, selected-button flash 004293d0, floats 00429fb0. */
function stepPenthouseWater(s:Penthouse,p:PlayerState,w:CollisionWorld,host:PenthouseWorld){
  const a=s.water;
  if(a.offset!==a.target){
    host.sound?.(0x95);
    a.offset=a.offset<a.target?Math.min(a.target,a.offset+512):Math.max(a.target,a.offset-64);
  }
  a.y=a.offset===0?null:191000+a.offset;
  const plane=a.y===null?undefined:a.planes.find(q=>q.threshold<=a.offset);
  for(const q of a.planes){
    const o=s.objects.get(q.art)!;
    o.scale=q===plane&&(host.cameraY===undefined||a.y!>=host.cameraY)?[1,1,1]:[0,0,0];
    if(q===plane)o.position={...o.rest,y:o.rest.y+a.offset};
  }
  for(const b of a.buttons)if(p.stompImpact&&p.contacts.some(c=>c.group===b.hull.groupIndex&&c.normal.y<-.5)){
    selectPenthouseWater(s,w,b.bit);a.target=b.target;host.guide?.(b.guide);
  }
  if(a.offset<-64000)a.bubble=0;
  else if(a.offset===-64000)a.bubble=Math.min(683,a.bubble+2);
  else a.bubble=Math.max(0,a.bubble-2);
  const size=a.bubble?(sin(a.bubble+341)>>2)/4096:0;
  s.objects.get(91)!.scale=[size,size,size];
  a.clock=(a.clock+32)&1023;
  const selected=a.buttons.find(b=>b.bit===a.selected)!,button=s.objects.get(selected.art)!,flash=s.objects.get(44)!;
  if(!a.blink&&a.clock>768){a.blink=true;flash.position={...button.position};button.scale=[0,0,0];flash.scale=[1,.5,1];}
  else if(a.blink&&a.clock<768){a.blink=false;flash.position={...button.position};button.scale=[1,.5,1];flash.scale=[0,0,0];}
  if(near(p,{x:0x2cc2e,y:0x2ee2b,z:-0x2fc03},128)){selectPenthouseWater(s,w,16);a.target=0;}
  for(const f of a.floats){
    const submerge=Math.min(0,a.offset-f.threshold);
    if(p.stompImpact&&p.contacts.some(c=>c.group===f.hull.groupIndex&&c.normal.y<-.5))f.velocity=1280;
    f.velocity+=f.displacement<0?48:-48;
    const previous=f.displacement;f.displacement+=f.velocity;
    if(f.displacement>=0&&previous<0){
      f.velocity=f.velocity<513?512:f.velocity>>1;
      if(submerge!==0)host.effect?.({x:f.hull.origin.x*32,y:f.y-f.displacement,z:f.hull.origin.z*32},57,2,false);
    }
    if(f.displacement>8192||f.displacement<-2048)f.velocity=0;
    const o=s.objects.get(f.art)!;
    o.position={x:f.hull.origin.x*32,y:f.y,z:f.hull.origin.z*32};
    const bounce=submerge<-4095?f.displacement:-Math.trunc(f.displacement*submerge/4096);
    f.step=Math.max(-2048,Math.min(2048,o.rest.y+submerge+bounce-f.y));
  }
}

/** 00428890: route links and switch-arm rotations are changed by the same mask. */
function setPenthouseTracks(s:Penthouse,mask:number){
  const t=s.train;
  for(const m of t.mechanisms)if((t.mask&m[0]!)&&!(mask&m[0]!)){
    s.objects.get(m[1]!)!.scale=s.objects.get(m[2]!)!.scale=[0,0,0];
    s.objects.get(m[3]!)!.angles=[m[4]!,m[5]!,m[6]!];
  }
  const write=(address:number,value:number)=>{const word=(address-0x4f3df8)/2;t.routes[Math.floor(word/4)]![word%4]=value;};
  // The original mutates these installed route endpoints when a branch opens.
  const changes:[number,number[]][]=[
    [1,[0x4f3e14,5,0x4f3e16,1,0x4f3e00,2,0x4f3e02,0]],
    [2,[0x4f3e14,1,0x4f3e16,1,0x4f3e00,3,0x4f3e02,0]],
    [4,[0x4f3e18,9,0x4f3e1a,0,0x4f3e4c,2,0x4f3e4e,1,0x4f3e38,3,0x4f3e3a,1]],
    [8,[0x4f3e18,10,0x4f3e1a,1,0x4f3e4c,4,0x4f3e4e,1,0x4f3e38,3,0x4f3e3a,1]],
    [16,[0x4f3e18,8,0x4f3e1a,1,0x4f3e4c,2,0x4f3e4e,1,0x4f3e38,4,0x4f3e3a,1]],
    [32,[0x4f3e54,9,0x4f3e56,1,0x4f3e3c,12,0x4f3e3e,0]],
    [64,[0x4f3e54,8,0x4f3e56,0,0x4f3e3c,11,0x4f3e3e,0]],
  ];
  for(const [bit,words]of changes)if(!(t.mask&bit)&&(mask&bit)){
    const m=t.mechanisms.find(m=>m[0]===bit)!;s.objects.get(m[1]!)!.scale=[1,1,1];
    for(let i=0;i<words.length;i+=2)write(words[i]!,words[i+1]!);
  }
  t.mask=mask;
}
function drawPenthouseTrain(s:Penthouse){
  for(const id of [38,80]){const o=s.objects.get(id)!;o.position={...s.train.position};o.angles=[0,s.train.yaw,0];}
}
function stepPenthouseTrain(s:Penthouse,p:PlayerState,w:CollisionWorld,host:PenthouseWorld){
  const t=s.train;
  for(const b of t.buttons)if(p.stompImpact&&p.contacts.some(c=>c.group===b.hull.groupIndex&&c.normal.y<-.5)){
    host.guide?.(b.guide);t.flash=24;t.flashArt=b.art;
    setPenthouseTracks(s,b.toggle?t.mask^b.toggle:((t.mask>>2)&4)+(t.mask&12)*2+(t.mask&~28));
  }
  t.clock=(t.clock+1)&31;
  const lit=t.clock<24?true:t.clock>24?false:t.blink;
  if(lit!==t.blink){t.blink=lit;for(const m of t.mechanisms)if(t.mask&m[0]!){
    s.objects.get(m[1]!)!.scale=lit?[1,1,1]:[0,0,0];s.objects.get(m[2]!)!.scale=lit?[0,0,0]:[1,1,1];
  }}
  if(t.path!==0){
    if(near(p,t.position,48)){host.touch?.(yawOf(p.x-t.position.x,p.z-t.position.z),1);t.speed=16;t.whistle=Math.min(t.whistle,40);}
    else if(t.speed<256)t.speed+=8;
    if(!t.blocked){
      const target=t.paths.get(t.path)![t.node]!;
      const d={x:target.x/8-Math.trunc(t.position.x/8),y:target.y/8-Math.trunc(t.position.y/8),z:target.z/8-Math.trunc(t.position.z/8)};
      if(Math.max(Math.abs(d.x),Math.abs(d.y),Math.abs(d.z))<1024){
        t.node+=t.reverse?-1:1;
        if(t.node===(t.reverse?-1:t.paths.get(t.path)!.length)){
          const r=t.routes[t.path]!,i=t.reverse?2:0;t.path=r[i]!;t.reverse=r[i+1]!==0;
          t.node=t.reverse?(t.paths.get(t.path)?.length??1)-1:0;
        }
      }
      const length=Math.hypot(d.x,d.y,d.z);
      if(length){
        const n={x:Math.trunc(d.x*4096/length),y:Math.trunc(d.y*4096/length),z:Math.trunc(d.z*4096/length)};
        t.position.x+=(n.x*t.speed)>>10;t.position.y+=(n.y*t.speed)>>10;t.position.z+=(n.z*t.speed)>>10;
        const want=yawOf(-n.z,-n.x),delta=(t.yaw-want)&4095;
        t.yaw+=delta<2049?-(delta>>2):(4096-delta)>>2;
      }
    }
    drawPenthouseTrain(s);
    if(host.gateFour&&(!host.camera||near(host.camera,t.position,768))){
      host.effect?.({x:t.position.x-(cos(t.yaw)>>2),y:t.position.y-16384,z:t.position.z-(sin(t.yaw)>>2)},17,27,true);
      if(--t.whistle<1){t.whistle=host.rand.byte()+30;host.sound?.(0x97,t.position);}
    }
    // The authored push block is a physical stop; wait before resuming after it clears.
    const origin=w.groups[collisionGroupByObject(w,19)]!.position!;
    const block={x:origin.x*32,y:origin.y*32,z:origin.z*32};
    if(t.wait<1){t.blocked=near(block,t.position,96);if(t.blocked)t.wait=180;}
    else {t.wait--;if(near(block,t.position,96))t.wait=180;}
    if(t.path===0&&t.finish)transformCollisionGroup(w,t.finish,t.finish.origin,0);
  }
  if(t.flash>0){
    const button=s.objects.get(t.flashArt)!,flash=s.objects.get(49)!;
    if(t.flash===24){flash.position={...button.position};button.scale=[0,0,0];flash.scale=[1,1,1];}
    if(--t.flash===0){button.scale=[1,1,1];flash.scale=[0,0,0];}
  }
}
