/** Browser regression: Elevator and Penthouse gunslinger encounters.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/gunslinger.png --eval-file tools/gunslinger-flow-check.js
 * Reads the supplied install; only the disposable browser's save is affected.
 * Positions/protects Buzz and injects hits; attack wordcode runs normally; not a full playthrough.
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
  ts2.save.tokens.fill(31);ts2.save.tokens[10]&=~16;ts2.save.tokens[11]&=~16;
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
  for(const level of [10,11]) {
    await enter(level);await ts2.spawnPlayer();ts2.viewer.stop();
    const slot=level===10?8:11,boss=()=>ts2.creatures.find(c=>c.slot===slot);
    const token=()=>ts2.pickups.tokenItems.find(i=>i.slot===4);
    if(level===10)ts2.setPlayerPos(60000,60000,-1800000);
    else ts2.setPlayerPos(-690000,-210000,127000);
    for(let i=0;i<100&&!ts2.talk;i++){ts2.player.hitStun=1000;ts2.tickGame({},1,0);}
    check(ts2.talk&&ts2.tasks.boss===1,'taunt failed level '+level+' player '+JSON.stringify(ts2.player)+' boss '+JSON.stringify(boss()));
    for(let i=0;i<2000&&ts2.talk;i++){
      if(i%30===0){window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter'}));}
      ts2.tickGame({},1,0);
    }
    ts2.tickGame({},1,0);check(ts2.tasks.boss===2,'wake failed');
    check(!token().enabled,'early reward');
    const position=()=>{
      const c=boss();Object.assign(ts2.player,{x:c.x+20000,y:level===10?-1800000:128000,z:c.z,vx:0,vy:0,vz:0,hitStun:1000});
    };
    const seen=new Set();let first=false;
    // No script seek: let the installed attack wordcode run while Buzz stays nearby.
    for(let i=0;i<1500&&seen.size<2;i++){
      position();ts2.tickGame({},1,0);
      if(level===10){for(const kind of [89,119])if(ts2.effects.activeKinds.includes(kind))seen.add(kind);}
      else for(const event of ['93:','94:'])if(ts2.sound.raised.some(s=>s.startsWith(event)))seen.add(event);
      if(seen.size&&!first){
        first=true;const before=JSON.stringify(ts2.tasks.gunslinger);
        ts2.openMenu();ts2.tickGame({},100,0);check(JSON.stringify(ts2.tasks.gunslinger)===before,'pause advanced boss');ts2.pressMenu('back');
      }
    }
    check(seen.size===2,'attack cycle absent level '+level+': '+JSON.stringify(boss())+' state '+JSON.stringify(ts2.tasks.gunslinger)+' seen '+JSON.stringify([...seen]));
    check(level===10||ts2.effects.kinds.includes(97),'Penthouse bullets absent');
    let flashed=false;
    const checkFlash=()=>{
      if(ts2.tasks.gunslinger.flash){
        const mesh=ts2.viewer.creatureMeshes.get(slot);
        check(mesh.scale.x===1&&mesh.material[0].color.r===2,'incorrect hit flash');
        flashed=true;
      }
    };
    for(let hit=0;hit<(level===10?15:10);hit++){
      position();ts2.hurtCreature(slot,4);ts2.tickGame({},1,0);
      checkFlash();
      if(hit<(level===10?14:9)){
        for(let i=0;i<61;i++){position();ts2.tickGame({},1,0);checkFlash();}
        check(boss().vulnerable===7,'recovery failed '+level);
      }
    }
    check(flashed,'no hit flash');
    for(let i=0;i<20&&ts2.tasks.boss===2;i++){position();ts2.tickGame({},1,0);}
    check(ts2.tasks.boss>2,'defeat missed '+level);check(!token().enabled,'reward delay skipped');
    ts2.tickGame({},120,0);check(token().enabled&&(ts2.tasks.done&16),'reward missing');
    if(level===10)check(!ts2.effects.activeKinds.includes(89),'homing shot survived defeat');
    ts2.tickGame({},260,0);
    for(let i=0;i<10&&!(ts2.pickups.tokens&16);i++){
      const r=token();ts2.setPlayerPos(r.x*32,r.z*32,r.y*32);ts2.tickGame({},1,0);
    }
    check((ts2.pickups.tokens&16)&&(ts2.save.tokens[level]&16),'collection/save failed');
    await ts2.spawnPlayer();ts2.viewer.stop();
    check(ts2.tasks.boss===0&&ts2.tasks.gunslinger.hurt===0&&boss().health===(level===10?30:29)&&!token().enabled,'restart retained fight');
    check(!ts2.effects.activeKinds.some(k=>[89,97,119].includes(k)),'restart retained projectile');
    ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
    ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
    await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
    if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
    await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.tasks===null,'fight leaked after exit');
    console.log('PASS gunslinger '+level+': authored attack cycle, pause, flash/recovery, defeat/reward/save, restart and exit');
  }
})()
