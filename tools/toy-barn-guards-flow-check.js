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
  check(ts2.goToPickupKind('Kind7'),'disk pickup missing');ts2.tickGame({},2,0);
  check(ts2.effects.diskAmmo>0,'disk pickup not collected');
  const guard=slot=>ts2.creatures.find(c=>c.slot===slot);
  for(const slot of [7,8,9]){
    const c=guard(slot);check(c.vulnerable===4,'guard started exposed');ts2.hurtCreature(slot,2);check(guard(slot).health===1,'closed spin hurt guard');
  }
  for(let t=0;t<120;t++){const c=guard(7);ts2.setPlayerPos(c.x+16000,c.z,c.y);Object.assign(ts2.player,{vy:0,fallTimer:0});ts2.tickGame({},1,0);}
  const ammo=ts2.effects.diskAmmo;ts2.player.laser=0;
  let exposed=false;
  for(let t=0;t<90&&!exposed;t++){
    const c=guard(7);ts2.setPlayerPos(c.x+16000,c.z,c.y);Object.assign(ts2.player,{vy:0,fallTimer:0});
    ts2.tickGame({fire:ts2.effects.diskAmmo===ammo},1,0);
    exposed=[7,8,9].every(slot=>guard(slot).vulnerable===5);
  }
  check(exposed&&ts2.effects.diskAmmo<ammo,'real disk did not open guards '+JSON.stringify({ammo,effects:ts2.effects,guards:[7,8,9].map(guard),player:ts2.player,talk:ts2.talk}));
  // Use damage injection for the three hits, then run their normal death timers.
  for(const slot of [7,8,9]){ts2.hurtCreature(slot,2);check(guard(slot).health===999,'open spin did not start guard death');}
  for(const slot of [7,8,9]){
    for(let t=0;t<150&&guard(slot).health!==0;t++){
      const c=guard(slot);ts2.setPlayerPos(c.x+16000,c.z,c.y);ts2.player.fallTimer=0;ts2.player.hitStun=1000;ts2.tickGame({},1,0);
    }
    check(guard(slot).health===0,'guard death did not finish');
  }
  for(let t=0;t<500;t++){ts2.setPlayerPos(0,0,-2000000);ts2.player.fallTimer=0;ts2.tickGame({},1,0);}
  check(ts2.toyBarnPlatforms.movers.slice(3).every(m=>m.script.pc!==0||m.script.ramp!==0),'defeated guard failed to release platform');
  check([7,8,9].every(slot=>guard(slot).vulnerable===4),'expired disks left guard vulnerability open');
  await ts2.spawnPlayer();ts2.viewer.stop();
  check([7,8,9].every(slot=>guard(slot).health===1&&guard(slot).vulnerable===4),'restart retained guard defeat/open state');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.toyBarnPlatforms===null&&ts2.toyBarnRotors===null,'Toy Barn controller leaked after exit');
  console.log('PASS Toy Barn collected/fired disk opens guards, closed spin rejected, authored deaths release platforms, timeout/restart close guards');
})()
