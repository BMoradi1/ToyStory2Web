import assert from 'node:assert/strict';
import {createCamera,stepCamera} from '../src/sim/camera.ts';
import {createPlayer} from '../src/sim/player.ts';

for(const moving of [false,true])for(const passive of [false,true]){
  const p=createPlayer(1000,2000,3000,0);
  p.coyote=moving?0:6;p.vx=moving?100:0;
  const run=(x:number,z:number,y:number,yaw=0)=>{
    const camera=createCamera(p);camera.yaw=yaw;
    camera.lookAt={x:p.x+x,y,z:p.z+z};
    stepCamera(camera,p,null,undefined,{passive});
    assert.equal(camera.lookAt,null,'request is consumed once');
    return camera;
  };
  assert.equal(run(0,-10000,0).yaw,256,'exact half-turn follows retail positive direction');
  assert.equal(run(10000,0,0).yaw,128,'quarter-turn takes one eighth');
  assert.equal(run(-10000,0,0).yaw,3968,'negative quarter-turn wraps');
  assert.equal(run(0,10000,0,4095).yaw,0,'negative delta rounds down before subtraction');
  assert.equal(run(0,10000,0,1).yaw,1,'positive sub-eight delta truncates to zero');
  const low=run(10000,-10000,-1000000),high=run(10000,-10000,1000000);
  assert.deepEqual(low,high,'target height never changes follow-camera state');
  const once=run(0,-10000,0),withoutRequest={...once,lookAt:null};
  stepCamera(once,p,null,undefined,{passive});
  stepCamera(withoutRequest,p,null,undefined,{passive});
  assert.deepEqual(once,withoutRequest,'consumed request does not keep steering');
}
console.log('PASS: standing/moving and active/passive target steering, half-turn direction, wrapping, signed rounding, ignored height and one-shot consumption.');
