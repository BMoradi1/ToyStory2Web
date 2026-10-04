/** Browser regression: shared gun enemy and buzzard hooks across three levels.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/platforms.png --eval-file tools/shared-enemy-flow-check.js
 * Reads the supplied install; only the disposable browser's save is affected.
 * Positions and protects Buzz; seeks the authored firing opcode; not a full playthrough.
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
  const {AI_SCRIPTS,CREATURE_OPS}=await import('/src/sim/creature-data.ts');
  for(const level of [11,13,14]) {
    await enter(level);await ts2.spawnPlayer();ts2.viewer.stop();
    const gun=ts2.creatures.find(c=>c.type===46);check(gun,'gun enemy missing');
    ts2.goToCreature(gun.slot);ts2.player.hitStun=1000;ts2.tickGame({},40);
    const words=AI_SCRIPTS[gun.script];let word=0;
    while(word<words.length&&words[word]!==0x21)word+=1+(CREATURE_OPS[words[word]]?.[0]??0);
    check(word<words.length,'firing opcode absent');
    ts2.seekCreatureScript(gun.slot,word);
    let fired=false;
    for(let i=0;i<30&&!fired;i++){
      ts2.goToCreature(gun.slot);ts2.player.hitStun=1000;ts2.tickGame({},1);
      fired=ts2.effects.kinds.includes(0x61);
    }
    check(fired,'gun projectile did not spawn on level '+level);
    check(ts2.sound.raised.some(s=>s.startsWith('56:')),'gun sound absent');
    const bird=ts2.creatures.find(c=>c.type===41);check(bird,'buzzard missing');
    ts2.goToCreature(bird.slot);ts2.player.hitStun=1000;ts2.tickGame({},1);
    check(ts2.sound.raised.some(s=>s.startsWith('57:')),'buzzard wing sound absent');
    check(ts2.creatures.find(c=>c.slot===bird.slot).animState===1,'buzzard attack animation absent');
    await ts2.spawnPlayer();ts2.viewer.stop();
    check(!ts2.effects.kinds.includes(0x61),'projectile survived restart');
    ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
    ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
    await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
    if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
    await wait(()=>ts2.front.screen==='select','selector missing');
    check(ts2.effects===null,'effects leaked after level exit');
    console.log('PASS shared enemies: level '+level+' projectile, sound, buzzard animation and cleanup');
  }
})()
