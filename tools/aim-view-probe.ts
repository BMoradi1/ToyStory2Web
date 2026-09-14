import assert from 'node:assert/strict';
import {createPlayer,NO_INPUT} from '../src/sim/player.ts';
import {createAimView,stepAimView,aimCamera} from '../src/sim/aim-view.ts';
import {fireBeam} from '../src/sim/laser.ts';
const p=createPlayer(0,0,0,0),s=createAimView();
stepAimView(s,p,{...NO_INPUT,aim:true});assert(s.active);
stepAimView(s,p,{...NO_INPUT,aim:true});assert(s.active,'held button does not toggle twice');
stepAimView(s,p,{...NO_INPUT,moveX:1,moveY:1});assert(s.yaw>0&&s.pitch>0);
for(let i=0;i<100;i++)stepAimView(s,p,{...NO_INPUT,moveY:1});assert.equal(s.pitch,768);
const camera=aimCamera(s,p);assert.equal(camera.eye.y,-0x3000);assert(camera.look.y<camera.eye.y);
const shot=fireBeam([],camera.eye,s.yaw,0,[],()=>1,s.pitch);
const ray={x:camera.look.x-camera.eye.x,y:camera.look.y-camera.eye.y,z:camera.look.z-camera.eye.z};
for(const axis of ['x','y','z'] as const)assert(Math.abs(shot.beam.to[axis]-camera.eye[axis]-ray[axis]*8)<1e-6);
stepAimView(s,p,{...NO_INPUT,aim:true});assert(!s.active);
stepAimView(s,p,NO_INPUT);stepAimView(s,p,{...NO_INPUT,aim:true});assert(s.active);
stepAimView(s,p,NO_INPUT,true);assert(!s.active,'cut/dialogue cancels aiming');
assert(!createAimView().active);
console.log('PASS: visor toggle edges, yaw/pitch clamps, eye height, beam/reticle alignment, cut cancellation and reset.');

// The arm tracks across 0/4095 without turning the long way; it trails a turn
// and settles to the retail integer dead band, without steering the shot ray.
const turn=createAimView(),buzz=createPlayer(0,0,0,4090);
stepAimView(turn,buzz,{...NO_INPUT,aim:true});
stepAimView(turn,buzz,{...NO_INPUT,moveX:1});
assert.equal(turn.yaw,14);assert.equal(turn.modelYaw,4093);
const yaw=turn.yaw,pitch=turn.pitch;
for(let i=0;i<80;i++)stepAimView(turn,buzz,NO_INPUT);
assert.equal(turn.yaw,yaw);assert.equal(turn.pitch,pitch);
assert(Math.abs(((turn.modelYaw-turn.yaw+2048)&4095)-2048)<=5);
const phase=turn.swayPhase;
stepAimView(turn,buzz,{...NO_INPUT,aim:true});
assert(!turn.active);assert.equal(turn.swayPhase,phase,'inactive visor does not animate');
stepAimView(turn,buzz,NO_INPUT);stepAimView(turn,buzz,{...NO_INPUT,aim:true});
assert.equal(turn.modelYaw,turn.yaw,'re-entry discards the previous arm lag');
console.log('PASS: retail arm lag, wraparound, settling, independent shot aim and toggle reset.');
