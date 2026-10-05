/** Positioned approach, real pole acquisition and lowering ride in Andy's House. */
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
  await enter(2);await ts2.spawnPlayer();ts2.viewer.stop();
  for(let t=0;t<2000&&ts2.talk;t++)ts2.tickGame({jump:(t&1)===0},1,0);
  const g=ts2.stompSurfaces.find(g=>g.surface===11&&g.tops.length),v=g.tops[0],at=v.reduce((a,p)=>({x:a.x+p.x*32/3,y:a.y+p.y*32/3,z:a.z+p.z*32/3}),{x:0,y:0,z:0});
  ts2.setPlayerPos(at.x,at.z,at.y-16000);Object.assign(ts2.player,{vx:0,vy:0,vz:0,stomp:0,stompImpact:false,onGround:false,hitStun:0,fallTimer:0,fellOut:false,pole:-1,poleLock:-1,climb:0,zipLine:-1,launched:false,jumpState:0});
  const heard=new Set();let splashed=false;
  const tick=input=>{ts2.tickGame(input??{},1,0);for(const x of ts2.sound.raised)heard.add(x.split(':')[0]);splashed ||= ts2.effects.activeKinds.includes(57);};
  for(let t=0;t<1500&&ts2.neighborhoodPump.inflation!==4096;t++)tick({jump:t%32===0});
  let s=ts2.neighborhoodPump;check(s.inflation===4096,'real pumping failed '+JSON.stringify({s,p:ts2.player}));
  check(heard.has('38')&&heard.has('b'),'pump sounds absent');check(ts2.guideSparkles.points.some(p=>p.index===3&&p.spent),'pump guide missing');
  for(let t=0;t<300;t++){
    tick();s=ts2.neighborhoodPump;
    for(const o of s.objects){const tr=ts2.viewer.objectTransforms.get(o.index);check(tr?.endsWith('|'+o.scale.join(',')),'pump scale mismatch '+o.id);const d=tr.split('|')[1].split(',').map(Number);check(Math.abs(d[0]*8192-o.position.x+o.rest.x)<1&&Math.abs(d[1]*8192+o.position.y-o.rest.y)<1,'floating prop artwork drift');}
  }
  check(splashed&&heard.has('39')&&s.vx===0,'buoyancy splash/recovery failed');
  for(const [x,y,kind] of [[-300000,30000,'inWater'],[300000,9000,'inMud']]){ts2.setPlayerPos(x,1000000,y);Object.assign(ts2.player,{vx:0,vy:0,vz:0,fallTimer:0,fellOut:false,hitStun:1000,pole:-1,climb:0});tick();check(ts2.player[kind],'liquid state missing '+kind);}
  ts2.openMenu();const frozen=JSON.stringify(s);ts2.tickGame({},100);check(JSON.stringify(s)===frozen,'paused pump changed');ts2.pressMenu('back');tick();
  await ts2.spawnPlayer();ts2.viewer.stop();s=ts2.neighborhoodPump;check(s.inflation===4095&&s.pump===0&&s.vx===0,'restart retained pump');
  await leave();check(ts2.neighborhoodPump===null,'pump survived exit');
  console.log('PASS Neighborhood real pump landings/jumps, inflated moving prop, rendered scale/motion, splashes/audio, water/mud, pause/restart/exit');
})()
