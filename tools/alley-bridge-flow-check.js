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
  await enter(5);await ts2.spawnPlayer();ts2.viewer.stop();
  let pose=ts2.goToPushBlock(2);check(pose,'missing bridge trigger');
  for(let t=0;t<90;t++){ts2.goToPushBlock(2);ts2.player.fallTimer=0;ts2.tickGame({},1,pose.yaw);}
  pose=ts2.goToPushBlock(2);
  for(let t=0;t<200&&ts2.alleyBridge.angle===0;t++)ts2.tickGame({moveY:1},1,pose.yaw);
  check(ts2.alleyBridge.angle>0,'real push failed to trigger bridge '+JSON.stringify({push:ts2.pushBlocks,p:ts2.player}));
  let heard=false,debris=false;
  for(let t=0;t<100;t++){
    ts2.tickGame({},1,pose.yaw);heard ||= ts2.sound.raised.some(e=>e.startsWith('34:'));debris ||= ts2.effects.activeKinds.includes(13);
  }
  check(ts2.alleyBridge.angle===1024&&heard&&debris,'bridge completion/effects absent '+JSON.stringify({angle:ts2.alleyBridge.angle,heard,debris}));
  for(const o of ts2.alleyBridge.objects){const transform=ts2.viewer.objectTransforms.get(o.index);check(transform?.startsWith(o.angles.join(',')+'|'),'bridge angle mismatch');check(transform?.endsWith('|'+o.scale.join(',')),'bridge scale mismatch');}
  for(const id of [0,1,3]){
    ts2.tickGame({},1); // Release the previous crate before teleporting to another.
    const start=ts2.pushBlocks.blocks[id],far=start.followers[0],initial=ts2.viewer.objectTransforms.get(far);check(far>=0&&initial,'missing distant crate');
    pose=ts2.goToPushBlock(id);Object.assign(ts2.player,{fallTimer:0,fellOut:false,climb:0,climbGroup:-1,pole:-1,poleLock:-1,zipLine:-1,launched:false,jumpState:0,stomp:0,hitStun:0,forwardSpeed:0,lateralSpeed:0});for(let t=0;t<100;t++)ts2.tickGame({moveY:1},1,pose.yaw);
    const moved=ts2.pushBlocks.blocks[id];check(Math.hypot(moved.x-start.x,moved.z-start.z)>1000,'actual crate push failed '+id+' '+JSON.stringify({start,moved,p:ts2.player,talk:ts2.talk,push:ts2.pushBlocks}));
    const a=initial.split('|')[1].split(',').map(Number),b=ts2.viewer.objectTransforms.get(far).split('|')[1].split(',').map(Number);
    const delta=[moved.x-start.x,-(moved.y-start.y),-(moved.z-start.z)];for(let axis=0;axis<3;axis++)check(Math.abs((b[axis]-a[axis])*8192-delta[axis])<128,'distant crate drift '+id);
  }
  ts2.openMenu();const angle=ts2.alleyBridge.angle;ts2.tickGame({},100);check(ts2.alleyBridge.angle===angle,'pause changed bridge');ts2.pressMenu('back');ts2.tickGame({},1);
  await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.alleyBridge.angle===0&&ts2.alleyBridge.objects.every(o=>o.scale.every(v=>v===1)),'restart did not restore bridge');
  await leave();check(ts2.alleyBridge===null,'bridge survived exit');
  console.log('PASS Alley real push opens bridge, completion artwork/debris/sound, three real distant-crate pushes, pause/restart/exit');
})()
