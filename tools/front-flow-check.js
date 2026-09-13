/** Browser-harness regression: level -> summary -> clean selector.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/selector.png --eval-file tools/front-flow-check.js
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
  ts2.tickGame({}, 10);
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
  window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));
  await pause(100);
  // Pause menu: continue, camera, volume, exit; then confirm yes.
  for (let i=0; i<3; i++) { ts2.pressMenu('down'); ts2.tickGame({},1); }
  ts2.pressMenu('select'); ts2.tickGame({},1);
  ts2.pressMenu('down'); ts2.tickGame({},1);
  ts2.pressMenu('select'); ts2.tickGame({},1);
  await wait(() => ts2.front.screen === 'summary', 'summary did not open');
  ts2.frontDrive(0, 650);
  ts2.frontDrive(0x4000); ts2.frontDrive(0, 130);
  await wait(() => ts2.front.screen === 'select', 'did not return to selector');
  const before = { scene:ts2.front.scene, player:ts2.player, creatures:ts2.creatures, effects:ts2.effects };
  await pause(2000);
  const after = { scene:ts2.front.scene, player:ts2.player, creatures:ts2.creatures, effects:ts2.effects };
  if (ts2.player != null) throw new Error('previous player remains in selector');
  if (ts2.tickGame({},60) !== null) throw new Error('previous gameplay still ticks');
  return {screen:ts2.front.screen, before, after};
})()
