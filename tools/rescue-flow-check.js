/** Browser regression: authored sheep rescue burst and light reset.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/rescue.png --eval-file tools/rescue-flow-check.js
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
  const sheep=ts2.creatures.find(c=>c.type===6&&c.health===102);
  if(!sheep)throw Error('no authored sheep');
  ts2.goToCreature(sheep.slot);
  // Let the follow camera reach the sheep before entering contact range.
  for(let i=0;i<120;i++){
    const c=ts2.creatures.find(c=>c.slot===sheep.slot);
    Object.assign(ts2.player,{x:c.x+16000,y:c.y,z:c.z,hitStun:1000});
    ts2.tickGame({},1);
  }
  let light;
  for(let i=0;i<30;i++){
    const c=ts2.creatures.find(c=>c.slot===sheep.slot);
    Object.assign(ts2.player,{x:c.x+c.offsetX,y:c.y+c.offsetY+7360,z:c.z+c.offsetZ,hitStun:1000});
    ts2.tickGame({},1);
    const rescued=ts2.creatures.find(c=>c.slot===sheep.slot);
    light=ts2.effects.pointLights.find(l=>l.r===96&&l.g===64&&l.life===15&&l.y===rescued.y-8192&&l.x===rescued.x&&l.z===rescued.z);
    if(light)break;
  }
  if(!light)throw Error('rescue light missing '+JSON.stringify({sheep:ts2.creatures.find(c=>c.slot===sheep.slot),lights:ts2.effects.pointLights}));
  if(ts2.creatures.find(c=>c.slot===sheep.slot).health!==0)throw Error('rescued sheep still alive');
  if(!ts2.effects.kinds.includes(0x29))throw Error('rescue particles missing');
  const frozen=JSON.stringify(ts2.effects.pointLights);
  for(let i=0;i<5;i++)ts2.redrawHud();
  if(JSON.stringify(ts2.effects.pointLights)!==frozen)throw Error('redraw aged light');
  ts2.tickGame({},1);
  if(ts2.effects.pointLights.some(l=>l.owner===light.owner&&l.life===15))throw Error('duplicate rescue burst');
  console.log('RESCUE BROWSER PASS',JSON.stringify(light));
  await ts2.spawnPlayer();ts2.viewer.stop();
  if(ts2.effects.pointLights.some(l=>l.life))throw Error('rescue light survived reset');
  console.log('RESCUE RESET PASS');
})();
