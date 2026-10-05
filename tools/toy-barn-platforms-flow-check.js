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
  const level=7;await enter(level);await ts2.spawnPlayer();ts2.viewer.stop();
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
  const initial=ts2.toyBarnPlatforms.movers.map(m=>({...m.position}));
  for(let t=0;t<100;t++){ts2.setPlayerPos(0,0,-2000000);ts2.player.fallTimer=0;ts2.tickGame({},1,0);}
  for(let i=3;i<6;i++)check(JSON.stringify(ts2.toyBarnPlatforms.movers[i].position)===JSON.stringify(initial[i]),'enemy-gated platform moved early');
  for(const slot of [7,8,9])ts2.killCreature(slot);
  const far=new Set(),back=new Set(),waiting=new Set();
  for(let t=0;t<2400;t++){
    // Keep Buzz safe while the level scripts run normally.
    ts2.setPlayerPos(0,0,-2000000);ts2.player.fallTimer=0;
    ts2.tickGame({},1,0);
    for(const [i,m] of ts2.toyBarnPlatforms.movers.entries()){
      const displacement=i<3?initial[i].y-m.position.y:initial[i].x-m.position.x;
      if(displacement>(i<3?50000:20000))far.add(i);
      if(far.has(i)&&Math.abs(displacement)<1024)back.add(i);
      if(m.script.wait>0)waiting.add(i);
      const transform=ts2.viewer.objectTransforms.get(m.index);
      check(transform&&transform.startsWith(m.angles.join(',')+'|'),'missing shuttle artwork transform');
      const offset=transform.split('|')[1].split(',').map(Number);
      for(const [a,axis] of ['x','y','z'].entries())check(Math.abs(offset[a]-(((m.position[axis]>>5)*32-m.rest[axis])/8192)*(a? -1:1))<1e-6,'platform artwork drifted');
    }
  }
  check(far.size===6&&back.size===6&&waiting.size===6,'incomplete shuttle cycles');
  ts2.openMenu();const frozen=JSON.stringify(ts2.toyBarnPlatforms);ts2.tickGame({},100,0);
  check(JSON.stringify(ts2.toyBarnPlatforms)===frozen,'paused shuttles moved');ts2.pressMenu('back');ts2.tickGame({},1,0);
  await ts2.spawnPlayer();ts2.viewer.stop();
  for(const [i,m] of ts2.toyBarnPlatforms.movers.entries()){
    check(JSON.stringify(m.position)===JSON.stringify(initial[i]),'restart retained shuttle position');
    check(m.script.pc===0&&m.script.wait===0&&m.script.ramp===0,'restart retained shuttle script');
  }
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.toyBarnPlatforms===null,'shuttle controller leaked after exit');
  console.log('PASS Toy Barn two real crate pushes/far art and six platform out/back/wait cycles, artwork alignment, pause/restart/exit');
})()
