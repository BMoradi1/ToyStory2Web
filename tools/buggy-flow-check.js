/** Browser regression: Space Land buggy.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/buggy.png --eval-file tools/buggy-flow-check.js
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
  const level=8;await enter(level);await ts2.spawnPlayer();ts2.viewer.stop();
  const boss=()=>ts2.creatures.find(c=>c.slot===40),token=()=>ts2.pickups.tokenItems.find(c=>c.slot===4);
  ts2.goToCreature(40);
  for(let i=0;i<300&&!ts2.talk;i++){ts2.player.hitStun=1000;ts2.tickGame({},1,0);}
  check(ts2.talk&&ts2.tasks.boss===1,'buggy taunt failed '+JSON.stringify({zones:ts2.zones,boss:boss(),player:ts2.player}));
  for(let i=0;i<2000&&ts2.talk;i++)ts2.tickGame({jump:(i&1)===0},1,0);
  ts2.tickGame({},1,0);check(ts2.tasks.boss===2,'buggy did not wake');check(!token().enabled,'early buggy reward');
  const position=()=>{const c=boss();ts2.setPlayerPos(c.x+16000,c.z,0);ts2.player.hitStun=1000;};
  check(!ts2.spaceBuggyModel.active,'projectile model starts active');
  const hidden=JSON.stringify(ts2.spaceBuggyModel.position);
  let dropped=false,laser=false,model=false;
  for(let i=0;i<1200&&!(dropped&&laser&&model);i++){
    position();ts2.tickGame({},1,0);
    dropped ||= ts2.effects.activeKinds.includes(114);
    const m=ts2.spaceBuggyModel;
    if(m.active){
      const [angles,offset]=ts2.viewer.objectTransforms.get(m.index).split('|');
      check(angles===m.angles.join(','),'projectile model orientation missing');
      const p=offset.split(',').map(Number),delta=[m.position.x-m.rest.x,-(m.position.y-m.rest.y),-(m.position.z-m.rest.z)];
      check(p.every((n,i)=>Math.abs(n*8192-delta[i])<1),'projectile model position missing');model=true;
    }
    laser ||= ts2.effects.beams.some(b=>b.life>0&&b.colour[0]===1&&b.colour[1]===0);
  }
  check(dropped&&laser&&model,'natural buggy attacks/model absent '+JSON.stringify({dropped,laser,boss:boss(),zones:ts2.zones,buggy:ts2.tasks.buggy}));
  ts2.openMenu();const frozen=JSON.stringify(ts2.tasks.buggy);ts2.tickGame({},100,0);check(JSON.stringify(ts2.tasks.buggy)===frozen,'paused buggy advanced');ts2.pressMenu('back');ts2.tickGame({},1,0);
  let flashed=false;
  for(let hit=0;hit<10;hit++){
    position();ts2.hurtCreature(40,4);ts2.tickGame({},1,0);
    if(hit<9){
      check(boss().vulnerable===4,'buggy recovery protection absent');
      for(let i=0;i<61;i++){
        position();ts2.tickGame({},1,0);
        if(ts2.tasks.buggy.flash){const mesh=ts2.viewer.creatureMeshes.get(40);check(mesh.material[0].color.r===2&&mesh.scale.x===1,'buggy flash not drawn');flashed=true;}
      }
      check(boss().vulnerable===7,'buggy recovery did not finish');
    }
  }
  check(flashed,'buggy never flashed');check(ts2.tasks.buggy.defeated&&ts2.tasks.boss===3,'nine-health defeat absent');
  check(boss().health===9&&!(boss().flags&256)&&boss().vulnerable===4,'defeated buggy still dangerous');
  check(ts2.effects.pointLights.some(l=>l.owner===0x52c840+40*0x9c&&l.life>0),'defeat burst light absent');
  check(!token().enabled,'reward delay skipped');
  ts2.tickGame({},120,0);check(token().enabled&&(ts2.tasks.done&16),'buggy token missing');
  check(boss().type===47,'buggy was removed rather than collapsing');
  ts2.tickGame({},260,0);
  for(let i=0;i<10&&!(ts2.pickups.tokens&16);i++){const t=token();ts2.setPlayerPos(t.x*32,t.z*32,t.y*32);ts2.tickGame({},1,0);}
  check((ts2.pickups.tokens&16)&&(ts2.save.tokens[level]&16),'buggy token collection/save failed');
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.tasks.boss===0&&!ts2.tasks.buggy.defeated&&ts2.tasks.buggy.hurt===0&&boss().health===29&&!token().enabled,'buggy state survived restart');
  check(!ts2.effects.kinds.includes(114),'hazard survived restart');
  check(!ts2.spaceBuggyModel.active&&JSON.stringify(ts2.spaceBuggyModel.position)===hidden,'projectile model survived restart');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.tasks===null&&ts2.effects===null,'buggy combat leaked after exit');
  console.log('PASS buggy natural intro/laser/dropped hazard/model, injected-hit recovery/flash, nine-health collapse/light, delayed token/save, pause/restart/exit');
})()
