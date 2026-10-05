/** Space Land saucer: dialogue, deadline, retry and physical finish landing. */
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
  const saucer=()=>ts2.creatures.find(c=>c.slot===1),token=()=>ts2.pickups.tokenItems.find(i=>i.slot===2);
  const tick=()=>ts2.tickGame({},1,0);
  const offer=()=>{
    ts2.goToCreature(1);Object.assign(ts2.player,{vy:0,hitStun:0,fallTimer:0});
    for(let i=0;i<150&&!ts2.talk;i++)tick();
    check(ts2.talk&&ts2.tasks.saucer.phase===1,'saucer offer missing '+JSON.stringify({s:ts2.tasks.saucer,c:saucer(),p:ts2.player}));
    ts2.tickGame({},100,0);check(ts2.tasks.saucer.progress===0,'race advanced under dialogue');
    for(let i=0;i<2000&&ts2.talk;i++){
      if(i%30===0){window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter'}));}
      tick();
    }
    check(!ts2.talk,'offer did not close');tick();
    check(ts2.tasks.saucer.phase===2,'race failed at start '+JSON.stringify({s:ts2.tasks.saucer,p:ts2.player}));
  };
  check(!token().enabled,'race token starts hidden');await offer();
  ts2.openMenu();const frozen=JSON.stringify(ts2.tasks.saucer);ts2.tickGame({},100,0);
  check(JSON.stringify(ts2.tasks.saucer)===frozen,'paused saucer moved');ts2.pressMenu('back');tick();
  let ticks=0;const initial={...saucer()};
  while(ts2.tasks.saucer.phase===2&&ticks++<3000){
    const c=saucer();ts2.setPlayerPos(c.x+20000,c.z,c.y-20000);
    Object.assign(ts2.player,{vy:0,onGround:false,coyote:0,fallTimer:0});tick();
  }
  check(ticks>1000&&ticks<3000,'saucer deadline was not exercised '+JSON.stringify({ticks,s:ts2.tasks.saucer}));
  check(!token().enabled&&!(ts2.tasks.done&4),'losing revealed token');
  check(saucer().x!==initial.x,'saucer never moved');
  for(let i=0;i<40;i++){ts2.setPlayerPos(10000000,10000000,-2000000);ts2.player.fallTimer=0;tick();}
  check(ts2.tasks.saucer.phase===0&&saucer().health>0,'saucer did not respawn for retry');
  await offer();
  // Choose an actual authored floor inside the finish rectangle, then land on it.
  const file=[...document.querySelector('#pickfile').files].find(f=>f.webkitRelativePath.toLowerCase().endsWith('/data/level08/terrain.all'));
  const {parseAll}=await import('/src/formats/all.ts');
  const {parseCollision,buildCollisionWorld}=await import('/src/formats/collision.ts');
  const world=buildCollisionWorld(parseCollision(parseAll(await file.arrayBuffer())).groups);
  const candidates=world.polys.filter(p=>p.normal.y<-.99).map(p=>p.vertices.reduce((a,v)=>({x:a.x+v.x*32/p.vertices.length,y:a.y+v.y*32/p.vertices.length,z:a.z+v.z*32/p.vertices.length}),{x:0,y:0,z:0}));
  const floor=candidates.find(p=>p.x>-464000&&p.x<-397000&&p.z>80000&&p.z<99000&&p.y<-84000);
  check(floor,'no finish floor found');ts2.setPlayerPos(floor.x,floor.z,floor.y-20000);
  Object.assign(ts2.player,{vy:0,onGround:false,coyote:0,fallTimer:0,zipLine:-1,zipPhase:0,zipCooldown:60,pole:-1,climb:0,climbGroup:-1});
  for(let i=0;i<100&&!(ts2.tasks.done&4);i++)tick();
  check(ts2.tasks.saucer.phase===3&&token().enabled,'actual finish landing failed '+JSON.stringify({floor,p:ts2.player,s:ts2.tasks.saucer}));
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.tasks.saucer.phase===0&&ts2.tasks.saucer.progress===0&&!token().enabled,'restart retained race result');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.tasks===null,'saucer tasks leaked after exit');
  console.log('PASS Space Land saucer dialogue, full deadline/retry, real finish landing/reward, pause/restart/exit');
})()
