/** Water camera integration across Neighborhood, Alley and Penthouse; positioned depth checks. */
(async () => {
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const wait = async (test, message) => {
    for (let i = 0; i < 500; i++) { if (test()) return; await pause(100); }
    throw new Error(message + ': ' + JSON.stringify(ts2.front));
  };
  // Skip the boot's movies/cards through their normal input handlers.
  for (let i = 0; i < 100 && !ts2.front.running; i++) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }));
    ts2.closeTitleCard(); await pause(100);
  }
  await wait(() => ts2.front.screen === 'title', 'title did not open');
  ts2.save.tokens.fill(31);ts2.save.tokens[10]&=~16;ts2.save.tokens[11]&=~16;
  ts2.frontDrive(0, 40); ts2.frontDrive(0x4000); ts2.frontDrive(0, 30);
  await wait(() => ts2.front.screen === 'menu', 'menu did not open');
  ts2.frontDrive(0, 40); ts2.frontDrive(0x4000); ts2.frontDrive(0, 30);
  await wait(() => ts2.front.screen === 'select', 'selector did not open');
  async function enter(level) {
    ts2.frontDrive(0,70);
    while(ts2.front.state.pos<level){ts2.frontDrive(0x20);ts2.frontDrive(0);}
    while(ts2.front.state.pos>level){ts2.frontDrive(0x80);ts2.frontDrive(0);}
    ts2.frontDrive(0x4000);ts2.frontDrive(0,40);
    for(let i=0;i<500&&!ts2.front.inLevel;i++) {
      if(ts2.cutsceneUp){window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));}
      await pause(100);
    }
    await wait(()=>ts2.front.inLevel,'level failed to start');
    ts2.viewer.stop();
  }
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  async function leave(){
    ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
    ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
    await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
    if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
    await wait(()=>ts2.front.screen==='select','selector missing');
  }
  const unit=()=>ts2.waterCamera.scale.every(n=>Math.abs(n-1)<1e-8);
  const closeTalk=()=>{for(let t=0;t<2000&&ts2.talk;t++)ts2.tickGame({jump:(t&1)===0},1,0);};
  for(const level of [2,5,11]){
    await enter(level);await ts2.spawnPlayer();ts2.viewer.stop();closeTalk();
    if(level===2){
      // Verify actual raster output at the authored starting scene while
      // holding simulation and camera pose fixed.
      const pixels=()=>{
        ts2.viewer.frame(ts2.viewer.lastTime);
        const gl=ts2.viewer.renderer.getContext(),out=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
        gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,out);return out;
      };
      const saved=ts2.waterCamera.scale;
      ts2.viewer.setCameraScale([1,1,1]);const normal=pixels();
      ts2.viewer.setCameraScale([1.05,.95,1]);const warped=pixels();
      let changed=0;for(let i=0;i<normal.length;i+=4)if(normal[i]!==warped[i]||normal[i+1]!==warped[i+1]||normal[i+2]!==warped[i+2])changed++;
      check(changed>100,'view distortion did not change rendered geometry');
      ts2.viewer.setCameraScale([1,1,1]);const restored=pixels();
      check(restored.every((v,i)=>v===normal[i]),'restoring projection did not restore framebuffer');
      ts2.viewer.setCameraScale(saved);
    }
    if(level===11){ts2.penthouse.water.offset=ts2.penthouse.water.target=-64000;ts2.tickGame({},1,0);}
    const water=level===2?17408:level===5?65536:127000;
    const hold=(y,ticks=180,x=-1000000)=>{
      for(let t=0;t<ticks;t++){
        ts2.setPlayerPos(x,-1000000,y);Object.assign(ts2.player,{vx:0,vy:0,vz:0,hitStun:1000,fallTimer:0,fellOut:false,pole:-1,climb:0,zipLine:-1,stomp:0});ts2.tickGame({},1,0);
      }
      // This depth fixture is outside the level floor; prevent its queued
      // fall respawn from replacing the camera on the first paused tick.
      ts2.player.fellOut=false;
    };
    hold(water+80000);check(!unit(),'underwater camera stayed flat '+level+' '+JSON.stringify(ts2.waterCamera));
    const matrix=ts2.viewer.camera.projectionMatrix.clone();
    ts2.openMenu();const frozen=JSON.stringify(ts2.waterCamera);ts2.tickGame({},80);
    check(JSON.stringify(ts2.waterCamera)===frozen,'pause advanced water camera '+level+' '+JSON.stringify({frozen,now:ts2.waterCamera,menu:ts2.menu,talk:!!ts2.talk,dying:ts2.player.dying}));
    ts2.viewer.resize();check(ts2.viewer.camera.projectionMatrix.equals(matrix),'resize lost distortion '+level);
    ts2.pressMenu('back');ts2.tickGame({},1,0);hold(water+80000,10);
    check(JSON.stringify(ts2.waterCamera)!==frozen,'resume did not advance wave '+level);
    hold(water-80000);check(unit(),'emerging retained distortion '+level);
    if(level===2){hold(100000,180,1000000);check(unit(),'mud distorted camera');}
    hold(water+80000);check(!unit(),'second dive stayed flat');
    await ts2.spawnPlayer();ts2.viewer.stop();check(unit(),'restart retained distortion');closeTalk();
    await leave();check(unit(),'exit retained distortion');
  }
  console.log('PASS three water worlds: underwater projection, wave progression, emerge, mud exclusion, pause/resize, restart and exit');
})()
