/** Toy Barn shuttle lifecycle: installed movement scripts. */
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
  await enter(10);await ts2.spawnPlayer();ts2.viewer.stop();
  const slots=[0,1,2,3,4,5,22];
  for(const slot of slots){
    for(let t=0;t<100;t++){
      const c=ts2.creatures.find(c=>c.slot===slot);
      ts2.setPlayerPos(c.x+16000,c.z,c.y);Object.assign(ts2.player,{vy:0,hitStun:1000,fallTimer:0});
      ts2.tickGame({jump:(t&1)===0},1,0);
    }
    const mesh=ts2.viewer.creatureMeshes.get(slot),tilted=[1,2,5].includes(slot);
    check(mesh,'mouse model missing '+slot);
    check(Math.abs(mesh.rotation.x-(tilted?Math.PI*1.5:0))<1e-8,'mouse pitch '+slot);
    check(Math.abs(mesh.rotation.z-(tilted?-Math.PI:0))<1e-8,'mouse roll '+slot);
  }
  ts2.openMenu();const before=ts2.viewer.creatureMeshes.get(5).quaternion.toArray();ts2.tickGame({},60);
  check(JSON.stringify(before)===JSON.stringify(ts2.viewer.creatureMeshes.get(5).quaternion.toArray()),'pose changed during pause');
  ts2.pressMenu('back');ts2.tickGame({},1);
  await ts2.spawnPlayer();ts2.viewer.stop();
  for(const slot of [1,2,5]){const mesh=ts2.viewer.creatureMeshes.get(slot);check(mesh&&mesh.rotation.x===0&&mesh.rotation.z===0,'restart retained forced pose '+slot);}
  await leave();
  console.log('PASS Elevator Hop mouse model pitch/roll: all seven placements, pause, restart and exit');
})()
