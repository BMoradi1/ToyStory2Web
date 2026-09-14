/** Browser regression: lens-flare art, real source projection, option and scene reset.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/lens-flare.png --eval-file tools/lens-flare-flow-check.js
 * Repeat with BASE_URL=http://localhost:5173/?flares=off to test the disabled option.
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
  if(location.search.includes('flares=off')){
    ts2.frontDrive(0,70);ts2.frontDrive(64);ts2.frontDrive(0,30);ts2.frontDrive(0x4000);ts2.frontDrive(0,30);
    await wait(()=>ts2.front.screen==='options','options');
    ts2.frontDrive(0,70);
    for(let i=0;i<3;i++){ts2.frontDrive(64);ts2.frontDrive(0,35);}
    ts2.frontDrive(0x4000);ts2.frontDrive(0);ts2.frontDrive(32);ts2.frontDrive(0);
    if(ts2.front.state.value.lensFlare!==false)throw Error('flare toggle failed');
    ts2.frontDrive(0x4000);ts2.frontDrive(0);ts2.frontDrive(0x1000);ts2.frontDrive(0,45);
    await wait(()=>ts2.front.screen==='menu','options exit');
    if(localStorage.getItem('ts2.lensFlare')!=='false')throw Error('flare preference not saved');
  }
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
  selector.selectedIndex=[...selector.options].findIndex(o=>o.text==='level03/level');
  selector.dispatchEvent(new Event('change'));
  await wait(()=>document.querySelector('#status').textContent.includes('level03/level: ready'),'level 3');
  await ts2.spawnPlayer();ts2.viewer.stop();
  const viewer=ts2.viewer,enabled=!location.search.includes('flares=off');
  const source={x:0x3889/8192,y:-(0xfffc9f67|0)/8192,z:-(0xffffe044|0)/8192};
  let visible=false;
  for(const [x,y,z] of [[0,0,1],[1,0,0],[0,0,-1],[-1,0,0],[0,-1,0]]){
    viewer.camera.position.set(source.x+x,source.y+y,source.z+z);
    viewer.camera.lookAt(source.x,source.y,source.z);
    const sprites=ts2.redrawHud();
    if(sprites.length){visible=true;break;}
  }
  if(visible!==enabled)throw Error('real arena flare does not follow option: '+JSON.stringify(ts2.lensFlares));
  if(enabled&&ts2.lensFlares.sprites.length!==10)throw Error('arena chain sprite count');
  console.log('FLARE BROWSER PASS',JSON.stringify({enabled,visible,sprites:ts2.lensFlares.sprites.length}));
  // Looking away must remove the source without leaving last frame's sprites.
  const eye=viewer.camera.position.clone();
  viewer.camera.lookAt(2*eye.x-source.x,2*eye.y-source.y,2*eye.z-source.z);
  if(ts2.redrawHud().length)throw Error('behind-camera flare retained');
  viewer.camera.lookAt(source.x,source.y,source.z);ts2.redrawHud();
  // Display this controlled camera view, keeping the simulation stopped.
  const tick=viewer.onTick;viewer.onTick=null;viewer.play=true;
  viewer.frame(performance.now());
  if(enabled){
    const gl=viewer.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
    const before=new Uint8Array(w*h*4),after=new Uint8Array(w*h*4);
    viewer.setLensFlares([]);viewer.frame(performance.now());gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,before);
    ts2.redrawHud();viewer.frame(performance.now());gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,after);
    let brightened=0;
    for(let i=0;i<before.length;i++)if(i%4!==3){if(after[i]<before[i])throw Error('flare darkened underlying world');if(after[i]>before[i])brightened++;}
    if(!brightened)throw Error('flare pixels never reached framebuffer');
    console.log('FLARE ADDITIVE PIXELS PASS',brightened);
  }
  viewer.onTick=tick;
  if(!enabled||location.search.includes('cleanup')){
  ts2.tickGame({}, 10);
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
  window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));
  await pause(100);
  // Pause menu: continue, camera, volume, exit; then confirm yes.
  for (let i=0; i<3; i++) { ts2.pressMenu('down'); ts2.tickGame({},1); }
  ts2.pressMenu('select'); ts2.tickGame({},1);
  ts2.pressMenu('down'); ts2.tickGame({},1);
  ts2.pressMenu('select'); ts2.tickGame({},1);
  await wait(() => ts2.front.screen === 'summary', 'summary did not open');
  ts2.frontDrive(0, 650);
  ts2.frontDrive(0x4000); ts2.frontDrive(0, 130);
  await wait(() => ts2.front.screen === 'select', 'did not return to selector');
  const before = { scene:ts2.front.scene, player:ts2.player, creatures:ts2.creatures, effects:ts2.effects };
  await pause(2000);
  const after = { scene:ts2.front.scene, player:ts2.player, creatures:ts2.creatures, effects:ts2.effects };
  if (ts2.guideSparkles.points.length || ts2.soundSequence) throw new Error('previous prop feedback remains in selector');
  if (ts2.player != null) throw new Error('previous player remains in selector');
  if (ts2.tickGame({},60) !== null) throw new Error('previous gameplay still ticks');
    if(ts2.lensFlares.sprites.length||viewer.flareScene.children.some(c=>c.visible))throw Error('flare sprites leaked into selector');
    console.log('FLARE CLEANUP PASS');
  }
})();
