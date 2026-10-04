/** Browser regression: Neighborhood mower and kite.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/neighborhood.png --eval-file tools/neighborhood-flow-check.js
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
  const level=2;await enter(level);await ts2.spawnPlayer();ts2.viewer.stop();
  const {sin,toRadians}=await import('/src/sim/trig.ts');
  const mower=()=>ts2.creatures.find(c=>c.type===12);let grass=false,marks=false;
  for(let i=0;i<400&&!(grass&&marks);i++){
    const c=mower();ts2.setPlayerPos(c.x+8000,c.z,c.y);ts2.player.hitStun=1000;ts2.tickGame({},1,0);
    if(ts2.talk){for(let j=0;j<2000&&ts2.talk;j++)ts2.tickGame({jump:(j&1)===0},1,0);}
    grass||=ts2.effects.activeKinds.includes(50);marks||=ts2.effects.activeKinds.includes(49);
  }
  check(grass&&marks&&ts2.sound.raised.some(s=>s.startsWith('4b:')),'mower particles/sound missing');
  const boss=()=>ts2.creatures.find(c=>c.slot===26),token=()=>ts2.pickups.tokenItems.find(c=>c.slot===4);
  ts2.setPlayerPos(180000,240000,-520000);
  for(let i=0;i<300&&!ts2.talk;i++){ts2.player.hitStun=1000;ts2.tickGame({},1,0);}
  check(ts2.talk&&ts2.tasks.boss===1,'kite taunt failed '+JSON.stringify({zones:ts2.zones,boss:boss(),player:ts2.player}));
  for(let i=0;i<2000&&ts2.talk;i++)ts2.tickGame({jump:(i&1)===0},1,0);
  ts2.tickGame({},1,0);check(ts2.tasks.boss===2,'kite did not wake');check(!token().enabled,'early kite reward');
  const position=()=>{ts2.setPlayerPos(180000,240000,-480000);ts2.player.hitStun=1000;};
  let rolled=false,moved=false;const start=boss();
  for(let i=0;i<240;i++){
    position();ts2.tickGame({},1,0);
    const angle=-toRadians(sin(ts2.tasks.kite.roll)>>6),mesh=ts2.viewer.creatureMeshes.get(26);
    check(Math.abs(mesh.rotation.z-angle)<1e-8,'kite roll not drawn');rolled||=Math.abs(angle)>0.1;moved||=Math.hypot(boss().x-start.x,boss().z-start.z)>1000;
  }
  check(rolled&&moved,'kite movement/roll absent');
  ts2.openMenu();const frozen=JSON.stringify(ts2.tasks.kite);ts2.tickGame({},100,0);check(JSON.stringify(ts2.tasks.kite)===frozen,'paused kite advanced');ts2.pressMenu('back');ts2.tickGame({},1,0);
  let flashed=false;
  for(let hit=0;hit<5;hit++){
    position();ts2.hurtCreature(26,4);ts2.tickGame({},1,0);
    if(hit<4)for(let i=0;i<61;i++){
      position();ts2.tickGame({},1,0);
      if(ts2.tasks.kite.flash){const mesh=ts2.viewer.creatureMeshes.get(26);check(mesh.material[0].color.r===2,'kite flash not drawn');flashed=true;}
    }
  }
  check(flashed,'kite never flashed');
  let tail=false;for(let i=0;i<120;i++){position();ts2.tickGame({},1,0);tail||=ts2.effects.activeKinds.includes(58);}
  check(tail,'falling kite tail particles missing');check(token().enabled&&(ts2.tasks.done&16),'kite token missing');
  ts2.tickGame({},260,0);
  for(let i=0;i<10&&!(ts2.pickups.tokens&16);i++){const t=token();ts2.setPlayerPos(t.x*32,t.z*32,t.y*32);ts2.tickGame({},1,0);}
  check((ts2.pickups.tokens&16)&&(ts2.save.tokens[level]&16),'kite token collection/save failed');
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.tasks.boss===0&&ts2.tasks.kite.hurt===0&&boss().health===10&&!token().enabled,'kite state survived restart');
  check(!ts2.effects.kinds.some(k=>[49,50,58].includes(k)),'Neighborhood particles survived restart');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.tasks===null&&ts2.effects===null,'Neighborhood state leaked after exit');
  console.log('PASS mower particles/sound, kite natural intro/movement/roll, injected-hit flash/defeat, tail particles/token/save, pause/restart/exit');
})()
