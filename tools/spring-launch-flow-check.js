/** Protected approaches followed by actual Andy/Airport spring landings. */
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
  const dismiss=()=>{for(let t=0;t<2000&&ts2.talk;t++)ts2.tickGame({jump:(t&1)===0},1,0);};
  const hold=(at,above)=>{ts2.setPlayerPos(at.x,at.z,at.y-above);Object.assign(ts2.player,{vx:0,vy:0,vz:0,fallTimer:0,fellOut:false,hitStun:0,climb:0,climbGroup:-1,pole:-1,zipLine:-1,launched:false,jumpState:0});};
  await enter(1);
  for(const stomp of [false,true]){
    await ts2.spawnPlayer();ts2.viewer.stop();dismiss();
    const at={"x": 690762.6666666667, "y": 99904, "z": -605344};
    for(let t=0;t<120;t++){hold(at,20000);ts2.tickGame({},1,0);if(ts2.talk)dismiss();}
    check(ts2.zones.camera===4,'Andy spring room wrong');hold(at,3000);ts2.player.stomp=stomp?1:0;
    let launch=false;for(let t=0;t<150&&!launch;t++){ts2.tickGame({},1,0);launch=ts2.player.vy===(stomp?-3072:-2432);}
    check(launch&&!ts2.player.launched,'Andy spring launch/air control '+stomp);check(ts2.sound.raised.some(e=>e.startsWith('1c:')),'Andy launch sound');
  }
  await leave();await enter(13);
  const cases=[{"at": {"x": -127317.33333333334, "y": -15434.666666666668, "z": -169002.6666666667}}, {"at": {"x": 260981.33333333334, "y": -267978.6666666667, "z": 719178.6666666666}}, {"at": {"x": 122858.66666666666, "y": -76234.66666666666, "z": 230165.33333333334}, "start": {"x": 112000, "y": -68800, "z": 221984}, "mover": 2}, {"at": {"x": -218826.6666666667, "y": -76266.66666666667, "z": 250602.66666666666}, "start": {"x": -208000, "y": -68800, "z": 258784}, "mover": 3}, {"at": {"x": 508443.06365791336, "y": -177034.6666666667, "z": 256808.09674453473}, "start": {"x": 507712, "y": -169600, "z": 243232}, "mover": 4}];
  for(let i=0;i<cases.length;i++){
    await ts2.spawnPlayer();ts2.viewer.stop();dismiss();const test=cases[i];
    const at=()=>{const m=test.mover===undefined?null:ts2.levelPlatforms.movers[test.mover];return m?{x:test.at.x+m.position.x-test.start.x,y:test.at.y+m.position.y-test.start.y,z:test.at.z+m.position.z-test.start.z}:test.at;};
    for(let t=0;t<120;t++){hold(at(),20000);ts2.tickGame({},1,0);if(ts2.talk)dismiss();}
    hold(at(),3000);ts2.player.stomp=1;
    let launch=false;for(let t=0;t<150&&!launch;t++){ts2.tickGame({},1,0);launch=ts2.player.vy===-3072;}
    check(launch&&!ts2.player.launched,'Airport spring launch/air control '+i+' '+JSON.stringify({p:ts2.player,s:ts2.levelPlatforms.springObject}));
    check(ts2.levelPlatforms.springRoll===(i<2?-480:-512),'first-frame compression '+i);
    const o=ts2.levelPlatforms.objects.find(o=>o.id===ts2.levelPlatforms.springObject);
    check(ts2.viewer.objectTransforms.get(o.index)?.startsWith('0,'+o.yaw+','+o.roll+'|'),'rendered compression absent '+i);
    check(ts2.sound.raised.some(e=>e.startsWith('1c:')),'Airport launch sound');
    ts2.openMenu();const frozen=ts2.levelPlatforms.springRoll;ts2.tickGame({},50);check(ts2.levelPlatforms.springRoll===frozen,'pause advanced spring');ts2.pressMenu('back');ts2.tickGame({},17,0);check(ts2.levelPlatforms.springRoll===0,'spring did not recover');
  }
  await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.levelPlatforms.springRoll===0,'restart retained compression');await leave();
  console.log('PASS Andy normal/stomp and all five Airport actual spring landings, normal air control, sound, rendered compression, pause/recovery/restart/exit');
})()
