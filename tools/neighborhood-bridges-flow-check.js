/** Neighborhood bridge triggers through real push input. */
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
  async function leave(){
    ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
    ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
    await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
    if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
    await wait(()=>ts2.front.screen==='select','selector missing');
  }
  await enter(2);await ts2.spawnPlayer();ts2.viewer.stop();
  for(let t=0;t<2000&&ts2.talk;t++)ts2.tickGame({jump:(t&1)===0},1,0);
  for(const id of [0,1]){
    let pose=ts2.goToPushBlock(id);
    for(let t=0;t<100;t++){pose=ts2.goToPushBlock(id);if(id===1)ts2.player.y=-67008;Object.assign(ts2.player,{fallTimer:0,fellOut:false,hitStun:1000,climb:0,climbGroup:-1,pole:-1,poleLock:-1,zipLine:-1});ts2.tickGame({},1,pose.yaw);}
    pose=ts2.goToPushBlock(id);if(id===1)ts2.player.y=-67008;
    let heard=false;
    for(let t=0;t<500;t++){
      ts2.player.hitStun=0;ts2.tickGame({moveY:1},1,pose.yaw);heard ||= ts2.sound.raised.some(e=>e.startsWith('34:'));
      const b=ts2.neighborhoodBridges;if(id===0?b.firstSpeed===-2147483648:b.secondAngle===581)break;
    }
    const b=ts2.neighborhoodBridges;
    check(id===0?b.firstAngle===0:b.secondAngle===581,'real bridge push failed '+JSON.stringify({id,b,push:ts2.pushBlocks,p:ts2.player}));
    check(heard,'bridge impact cue missing '+id);
    for(const o of b.objects.filter(o=>id===0?o.id<12:o.id>=30))check(ts2.viewer.objectTransforms.get(o.index)?.startsWith(o.angles.join(',')+'|'),'near/far bridge art missing '+JSON.stringify({o,transform:ts2.viewer.objectTransforms.get(o.index)}));
    ts2.tickGame({},1);
  }
  ts2.openMenu();const frozen=JSON.stringify(ts2.neighborhoodBridges);ts2.tickGame({},100);check(JSON.stringify(ts2.neighborhoodBridges)===frozen,'paused bridge changed');ts2.pressMenu('back');ts2.tickGame({},1);
  await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.neighborhoodBridges.firstAngle===750&&ts2.neighborhoodBridges.secondAngle===0,'restart did not restore bridges');
  await leave();check(ts2.neighborhoodBridges===null,'bridges survived exit');
  console.log('PASS Neighborhood actual pushes on both bridges, near/far artwork, impact sounds, pause/restart/exit');
})()
