/** Browser regression: Tin Robot intro, fight cycle, reward and reset.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/tin-defeat.png --eval-file tools/tin-defeat-flow-check.js
 * Reads the supplied install; only the disposable browser's save is affected.
 * Positions Buzz in the arena and injects charged-spin damage through the
 * damage harness. Never changes the robot's script, animation or health directly.
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
  const robot=ts2.creatures.find(c=>c.type===5);
  if(!robot)throw Error('no authored Tin Robot');
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const current = () => ts2.creatures.find(c => c.slot === robot.slot);
  const owner = 0x52c840 + robot.slot * 0x9c;
  const park = () => {
    ts2.setPlayerPos(robot.homeX + 30000, robot.homeZ, robot.homeY);
    // Keep contact damage from ending the automated run; damage to the boss
    // still passes through the real vulnerability gate and authored script.
    ts2.player.hitStun = 1000;
  };

  park();
  for (let i = 0; i < 10 && !ts2.talk; i++) ts2.tickGame({}, 1);
  check(ts2.talk && ts2.tasks.boss === 1, 'arena did not start the taunt');
  ts2.tickGame({}, 120);
  check(ts2.talk && ts2.tasks.boss === 1, 'fight started before dialogue was dismissed');
  check(current().animState === 0 && current().health === robot.health, 'intro changed combat state');
  for (let i = 0; i < 500 && ts2.talk; i++) ts2.tickGame({ jump: (i & 1) === 0 }, 1);
  check(!ts2.talk, 'taunt did not close');
  ts2.tickGame({}, 1);
  check(ts2.tasks.boss === 2 && !ts2.cut.noControl, 'dialogue did not hand control to the fight');
  ts2.player.hitStun = 0;
  const beforeMove = { x: ts2.player.x, z: ts2.player.z };
  ts2.tickGame({ moveY: 1 }, 12);
  check(ts2.player.x !== beforeMove.x || ts2.player.z !== beforeMove.z, 'player control stayed frozen');
  console.log('TIN INTRO / CONTROL PASS');

  const states = new Set();
  let flash = null, hits = 0, deathSeen = false;
  for (let i = 0; i < 3500 && !(ts2.tasks.done & 16); i++) {
    park();
    const c = current();
    states.add(c.animState);
    check(!ts2.talk, 'taunt repeated during the fight');
    check(c.vulnerable === (c.health >= 10 && [3, 5].includes(c.animState) ? 7 : 4), 'incorrect shell vulnerability');
    // Let the first full stomp cycle run before attacking. Closed shells must
    // reject the same charged-spin damage that will finish the encounter.
    if (c.animState === 2 && hits === 0) {
      check(ts2.hurtCreature(robot.slot, 3).health === c.health, 'closed shell accepted spin damage');
    }
    if (states.has(4) && c.vulnerable === 7 && c.stun === 0 && c.health >= 10) {
      check(ts2.hurtCreature(robot.slot, 3).health === c.health - 4, 'open shell rejected spin damage');
      hits++;
    }
    if (c.animState === 7) {
      deathSeen = true;
      if (c.frame <= 12) check(!(ts2.tasks.done & 16), 'token awarded before death frame 13');
    }
    ts2.tickGame({}, 1);
    const light = ts2.effects.pointLights.find(l => l.owner === owner && l.r === 240 && l.g === 128 && l.life === 31);
    if (light) {
      check(!flash, 'defeat flash repeated');
      flash = light;
      const dead = current();
      check(light.x === dead.x + dead.offsetX && light.y === dead.y + dead.offsetY && light.z === dead.z + dead.offsetZ,
        'wrong defeat centre');
      check(ts2.effects.kinds.filter(k => k === 0x23).length === 5, 'expected five defeat particles');
      const frozen = JSON.stringify(ts2.effects.pointLights);
      for (let j = 0; j < 5; j++) ts2.redrawHud();
      check(JSON.stringify(ts2.effects.pointLights) === frozen, 'drawing aged light');
    }
  }
  check([1, 2, 3, 4, 5, 6, 7].every(s => states.has(s)), 'fight skipped an authored animation state');
  check(hits === 3 && flash && deathSeen && (ts2.tasks.done & 16), 'fight did not complete');
  check(ts2.tokenReveals.timers[4] > 0 && ts2.cut.noControl, 'boss token did not start its reveal');
  for (let i = 0; i < 260; i++) { park(); ts2.tickGame({}, 1); }
  check(ts2.tokenReveals.timers[4] === 0 && !ts2.cut.noControl && ts2.cut.blend === 0, 'reward camera did not release control');

  // Locate this specific token from the supplied scene rather than collecting
  // whichever token the generic pickup helper happens to find first.
  const file = [...document.querySelector('#pickfile').files].find(f => f.webkitRelativePath.endsWith('/data/level01/level.dat'));
  const { parseDat } = await import('/src/formats/dat.ts');
  const { createPickups } = await import('/src/sim/pickups.ts');
  const token = createPickups(parseDat(await file.arrayBuffer()), 1).items.find(i => i.tokenSlot === 4);
  check(token, 'boss token missing from scene');
  for (let i = 0; i < 10 && !(ts2.pickups.tokens & 16); i++) {
    ts2.setPlayerPos(token.x * 32, token.z * 32, token.y * 32);
    ts2.tickGame({}, 1);
  }
  check(ts2.pickups.tokens & 16, 'revealed boss token could not be collected');
  check(ts2.save.tokens[1] & 16, 'boss token was not saved');
  console.log('TIN FIGHT / DEFEAT / TOKEN PASS', JSON.stringify({ hits, states: [...states], flash }));

  await ts2.spawnPlayer(); ts2.viewer.stop();
  check(!ts2.effects.pointLights.some(l => l.life), 'defeat light survived reset');
  check(ts2.tokenReveals.timers.every(t => t === 0) && !ts2.cut.noControl, 'reward cut survived reset');
  console.log('TIN RESET PASS');
})();
