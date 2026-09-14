/** Browser regression: first-person laser view, level sprites and backdrop.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/aim-render.png --eval-file tools/aim-render-flow-check.js
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
  for(const index of [1,2,3])if(!ts2.viewer.hiddenObjects.has(index))throw Error('stored visor piece visible in room');
  if(ts2.viewer.aimModel?.visible)throw Error('visor visible before aiming');
  ts2.player.hitStun=0;
  ts2.tickGame({aim:true},1);
  if(!ts2.aimView.active)throw Error('aim toggle did not enter');
  if(!ts2.viewer.aimModel?.visible)throw Error('original visor not shown');
  const eye=ts2.viewer.camera.position;
  if(Math.abs(eye.y-(-(ts2.player.y-0x3000)/8192))>0.0001)throw Error('wrong first-person eye');
  const start={x:ts2.player.x,z:ts2.player.z};
  ts2.tickGame({aim:true},1);
  if(!ts2.aimView.active)throw Error('held toggle repeated');
  ts2.tickGame({aim:false,moveX:1,moveY:1},10);
  if(!ts2.aimView.pitch||ts2.player.x!==start.x||ts2.player.z!==start.z)throw Error('aim input moved Buzz');
  let fired=false;
  for(let i=0;i<30;i++){
    ts2.tickGame({fire:true},1);
    if(ts2.effects.beams.length){fired=true;break;}
  }
  if(!fired)throw Error('aimed laser did not fire');
  if(ts2.viewer.player.visible)throw Error('Buzz blocks first person');
  ts2.tickGame({aim:true},1);
  if(ts2.aimView.active||!ts2.viewer.player.visible||ts2.viewer.aimModel.visible)throw Error('toggle did not restore third person');
  ts2.tickGame({aim:false},1);ts2.tickGame({aim:true},1);
  await ts2.spawnPlayer();ts2.viewer.stop();
  if(ts2.aimView.active||!ts2.viewer.player.visible)throw Error('respawn did not clear aiming');
  ts2.tickGame({},120);
  window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyV',key:'v'}));
  ts2.tickGame({},1);
  window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyV',key:'v'}));
  if(!ts2.aimView.active)throw Error('physical V binding failed');
  ts2.openMenu();
  const frozen=JSON.stringify(ts2.aimView);
  ts2.tickGame({moveX:1,moveY:1},10);
  if(JSON.stringify(ts2.aimView)!==frozen)throw Error('pause changed aim');
  ts2.pressMenu('select');ts2.tickGame({},1);
  ts2.tickGame({},1);
  if(!ts2.aimView.active)throw Error('resume cancelled laser view');
  ts2.play(true);ts2.tickGame({},1);
  ts2.redrawHud();
  const hudCanvas=document.querySelector("#hud");
  const pixels=hudCanvas.getContext("2d").getImageData(hudCanvas.width/2-40,hudCanvas.height/2-40,80,80).data;
  if(!pixels.some((value,i)=>i%4===3&&value>0))throw Error("aiming reticle is missing");
  const geometry=ts2.viewer.lastLevel.geometry;
  if(geometry.billboards.length!==211)throw Error('authored sprite cards missing');
  if(!ts2.viewer.backdrop.mesh.visible)throw Error('level backdrop missing');
  ts2.viewer.frame(ts2.viewer.lastTime);
  if(ts2.viewer.aimModel.position.distanceTo(ts2.viewer.camera.position)>1e-6)throw Error('visor does not follow eye');
  if(ts2.viewer.aimModel.quaternion.angleTo(ts2.viewer.camera.quaternion)>1e-6)throw Error('visor does not follow aim');
  console.log('AIM AND RENDER GAPS BROWSER PASS',JSON.stringify({cards:geometry.billboards.length,objects:geometry.objectCount,backdrop:ts2.viewer.backdrop.mesh.visible}));
})();
