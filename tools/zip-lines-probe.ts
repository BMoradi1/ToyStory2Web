/** tsx tools/zip-lines-probe.ts "Toy Story 2". Reads local assets only. */
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {parseDat} from '../src/formats/dat.ts';
import {parseAll} from '../src/formats/all.ts';
import {buildCollisionWorld,parseCollision} from '../src/formats/collision.ts';
import {readZipLines,type ZipLine} from '../src/sim/zip-lines.ts';
import {levelNumber} from '../src/sim/level-data.ts';
import {createPlayer,createRuntime,stepPlayer,NO_INPUT,NO_GROUND,groundFromCollision} from '../src/sim/player.ts';
import {selectState} from '../src/sim/player-animation.ts';
import {ZIPLINE} from '../src/sim/player-constants.ts';
const root=process.argv[2]??'Toy Story 2';
function rider(line:ZipLine,t=0.1){
  const p=createPlayer(line.start.x+(line.end.x-line.start.x)*t,
    line.start.y+(line.end.y-line.start.y)*t+ZIPLINE.hangOffset+100,
    line.start.z+(line.end.z-line.start.z)*t,line.yaw);
  return {p,rt:createRuntime(),ground:{...NO_GROUND,zipLines:[line]}};
}
let linesTested=0;
for(let dir=1;dir<=10;dir++)for(const scene of ['level','level1']){
  const id=`level${String(dir).padStart(2,'0')}/${scene}`,n=levelNumber(id);
  const file=join(root,'data',id+'.dat');
  if(!n||n>15||!existsSync(file))continue;
  const lines=readZipLines(parseDat(readFileSync(file)).paths.find(p=>p.id===62)?.points??[]);
  for(const line of lines){
    assert(Number.isFinite(line.length)&&line.length>200);
    const {p,rt,ground}=rider(line);
    stepPlayer(p,NO_INPUT,rt,ground,0);assert.equal(p.zipPhase,2,`${id} catch`);
    assert.equal(selectState(p,false),17);
    const start=p.zipDistance;
    for(let i=0;i<50;i++)stepPlayer(p,NO_INPUT,rt,ground,0);
    assert.equal(p.zipSpeed,48);assert(p.zipDistance>start+1000);
    // Every riding point lies on the authored cable, including diagonal slopes.
    const dx=line.end.x-line.start.x,dz=line.end.z-line.start.z;
    assert(Math.abs((p.x-line.start.x)*dz-(p.z-line.start.z)*dx)/Math.hypot(dx,dz)<1);
    stepPlayer(p,{...NO_INPUT,jump:true},rt,ground,0);
    assert.equal(p.zipLine,-1);assert.equal(p.zipCooldown,30);assert(p.vy<0);
    for(let i=0;i<29;i++){
      p.x=line.start.x+(line.end.x-line.start.x)*0.1;
      p.z=line.start.z+(line.end.z-line.start.z)*0.1;
      p.y=line.start.y+(line.end.y-line.start.y)*0.1+ZIPLINE.hangOffset+100;
      stepPlayer(p,NO_INPUT,rt,ground,0);assert.equal(p.zipLine,-1);
    }
    const end=rider(line,Math.min(0.9,1-300/line.length));
    for(let i=0;i<1000;i++){
      stepPlayer(end.p,NO_INPUT,end.rt,end.ground,0);
      if(end.p.zipCooldown>0)break;
    }
    assert.equal(end.p.zipLine,-1);assert.equal(end.p.zipCooldown,30,'end releases');
    linesTested++;
  }
}
const line=readZipLines([{x:0,y:0,z:0},{x:4000,y:400,z:0}])[0]!;
const catching=rider(line);catching.p.y-=5000;
// A pending cable catch must not be stolen by a nearby ledge probe.
const catchGround={...catching.ground,ledge:()=>{throw Error('ledge overrides cable catch');}};
stepPlayer(catching.p,NO_INPUT,catching.rt,catchGround,0);assert.equal(catching.p.zipPhase,1);
for(let i=0;i<40;i++)stepPlayer(catching.p,{...NO_INPUT,jump:true},catching.rt,catchGround,0);
assert.equal(catching.p.zipPhase,2,'held jump does not release on grab');
catching.p.hitStun=30;stepPlayer(catching.p,NO_INPUT,catching.rt,catching.ground,0);
assert.equal(catching.p.zipLine,-1,'damage interrupts');
const grounded=rider(line);grounded.p.onGround=true;grounded.p.coyote=5;
stepPlayer(grounded.p,NO_INPUT,grounded.rt,grounded.ground,0);assert.equal(grounded.p.zipLine,-1);
const far=rider(line);far.p.z=10000;stepPlayer(far.p,NO_INPUT,far.rt,far.ground,0);assert.equal(far.p.zipLine,-1);
const dir=join(root,'data/level01');
const lines=readZipLines(parseDat(readFileSync(join(dir,'level.dat'))).paths.find(p=>p.id===62)!.points);
const world=buildCollisionWorld(parseCollision(parseAll(readFileSync(join(dir,'TERRAIN.ALL')))).groups);
const real=rider(lines[0]!);const ground=groundFromCollision(world,[],lines);
for(let i=0;i<60;i++)stepPlayer(real.p,NO_INPUT,real.rt,ground,0);
assert.equal(real.p.zipPhase,2,'ride survives real collision');assert(real.p.zipDistance>2000);
assert.deepEqual(readZipLines([{x:0,y:0,z:0},{x:0,y:10,z:0}]),[],'ignore degenerate vertical lines');
console.log(`PASS: ${linesTested} authored zip lines; catch/ride/jump/end/lockout; damage and range gates; Level 1 collision`);
