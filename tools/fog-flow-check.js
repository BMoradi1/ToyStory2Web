/** Browser-harness regression: level 14 gamma/fog, GPU linear blending and clean selector.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/fog.png --eval-file tools/fog-flow-check.js
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
  await wait(() => ts2.front.screen === 'select', 'selector did not open');
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
  const gammaURL=performance.getEntriesByType('resource').find(e=>/\/src\/render\/gamma\.ts(?:\?|$)/.test(e.name))?.name;
  if(!gammaURL)throw Error('loaded gamma module not found');
  const gamma=await import(gammaURL);
  const threeURL=performance.getEntriesByType('resource').find(e=>/\/three\.js\?/.test(e.name))?.name;
  if(!threeURL)throw Error('loaded Three module not found');
  const THREE=await import(threeURL);
  const {GameMaterial}=await import('/src/render/game-material.ts');
  const selector=document.querySelector('#level');
  selector.selectedIndex=[...selector.options].findIndex(o=>o.text==='level04/level1');
  if(selector.selectedIndex<0)throw Error('level 14 missing');
  selector.dispatchEvent(new Event('change'));
  await wait(()=>document.querySelector('#status').textContent.includes('level04/level1: ready'),'level 14');
  await ts2.spawnPlayer();
  const viewer=ts2.viewer;viewer.stop();
  const fog=viewer.scene.fog;
  if(!fog||fog.near!==24000/256||fog.far!==46000/256)throw Error('level 14 fog band');
  for(const [gain,colour] of [[2,0x202020],[2.5,0x282828],[3,0x303030],[2,0x202020]]){
    gamma.setGamma(gain);viewer.refreshGamma();
    if(fog.color.getHex()!==colour)throw Error('fog gamma/rollback '+gain+': '+fog.color.getHex().toString(16));
  }
  // Render real material fragments at known depths. Smoothstep would fail the quarter samples.
  const scene=new THREE.Scene();scene.fog=fog.clone();
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,0.1,1000);
  const material=new GameMaterial({color:0xffffff});
  const geometry=new THREE.PlaneGeometry(2,2),plane=new THREE.Mesh(geometry,material);scene.add(plane);
  const target=new THREE.WebGLRenderTarget(4,4),renderer=viewer.renderer;
  renderer.setRenderTarget(target);renderer.setScissorTest(false);renderer.setViewport(0,0,4,4);
  const pixels=new Uint8Array(4);
  for(const [fraction,expected] of [[-0.1,255],[0,255],[0.25,199],[0.5,144],[0.75,88],[1,32],[1.1,32]]){
    plane.position.z=-(fog.near+(fog.far-fog.near)*fraction);
    renderer.clear();renderer.render(scene,camera);renderer.readRenderTargetPixels(target,2,2,1,1,pixels);
    if([...pixels.slice(0,3)].some(v=>Math.abs(v-expected)>1)||pixels[3]!==255)throw Error('fog GPU ramp '+fraction+': '+[...pixels]);
  }
  scene.fog=null;renderer.clear();renderer.render(scene,camera);renderer.readRenderTargetPixels(target,2,2,1,1,pixels);
  if(pixels[0]!==255)throw Error('fog shader remains after disable');
  renderer.setRenderTarget(null);target.dispose();geometry.dispose();material.dispose();
  console.log('FOG GPU PASS: authored level 14 band, gamma preview/rollback, linear quarter points, clamping and disable');
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
  if(ts2.viewer.scene.fog!==null)throw Error('level 14 fog leaked into selector');
  gamma.setGamma(3);ts2.viewer.refreshGamma();
  if(ts2.viewer.scene.fog!==null)throw Error('gamma restored stale fog');
  gamma.setGamma(2);
  console.log('FOG CLEANUP PASS: selector stays fog-free after gamma changes');
  return {screen:ts2.front.screen, before, after};
})()
