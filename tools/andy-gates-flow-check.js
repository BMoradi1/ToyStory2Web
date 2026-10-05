/** Andy doorway and hatch: protected trigger positioning and a real push-to-fall. */
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
  await enter(1);await ts2.spawnPlayer();ts2.viewer.stop();
  for(let t=0;t<2000&&ts2.talk;t++)ts2.tickGame({jump:(t&1)===0},1,0);
  check(ts2.andyGates.growth===0&&ts2.andyGates.objects[0].scale[0]===0,'doorway initially visible');
  for(let t=0;t<20&&ts2.andyGates.growth===0;t++){
    ts2.setPlayerPos(300000,-340000,1000);Object.assign(ts2.player,{vx:0,vy:0,vz:0,coyote:6,fallTimer:0,fellOut:false,hitStun:0});ts2.tickGame({},1,0);
  }
  check(ts2.andyGates.growth>0,'doorway trigger failed '+JSON.stringify(ts2.player));
  ts2.tickGame({},70,0);check(ts2.andyGates.growth===4096,'doorway did not finish growing');
  for(const o of ts2.andyGates.objects){const pose=ts2.viewer.objectTransforms.get(o.index);check(pose?.endsWith('|'+o.scale.join(',')),'doorway scale absent');}
  ts2.tickGame({},1);let pose=ts2.goToPushBlock(3);check(pose,'missing hatch push block');
  Object.assign(ts2.player,{fallTimer:0,fellOut:false,climb:0,climbGroup:-1,pole:-1,poleLock:-1,zipLine:-1,launched:false,jumpState:0,stomp:0,hitStun:0,forwardSpeed:0,lateralSpeed:0});
  for(let t=0;t<800&&ts2.andyGates.hatchAngle===0;t++)ts2.tickGame({moveY:1},1,pose.yaw);
  check(ts2.andyGates.hatchAngle>0,'actual push did not drop hatch '+JSON.stringify({push:ts2.pushBlocks,p:ts2.player,talk:ts2.talk}));
  for(let t=0;t<160;t++)ts2.tickGame({},1,pose.yaw);
  check(ts2.andyGates.hatchAngle===512,'hatch rotation incomplete '+ts2.andyGates.hatchAngle);
  const block=ts2.pushBlocks.blocks[3];check(ts2.viewer.objectTransforms.get(block.object)?.startsWith('512,0,0|'),'hatch artwork lost native pitch');
  ts2.openMenu();const frozen=JSON.stringify(ts2.andyGates);ts2.tickGame({},130);check(JSON.stringify(ts2.andyGates)===frozen,'pause changed gates');ts2.pressMenu('back');ts2.tickGame({},1,0);
  await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.andyGates.growth===0&&ts2.andyGates.hatchAngle===0,'restart retained gates');
  await leave();check(ts2.andyGates===null,'gates survived exit');
  console.log('PASS Andy doorway contact/growth/child artwork, actual hatch push/fall/rotation, pause/restart/exit');
})()
