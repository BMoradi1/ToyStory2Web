/** Browser regression: Alleys boats and rooftop clown.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/alley-combat.png --eval-file tools/alley-combat-flow-check.js
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
  const level=5;await enter(level);await ts2.spawnPlayer();ts2.viewer.stop();
  for(const boat of ts2.creatures.filter(c=>c.type===27)){
    let fired=false;
    for(let i=0;i<450&&!fired;i++){
      const c=ts2.creatures.find(c=>c.slot===boat.slot);
      ts2.setPlayerPos(c.x+12000,c.z,c.y);ts2.player.hitStun=1000;ts2.tickGame({},1,0);
      if(ts2.talk){for(let j=0;j<2000&&ts2.talk;j++)ts2.tickGame({jump:(j&1)===0},1,0);}
      fired=ts2.effects.activeKinds.includes(92);
    }
    check(fired,'boat never fired '+boat.slot);
  }
  console.log('PASS all four boat cannon emitters');
  const boss=()=>ts2.creatures.find(c=>c.slot===3),token=()=>ts2.pickups.tokenItems.find(c=>c.slot===4);
  ts2.goToCreature(3);
  for(let i=0;i<300&&!ts2.talk;i++){ts2.player.hitStun=1000;ts2.tickGame({},1,0);}
  check(ts2.talk&&ts2.tasks.boss===1,'clown taunt failed '+JSON.stringify({zones:ts2.zones,boss:boss(),player:ts2.player}));
  for(let i=0;i<2000&&ts2.talk;i++)ts2.tickGame({jump:(i&1)===0},1,0);
  ts2.tickGame({},1,0);check(ts2.tasks.boss===2,'clown did not wake');check(!token().enabled,'early clown reward');
  const position=()=>{const c=boss();ts2.setPlayerPos(c.x+16000,c.z,c.y);ts2.player.hitStun=1000;};
  const start=boss();let moved=false;
  for(let i=0;i<250;i++){position();ts2.tickGame({},1,0);moved||=Math.hypot(boss().x-start.x,boss().z-start.z)>1000;}
  check(moved,'authored clown attack movement absent');
  ts2.openMenu();const frozen=JSON.stringify(ts2.tasks.clown);ts2.tickGame({},100,0);check(JSON.stringify(ts2.tasks.clown)===frozen,'paused clown advanced');ts2.pressMenu('back');ts2.tickGame({},1,0);
  let flashed=false;
  for(let hit=0;hit<10;hit++){
    position();ts2.hurtCreature(3,4);ts2.tickGame({},1,0);
    if(hit<9){
      check(boss().vulnerable===4,'clown recovery protection absent '+JSON.stringify({hit,boss:boss(),state:ts2.tasks.clown,phase:ts2.tasks.boss,player:ts2.player,cut:ts2.cut,talk:ts2.talk}));
      for(let i=0;i<61;i++){
        position();ts2.tickGame({},1,0);
        if(ts2.tasks.clown.flash){const mesh=ts2.viewer.creatureMeshes.get(3);check(mesh.material[0].color.r===2&&mesh.scale.x===1,'clown flash not drawn');flashed=true;}
      }
      check(boss().vulnerable===7,'clown recovery did not finish');
    }
  }
  check(flashed,'clown never flashed');
  for(let i=0;i<10&&ts2.tasks.boss===2;i++)ts2.tickGame({},1,0);
  check(ts2.tasks.boss>2&&!token().enabled,'clown removal/reward delay failed');
  ts2.tickGame({},120,0);check(token().enabled&&(ts2.tasks.done&16),'clown token missing');
  ts2.tickGame({},260,0);
  for(let i=0;i<10&&!(ts2.pickups.tokens&16);i++){const t=token();ts2.setPlayerPos(t.x*32,t.z*32,t.y*32);ts2.tickGame({},1,0);}
  check((ts2.pickups.tokens&16)&&(ts2.save.tokens[level]&16),'clown token collection/save failed');
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.tasks.boss===0&&ts2.tasks.clown.hurt===0&&boss().health===20&&!token().enabled,'clown state survived restart');
  check(!ts2.effects.kinds.includes(92),'shells survived restart');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.tasks===null&&ts2.effects===null,'combat leaked after exit');
  console.log('PASS clown natural intro/attack, injected-hit recovery/flash, defeat/reward/save and lifecycle');
})()
