/** Browser regression: Construction Yard paint cans.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/buggy.png --eval-file tools/buggy-flow-check.js
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
  const level=4;await enter(level);await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.paintCans.cans.length===3,'missing paint cans');
  for(let index=0;index<3;index++){
    const can=()=>ts2.paintCans.cans[index];
    let rose=false,closed=false,opened=false,slam=false,bounced=false;
    const start=can().clock;
    for(let i=0;i<700&&!(rose&&closed&&opened&&slam&&bounced);i++){
      const c=can(),at=c.lid.rest;
      ts2.setPlayerPos(at.x+10000,at.z,at.y-10000);ts2.player.hitStun=1000;
      ts2.tickGame({},1,0);
      rose ||= c.lid.position.y<at.y-20000;
      opened ||= !c.active;closed ||= c.active;
      bounced ||= c.velocity<0;
      slam ||= ts2.sound.raised.some(s=>s.startsWith('69:'))&&ts2.effects.activeKinds.includes(66);
      if(i===20){
        ts2.openMenu();const frozen=JSON.stringify(ts2.paintCans);ts2.tickGame({},100,0);
        check(JSON.stringify(ts2.paintCans)===frozen,'paused lids advanced');ts2.pressMenu('back');ts2.tickGame({},1,0);
      }
    }
    check(rose&&closed&&opened&&slam&&bounced,'incomplete paint can cycle '+JSON.stringify({index,rose,closed,opened,slam,bounced,start,clock:can().clock}));
    check(ts2.viewer.objectTransforms.has(can().lid.index),'lid transform missing');
    check(ts2.viewer.objectTransforms.has(can().shadow.index),'shadow transform missing');
    check(can().shadow.position.y===can().lid.position.y,'shadow detached');
  }
  ts2.setPlayerPos(1e7,1e7,0);ts2.player.hitStun=1000;
  const frozen=ts2.paintCans.cans.map(c=>c.clock);ts2.tickGame({},10,0);
  check(JSON.stringify(frozen)===JSON.stringify(ts2.paintCans.cans.map(c=>c.clock)),'distant lids advanced');
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.paintCans.cans.every((c,i)=>c.clock===i*33&&c.velocity===0&&c.drop===0),'restart retained lid state');
  check(!ts2.effects.kinds.includes(66),'restart retained paint debris');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.paintCans===null,'paint cans leaked after exit');
  console.log('PASS all three paint cans rise/hold/drop/bounce, collision state, lid/shadow transforms, slam particles/sound, distance freeze, pause/restart/exit');
})()
