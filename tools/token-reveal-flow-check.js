/** Browser regression: earned-token reveal timing and reset.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/token-reveal.png --eval-file tools/token-reveal-flow-check.js
 * Reads the supplied install; only the disposable browser's save is affected.
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
  ts2.frontDrive(0, 40); ts2.frontDrive(0x4000); ts2.frontDrive(0, 30);
  await wait(() => ts2.front.screen === 'menu', 'menu did not open');
  ts2.frontDrive(0, 40); ts2.frontDrive(0x4000); ts2.frontDrive(0, 30);
  await wait(() => ts2.front.screen === 'select' , 'selector did not open');
  ts2.frontDrive(0, 70);
  while (ts2.front.state.pos > 1) { ts2.frontDrive(0x80); ts2.frontDrive(0); }
  ts2.frontDrive(0x4000); ts2.frontDrive(0, 40);
  for (let i=0; i<500 && !ts2.front.inLevel; i++) {
    if (ts2.cutsceneUp) {
      window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
      window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));
    }
    await pause(100);
  }
  await wait(() => ts2.front.inLevel, 'level did not start');
  ts2.viewer.stop();
  const base=ts2.tokenReveals;
  if(base.timers.some(t=>t!==0))throw Error('startup reveal was animated');
  const file=[...document.querySelector('#pickfile').files].find(f=>f.webkitRelativePath.endsWith('/data/level01/level.dat'));
  const {parseDat}=await import('/src/formats/dat.ts');
  const {createPickups}=await import('/src/sim/pickups.ts');
  const token=createPickups(parseDat(await file.arrayBuffer()),1).items.find(i=>i.tokenSlot===0);
  const advance=n=>{for(let i=0;i<n;i++){
    ts2.player.x=token.x*32;ts2.player.y=token.y*32;ts2.player.z=token.z*32+30000;
    ts2.player.hitStun=1000;ts2.tickGame({},1);
  }};
  ts2.revealToken(0);
  if(ts2.cut.ticks!==180||!ts2.cut.noControl)throw Error('token reveal camera missing');
  if(ts2.cut.look.x!==token.x*32||ts2.cut.look.y!==token.y*32||ts2.cut.look.z!==token.z*32)throw Error('camera not targeting token');
  if(ts2.tokenReveals.timers[0]!==132||ts2.tokenReveals.scales[0]!==0)throw Error('reveal did not start hidden');
  advance(31);
  if(ts2.tokenReveals.timers[0]!==101||ts2.effects.kinds.includes(0x2b))throw Error('early reveal particles');
  advance(1);
  if(ts2.tokenReveals.timers[0]!==100)throw Error('reveal burst timer');
  if(ts2.effects.kinds.filter(k=>k===0x2b).length!==16)throw Error('missing reveal ring');
  console.log('TOKEN REVEAL TIMING PASS',JSON.stringify(ts2.tokenReveals));
  const frozen=JSON.stringify(ts2.tokenReveals);
  const frozenCut=ts2.cut.ticks;
  for(let i=0;i<5;i++)ts2.redrawHud();
  if(JSON.stringify(ts2.tokenReveals)!==frozen)throw Error('drawing advances reveal');
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
  window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));
  ts2.tickGame({},10);
  if(JSON.stringify(ts2.tokenReveals)!==frozen)throw Error('pause advances reveal');
  if(ts2.cut.ticks!==frozenCut)throw Error('pause advances reveal cut');
  ts2.pressMenu('select');ts2.tickGame({},1);
  advance(140);
  if(ts2.tokenReveals.timers[0]!==0)throw Error('reveal never finished');
  advance(80);
  if(ts2.cut.ticks!==0||ts2.cut.noControl||ts2.cut.blend!==0)throw Error('camera failed to return to follow');
  console.log('TOKEN REVEAL CAMERA RETURN PASS');
  const savedTokens=ts2.save.tokens[1];
  ts2.save.tokens[1]=savedTokens|1;
  advance(60);
  if(ts2.effects.kinds.includes(0x29))throw Error('saved token emitted idle sparkles');
  ts2.save.tokens[1]=savedTokens&~1;
  let idleSeen=false;
  for(let i=0;i<16;i++){advance(1);if(ts2.effects.kinds.includes(0x29)){idleSeen=true;break;}}
  if(!idleSeen)throw Error('idle token sparkles missing '+JSON.stringify({token,camera:ts2.viewer.camera.position,player:ts2.player,pickups:ts2.pickups}));
  const idle=JSON.stringify(ts2.effects.kinds);
  for(let i=0;i<5;i++)ts2.redrawHud();
  if(JSON.stringify(ts2.effects.kinds)!==idle)throw Error('drawing changes idle sparkles');
  ts2.save.tokens[1]=savedTokens;
  console.log('IDLE TOKEN SPARKLES/SAVED SUPPRESSION PASS');

  ts2.revealToken(0);if(ts2.tokenReveals.timers[0]!==0)throw Error('repeated reveal restarted');
  await ts2.spawnPlayer();ts2.viewer.stop();
  if(ts2.tokenReveals.timers.some(t=>t!==0))throw Error('reveal survived reset');
  console.log('TOKEN REVEAL PAUSE/FINISH/RESET PASS');
})();
