/** Space Land path-authored projectile volley. */
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
  const tick=()=>ts2.tickGame({jump:!!ts2.talk},1,0);
  const at={x:80000,y:-90000,z:-210000};
  const hold=p=>{ts2.setPlayerPos(p.x,p.z,p.y);Object.assign(ts2.player,{vy:0,fallTimer:0,zipLine:-1,zipPhase:0,pole:-1,climb:0});tick();};
  let spawned=false,rendered=false,sounded=false;const phases=[];
  for(let i=0;i<430;i++){
    hold(at);const s=ts2.spaceProjectiles;
    if(i>90)check(ts2.zones.player===2,'not in projectile room '+JSON.stringify(ts2.zones));
    if(s.clock<=200)check(s.node===0,'volley began without its delay');
    sounded ||= ts2.sound.raised.some(s=>s.startsWith('d:'));
    spawned ||= ts2.effects.activeKinds.includes(96);
    rendered ||= ts2.effects.kinds.includes(96)&&ts2.effects.cards>0;
    if(i%16===0)phases.push([s.clock,s.node]);
  }
  check(spawned&&rendered,'projectile never appeared '+JSON.stringify({spawned,rendered,phases}));
  check(sounded,'projectile launch sound missing');
  ts2.openMenu();const frozen=JSON.stringify(ts2.spaceProjectiles);ts2.tickGame({},100,0);
  check(JSON.stringify(ts2.spaceProjectiles)===frozen,'paused volley advanced');ts2.pressMenu('back');tick();
  hold({x:120000,y:-90000,z:-210000});const timer=ts2.spaceProjectiles.clock;
  for(let i=0;i<50;i++)hold({x:120000,y:-90000,z:-210000});
  check(ts2.spaceProjectiles.clock===timer,'X gate failed to stop volley');
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.spaceProjectiles.node===0&&ts2.spaceProjectiles.clock===0,'restart retained volley');
  check(!ts2.effects.activeKinds.includes(96),'restart retained projectile');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.spaceProjectiles===null,'projectiles leaked after exit');
  console.log('PASS Space Land projectile volley delay, live rendered projectile, sound, area/pause gates and restart/exit');
})()
