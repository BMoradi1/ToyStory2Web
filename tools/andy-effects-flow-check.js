/** Positioned room-4 emitter inspection and real steam damage in Andy's House. */
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
  const dismiss=()=>{for(let t=0;t<2000&&ts2.talk;t++)ts2.tickGame({jump:(t&1)===0},1,0);};dismiss();
  const hold=(at,protect=true)=>{ts2.setPlayerPos(at.x,at.z,at.y);Object.assign(ts2.player,{vx:0,vy:0,vz:0,fallTimer:0,fellOut:false,climb:0,climbGroup:-1,pole:-1,zipLine:-1});if(protect)ts2.player.hitStun=1000;ts2.tickGame({},1,0);if(ts2.talk)dismiss();};
  const centre={x:0xb3e1a,y:0x26720,z:-529601},steam={x:0xb74dc,y:0x23f3e,z:-0x6634a};
  const kinds=new Set(),emitters=new Set(),nodes=new Set();
  for(let t=0;t<600;t++){hold(centre);for(const k of ts2.effects.activeKinds)kinds.add(k);emitters.add(ts2.andyEffects.emitter);nodes.add(ts2.andyEffects.node);}
  check(ts2.zones.camera===4,'Andy emitters room mismatch');check([12,16,17,34].every(k=>kinds.has(k)),'live effect kinds absent '+JSON.stringify([...kinds]));check(emitters.size===3&&nodes.size>2,'emitters/path did not cycle');
  for(let t=0;t<120;t++)hold(steam);
  const health=ts2.pickups.health;ts2.player.hitStun=0;hold(steam,false);
  check(ts2.pickups.health===health-1&&ts2.player.hitStun>0,'steam contact did not hurt');
  for(let t=0;t<10;t++)hold(steam,false);check(ts2.pickups.health===health-1,'steam ignored hurt cooldown');
  ts2.openMenu();const frozen=JSON.stringify(ts2.andyEffects);ts2.tickGame({},130);check(JSON.stringify(ts2.andyEffects)===frozen,'pause advanced emitters');ts2.pressMenu('back');ts2.tickGame({},1,0);
  await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.andyEffects.node===1&&ts2.andyEffects.timer===0&&ts2.andyEffects.emitter===0,'restart retained emitters');
  await leave();check(ts2.andyEffects===null,'effects survived exit');
  console.log('PASS Andy live lobber/cycling particles/steam, actual steam damage and invulnerability, pause/restart/exit');
})()
