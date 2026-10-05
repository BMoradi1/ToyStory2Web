/** Construction Yard debris browser regression. Positions Buzz at installed
 * routes; does not inject emitter state. Checks pause, restart and exit.
 * Run with tools/browser-shot.ts and --user-gesture. */
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
  const level=4;await enter(level);await ts2.spawnPlayer();ts2.viewer.stop();
  const routes=ts2.constructionDebris.rolling;
  for(let node=0;node<16;node+=2){
    const at=routes[node];let seen=false;
    for(let i=0;i<700&&!seen;i++){
      const before=ts2.constructionDebris;
      ts2.setPlayerPos(at.x,at.z,at.y+10000);ts2.player.hitStun=1000;ts2.tickGame({},1,0);
      seen=before.node===node&&before.rollingClock<0&&ts2.effects.activeKinds.includes(67);
      if(ts2.talk)for(let j=0;j<2000&&ts2.talk;j++)ts2.tickGame({jump:(j&1)===0},1,0);
    }
    check(seen,'rolling debris absent near route '+node);
  }
  let thrown=false;
  for(let i=0;i<300&&!thrown;i++){
    ts2.setPlayerPos(0x783b,-0x742c4,-0x7d05b);ts2.player.hitStun=1000;ts2.tickGame({},1,0);
    thrown=ts2.effects.activeKinds.includes(84);
  }
  check(thrown,'authored thrown debris absent');
  ts2.openMenu();const frozen=JSON.stringify(ts2.constructionDebris);ts2.tickGame({},100,0);
  check(JSON.stringify(ts2.constructionDebris)===frozen,'paused debris clocks advanced');ts2.pressMenu('back');ts2.tickGame({},1,0);
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.constructionDebris.node===0&&ts2.constructionDebris.rollingClock===0&&ts2.constructionDebris.throwClock===0,'restart retained debris clocks');
  check(!ts2.effects.kinds.some(k=>k===67||k===84),'restart retained debris');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.constructionDebris===null,'debris controller leaked after exit');
  console.log('PASS Construction Yard rolling routes and thrown debris, pause/restart/exit');
})()
