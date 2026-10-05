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
  for(const area of [{x:-350000,y:-40000,z:170000,kind:86},{x:-170000,y:-65000,z:295000,kind:80}]){
    for(let i=0;i<120;i++){ts2.setPlayerPos(area.x,area.z,area.y);Object.assign(ts2.player,{vy:0,fallTimer:0,hitStun:1000});ts2.tickGame({},1,0);}
    let spawned=false,rendered=false,sounded=false;
    for(let i=0;i<600;i++){
      ts2.setPlayerPos(area.x,area.z,area.y);Object.assign(ts2.player,{vy:0,fallTimer:0,hitStun:1000});ts2.tickGame({},1,0);
      spawned ||= ts2.effects.activeKinds.includes(area.kind);
      rendered ||= ts2.effects.sprites.includes(area.kind===86?52:51)&&[...ts2.viewer.effectPageData.values()].some(p=>p.cards.length+p.flat.length>0);
      sounded ||= ts2.sound.raised.some(e=>e.startsWith('74:'));
    }
    check(spawned&&rendered,'emitter did not spawn/render '+area.kind+' '+JSON.stringify(ts2.effects));
    if(area.kind===86)check(sounded,'ball emitter sound missing');
  }
  ts2.openMenu();const frozen=JSON.stringify(ts2.toyBarnEffects);ts2.tickGame({},100,0);check(JSON.stringify(ts2.toyBarnEffects)===frozen,'paused emitters advanced');
  ts2.pressMenu('back');ts2.tickGame({},1,0);await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.toyBarnEffects.node===0,'restart retained ball sequence');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.toyBarnPlatforms===null&&ts2.toyBarnRotors===null&&ts2.toyBarnEffects===null,'Toy Barn controller leaked after exit');
  console.log('PASS Toy Barn both emitter regions, rendered sprites, sound, pause/restart/exit');
})()
