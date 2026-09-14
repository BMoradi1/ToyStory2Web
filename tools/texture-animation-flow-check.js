/** Browser regression: animated texture pixels, graphics preference and respawn reset.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/texture.png --eval-file tools/texture-animation-flow-check.js
 * Repeat with BASE_URL=http://localhost:5173/?animations=off to test the disabled option.
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
  if(location.search.includes('animations=off')){
    ts2.frontDrive(0,70);ts2.frontDrive(64);ts2.frontDrive(0,30);ts2.frontDrive(0x4000);ts2.frontDrive(0,30);
    await wait(()=>ts2.front.screen==='options','options');
    ts2.frontDrive(0,70);
    for(let i=0;i<3;i++){ts2.frontDrive(64);ts2.frontDrive(0,35);}
    ts2.frontDrive(0x4000);ts2.frontDrive(0);ts2.frontDrive(64);ts2.frontDrive(0);ts2.frontDrive(64);ts2.frontDrive(0);ts2.frontDrive(64);ts2.frontDrive(0);ts2.frontDrive(32);ts2.frontDrive(0);
    if(ts2.front.state.value.animatedTextures!==false)throw Error('animation toggle failed');
    ts2.frontDrive(0x4000);ts2.frontDrive(0);ts2.frontDrive(0x1000);ts2.frontDrive(0,45);
    await wait(()=>ts2.front.screen==='menu','options exit');
    if(localStorage.getItem('ts2.animatedTextures')!=='false')throw Error('animation preference not saved');
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
  selector.selectedIndex=[...selector.options].findIndex(o=>o.text==='level05/level');
  selector.dispatchEvent(new Event('change'));
  await wait(()=>document.querySelector('#status').textContent.includes('level05/level: ready'),'level 5');
  await ts2.spawnPlayer();ts2.viewer.stop();
  const version=ts2.texturePixels(5).version;
  const initial=ts2.texturePixels(5).data;
  ts2.tickGame({},20,0);
  const after=ts2.texturePixels(5).data;
  const changed=initial.some((v,i)=>v!==after[i]);
  const enabled=!location.search.includes('animations=off');
  if(changed!==enabled)throw Error('texture animation enabled state not reflected in pixels');
  if((ts2.texturePixels(5).version>version)!==enabled)throw Error('GPU texture was not marked for upload');
  // Respawn restores the authored sheet even when the scene itself is reused.
  await ts2.spawnPlayer();ts2.viewer.stop();
  if(ts2.texturePixels(5).data.some((v,i)=>v!==initial[i]))throw Error('respawn did not restore texture pixels');
  console.log('TEXTURE BROWSER PASS',JSON.stringify({enabled,changed,reset:true}));
  // Show the source/destination texture sheet itself for a stable visual check.
  const texture=ts2.texturePixels(5), canvas=document.createElement('canvas');
  canvas.width=texture.width;canvas.height=texture.height;
  canvas.style.cssText='position:fixed;inset:0;margin:auto;width:768px;height:768px;image-rendering:pixelated;z-index:100';
  document.body.append(canvas);ts2.tickGame({},20,0);
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(ts2.texturePixels(5).data),texture.width,texture.height),0,0);
})();
