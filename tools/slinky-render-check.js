/** Render the installed level 4 Slinky with animated joint surfaces for visual review. */
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
  const selector=document.querySelector('#level');
  const scene='level04/level';
  selector.selectedIndex=[...selector.options].findIndex(o=>o.text===scene);
  selector.dispatchEvent(new Event('change'));
  await wait(()=>document.querySelector('#status').textContent.includes(scene+': ready'),scene);
  await ts2.spawnPlayer();ts2.viewer.stop();
  const slinky=ts2.creatures.find(c=>c.type===44);
  if(!slinky)throw Error('missing authored Slinky');
  ts2.goToCreature(slinky.slot);ts2.player.hitStun=1000;ts2.tickGame({},2);
  const c=ts2.creatures.find(c=>c.slot===slinky.slot);
  const view=ts2.viewer;
  view.camera.position.set(c.x/8192+3,-c.y/8192+1.5,-c.z/8192+3);
  view.camera.lookAt(c.x/8192,-c.y/8192+1,-c.z/8192);
  view.frame(view.lastTime);
  console.log('SLINKY RENDER CHECK',JSON.stringify(c));
})();
