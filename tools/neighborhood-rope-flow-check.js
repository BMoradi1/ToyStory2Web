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
  const q=ts2.poles[0],rest={...q};
  for(let t=0;t<120;t++){ts2.setPlayerPos(q.x+20000,q.z,q.bottom);Object.assign(ts2.player,{vx:0,vy:0,vz:0,fallTimer:0,fellOut:false,hitStun:1000,climb:0,climbGroup:-1,pole:-1,zipLine:-1});ts2.tickGame({},1,0);}
  check(ts2.neighborhoodRope.speed===0,'rope activated without a grab');
  ts2.setPlayerPos(q.x+2000,q.z,q.bottom);Object.assign(ts2.player,{hitStun:0,fallTimer:0,fellOut:false,pole:-1,poleLock:-1,climb:0,jumpState:0,stomp:0,launched:false,onGround:false});
  let heard=false,attached=0;const start=ts2.player.y;
  for(let t=0;t<350;t++){
    ts2.tickGame({},1,0);heard ||= ts2.sound.raised.some(e=>e.startsWith('21:'));if(ts2.player.pole===0)attached++;
    const r=ts2.neighborhoodRope;
    for(const o of r.objects){const pose=ts2.viewer.objectTransforms.get(o.index);check(pose,'rope artwork absent');check(pose.endsWith('|'+o.scale.join(',')),'rope stretch differs');const dy=Number(pose.split('|')[1].split(',')[1]);check(Math.abs(dy*8192+o.position.y-o.rest.y)<1,'lowering artwork differs');}
  }
  check(attached>100&&heard&&ts2.player.y>start+200000,'actual sliding ride/audio failed '+JSON.stringify({attached,heard,p:ts2.player}));
  check(ts2.neighborhoodRope.speed===-1&&q.bottom===-0x2500&&q.type===0,'rope limit/type missing');
  ts2.openMenu();const frozen=JSON.stringify(ts2.neighborhoodRope);ts2.tickGame({},100);check(JSON.stringify(ts2.neighborhoodRope)===frozen,'paused rope changed');ts2.pressMenu('back');ts2.tickGame({},1,0);
  await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.neighborhoodRope.speed===0&&ts2.poles[0].bottom===rest.bottom&&ts2.poles[0].top===rest.top,'restart retained extended rope');
  await leave();check(ts2.neighborhoodRope===null,'rope survived exit');
  console.log('PASS Neighborhood actual rope grab/sliding ride, extending artwork, audio, pause/restart/exit');
})()
