/** Browser regression: level 9 boss entrance and laser.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/pod-boss.png --eval-file tools/pod-boss-flow-check.js
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
  const selector=document.querySelector('#level');
  const scene='level09/level';
  selector.selectedIndex=[...selector.options].findIndex(o=>o.text===scene);
  selector.dispatchEvent(new Event('change'));
  await wait(()=>document.querySelector('#status').textContent.includes(scene+': ready'),scene);
  await ts2.spawnPlayer();ts2.viewer.stop();
  if(ts2.tasks.pod.phase!==0)throw Error('boss init');
  ts2.player.z=-110000;
  ts2.tickGame({},1);
  if(ts2.tasks.pod.phase!==1)throw Error('entrance trigger');
  ts2.tickGame({},365);
  if(ts2.tasks.pod.phase!==2)throw Error('entrance did not end');
  for(let i=0;i<250;i++){
    const boss=ts2.creatures.find(c=>c.slot===0);
    ts2.player.x=boss.x;ts2.player.y=0;ts2.player.z=boss.z+10000;
    ts2.tickGame({},1);
    if(ts2.effects.podBeams.some(b=>b.flareSize===64))break;
  }
  const beam=ts2.effects.podBeams.find(b=>b.flareSize===64);
  if(!beam)throw Error('boss laser never fired: '+JSON.stringify(ts2.tasks));
  if(beam.width!==128)throw Error('boss beam width');
  const viewer=ts2.viewer;let visible=false;
  for(const [x,y,z] of [[0,-1,0],[0,0,1],[1,0,0],[0,0,-1],[-1,0,0]]){
    viewer.camera.position.set(beam.to.x/8192+x,-beam.to.y/8192+y,-beam.to.z/8192+z);
    viewer.camera.lookAt(beam.to.x/8192,-beam.to.y/8192,-beam.to.z/8192);
    if(ts2.redrawHud().some(s=>s.colour[0]===0&&s.colour[1]>0&&s.colour[2]===0)){visible=true;break;}
  }
  if(!visible)throw Error('boss impact flare missing');
  console.log('POD BOSS LASER PASS',JSON.stringify(beam));
  const advance=n=>{for(let i=0;i<n;i++){ts2.player.x=0;ts2.player.y=0;ts2.player.z=-110000;ts2.player.hitStun=1000;ts2.tickGame({},1);}};
  for(let stage=1;stage<=6;stage++){
    ts2.hurtCreature(0,1);advance(1);
    if(ts2.tasks.pod.stun===0||ts2.effects.podBeams.some(b=>b.flareSize===64))throw Error('hit did not close shell/stop beam');
    advance(365);
    const pair=ts2.tasks.pod.pair;
    if(!pair.length||!pair.every(id=>ts2.creatures.find(c=>c.slot===id).health>0))throw Error('helpers missing '+JSON.stringify(ts2.tasks.pod));
    for(const id of pair){
      for(let i=0;i<100&&ts2.creatures.find(c=>c.slot===id).health>0;i++)ts2.hurtCreature(id,1);
    }
    for(let i=0;i<400&&(ts2.tasks.pod.stage===stage||ts2.tasks.pod.stun>0);i++)advance(1);
    if(ts2.tasks.pod.stage!==stage+1)throw Error('helper stage stuck '+JSON.stringify(ts2.tasks.pod));
  }
  if(ts2.tasks.pod.phase!==3)throw Error('final phase missing: '+JSON.stringify(ts2.tasks.pod));
  console.log('POD BOSS SIX WAVES PASS');
  for(let i=0;i<30&&ts2.tasks.pod.phase===3;i++){ts2.hurtCreature(0,1);advance(122);}
  if(ts2.tasks.pod.phase!==4&&ts2.tasks.pod.phase!==5)throw Error('death cut missing');
  console.log('POD BOSS DEATH PASS');
  advance(130);
  for(let i=0;i<300&&ts2.front.screen!=='summary';i++){
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
    window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));
    await pause(100);
  }
  await wait(()=>ts2.front.screen==='summary','boss victory summary');
  ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);
  await wait(()=>ts2.front.screen==='select','selector after victory');
  if(ts2.player||ts2.effects?.podBeams.length||ts2.lensFlares.sprites.length)throw Error('boss state leaked into selector');
  console.log('POD BOSS VICTORY/CLEANUP PASS');
})();
