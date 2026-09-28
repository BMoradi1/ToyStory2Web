/** Browser-harness regression: Slinky’s Tarmac timed path.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/tarmac-path.png --eval-file tools/tarmac-path-flow-check.js
 * Reads the supplied install; only the disposable browser's save is affected.
 * Positions Buzz for focused task and collision checks; this is not a full playthrough.
 */
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
  ts2.save.tokens.fill(31);
  ts2.frontDrive(0, 40); ts2.frontDrive(0x4000); ts2.frontDrive(0, 30);
  await wait(() => ts2.front.screen === 'menu', 'menu did not open');
  ts2.frontDrive(0, 40); ts2.frontDrive(0x4000); ts2.frontDrive(0, 30);
  await wait(() => ts2.front.screen === 'select', 'selector did not open');
  async function enter() {
    ts2.frontDrive(0,70);
    while(ts2.front.state.pos<14){ts2.frontDrive(0x20);ts2.frontDrive(0);}
    while(ts2.front.state.pos>14){ts2.frontDrive(0x80);ts2.frontDrive(0);}
    ts2.frontDrive(0x4000);ts2.frontDrive(0,40);
    for(let i=0;i<500&&!ts2.front.inLevel;i++) {
      if(ts2.cutsceneUp){window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));}
      await pause(100);
    }
    await wait(()=>ts2.front.inLevel,'Tarmac failed to start');
    ts2.viewer.stop();
  }
  await enter();
  await ts2.spawnPlayer();
  ts2.viewer.stop();
  const check=(ok,message)=>{if(!ok)throw Error(message);};

  const token=()=>ts2.pickups.tokenItems.find(i=>i.slot===2);
  async function offer() {
    ts2.goToCreature(38);
    for(let i=0;i<100&&!ts2.talk;i++)ts2.tickGame({},1,0);
    check(ts2.talk&&ts2.tasks.pathRun===1,'Slinky offer did not open: '+JSON.stringify(ts2.tasks));
    check(ts2.sound.raised.some(s=>s.startsWith('b6:')),'acceptance sound missing');
    const before=ts2.tasks.pathClock;
    ts2.tickGame({},100,0);
    check(ts2.tasks.pathRun===1&&ts2.tasks.pathClock===before,'clock ran under dialogue');
    for(let i=0;i<2000&&ts2.talk;i++) {
      if(i%30===0){window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter'}));}
      ts2.tickGame({},1,0);
    }
    check(!ts2.talk&&token().enabled,'dialogue did not reveal token');
    ts2.tickGame({},1,0);
    check(ts2.tasks.pathRun===2,'run failed at start: '+JSON.stringify({tasks:ts2.tasks,p:ts2.player}));
    check(ts2.tasks.pathClock>=169,'wrong countdown');
    ts2.tickGame({},180,0);
    check(ts2.tasks.pathRun===2&&!ts2.cut.noControl,'run failed during reveal: '+JSON.stringify(ts2.tasks));
  }
  check(!token().enabled,'token started visible');
  await offer();
  ts2.openMenu();const clock=ts2.tasks.pathClock;ts2.tickGame({},130);
  check(ts2.tasks.pathClock===clock,'pause advanced clock');
  ts2.pressMenu('back');ts2.tickGame({},1);
  ts2.tickGame({jump:true},1,0);
  check(ts2.tasks.pathRun===0&&!token().enabled,'actual jump did not withdraw reward');
  check((ts2.tasks.done&4)===0&&ts2.tokenReveals.timers[2]===0,'failed reward retained done/reveal');
  ts2.tickGame({},120,0);
  await offer();
  // Stay at the authored start, then let the full countdown expire.
  ts2.tickGame({},71*64,0);
  check(ts2.tasks.pathRun===0&&!token().enabled,'timeout failed to withdraw reward');
  await offer();
  // Land on an actual authored slime triangle, without injecting its surface flag.
  const file=[...document.querySelector('#pickfile').files].find(f=>f.webkitRelativePath.toLowerCase().endsWith('/data/level04/terr1.all'));
  const {parseAll}=await import('/src/formats/all.ts');
  const {parseCollision,buildCollisionWorld}=await import('/src/formats/collision.ts');
  const {standingSurface}=await import('/src/sim/stomp-props.ts');
  const world=buildCollisionWorld(parseCollision(parseAll(await file.arrayBuffer())).groups);
  const group=world.groups.find(g=>g.surface===0);
  const vertices=world.polys[group.polys.find(i=>world.polys[i].normal.y<-.99)].vertices;
  const centre=vertices.reduce((s,v)=>({x:s.x+v.x/vertices.length,y:s.y+v.y/vertices.length,z:s.z+v.z/vertices.length}),{x:0,y:0,z:0});
  Object.assign(ts2.player,{x:centre.x*32,y:centre.y*32+192,z:centre.z*32,vx:0,vy:0,vz:0,
    jumpState:0,onGround:true,contacts:[],coyote:0,climb:0,pole:-1,zipLine:-1});
  ts2.tickGame({},1,0);
  check(standingSurface(ts2.player,world)===0&&ts2.player.jumpState===0,'did not touch actual slime');
  check(ts2.tasks.pathRun===0&&!token().enabled,'slime did not withdraw reward');
  await offer();
  const t=token();
  Object.assign(ts2.player,{x:t.x*32,y:(t.y+230)*32,z:t.z*32,vx:0,vy:0,vz:0,
    jumpState:0,onGround:true,contacts:[],coyote:0,climb:0,pole:-1,zipLine:-1});
  ts2.tickGame({},1,0);
  check(token().collected&&(ts2.pickups.tokens&4)!==0,'active reward could not be collected');
  ts2.pressMenu('select');ts2.tickGame({},1,0);ts2.tickGame({},2,0);
  check(ts2.tasks.pathRun===0,'collected reward left timer running');
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.tasks.pathRun===0&&ts2.tasks.pathClock===100&&!token().enabled,'restart retained challenge');
  ts2.openMenu();
  for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector did not return');
  check(ts2.tasks===null,'task state leaked into selector');
  console.log('PASS: actual Slinky contact/dialogue, delayed timer, pause, jump/slime failures, timeout, retry/reveal, token collection, sound, restart and exit');
})()
