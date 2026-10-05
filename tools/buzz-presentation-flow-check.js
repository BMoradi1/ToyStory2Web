/** Browser regression: Buzz helmet transparency and double-jump audio.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/buzz-presentation.png --eval-file tools/buzz-presentation-flow-check.js
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
  await ts2.spawnPlayer();ts2.viewer.stop();
  for(let t=0;t<2000&&ts2.talk;t++)ts2.tickGame({jump:(t&1)===0},1,0);
  ts2.tickGame({},120);
  const checkHelmet=()=>{
    const mesh=ts2.viewer.player, materials=mesh.material;
    const glass=materials.findIndex(m=>m.transparent);
    if(glass<0||materials[glass].depthWrite||materials[glass].blending!==2)throw Error('helmet is opaque');
    if(mesh.geometry.groups[glass].count!==147)throw Error('wrong helmet geometry');
    if(!materials.some(m=>!m.transparent&&m.depthWrite))throw Error('body became transparent');
  };
  checkHelmet();
  ts2.tickGame({jump:true},1);ts2.tickGame({},1);ts2.tickGame({jump:true},1);
  if(!ts2.sound.raised.includes('10:BUZWING'))throw Error('missing double-jump wing sound: '+JSON.stringify(ts2.sound.raised));
  checkHelmet();
  ts2.tickGame({},150);checkHelmet();
  const v=ts2.viewer,p=v.player.position;
  v.placeCamera(p.x-1.5,p.y+2.5,p.z-3,p.x,p.y+1.8,p.z);
  v.frame(v.lastTime);
  console.log('PASS helmet stays transparent through jump poses; double jump raises BUZWING');
})();
