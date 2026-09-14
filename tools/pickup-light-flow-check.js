/** Browser regression: authored pickup burst and light reset.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/pickup-light.png --eval-file tools/pickup-light-flow-check.js
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
  const pickup=ts2.goToPickup();
  if(!pickup)throw Error('no authored pickup');
  const at={x:ts2.player.x,y:ts2.player.y,z:ts2.player.z};
  ts2.player.y+=7360;ts2.player.hitStun=1000;ts2.tickGame({},1);
  const light=ts2.effects.pointLights.find(l=>l.owner===at.x&&l.r===96&&l.g===64&&l.life===15);
  if(!light||light.x!==at.x||light.y!==at.y||light.z!==at.z)throw Error('pickup light missing '+JSON.stringify({at,lights:ts2.effects.pointLights}));
  if(!ts2.effects.kinds.includes(0x29))throw Error('pickup sparks missing');
  const selected=ts2.effects.lightTransition.selected;
  if(selected<0||ts2.effects.pointLights[selected].owner!==at.x)throw Error('pickup light not selected');
  const frozen=JSON.stringify(ts2.effects.pointLights);
  for(let i=0;i<5;i++)ts2.redrawHud();
  if(JSON.stringify(ts2.effects.pointLights)!==frozen)throw Error('drawing aged pickup light');
  console.log('PICKUP BURST BROWSER PASS',JSON.stringify(light));
  await ts2.spawnPlayer();ts2.viewer.stop();
  if(ts2.effects.pointLights.some(l=>l.life))throw Error('pickup light survived respawn');
  console.log('PICKUP LIGHT RESET PASS');
})();
