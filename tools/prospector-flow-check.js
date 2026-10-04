/** Browser-harness regression: Airport Prospector combat lifecycle (positions Buzz and injects hits).
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/prospector.png --eval-file tools/prospector-flow-check.js
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
  ts2.save.tokens.fill(31);ts2.save.tokens[13]&=~16;
  ts2.frontDrive(0, 40); ts2.frontDrive(0x4000); ts2.frontDrive(0, 30);
  await wait(() => ts2.front.screen === 'menu', 'menu did not open');
  ts2.frontDrive(0, 40); ts2.frontDrive(0x4000); ts2.frontDrive(0, 30);
  await wait(() => ts2.front.screen === 'select', 'selector did not open');
  async function enter() {
    ts2.frontDrive(0,70);
    while(ts2.front.state.pos<13){ts2.frontDrive(0x20);ts2.frontDrive(0);}
    while(ts2.front.state.pos>13){ts2.frontDrive(0x80);ts2.frontDrive(0);}
    ts2.frontDrive(0x4000);ts2.frontDrive(0,40);
    for(let i=0;i<500&&!ts2.front.inLevel;i++) {
      if(ts2.cutsceneUp){window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));}
      await pause(100);
    }
    await wait(()=>ts2.front.inLevel,'Airport failed to start');
    ts2.viewer.stop();
  }
  await enter();
  await ts2.spawnPlayer();
  ts2.viewer.stop();
  const check=(ok,message)=>{if(!ok)throw Error(message);};

  const prospector=()=>ts2.creatures.find(c=>c.slot===32);
  const token=()=>ts2.pickups.tokenItems.find(i=>i.slot===4);
  ts2.goToCreature(32);
  for(let i=0;i<100&&!ts2.talk;i++)ts2.tickGame({},1,0);
  check(ts2.talk&&ts2.tasks.boss===1,'taunt did not open');
  for(let i=0;i<2000&&ts2.talk;i++) {
    if(i%30===0){window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter'}));}
    ts2.tickGame({},1,0);
  }
  ts2.tickGame({},1,0);
  check(ts2.tasks.boss===2&&prospector().vulnerable===6,'fight did not open');
  check(!token().enabled,'reward visible before defeat');
  // Let the authored chase script reach the throw; only Buzz's position is
  // controlled. Do not seek the creature script or inject its animation.
  let throwing=false, released=false;
  for(let i=0;i<800&&!released;i++) {
    const c=prospector();
    Object.assign(ts2.player,{x:c.x+20000,y:c.y,z:c.z,vx:0,vy:0,vz:0});
    ts2.tickGame({},1,0);
    if(prospector().animState===3&&!throwing) {
      throwing=true;
      const frame=prospector().frame;
      ts2.openMenu();ts2.tickGame({},100,0);
      check(prospector().frame===frame&&!ts2.effects.kinds.includes(0x68),'pause advanced pending throw');
      ts2.pressMenu('back');
    }
    if(ts2.effects.kinds.includes(0x68)) {
      released=true;
      check(ts2.sound.raised.some(s=>s.startsWith('a6:')),'pick release sound missing');
    }
  }
  check(throwing&&released,'authored approach did not animate and release pick: '+JSON.stringify(prospector()));
  // Move Buzz away to isolate recovery and defeat from player-contact damage.
  Object.assign(ts2.player,{x:prospector().x+90000,z:prospector().z+90000});
  let flashSeen=false;
  for(let hit=0;hit<10;hit++) {
    ts2.hurtCreature(32,4);ts2.tickGame({},1,0);
    check(prospector().vulnerable===4,'hit failed to close vulnerability');
    if(ts2.tasks.prospector.flash){
      const mesh=ts2.viewer.creatureMeshes.get(32);
      check(mesh.material[0].color.r===2&&mesh.scale.x===1,'hit flash changed size or failed to brighten');
      flashSeen=true;
    }
    if(hit<9){ts2.tickGame({},60,0);check(prospector().vulnerable===6,'recovery did not reopen');}
  }
  check(flashSeen,'no visible hit flash observed');
  check(prospector().health===9&&ts2.tasks.boss>2,'defeat threshold missed');
  check(!token().enabled,'reward skipped defeat delay');
  ts2.tickGame({},120,0);
  check(token().enabled&&(ts2.tasks.done&16),'reward missing after defeat');
  ts2.tickGame({},260,0);
  for(let i=0;i<10&&!(ts2.pickups.tokens&16);i++){
    const reward=token();ts2.setPlayerPos(reward.x*32,reward.z*32,reward.y*32);ts2.tickGame({},1,0);
  }
  check((ts2.pickups.tokens&16)&&(ts2.save.tokens[13]&16),'boss token collection/save failed');
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.tasks.boss===0&&ts2.tasks.prospector.hurt===0&&prospector().health===29&&!token().enabled,'restart retained fight');
  check(!ts2.effects.kinds.includes(0x68),'restart retained pick');
  ts2.openMenu();
  for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector did not return');
  check(ts2.tasks===null,'fight leaked into selector');
  await enter();
  check(ts2.tasks.boss===0&&prospector().health===29&&!token().enabled,'re-entry retained fight');
  console.log('PASS: Prospector actual taunt/wake, injected hits, recovery, defeat/reward collection/save, hit flash, restart, exit and re-entry. Authored pick animation, projectile release and sound also checked.');
})()
