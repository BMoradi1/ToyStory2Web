/** Space Land rocking block and distant crate followers. */
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
  const level=8;await enter(level);await ts2.spawnPlayer();ts2.viewer.stop();
  const offset=s=>s.split('|')[1].split(',').map(Number);
  for(const id of [0,1]){
    const start=ts2.pushBlocks.blocks[id],far=start.followers[0];check(far>=0,'far crate missing');
    const initial=ts2.viewer.objectTransforms.get(far),pose=ts2.goToPushBlock(id);
    for(let i=0;i<100;i++)ts2.tickGame({moveY:1},1,pose.yaw);
    const moved=ts2.pushBlocks.blocks[id];
    check(Math.hypot(moved.x-start.x,moved.z-start.z)>1000,'real push failed '+id+' '+JSON.stringify({start,moved,p:ts2.player}));
    const a=offset(initial),b=offset(ts2.viewer.objectTransforms.get(far));
    const delta=[moved.x-start.x,-(moved.y-start.y),-(moved.z-start.z)];
    for(let axis=0;axis<3;axis++)check(Math.abs((b[axis]-a[axis])*8192-delta[axis])<128,'far art drift '+id);
    await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.viewer.objectTransforms.get(far)===initial,'far art restart mismatch');
  }
  const start=ts2.pushBlocks.blocks[2],initial=ts2.viewer.objectTransforms.get(start.object);
  // Keep Buzz above the block until the camera/room state catches up.
  let rocked=false;
  for(let i=0;i<100;i++){
    ts2.setPlayerPos(start.x,start.z,start.y-40000);Object.assign(ts2.player,{vy:0,onGround:false,fallTimer:0});ts2.tickGame({},1,0);
    rocked ||= ts2.spaceRockingBlock.pitch!==0;
  }
  check(rocked&&!ts2.spaceRockingBlock.tipped,'idle rocking missing');
  ts2.setPlayerPos(start.x,start.z,start.y-20000);Object.assign(ts2.player,{vy:0,onGround:false,fallTimer:0});
  for(let i=0;i<100&&!ts2.spaceRockingBlock.tipped;i++)ts2.tickGame({},1,0);
  check(ts2.spaceRockingBlock.tipped&&ts2.player.onGround,'real landing did not trigger block');
  check(ts2.pushBlocks.blocks[2].tipPoint===-1,'landing did not start tipping');
  let fell=false,landed=false;
  for(let i=0;i<300&&!landed;i++){
    ts2.tickGame({},1,0);const b=ts2.pushBlocks.blocks[2];fell ||= b.fall>0;landed=fell&&b.fall===0;
    const now=offset(ts2.viewer.objectTransforms.get(b.object)),before=offset(initial);
    const delta=[b.x-start.x,-(b.y-start.y),-(b.z-start.z)];
    for(let axis=0;axis<3;axis++)check(Math.abs((now[axis]-before[axis])*8192-delta[axis])<1,'falling artwork drift');
  }
  check(fell&&landed&&ts2.pushBlocks.blocks[2].y===0,'block did not finish its drop');
  check(ts2.spaceRockingBlock.pitch===0,'released block kept rocking');
  ts2.openMenu();const frozen=JSON.stringify(ts2.pushBlocks);ts2.tickGame({},100,0);
  check(JSON.stringify(ts2.pushBlocks)===frozen,'paused block moved');ts2.pressMenu('back');ts2.tickGame({},1,0);
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(!ts2.spaceRockingBlock.tipped&&ts2.spaceRockingBlock.pitch===0,'restart retained rocking trigger');
  check(ts2.pushBlocks.blocks[2].y===start.y&&ts2.viewer.objectTransforms.get(start.object)===initial,'restart retained falling position');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.spaceRockingBlock===null,'rocking controller leaked after exit');
  console.log('PASS Space Land two real crate pushes/far art, rocking block landing/slide/fall/collision, pause/restart/exit');
})()
