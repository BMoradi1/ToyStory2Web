/** Construction Yard shuttle lifecycle: installed movement scripts. */
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
  const surface=-0x7a78;
  const place=y=>{ts2.setPlayerPos(-200000,-300000,y);Object.assign(ts2.player,{vy:0,onGround:false,hitStun:0,fallTimer:0,stomp:0});};
  for(let i=0;i<90;i++){place(surface-1000);ts2.tickGame({},1,0);}
  place(surface-1000);ts2.tickGame({},1,0);check(!ts2.player.inMud,'mud active above surface');
  place(surface+100);ts2.tickGame({},1,0);
  check(ts2.player.inMud&&!ts2.player.inWater,'mud movement flag missing');
  check(ts2.effects.activeKinds.includes(53),'mud entry splash missing');
  check(ts2.sound.raised.some(s=>s.startsWith('4e:')),'mud entry sound missing');
  ts2.tickGame({moveY:1},80,0);
  check(ts2.player.inMud&&ts2.player.vy<=64,'mud sink limit missing');
  check(Math.abs(ts2.player.forwardSpeed)<300,'mud did not slow running');
  ts2.tickGame({jump:true},1,0);check(ts2.player.vy===-752,'mud escape jump missing');
  ts2.openMenu();const frozen=JSON.stringify(ts2.waterEffects),y=ts2.player.y;ts2.tickGame({},100,0);
  check(JSON.stringify(ts2.waterEffects)===frozen&&ts2.player.y===y,'paused mud changed');ts2.pressMenu('back');ts2.tickGame({},1,0);
  ts2.setPlayerPos(200000,-300000,surface+100);ts2.tickGame({},1,0);
  check(!ts2.player.inMud&&ts2.waterEffects.dripKind===54&&ts2.waterEffects.dripTicks>0,'mud region exit did not restore movement/mark feet');
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(!ts2.player.inMud&&ts2.waterEffects.dripTicks===0,'restart retained mud state');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.constructionScenery===null&&ts2.waterEffects.dripTicks===0,'mud state leaked after exit');
  console.log('PASS Construction Yard mud surface entry/splash/sound, slow movement/sinking, escape jump, muddy exit, pause/restart/exit');
})()
