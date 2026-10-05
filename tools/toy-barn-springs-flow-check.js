/** Toy Barn shuttle lifecycle: installed movement scripts. */
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
  const level=7;await enter(level);await ts2.spawnPlayer();ts2.viewer.stop();
  for(const test of [{surface:8,x:313696,y:-39413,z:-250091,stomp:true},{surface:9,x:2816,y:-15445,z:220821,stomp:false},{surface:9,x:2816,y:-15445,z:220821,stomp:true}]){
    await ts2.spawnPlayer();ts2.viewer.stop();
    for(let i=0;i<90;i++){ts2.setPlayerPos(test.x,test.z,test.y-50000);Object.assign(ts2.player,{vy:0,fallTimer:0});ts2.tickGame({},1,0);}
    ts2.setPlayerPos(test.x,test.z,test.y-20000);Object.assign(ts2.player,{vy:0,fallTimer:0,stomp:test.stomp?1:0,onGround:false});
    let launched=false,animated=false;
    for(let i=0;i<100&&!launched;i++){
      ts2.tickGame({},1,0);
      launched=ts2.player.vy< -2000;
      animated ||= ts2.toyBarnSprings.chair>0||ts2.toyBarnSprings.bounce>0;
    }
    check(launched&&animated,'spring did not launch '+JSON.stringify(test));
    check(ts2.player.vy===(test.stomp?-3072:-2432),'wrong spring impulse');
    check(ts2.player.launched===(test.surface===8),'wrong directional launch mode');
    if(test.surface===8)check(ts2.player.yaw===0x81e,'wrong launch direction');
    for(const o of ts2.toyBarnSprings.objects){
      const pose=ts2.viewer.objectTransforms.get(o.index);check(pose===o.angles.join(',')+'|0,0,0|'+o.scale.join(','),'spring artwork mismatch');
    }
    ts2.openMenu();const frozen=JSON.stringify(ts2.toyBarnSprings);ts2.tickGame({},100,0);check(JSON.stringify(ts2.toyBarnSprings)===frozen,'pause advanced spring');ts2.pressMenu('back');ts2.tickGame({},1,0);
  }
  await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.toyBarnSprings.chair===0&&ts2.toyBarnSprings.bounce===0,'restart retained spring animation');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.toyBarnPlatforms===null&&ts2.toyBarnRotors===null&&ts2.toyBarnEffects===null&&ts2.toyBarnSprings===null,'Toy Barn controller leaked after exit');
  console.log('PASS Toy Barn physical spring landings/stomps, directional impulses, artwork, pause/restart/exit');
})()
