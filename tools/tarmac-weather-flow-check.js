/** Browser-harness regression: Tarmac rain, lightning and thunder.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/tarmac-weather.png --eval-file tools/tarmac-weather-flow-check.js
 * Reads the supplied install; only the disposable browser's save is affected.
 * Positions Buzz for focused landing and hazard checks; this is not a full playthrough.
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
  ts2.save.tokens.fill(31);
  ts2.frontDrive(0, 40); ts2.frontDrive(0x4000); ts2.frontDrive(0, 30);
  await wait(() => ts2.front.screen === 'menu', 'menu did not open');
  ts2.frontDrive(0, 40); ts2.frontDrive(0x4000); ts2.frontDrive(0, 30);
  await wait(() => ts2.front.screen === 'select', 'selector did not open');
  async function enter() {
    ts2.frontDrive(0,70);
    while(ts2.front.state.pos<14){ts2.frontDrive(0x20);ts2.frontDrive(0);}
    while(ts2.front.state.pos>14){ts2.frontDrive(0x80);ts2.frontDrive(0);}
    ts2.frontDrive(0x4000);ts2.frontDrive(0,40);
    for(let i=0;i<500&&!ts2.front.inLevel;i++) {
      if(ts2.cutsceneUp){window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));}
      await pause(100);
    }
    await wait(()=>ts2.front.inLevel,'Tarmac failed to start');
    ts2.viewer.stop();
  }
  await enter();
  await ts2.spawnPlayer();
  ts2.viewer.stop();
  const check=(ok,message)=>{if(!ok)throw Error(message);};

  const weather=ts2.tarmacWeather;
  check(weather&&weather.flash===200&&weather.rain.every(d=>d.bottom===0),'weather did not reset');
  const lightUrl=performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname==='/src/render/weather-light.ts')?.name;
  const {weatherLight,setWeatherLight}=await import(lightUrl??'/src/render/weather-light.ts');
  const initial={x:ts2.player.x,y:ts2.player.y,z:ts2.player.z};
  let flashes=0,thunders=0,splashes=0;
  for(let i=0;i<500;i++){
    // Keep the focused weather check safely at the authored spawn.
    Object.assign(ts2.player,{...initial,vx:0,vy:0,vz:0,hitStun:10000,dying:false});
    ts2.tickGame({},1,0);
    if(weather.brightness>128)flashes++;
    if(weather.thunder){thunders++;check(ts2.sound.raised.includes('70:Thunder'),'thunder did not resolve');}
    if(ts2.effects.kinds.includes(0x1b))splashes++;
  }
  check(flashes>0&&thunders>=2,'weather schedule did not run');
  check(splashes>0&&weather.splashes>0,'ground splash emitter missing');
  const drops=weather.rain.filter(d=>d.bottom!==0);
  check(drops.length>0&&drops.length<=64,'rain pool empty/unbounded');
  const rainPage=ts2.viewer.effectPageData.get(23);
  check(rainPage&&rainPage.texture===ts2.viewer.effectPages.get(23).cards.mesh.material.uniforms.map.value,'rain texture page not bound');
  const cards=rainPage.cards.filter(c=>Math.abs(c.width-30/256)<1e-8&&Math.abs(c.height-200/256)<1e-8);
  check(cards.every(c=>c.u0===128/256&&c.v0===64/256),'rain UVs must use the installed page');
  check(cards.length===drops.length,'rain not submitted as installed sprite cards');
  check(weatherLight.value===weather.brightness/128,'light multiplier not connected');
  // Compare actual framebuffer output without advancing the simulation/camera.
  const pixels=()=>{
    ts2.viewer.frame(ts2.viewer.lastTime);
    const gl=ts2.viewer.renderer.getContext(),p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
    gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);
    let total=0;for(let i=0;i<p.length;i+=4)total+=p[i]+p[i+1]+p[i+2];return total;
  };
  const brightness=weather.brightness;
  setWeatherLight(128);const normal=pixels();setWeatherLight(221);const flash=pixels();
  check(normal>0&&flash>normal,'flash did not brighten real rendered pixels');
  setWeatherLight(brightness);
  ts2.openMenu();const frozen=JSON.stringify(weather);ts2.tickGame({},60);
  check(JSON.stringify(weather)===frozen,'pause advanced weather');
  ts2.pressMenu('back');ts2.tickGame({},1);ts2.tickGame({},1,0);
  check(JSON.stringify(weather)!==frozen,'resume did not advance weather');
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.tarmacWeather.flash===200&&weatherLight.value===1&&ts2.tarmacWeather.rain.every(d=>d.bottom===0)&&ts2.viewer.effectPageData.size===0,'restart retained weather');
  ts2.tickGame({},170,0);
  check(weatherLight.value>1,'natural flash not reached before exit');
  ts2.openMenu();
  for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector did not return');
  check(ts2.tarmacWeather===null&&weatherLight.value===1&&ts2.viewer.effectPageData.size===0,'weather leaked into selector');
  await enter();await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.tarmacWeather.flash===200&&weatherLight.value===1,'re-entry retained flash');
  ts2.tickGame({},60,0);
  console.log('PASS: live rain cards, authored ground splashes, natural flashes/thunder cues, actual framebuffer brightening, pause, restart, exit during flash and re-entry');
})()
