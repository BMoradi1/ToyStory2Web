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
  ts2.save.tokens.fill(31);ts2.save.tokens[7]&=~4;ts2.save.tokens[10]&=~16;ts2.save.tokens[11]&=~16;
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
  const safeTick=()=>{ts2.setPlayerPos(0,0,-2000000);Object.assign(ts2.player,{vy:0,fallTimer:0});ts2.tickGame({},1,0);};
  async function offer(){
    ts2.goToCreature(13);
    for(let t=0;t<180&&!ts2.talk;t++)ts2.tickGame({},1,0);
    check(ts2.talk&&ts2.tasks.fetch===1,'fetch offer missing '+JSON.stringify(ts2.tasks));
    const frozen=JSON.stringify(ts2.toyBarnBarrier);ts2.tickGame({},100,0);check(JSON.stringify(ts2.toyBarnBarrier)===frozen,'dialogue advanced barrier');
    for(let t=0;t<2000&&ts2.talk;t++)ts2.tickGame({jump:(t&1)===0},1,0);
    check(!ts2.talk,'fetch dialogue stuck');
    for(let t=0;t<50;t++)safeTick();
    check(ts2.toyBarnBarrier.height===16384&&!ts2.toyBarnBarrier.enabled,'offer failed to open gate '+JSON.stringify({gate:ts2.toyBarnBarrier.height,tasks:ts2.tasks}));
    check(ts2.viewer.objectTransforms.get(ts2.toyBarnBarrier.index).split('|')[1]==='0,2,0','raised gate artwork mismatch');
  }
  await offer();ts2.killCreature(6);for(let t=0;t<40;t++)safeTick();
  check(ts2.tasks.fetchDone===1&&ts2.tasks.fetch===0,'first fetch did not complete');
  check(ts2.toyBarnBarrier.height===0&&ts2.toyBarnBarrier.enabled,'first completion left gate open');
  await offer();
  // Second run has a 30-second deadline. Keep Buzz safe while it expires.
  for(let t=0;t<2300&&ts2.tasks.fetch!==0;t++)safeTick();
  for(let t=0;t<40;t++)safeTick();
  check(ts2.tasks.fetch===0&&ts2.tasks.fetchDone===1,'second fetch did not time out');
  check(!ts2.pickups.tokenItems.find(t=>t.slot===2).enabled&&(ts2.tasks.done&4)===0&&ts2.tokenReveals.timers[2]===0,'timeout retained reward/reveal');
  check(ts2.toyBarnBarrier.height===0&&ts2.toyBarnBarrier.enabled,'timeout left gate open');
  await offer();
  const token=ts2.pickups.tokenItems.find(t=>t.slot===2);check(token.enabled,'second-run token absent');
  Object.assign(ts2.player,{x:token.x*32,y:(token.y+230)*32,z:token.z*32,vx:0,vy:0,vz:0,jumpState:0,onGround:true,contacts:[],coyote:0,climb:0,pole:-1,zipLine:-1});
  ts2.tickGame({},1,0);check(ts2.pickups.tokenItems.find(t=>t.slot===2).collected,'second reward not collected');
  ts2.pressMenu('select');ts2.tickGame({},1,0);for(let t=0;t<40;t++)safeTick();
  check(ts2.tasks.fetchDone===2&&ts2.tasks.fetch===0,'second fetch did not finish');
  check(ts2.toyBarnBarrier.height===16384&&!ts2.toyBarnBarrier.enabled,'second success closed gate');
  ts2.openMenu();const frozen=JSON.stringify(ts2.toyBarnBarrier);ts2.tickGame({},100,0);check(JSON.stringify(ts2.toyBarnBarrier)===frozen,'pause moved barrier');ts2.pressMenu('back');ts2.tickGame({},1,0);
  await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.toyBarnBarrier.height===0&&ts2.toyBarnBarrier.enabled,'restart did not restore gate');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.toyBarnPlatforms===null&&ts2.toyBarnRotors===null&&ts2.toyBarnEffects===null&&ts2.toyBarnSprings===null&&ts2.toyBarnBarrier===null,'Toy Barn controller leaked after exit');
  console.log('PASS Toy Barn fetch offers, gate open/close, first/second completion, timeout, retry, artwork and restart/exit');
})()
