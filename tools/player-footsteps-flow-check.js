/** Actual walking and pole-climbing input must raise authored footstep sounds. */
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
  let walked=false,walkingSound=false;
  for(let t=0;t<180;t++){
    ts2.tickGame({moveY:t<90?1:-1},1,0);
    walked ||= ts2.anim.footfallMask!==0;
    walkingSound ||= ts2.sound.raised.some(e=>e==='0:BUZSTPL');
  }
  check(walked&&walkingSound,'walking animation produced no footstep audio');
  const q=ts2.poles[0];ts2.goToPole(0);
  ts2.setPlayerPos(q.x,(q.z),(q.top+q.bottom+0x3600)/2);
  Object.assign(ts2.player,{hitStun:0,fallTimer:0,fellOut:false,pole:-1,poleLock:-1,climb:0,jumpState:0,stomp:0,launched:false,onGround:false,spin:0,spinCharge:0});
  const start=ts2.player.y;let climbingSound=false;
  for(let t=0;t<100;t++){
    ts2.tickGame({moveY:1},1,0);
    climbingSound ||= ts2.sound.raised.some(e=>e==='43:BUZSTPL');
  }
  check(ts2.player.pole===0&&ts2.player.y<start-10000,'real pole climb failed');
  check(climbingSound,'climbing animation sounds were discarded');
  ts2.openMenu();const frozen=JSON.stringify(ts2.sound.raised);ts2.tickGame({},80);
  check(JSON.stringify(ts2.sound.raised)===frozen,'pause emitted walking/climbing sound');
  ts2.pressMenu('back');ts2.tickGame({},1);
  await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.anim.footfalls===0&&ts2.anim.sounds.length===0,'restart retained animation events');
  for(let t=0;t<2000&&ts2.talk;t++)ts2.tickGame({jump:(t&1)===0},1,0);
  await leave();
  console.log('PASS real walking and pole climbing audio, pause and restart');
})()
