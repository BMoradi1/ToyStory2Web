/** Browser-harness regression: every life lost -> game over -> boot/title.
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
  const startingLives = ts2.pickups.lives;
  const tokens = ts2.save.tokens.slice();
  for (let life = startingLives; life >= 0; life--) {
    for (let hit = 0; hit < 15; hit++) ts2.hurtPlayer();
    if (!ts2.player.dying) throw new Error('fatal damage did not start death');
    ts2.tickGame({}, 91);
    await pause(30);
    if (life > 0 && ts2.player.dying) throw new Error('remaining life did not respawn');
  }
  await wait(() => ts2.front.screen === 'gameOver', 'game over did not open');
  ts2.frontDrive(0, 70);
  if (ts2.front.inLevel) throw new Error('gameplay remains active');
  const screen = ts2.front.screen;
  ts2.frontDrive(0x4000); ts2.frontDrive(0, 25);
  for (let i = 0; i < 150 && ts2.front.screen !== 'title'; i++) {
    window.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape'}));
    window.dispatchEvent(new KeyboardEvent('keyup', {key:'Escape'}));
    ts2.closeTitleCard(); await pause(100);
  }
  await wait(() => ts2.front.screen === 'title', 'title did not reopen');
  if (ts2.save.lives !== 5 || ts2.save.health !== 14) throw new Error('continue resources not restored');
  if (JSON.stringify(ts2.save.tokens) !== JSON.stringify(tokens)) throw new Error('tokens changed on game over');
  return {screen, returnedTo:ts2.front.screen, startingLives, lives:ts2.save.lives, health:ts2.save.health};
})()
