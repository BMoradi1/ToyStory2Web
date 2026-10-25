/** Browser-harness regression: Bombs Away biplane fight lifecycle (positions Buzz and injects damage).
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/bombs-away.png --eval-file tools/bombs-away-flow-check.js
 * Reads the supplied install; only the disposable browser's save is affected.
 * Positions and protects Buzz for focused checks; this is not a full playthrough.
 */
(async () => {
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const wait = async (test, message) => {
    for (let i = 0; i < 500; i++) { if (test()) return; await pause(100); }
    throw new Error(message + ': ' + JSON.stringify(ts2.front));
  };
  const escape = () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }));
  };
  for (let i = 0; i < 100 && !ts2.front.running; i++) { escape(); ts2.closeTitleCard(); await pause(100); }
  await wait(() => ts2.front.screen === 'title', 'title did not open');
  ts2.save.tokens.fill(31);
  ts2.frontDrive(0, 40); ts2.frontDrive(0x4000); ts2.frontDrive(0, 30);
  await wait(() => ts2.front.screen === 'menu', 'menu did not open');
  ts2.frontDrive(0, 40); ts2.frontDrive(0x4000); ts2.frontDrive(0, 30);
  await wait(() => ts2.front.screen === 'select', 'selector did not open');
  // Third in play order, internal level 6.
  async function enter() {
    ts2.frontDrive(0, 70);
    while (ts2.front.state.pos < 3) { ts2.frontDrive(0x20); ts2.frontDrive(0); }
    while (ts2.front.state.pos > 3) { ts2.frontDrive(0x80); ts2.frontDrive(0); }
    ts2.frontDrive(0x4000); ts2.frontDrive(0, 40);
    for (let i = 0; i < 500 && !ts2.front.inLevel; i++) { if (ts2.cutsceneUp) escape(); await pause(100); }
    await wait(() => ts2.front.inLevel, 'Bombs Away failed to start');
    ts2.viewer.stop();
    await ts2.spawnPlayer();
    ts2.viewer.stop();
  }
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const boss = () => ts2.creatures.find(c => c.slot === 0);
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { ts2.player.hitStun = 1000; ts2.tickGame({}, 1, 0); } };
  const raised = () => ts2.sound?.raised ?? [];

  await enter();
  check(boss()?.type === 48 && boss().health === 20, 'biplane placement missing');
  check(boss().heading === 0xc00 && ts2.tasks.bossPhase === 0, 'world-boss init missing');
  const startX = boss().x;

  async function begin() {
    // Walk Buzz in past the trigger; the entrance cut takes the controls.
    const p = ts2.player;
    Object.assign(p, { x: 0x31f9e - 0x4000, vx: 0, vy: 0, vz: 0 });
    tick();
    check(ts2.tasks.bossPhase === 1 && ts2.cut.noControl, 'entrance cut did not start');
    const x = boss().x, eyeY = ts2.cut.eye.y;
    ts2.openMenu(); tick(60);
    check(boss().x === x, 'pause advanced the entrance');
    ts2.pressMenu('back');
    tick(20);
    check(boss().x < x && ts2.cut.eye.y > eyeY, 'entrance did not fly in with a descending eye');
    tick(290);
    check(ts2.tasks.bossPhase === 2 && !ts2.cut.noControl, 'entrance did not hand back control: ' + JSON.stringify(ts2.tasks.bossPhase));
    check(boss().vulnerable === 7, 'fight shell closed');
  }
  await begin();

  // Chase with guns, then the 64-tick bomb with Buzz nearby.
  let bombs = false, strikes = false, gun = false;
  for (let i = 0; i < 400; i++) {
    const b = boss();
    Object.assign(ts2.player, { x: b.x + 0x2000, z: b.z, vx: 0, vz: 0 });
    tick();
    bombs ||= ts2.effects.kinds.includes(0xc);
    strikes ||= ts2.effects.kinds.includes(0x7b);
    gun ||= raised().some(s => s.startsWith('65:'));
  }
  check(gun, 'gunfire not raised');
  check(strikes, 'bullet strikes missing');
  check(bombs, 'no bomb dropped');

  // A surviving hit: closed shell, stun, flicker on the rendered model.
  ts2.hurtCreature(0, 4); tick();
  check(boss().health === 18 && boss().vulnerable === 4 && ts2.tasks.bossHurt > 0, 'hit stun missing: ' + JSON.stringify(boss()));
  const scales = new Set();
  for (let i = 0; i < 4; i++) { tick(); ts2.viewer.frame(ts2.viewer.lastTime); scales.add(ts2.viewer.creatureMeshes.get(0)?.scale.x); }
  check(scales.has(1) && scales.has(2), 'stun did not flicker the drawn model: ' + JSON.stringify([...scales]));
  tick(0x78);
  check(boss().vulnerable === 7 && ts2.tasks.bossFlash === 1, 'stun did not end');

  // Restart resets the encounter.
  await ts2.spawnPlayer(); ts2.viewer.stop();
  check(ts2.tasks.bossPhase === 0 && boss().health === 20 && boss().x === startX, 'restart retained the fight');
  await begin();

  // Five hits take it from 20 to 10: the death cut, the save bit, the kill.
  for (let i = 0; i < 5; i++) { ts2.hurtCreature(0, 4); tick(); if (i < 4) tick(0x7a); }
  check(boss().health === 10 && ts2.tasks.bossPhase === 3 && ts2.cut.noControl, 'death did not start');
  check((ts2.save.tokens[6] & 0x80) !== 0, 'boss save bit missing');
  const y = boss().y;
  tick(100);
  check(boss().y < y, 'it did not climb away');
  check(ts2.tasks.bossPhase === 3, 'won before the cut ended');
  tick(90);
  check(boss().deathTimer !== 0 || boss().type === 0, 'creature not ended under 120 ticks of the cut');
  tick(120);
  // The movie plays and the front end takes over.
  for (let i = 0; i < 500 && ts2.front.inLevel; i++) { if (ts2.cutsceneUp) escape(); await pause(50); }
  await wait(() => ['summary', 'select'].includes(ts2.front.screen), 'victory did not exit the level');
  if (ts2.front.screen === 'summary') { ts2.frontDrive(0, 650); ts2.frontDrive(0x4000); ts2.frontDrive(0, 130); }
  await wait(() => ts2.front.screen === 'select', 'selector did not return');
  check(ts2.tasks === null, 'boss tasks leaked after victory');

  // Replay is a fresh fight.
  await enter();
  check(ts2.tasks.bossPhase === 0 && boss().health === 20 && boss().type === 48, 'replay retained defeat');
  await begin();
  tick(60); ts2.viewer.frame(ts2.viewer.lastTime);
  console.log('PASS: Bombs Away biplane init, natural trigger/entrance cut/pause, guns/strikes/bombs, injected-hit stun and drawn flicker, restart, five-hit death climb/kill, save bit, movie/win handoff and replay. Buzz positioned and protected for focused checks.');
})()
