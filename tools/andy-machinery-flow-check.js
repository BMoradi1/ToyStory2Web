/** Andy room-2 machinery lifecycle; protected teleports inspect each authored object. */
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
  const hold=at=>{ts2.setPlayerPos(at.x+6000,at.z,at.y);Object.assign(ts2.player,{vx:0,vy:0,vz:0,fallTimer:0,fellOut:false,hitStun:1000,climb:0,climbGroup:-1,pole:-1,zipLine:-1,stomp:0});ts2.tickGame({},1,0);};
  let sprays=false,bursts=false,sound24=false,sound25=false;
  for(const object of ts2.andyMachinery.objects){
    const poses=new Set(),gates=[new Set(),new Set()];
    for(let t=0;t<420;t++){
      hold(object.rest);
      const state=ts2.andyMachinery;
      if(t>120)check(ts2.zones.camera===2,'authored machinery is not in room 2 '+JSON.stringify(ts2.zones));
      const pose=ts2.viewer.objectTransforms.get(object.index);check(pose,'rendered transform missing '+object.id);poses.add(pose);
      state.barriers.forEach((b,i)=>gates[i].add(b.enabled));
      sprays ||= ts2.effects.activeKinds.includes(24);bursts ||= ts2.effects.activeKinds.includes(25)||ts2.effects.activeKinds.includes(26);
      sound24 ||= ts2.sound.raised.some(e=>e.startsWith('24:'));sound25 ||= ts2.sound.raised.some(e=>e.startsWith('25:'));
    }
    check(poses.size>16,'artwork stuck '+object.id);
    if(object.id===10||object.id===16)check(gates[object.id===10?0:1].size===2,'barrier never toggled '+object.id);
  }
  check(sprays&&bursts&&sound24&&sound25,'particles/audio missing '+JSON.stringify({sprays,bursts,sound24,sound25}));
  ts2.openMenu();const frozen=JSON.stringify(ts2.andyMachinery);ts2.tickGame({},130);check(JSON.stringify(ts2.andyMachinery)===frozen,'pause advanced machinery');ts2.pressMenu('back');ts2.tickGame({},1,0);
  await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.andyMachinery.phase===0&&ts2.andyMachinery.barriers.every(b=>b.enabled),'restart retained cycles/barriers');
  await leave();check(ts2.andyMachinery===null,'machinery survived exit');await enter(1);await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.andyMachinery.phase===0,'reentry retained phase');
  console.log('PASS Andy five rendered machinery cycles, paired collision gates, live sprays/bursts/audio, pause/restart/exit/reentry');
})()
