/** Construction Yard drawbridge lifecycle: uses real stomp contacts. */
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
  const surface=ts2.stompSurfaces.find(s=>s.surface===36),top=surface.tops[0];
  const at=top.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});
  const pound=()=>{
    ts2.setPlayerPos(at.x,at.z,at.y-20000);
    Object.assign(ts2.player,{stomp:1,hitStun:0,fallTimer:0,onGround:false,vy:0});
    for(let i=0;i<100&&ts2.constructionBridge.phase===0;i++)ts2.tickGame({},1,0);
    check(ts2.constructionBridge.phase===1,'bridge stomp did not trigger');
  };
  pound();
  check(ts2.guideSparkles.points.some(p=>p.index===3&&p.spent),'bridge guide not retired');
  for(let i=0;i<320&&ts2.constructionBridge.phase===1;i++)ts2.tickGame({},1,0);
  check(ts2.constructionBridge.phase===2&&ts2.constructionBridge.angle===-2464,'bridge failed to lower');
  for(const o of ts2.constructionBridge.objects)check(ts2.viewer.objectTransforms.get(o.index)?.startsWith('0,0,-2|'),'bridge artwork not lowered');
  check(ts2.sound.raised.some(s=>s.startsWith('6d:'))&&ts2.sound.raised.some(s=>s.startsWith('6e:')),'bridge sounds absent');
  ts2.openMenu();const frozen=JSON.stringify(ts2.constructionBridge);ts2.tickGame({},100,0);
  check(JSON.stringify(ts2.constructionBridge)===frozen,'paused bridge moved');ts2.pressMenu('back');ts2.tickGame({},1,0);
  ts2.tickGame({},600,0);check(ts2.constructionBridge.phase===0&&ts2.constructionBridge.angle===0,'bridge did not return');
  pound();ts2.tickGame({},60,0);check(ts2.constructionBridge.angle<0,'bridge cannot activate twice');
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.constructionBridge.phase===0&&ts2.constructionBridge.angle===0&&ts2.constructionBridge.velocity===0,'restart retained bridge motion');
  for(const o of ts2.constructionBridge.objects)check(ts2.viewer.objectTransforms.get(o.index)?.startsWith('0,0,614|'),'restart retained bridge artwork');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.constructionBridge===null,'bridge controller leaked after exit');
  console.log('PASS Construction Yard bridge stomp, lowering/hold/return, artwork, sound/guide, repeat activation, pause/restart/exit');
})()
