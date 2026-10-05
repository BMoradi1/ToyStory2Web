/** Space Land ball pit: movement, particle presentation and lifecycle. */
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
  const level=8;await enter(level);await ts2.spawnPlayer();ts2.viewer.stop();
  const at={x:280000,z:220000,y:-33280};
  const tick=input=>ts2.tickGame(input??{},1,0);
  for(let i=0;i<100;i++){
    ts2.setPlayerPos(at.x,at.z,at.y-1000);Object.assign(ts2.player,{vy:0,fallTimer:0});tick();
  }
  ts2.setPlayerPos(at.x,at.z,at.y+100);Object.assign(ts2.player,{vy:0,fallTimer:0,onGround:false});
  let balls=false,rendered=false;
  for(let i=0;i<80;i++){
    tick({moveY:1});check(ts2.player.inBallPit&&!ts2.player.inMud&&!ts2.player.inWater,'wrong pit movement state');
    check(ts2.player.vy<=64,'pit sink cap exceeded');
    balls ||= ts2.effects.activeKinds.includes(95);rendered ||= ts2.effects.kinds.includes(95)&&ts2.effects.cards>0;
  }
  check(balls&&rendered,'ball scatter never appeared');
  check(ts2.player.forwardSpeed>=248&&ts2.player.forwardSpeed<=276,'pit did not slow movement');
  check(!ts2.effects.activeKinds.some(k=>[13,27,28,45,51,52,53,57].includes(k)),'water/mud effects leaked into pit');
  tick({jump:true});check(ts2.player.vy===-752&&ts2.player.jumpedFromGround,'pit escape jump failed');
  ts2.openMenu();const y=ts2.player.y;ts2.tickGame({},100,0);check(ts2.player.y===y,'paused player sank');
  ts2.pressMenu('back');tick();ts2.setPlayerPos(150000,220000,-34000);ts2.player.vy=0;tick();
  check(!ts2.player.inBallPit&&!ts2.player.inWater&&!ts2.player.inMud,'pit state leaked outside region');
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(!ts2.player.inBallPit&&!ts2.effects.activeKinds.includes(95),'restart retained pit state/effects');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.spaceBallPit===null,'ball pit leaked after exit');
  console.log('PASS Space Land ball-pit slow movement/sinking, scatter rendering, escape jump, exit, pause and restart/exit');
})()
