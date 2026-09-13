/** Browser-harness regression: zip-line catch, ride animation, jump-off and lockout.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/zip-line.png --eval-file tools/zip-line-flow-check.js
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
  await wait(() => ts2.front.screen === 'select', 'selector did not open');
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
  const {createPlayer}=await import('/src/sim/player.ts');
  const line=ts2.zipLines[0];
  if(!line)throw Error('Level 1 zip lines missing');
  const reset=()=>{
    const t=0.1;
    Object.assign(ts2.player,createPlayer(line.start.x+(line.end.x-line.start.x)*t,
      line.start.y+(line.end.y-line.start.y)*t+0x3e00-3000,
      line.start.z+(line.end.z-line.start.z)*t,line.yaw));
  };
  reset();
  ts2.tickGame({},1,0);
  if(ts2.player.zipPhase!==1)throw Error('did not begin catching cable');
  ts2.tickGame({},60,0);
  if(ts2.player.zipPhase!==2 || ts2.player.zipSpeed!==48 || ts2.player.animPhase!==17)
    throw Error('did not ride/animate zip line');
  const riding={x:ts2.player.x,y:ts2.player.y,z:ts2.player.z,distance:ts2.player.zipDistance};
  ts2.tickGame({jump:true},1,0);
  if(ts2.player.zipLine!==-1 || ts2.player.zipCooldown!==30 || ts2.player.vy>=0)
    throw Error('zip-line jump-off failed');
  ts2.tickGame({},10,0);
  if(ts2.player.zipLine!==-1)throw Error('reattached during lockout');
  reset();ts2.tickGame({},70,0);
  if(ts2.player.zipPhase!==2)throw Error('second ride did not start');
  ts2.viewer.renderer.render(ts2.viewer.scene,ts2.viewer.camera);
  console.log('ZIP LINE BROWSER PASS',JSON.stringify({riding,phase:ts2.player.animPhase,line}));
})()
