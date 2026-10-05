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
  const heard=new Set();const tick=()=>{ts2.tickGame({},1,0);for(const x of ts2.sound.raised)heard.add(x.split(':')[0]);};
  const stomp=surface=>{
    const g=ts2.stompSurfaces.find(g=>g.surface===surface&&g.tops.length),v=g.tops[0],at=v.reduce((a,p)=>({x:a.x+p.x*32/3,y:a.y+p.y*32/3,z:a.z+p.z*32/3}),{x:0,y:0,z:0});
    ts2.setPlayerPos(at.x,at.z,at.y-16000);Object.assign(ts2.player,{vx:0,vy:0,vz:0,stomp:1,stompImpact:false,onGround:false,hitStun:0,fallTimer:0,fellOut:false,pole:-1,poleLock:-1,climb:0,zipLine:-1,launched:false,jumpState:0});
    for(let t=0;t<100;t++){tick();if(surface===10?ts2.neighborhoodStructure.launcher>0:ts2.neighborhoodStructure.supports[surface-8]!==4096)return;}
    throw Error('actual stomp failed '+surface+' '+JSON.stringify(ts2.player));
  };
  stomp(8);for(let t=0;t<40;t++)tick();check(ts2.neighborhoodStructure.pitch<0,'first support did not wobble');
  stomp(9);for(let t=0;t<130;t++)tick();
  let s=ts2.neighborhoodStructure;check(s.phase===2&&s.supports.every(n=>n===0),'structure did not collapse');
  for(const o of s.objects){const tr=ts2.viewer.objectTransforms.get(o.index);check(tr?.startsWith(o.angles.join(',')+'|')&&tr.endsWith('|'+o.scale.join(',')),'structure artwork mismatch '+o.id);}
  stomp(10);for(let t=0;t<8&&!ts2.player.launched;t++)tick();check(ts2.player.launched&&ts2.player.vy===-4224&&ts2.player.vz===16384,'directional spring failed');
  for(const id of [0,1,2])check(ts2.guideSparkles.points.some(p=>p.index===id&&p.spent),'guide missing '+id);
  check(['38','3b','1c'].every(id=>heard.has(id)),'structure sounds missing '+JSON.stringify([...heard]));
  ts2.openMenu();const frozen=JSON.stringify(s);ts2.tickGame({},100);check(JSON.stringify(s)===frozen,'paused structure changed');ts2.pressMenu('back');tick();
  await ts2.spawnPlayer();ts2.viewer.stop();s=ts2.neighborhoodStructure;check(s.phase===0&&s.supports.every(n=>n===4096)&&s.launcher===0,'restart retained puzzle');
  await leave();check(ts2.neighborhoodStructure===null,'structure survived exit');
  console.log('PASS Neighborhood real support stomps, collapse/near-far art, actual delayed directional spring, guides/audio, pause/restart/exit');
})()
