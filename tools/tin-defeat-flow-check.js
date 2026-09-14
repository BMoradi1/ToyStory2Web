/** Browser regression: authored Tin Robot defeat burst and light reset.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/tin-defeat.png --eval-file tools/tin-defeat-flow-check.js
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
  const robot=ts2.creatures.find(c=>c.type===5);
  if(!robot)throw Error('no authored Tin Robot');
  // The taunt-to-fight handoff is not ported; enter the authored fight script.
  if(!ts2.seekCreatureScript(robot.slot,10))throw Error('cannot enter fight script');
  const owner=0x52c840+robot.slot*0x9c;
  let flash;
  for(let i=0;i<3000;i++){
    const c=ts2.creatures.find(c=>c.slot===robot.slot);
    ts2.goToCreature(robot.slot);
    ts2.player.x+=4000;ts2.player.hitStun=1000;
    if(i>120 && !ts2.talk) {
      // Isolate the effect from the unfinished intro/fight controller.
      ts2.seekCreatureScript(robot.slot,40);
      if(c.health>=10)ts2.hurtCreature(robot.slot,5);
    }
    ts2.tickGame({jump:(i&1)===0},1);
    flash=ts2.effects.pointLights.find(l=>l.owner===owner&&l.r===240&&l.g===128&&l.life===31);
    if(flash)break;
  }
  if(!flash)throw Error('defeat flash missing '+JSON.stringify(ts2.creatures.find(c=>c.slot===robot.slot)));
  const c=ts2.creatures.find(c=>c.slot===robot.slot);
  if(flash.x!==c.x+c.offsetX||flash.y!==c.y+c.offsetY||flash.z!==c.z+c.offsetZ)throw Error('wrong defeat centre');
  if(ts2.effects.kinds.filter(k=>k===0x23).length!==5)throw Error('expected five defeat particles '+JSON.stringify(ts2.effects.kinds));
  const frozen=JSON.stringify(ts2.effects.pointLights);
  for(let i=0;i<5;i++)ts2.redrawHud();
  if(JSON.stringify(ts2.effects.pointLights)!==frozen)throw Error('drawing aged light');
  ts2.tickGame({},1);
  if(ts2.effects.pointLights.some(l=>l.owner===owner&&l.life===31))throw Error('defeat flash repeated');
  console.log('TIN DEFEAT BROWSER PASS',JSON.stringify(flash));
  await ts2.spawnPlayer();ts2.viewer.stop();
  if(ts2.effects.pointLights.some(l=>l.life))throw Error('defeat light survived reset');
  console.log('TIN DEFEAT RESET PASS');
})();
