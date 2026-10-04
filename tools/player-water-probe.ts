/** Water flag boundary and original movement-table/vertical overrides. */
import assert from 'node:assert/strict';
import {createPlayer,createRuntime,stepPlayer,NO_GROUND,NO_INPUT,flatGround,JumpState} from '../src/sim/player.ts';
for(const [y,wet,gravity]of [[8192,false,64],[8193,true,16]] as const){
 const p=createPlayer(0,y,0),rt=createRuntime();stepPlayer(p,NO_INPUT,rt,{...NO_GROUND,waterY:0},0);
 assert.equal(p.inWater,wet);assert.equal(p.vy,gravity,'strict surface +8192 threshold');
}
{
 const p=createPlayer(0,10000,0),rt=createRuntime(),water={...NO_GROUND,waterY:0};
 p.vy=2000;stepPlayer(p,NO_INPUT,rt,water,0);assert.equal(p.vy,1024,'water fall cap');
 p.y=-10000;p.vy=0;stepPlayer(p,NO_INPUT,rt,water,0);assert(!p.inWater);assert.equal(p.vy,64,'leaving restores land gravity');
 p.y=10000;p.vy=0;stepPlayer(p,NO_INPUT,rt,{...water,waterY:null},0);assert(!p.inWater);assert.equal(p.vy,64,'drained water clears flag');
}
for(const wet of [false,true]){
 const p=createPlayer(0,100000,0),rt=createRuntime(),g={...flatGround(100000),waterY:wet?0:null};
 for(let i=0;i<3;i++)stepPlayer(p,NO_INPUT,rt,g,0);
 stepPlayer(p,{...NO_INPUT,jump:true},rt,g,0);assert.equal(p.vy,wet?-752:-1472,'ground jump and gravity');
 p.jumpState=JumpState.Rising;p.vy=-600;stepPlayer(p,NO_INPUT,rt,g,0);assert.equal(p.vy,wet?-288:-252,'release cut uses water divisor');
 p.jumpState=JumpState.Released;p.jumpedFromGround=false;p.vy=0;p.coyote=0;p.fallTimer=0;
 stepPlayer(p,{...NO_INPUT,jump:true},rt,g,0);assert.equal(p.vy,wet?-560:-1088,'air double jump');
}
{
 const p=createPlayer(0,100000,0),rt=createRuntime(),g={...flatGround(100000),waterY:0};
 for(let i=0;i<160;i++)stepPlayer(p,{...NO_INPUT,moveY:1},rt,g,0);
 assert(p.forwardSpeed>=632&&p.forwardSpeed<=658,'water speed oscillates around 640 with discrete acceleration/friction');
 const speed=p.forwardSpeed;
 p.hitStun=100;stepPlayer(p,NO_INPUT,rt,g,0);assert(p.inWater);assert.equal(p.forwardSpeed,speed-8,'water overrides hit-stun friction');
}
console.log('PASS: strict water depth boundary, entry/exit/drain state, gravity/fall cap, ground/release/double jumps, speed and override order');
