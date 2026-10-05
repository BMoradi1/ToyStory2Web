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
  async function leave(){
    ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
    ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
    await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
    if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
    await wait(()=>ts2.front.screen==='select','selector missing');
  }
  await enter(5);await ts2.spawnPlayer();ts2.viewer.stop();
  const initial=ts2.alleyPlatforms.movers.map(m=>({...m.position}));
  for(let t=0;t<6000;t++){
    ts2.setPlayerPos(0,0,-2000000);Object.assign(ts2.player,{vy:0,fallTimer:0,hitStun:1000});ts2.tickGame({},1,0);
    if(t%100===0)for(const m of ts2.alleyPlatforms.movers)for(const o of m.objects){
      const transform=ts2.viewer.objectTransforms.get(o.index);check(transform,'missing platform artwork');
      const offset=transform.split('|')[1].split(',').map(Number);
      for(const [i,a] of ['x','y','z'].entries())check(Math.abs(offset[i]-(((m.position[a]>>5)*32-o.rest[a])/8192)*(i?-1:1))<1e-6,'platform artwork drift');
    }
  }
  check(ts2.alleyPlatforms.movers.every(m=>m.wraps>0),'incomplete platform path cycle');
  ts2.openMenu();const before=JSON.stringify(ts2.alleyPlatforms.movers.map(m=>[m.position,m.phase]));ts2.tickGame({},120);
  check(before===JSON.stringify(ts2.alleyPlatforms.movers.map(m=>[m.position,m.phase])),'platforms moved during pause');
  ts2.pressMenu('back');ts2.tickGame({},1);
  await ts2.spawnPlayer();ts2.viewer.stop();check(JSON.stringify(initial)===JSON.stringify(ts2.alleyPlatforms.movers.map(m=>m.position)),'restart left displaced platforms');
  await leave();check(ts2.alleyPlatforms===null,'controller survived exit');
  await enter(5);await ts2.spawnPlayer();ts2.viewer.stop();check(JSON.stringify(initial)===JSON.stringify(ts2.alleyPlatforms.movers.map(m=>m.position)),'reentry did not restore platforms');
  console.log('PASS eight Alley platform paths, 12 artwork transforms, full cycles, pause, restart, exit and reentry');
})()
