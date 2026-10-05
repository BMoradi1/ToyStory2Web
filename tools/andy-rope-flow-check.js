/** Positioned approach, real pole acquisition and lowering ride in Andy's House. */
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
  const q=ts2.poles[8],rest={...q};
  for(let t=0;t<120;t++){ts2.setPlayerPos(q.x+20000,q.z,q.top+0x3600);Object.assign(ts2.player,{vx:0,vy:0,vz:0,fallTimer:0,fellOut:false,hitStun:1000,climb:0,climbGroup:-1,pole:-1,zipLine:-1});ts2.tickGame({},1,0);}
  check(ts2.zones.camera===2&&ts2.andyRope.speed===0,'rope activated before grab or wrong room');
  ts2.goToPole(8);ts2.setPlayerPos(q.x+2000,q.z,q.top+0x3600+1);Object.assign(ts2.player,{hitStun:0,fallTimer:0,pole:-1,poleLock:-1,climb:0,jumpState:0,stomp:0,launched:false,onGround:false});
  let heard=false,attached=false;const start=ts2.player.y;
  for(let t=0;t<110;t++){
    ts2.tickGame({},1,0);heard ||= ts2.sound.raised.some(e=>e.startsWith('21:'));attached ||= ts2.player.pole===8;
    if(t>10)check(ts2.player.pole===8,'lowering rope dropped its rider '+JSON.stringify(ts2.player));
    const r=ts2.andyRope,pose=ts2.viewer.objectTransforms.get(r.index);check(pose,'rope transform absent');const dy=Number(pose.split('|')[1].split(',')[1]);check(Math.abs(dy*8192+r.position.y-r.rest.y)<1,'rope artwork did not track lowering');
  }
  check(attached&&heard&&ts2.player.y>start+30000,'actual lowering rope ride/audio failed');
  check(ts2.andyRope.height===ts2.andyRope.target&&q.bottom===rest.bottom+0xb800&&q.top===rest.top+0xb800,'attachment endpoints/limit wrong');
  ts2.openMenu();const frozen=JSON.stringify(ts2.andyRope);ts2.tickGame({},100);check(JSON.stringify(ts2.andyRope)===frozen,'paused rope changed');ts2.pressMenu('back');ts2.tickGame({},1,0);
  await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.andyRope.speed===0&&ts2.poles[8].bottom===rest.bottom&&ts2.poles[8].top===rest.top,'restart retained lowered rope');
  await leave();check(ts2.andyRope===null,'rope survived exit');
  console.log('PASS Andy actual rope grab/lowering ride, attached endpoints, rendered artwork/audio, pause/restart/exit');
})()
