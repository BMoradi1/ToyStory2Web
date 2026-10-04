/** Browser regression: box-launched plane hooks across two levels.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/box-planes.png --eval-file tools/box-plane-flow-check.js
 * Reads the supplied install; only the disposable browser's save is affected.
 * Positions and protects Buzz near each launcher and follows its plane.
 * Does not seek scripts or complete a full playthrough.
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
  async function enter(level) {
    ts2.frontDrive(0,70);
    while(ts2.front.state.pos<level){ts2.frontDrive(0x20);ts2.frontDrive(0);}
    while(ts2.front.state.pos>level){ts2.frontDrive(0x80);ts2.frontDrive(0);}
    ts2.frontDrive(0x4000);ts2.frontDrive(0,40);
    for(let i=0;i<500&&!ts2.front.inLevel;i++) {
      if(ts2.cutsceneUp){window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));}
      await pause(100);
    }
    await wait(()=>ts2.front.inLevel,'level failed to start');
    ts2.viewer.stop();
  }
  const check=(ok,message)=>{if(!ok)throw Error(message);};

  for(const level of [5,7]) {
    await enter(level);await ts2.spawnPlayer();ts2.viewer.stop();
    const boxes=ts2.creatures.filter(c=>c.type===25);check(boxes.length,'boxes missing');
    check(ts2.creatures.filter(c=>c.type===24).every(c=>c.health===0&&c.respawn===10000),'planes not dormant on entry');
    let trail=false,engine=false;
    for(const box of boxes){
      let launched=null;
      for(let i=0;i<1400&&!launched;i++){
        const owner=ts2.creatures.find(c=>c.slot===box.slot);
        ts2.setPlayerPos(owner.x+20000,owner.z,owner.y);ts2.player.hitStun=1000;ts2.tickGame({},1,0);
        if(ts2.talk){for(let j=0;j<2000&&ts2.talk;j++)ts2.tickGame({jump:(j&1)===0},1,0);}
        launched=ts2.creatures.find(c=>c.type===24&&(c.slot===box.slot+1||c.slot===box.slot+2)&&c.health>0);
      }
      check(launched,'box did not launch on level '+level+' slot '+box.slot);
      for(let i=0;i<400;i++){
        const plane=ts2.creatures.find(c=>c.slot===launched.slot);
        if(plane.health<=0)break;
        ts2.setPlayerPos(plane.x+12000,plane.z,plane.y);ts2.player.hitStun=1000;ts2.tickGame({},1,0);
        const now=ts2.creatures.find(c=>c.slot===plane.slot),mesh=ts2.viewer.creatureMeshes.get(plane.slot);
        if(now.health>0&&mesh){
          check(Math.abs(mesh.position.x-now.x/8192)<1e-7&&Math.abs(mesh.position.y+now.y/8192)<1e-7&&Math.abs(mesh.position.z+now.z/8192)<1e-7,'spawned plane mesh misplaced');
        }
        trail||=ts2.effects.activeKinds.includes(88);engine||=ts2.sound.raised.some(s=>s.startsWith('5d:'));
      }
    }
    check(trail&&engine,'plane trail or engine absent on level '+level+' '+JSON.stringify({trail,engine,planes:ts2.creatures.filter(c=>c.type===24)}));
    ts2.openMenu();const snapshot=JSON.stringify(ts2.creatures.filter(c=>c.type===24||c.type===25));ts2.tickGame({},100,0);
    check(snapshot===JSON.stringify(ts2.creatures.filter(c=>c.type===24||c.type===25)),'paused launchers advanced');ts2.pressMenu('back');ts2.tickGame({},1,0);
    await ts2.spawnPlayer();ts2.viewer.stop();
    check(ts2.creatures.filter(c=>c.type===24).every(c=>c.health===0&&c.respawn===10000),'plane state survived restart');
    check(!ts2.effects.kinds.includes(88),'plane trails survived restart');
    ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
    ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
    await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
    if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
    await wait(()=>ts2.front.screen==='select','selector missing');
    check(ts2.effects===null,'effects leaked after level exit');
    console.log('PASS box planes: level '+level+' all authored launchers, live planes/trails/sound, correct model position, pause/restart/exit');
  }
})()
