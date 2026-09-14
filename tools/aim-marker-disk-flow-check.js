/** Browser regression: retail marker and selected-target disks.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/aim-marker-disk.png --eval-file tools/aim-marker-disk-flow-check.js
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
  const visorBefore=ts2.viewer.aimModel.geometry.getAttribute('position').array.slice();
  ts2.tickGame({aim:true},1);
  if(!ts2.aimView.active)throw Error('held toggle repeated');
  ts2.tickGame({aim:false,moveX:1,moveY:1},10);
  if(!ts2.aimView.pitch||ts2.player.x!==start.x||ts2.player.z!==start.z)throw Error('aim input moved Buzz');
  const visorAfter=ts2.viewer.aimModel.geometry.getAttribute('position').array;
  if(!visorBefore.some((value,i)=>Math.abs(value-visorAfter[i])>0.00001))throw Error('visor is rigid while turning');
  if(ts2.aimView.modelYaw===ts2.aimView.yaw)throw Error('arm does not trail turn');
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
  window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE',key:'e'}));
  ts2.tickGame({},1);
  window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyE',key:'e'}));
  if(!ts2.aimView.lock.locked)throw Error('E did not acquire a real creature '+JSON.stringify(ts2.aimView));
  const target=ts2.aimView.lock.target;
  if(ts2.effects.aimMarker?.sprite!==23||ts2.effects.aimMarker.r!==255)throw Error('retail locked marker missing');
  ts2.tickGame({cameraRight:true},5);
  if(ts2.aimView.lock.target!==target)throw Error('held E cycled repeatedly');
  ts2.openMenu();const frozenLock=JSON.stringify(ts2.aimView);
  ts2.tickGame({cameraRight:true},5);
  if(JSON.stringify(ts2.aimView)!==frozenLock)throw Error('pause changed lock');
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.tickGame({},1);
  ts2.tickGame({moveX:1},1);
  if(ts2.aimView.lock.locked)throw Error('manual movement did not release lock');
  if(ts2.effects.aimMarker?.g!==255)throw Error('released marker not green');
  ts2.tickGame({},1);ts2.tickGame({cameraRight:true},1);
  if(!ts2.aimView.lock.locked)throw Error('target did not re-lock');
  ts2.killCreature(ts2.aimView.lock.target);ts2.tickGame({},1);
  if(ts2.aimView.lock.locked||ts2.aimView.lock.target!==null)throw Error('dead target remains locked');
  ts2.tickGame({cameraRight:true},1);ts2.tickGame({},20);
  const selector=document.querySelector('#level');
  selector.selectedIndex=[...selector.options].findIndex(o=>o.text==='level04/level');
  selector.dispatchEvent(new Event('change'));
  await wait(()=>document.querySelector('#info').textContent.includes('level04/level —'),'construction scene did not load');
  await ts2.spawnPlayer();ts2.viewer.stop();ts2.play(true);
  if(ts2.effects.aimMarker)throw Error('old marker survived scene change');
  if(!ts2.goToPickupKind('Kind7'))throw Error('test disk pickup missing');
  ts2.tickGame({},2);
  if(ts2.effects.diskAmmo<=0)throw Error('disk pickup did not grant ammunition');
  const enemy=ts2.creatures.find(c=>c.vulnerable&&c.health>0);
  if(!enemy)throw Error('test enemy missing');
  ts2.setPlayerPos(enemy.x,enemy.z+60000,enemy.y);ts2.player.hitStun=0;
  ts2.tickGame({},2);ts2.player.hitStun=0;
  if(!ts2.aimView.active){ts2.tickGame({aim:true},1);ts2.tickGame({},1);}
  if(!ts2.aimView.lock.locked){ts2.tickGame({cameraRight:true},1);ts2.tickGame({},1);}
  const selected=ts2.aimView.lock.target;
  if(selected===null)throw Error('disk has no selected enemy');
  const ammo=ts2.effects.diskAmmo;
  ts2.player.laser=0;
  for(let i=0;i<30&&ts2.effects.diskAmmo===ammo;i++)ts2.tickGame({fire:true},1);
  if(!ts2.effects.disks.some(d=>d.kind===0x47&&d.target===selected))throw Error('disk did not home on selected enemy '+JSON.stringify({selected,ammo,aim:ts2.aimView,effects:ts2.effects,player:ts2.player}));
  if(ts2.effects.diskAmmo!==ammo-1)throw Error('wrong disk ammo consumption');
  ts2.tickGame({fire:false,moveX:1},1);ts2.player.laser=0;
  const nextAmmo=ts2.effects.diskAmmo;
  for(let i=0;i<30&&ts2.effects.diskAmmo===nextAmmo;i++)ts2.tickGame({fire:true},1);
  if(!ts2.effects.disks.some(d=>d.kind===0x48&&d.target===null))throw Error('unlocked disk did not fly straight');
  ts2.redrawHud();ts2.viewer.frame(ts2.viewer.lastTime);
  console.log('PASS: original marker colour/lifecycle, real pickup ammunition, locked homing disk and unlocked straight disk');
})();
