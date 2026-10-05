/** Construction Yard shuttle lifecycle: installed movement scripts. */
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
  check(!ts2.zoneGraph().some(([from,to])=>from===1&&to===2),'trailer portal starts open');
  const near=()=>ts2.setPlayerPos(0x51b97,0x5e58e,-0x104fd);
  near();ts2.tickGame({},8,0);
  check(ts2.constructionScenery.height===0,'near scenery failed to collapse');
  check(ts2.zoneGraph().some(([from,to])=>from===1&&to===2),'near trailer portal stayed closed');
  for(const o of ts2.constructionScenery.objects)check(ts2.viewer.objectTransforms.get(o.index).endsWith('|1,0,1'),'collapsed scenery artwork mismatch');
  ts2.openMenu();const frozen=JSON.stringify(ts2.constructionScenery);ts2.tickGame({},100,0);
  check(JSON.stringify(ts2.constructionScenery)===frozen,'paused scenery changed');ts2.pressMenu('back');ts2.tickGame({},1,0);
  ts2.setPlayerPos(0,0,-2000000);ts2.tickGame({},8,0);
  check(ts2.constructionScenery.height===4096,'distant scenery failed to restore');
  check(!ts2.zoneGraph().some(([from,to])=>from===1&&to===2),'distant trailer portal stayed open');
  near();ts2.tickGame({},8,0);check(ts2.constructionScenery.height===0,'repeat proximity failed');
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.constructionScenery.height===4096,'restart retained collapsed scenery');
  check(!ts2.zoneGraph().some(([from,to])=>from===1&&to===2),'restart retained open trailer portal');
  for(const o of ts2.constructionScenery.objects)check(ts2.viewer.objectTransforms.get(o.index).endsWith('|1,1,1'),'restart scenery artwork mismatch');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.constructionScenery===null,'scenery controller leaked after exit');
  console.log('PASS Construction Yard proximity collapse/restore, both artwork scales, repeat approach, trailer portal gating, pause/restart/exit');
})()
