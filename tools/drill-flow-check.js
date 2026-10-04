/** Browser regression: Construction Yard jackhammer.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/drill.png --eval-file tools/drill-flow-check.js
 * Reads the supplied install; only the disposable browser's save is affected.
 * Positions/protects Buzz and injects hits; attack wordcode runs normally; not a full playthrough.
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
  const level=4;await enter(level);await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.goToPickupKind('Kind7'),'disk pickup missing');ts2.tickGame({},2,0);check(ts2.effects.diskAmmo>0,'disk pickup not collected');
  const boss=()=>ts2.creatures.find(c=>c.slot===24),token=()=>ts2.pickups.tokenItems.find(c=>c.slot===4);
  ts2.goToCreature(24);
  for(let i=0;i<300&&!ts2.talk;i++){ts2.player.hitStun=1000;ts2.tickGame({},1,0);}
  check(ts2.talk&&ts2.tasks.boss===1,'drill taunt failed '+JSON.stringify({zones:ts2.zones,boss:boss(),player:ts2.player}));
  for(let i=0;i<2000&&ts2.talk;i++)ts2.tickGame({jump:(i&1)===0},1,0);
  ts2.tickGame({},1,0);check(ts2.tasks.boss===2,'drill did not wake');check(!token().enabled,'early drill reward');
  const position=(protect=true)=>{const c=boss();ts2.setPlayerPos(c.x+16000,c.z,c.y);ts2.player.hitStun=protect?1000:0;};
  let debris=false;
  for(let i=0;i<300&&!debris;i++){position();ts2.tickGame({},1,0);debris=ts2.effects.activeKinds.includes(84);}
  check(debris,'drill debris absent');check(boss().vulnerable===4,'drill exposed before disk');
  const health=boss().health;ts2.hurtCreature(24,2);check(boss().health===health,'spin bypassed disk rule');
  let exposed=false;
  const ammo=ts2.effects.diskAmmo;ts2.player.laser=0;
  for(let i=0;i<60&&!exposed;i++){
    position(false);ts2.player.fallTimer=0;ts2.tickGame({fire:ts2.effects.diskAmmo===ammo},1,0);
    exposed=boss().vulnerable===5&&ts2.effects.disks.length>0;
  }
  check(exposed&&ts2.effects.diskAmmo<ammo,'real disk did not expose drill '+JSON.stringify({boss:boss(),effects:ts2.effects,player:ts2.player}));
  ts2.hurtCreature(24,2);check(boss().health<health,'spin failed while disk active');
  let flashed=false;
  for(let i=0;i<200;i++){
    position();ts2.tickGame({},1,0);
    if(ts2.tasks.drill.flash){const mesh=ts2.viewer.creatureMeshes.get(24);check(mesh.material[0].color.r===2&&mesh.scale.x===1,'drill flash not drawn');flashed=true;}
  }
  check(flashed,'drill never flashed');check(boss().vulnerable===4&&!ts2.effects.disks.length,'protection not restored when disk expired');
  ts2.openMenu();const frozen=JSON.stringify(ts2.tasks.drill);ts2.tickGame({},100,0);check(JSON.stringify(ts2.tasks.drill)===frozen,'paused drill advanced');ts2.pressMenu('back');ts2.tickGame({},1,0);
  // Inject the remaining damage to isolate defeat/reward from player skill.
  for(let hit=0;hit<20&&boss().type!==0;hit++){position();ts2.hurtCreature(24,4);ts2.tickGame({},2,0);}
  check(ts2.tasks.boss>2&&!token().enabled,'drill removal/reward delay failed');
  ts2.tickGame({},120,0);check(token().enabled&&(ts2.tasks.done&16),'drill token missing');
  ts2.tickGame({},260,0);
  for(let i=0;i<10&&!(ts2.pickups.tokens&16);i++){const t=token();ts2.setPlayerPos(t.x*32,t.z*32,t.y*32);ts2.tickGame({},1,0);}
  check((ts2.pickups.tokens&16)&&(ts2.save.tokens[level]&16),'drill token collection/save failed');
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.tasks.boss===0&&ts2.tasks.drill.hurt===0&&boss().health===30&&!token().enabled,'drill state survived restart');
  check(!ts2.effects.kinds.includes(84),'debris survived restart');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.tasks===null&&ts2.effects===null,'drill combat leaked after exit');
  console.log('PASS drill natural intro/debris, collected/fired disk and spin window, flash, injected defeat/reward/save and lifecycle');
})()
