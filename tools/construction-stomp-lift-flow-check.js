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
  const start={...ts2.constructionStompLift.position};
  for(let id=0;id<3;id++){
    const button=ts2.constructionStompLift.switches[id],floor=button.hull.polys.find(p=>p.normal.y<-.99);
    const y=floor.vertices[0].y*32,z=Math.max(...floor.vertices.map(v=>v.z))*32-1024;
    ts2.setPlayerPos(button.hull.origin.x*32,z,y-20000);
    Object.assign(ts2.player,{stomp:1,hitStun:0,fallTimer:0,onGround:false,vy:0});
    for(let i=0;i<100&&!button.pressed;i++)ts2.tickGame({},1,0);
    check(button.pressed,'real stomp failed for switch '+id);
    check(ts2.viewer.objectTransforms.get(button.art.index).startsWith('-384,0,0|'),'pressed switch artwork missing');
    check(ts2.guideSparkles.points.some(p=>p.index===id+4&&p.spent),'switch guide was not retired');
  }
  check((ts2.constructionStompLift.bits&7)===7,'switches did not select all heights');
  let down=false,back=false,min=start.y;
  for(let i=0;i<2400&&!back;i++){
    ts2.setPlayerPos(0,0,-2000000);ts2.player.fallTimer=0;ts2.tickGame({},1,0);
    const lift=ts2.constructionStompLift;min=Math.min(min,lift.position.y);
    if(lift.bits&8)down=true;else if(down)back=true;
    const offset=ts2.viewer.objectTransforms.get(lift.art.index).split('|')[1].split(',').map(Number);
    check(Math.abs(offset[1]+(lift.position.y-lift.art.rest.y)/8192)<1e-6,'lift artwork drifted from collision');
  }
  check(down&&back&&min<start.y-0x63380,'lift failed its full top-height cycle');
  ts2.openMenu();const frozen=JSON.stringify(ts2.constructionStompLift);ts2.tickGame({},100,0);
  check(JSON.stringify(ts2.constructionStompLift)===frozen,'paused stomp lift moved');ts2.pressMenu('back');ts2.tickGame({},1,0);
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.constructionStompLift.bits===0&&ts2.constructionStompLift.velocity===0,'restart retained switch state');
  check(JSON.stringify(ts2.constructionStompLift.position)===JSON.stringify(start),'restart retained lift position');
  for(const b of ts2.constructionStompLift.switches)check(ts2.viewer.objectTransforms.get(b.art.index).startsWith('0,0,0|'),'restart retained pressed artwork');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.constructionStompLift===null,'stomp lift controller leaked after exit');
  console.log('PASS Construction Yard three real stomp switches, guide/artwork, lift top-height round trip, pause/restart/exit');
})()
