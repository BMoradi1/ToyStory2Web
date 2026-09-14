/** Browser regression: reusable pickup reappearance and flash.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/pickup-reappear.png --eval-file tools/pickup-reappear-flow-check.js
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
  const selector=document.querySelector('#level'),scene='level04/level';
  selector.selectedIndex=[...selector.options].findIndex(o=>o.text===scene);
  selector.dispatchEvent(new Event('change'));
  await wait(()=>document.querySelector('#status').textContent.includes(scene+': ready'),scene);
  await ts2.spawnPlayer();ts2.viewer.stop();
  const file=[...document.querySelector('#pickfile').files].find(f=>f.webkitRelativePath.endsWith('/data/'+scene+'.dat'));
  const {parseDat}=await import('/src/formats/dat.ts');
  const {createPickups}=await import('/src/sim/pickups.ts');
  const item=createPickups(parseDat(await file.arrayBuffer()),4).items.find(i=>i.kind===7&&i.y>-1000);
  const at={x:item.x*32,y:item.y*32,z:item.z*32};
  ts2.player.x=at.x;ts2.player.y=at.y+7360;ts2.player.z=at.z;
  ts2.player.hitStun=1000;ts2.tickGame({},1);
  if(ts2.pickups.reappearing.ticks!==400||!ts2.viewer.hiddenObjects.has(item.objectIndex))throw Error('pickup did not enter respawn');
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
  window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));
  ts2.tickGame({},10);
  if(ts2.pickups.reappearing.ticks!==400)throw Error('pause aged respawn');
  ts2.pressMenu('select');ts2.tickGame({},1);
  const advance=n=>{for(let i=0;i<n;i++){
    ts2.player.x=at.x;ts2.player.y=at.y;ts2.player.z=at.z+30000;ts2.player.hitStun=1000;
    ts2.tickGame({},1);
  }};
  advance(399);
  if(ts2.pickups.reappearing.ticks!==1||!ts2.viewer.hiddenObjects.has(item.objectIndex))throw Error('pickup returned early');
  advance(1);
  if(ts2.pickups.reappearing.ticks!==0||ts2.viewer.hiddenObjects.has(item.objectIndex))throw Error('pickup did not return');
  const light=ts2.effects.pointLights.find(l=>l.owner===at.x&&l.r===96&&l.g===64&&l.life===15);
  if(!light||!ts2.effects.kinds.includes(0x29))throw Error('reappearance flash missing');
  console.log('PICKUP REAPPEARANCE/TIMING/FLASH PASS');
  ts2.player.x=at.x;ts2.player.y=at.y+7360;ts2.player.z=at.z;ts2.tickGame({},1);
  if(ts2.pickups.reappearing.ticks!==400)throw Error('pickup cannot be collected again');
  await ts2.spawnPlayer();ts2.viewer.stop();
  if(ts2.pickups.reappearing.ticks||ts2.pickups.reappearing.index!==-1)throw Error('respawn timer survived reset');
  console.log('PICKUP RECOLLECTION/RESET PASS');
})();
