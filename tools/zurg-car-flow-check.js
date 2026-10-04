/** Browser regression: shared Zurg-car hook across four levels.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/zurg-cars.png --eval-file tools/zurg-car-flow-check.js
 * Reads the supplied install; only the disposable browser's save is affected.
 * Positions and protects Buzz near cars; injects boss/helper damage to reach the level 9 car wave.
 * Does not seek car scripts or complete a full playthrough.
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

  for(const level of [2,4,8,9]) {
    await enter(level);await ts2.spawnPlayer();ts2.viewer.stop();
    if(level===9){
      const advance=n=>{for(let i=0;i<n;i++){ts2.setPlayerPos(0,-110000,0);ts2.player.hitStun=1000;ts2.tickGame({},1,0);}};
      advance(366);
      for(let stage=1;stage<=6;stage++){
        ts2.hurtCreature(0,1);advance(366);
        if(ts2.creatures.some(c=>c.type===14&&c.health>0))break;
        for(const slot of ts2.tasks.pod.pair)for(let i=0;i<100&&ts2.creatures.find(c=>c.slot===slot).health>0;i++)ts2.hurtCreature(slot,1);
        for(let i=0;i<400&&(ts2.tasks.pod.stage===stage||ts2.tasks.pod.stun>0);i++)advance(1);
      }
      check(ts2.creatures.some(c=>c.type===14&&c.health>0),'boss did not summon car');
    }
    const cars=ts2.creatures.filter(c=>c.type===14);check(cars.length,'Zurg cars missing');
    check(cars.every(c=>ts2.viewer.creatureMeshes.has(c.slot)),'car artwork missing after level transition '+level);let smoke=false,engine=false;
    for(const car of cars){
      for(const [dx,dz]of [[0,8000],[8000,0],[0,-8000],[-8000,0]]){
        for(let i=0;i<650&&!(smoke&&engine);i++){
          const now=ts2.creatures.find(c=>c.slot===car.slot);
          ts2.setPlayerPos(now.x+dx,now.z+dz,now.y);ts2.player.hitStun=1000;ts2.tickGame({},1,0);
          if(ts2.talk){for(let j=0;j<2000&&ts2.talk;j++)ts2.tickGame({jump:(j&1)===0},1,0);}
          smoke||=ts2.effects.activeKinds.includes(39);engine||=ts2.sound.raised.some(s=>s.startsWith('41:'));
        }
        if(smoke&&engine)break;
      }
      if(smoke&&engine)break;
    }
    check(smoke&&engine,'car smoke/engine absent on level '+level+' '+JSON.stringify({smoke,engine,visible:[...ts2.viewer.visibleCreatureSlots()],camera:ts2.viewer.camera.position,cut:ts2.cut,cars:ts2.creatures.filter(c=>c.type===14),sound:ts2.sound.raised,effects:ts2.effects.activeKinds}));
    ts2.openMenu();const snapshot=JSON.stringify(ts2.creatures.filter(c=>c.type===14));ts2.tickGame({},100,0);
    check(snapshot===JSON.stringify(ts2.creatures.filter(c=>c.type===14)),'paused cars advanced');ts2.pressMenu('back');ts2.tickGame({},1,0);
    await ts2.spawnPlayer();ts2.viewer.stop();
    check(!ts2.effects.kinds.includes(39),'car smoke survived restart');
    ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
    ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
    await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
    if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
    await wait(()=>ts2.front.screen==='select','selector missing');
    check(ts2.effects===null,'effects leaked after level exit');
    console.log('PASS Zurg cars: level '+level+' authored movement, engine sound, wheel smoke and lifecycle');
  }
})()
