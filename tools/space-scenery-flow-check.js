/** Space Land scenery and room-gated displays. */
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
  const spawn={x:ts2.player.x,y:ts2.player.y,z:ts2.player.z};
  const tick=()=>ts2.tickGame({jump:!!ts2.talk},1,0);
  const hold=at=>{ts2.setPlayerPos(at.x,at.z,at.y);ts2.player.fallTimer=0;tick();};
  const displays=()=>ts2.spaceScenery.objects.filter(o=>o.id>=20);
  for(let i=0;i<20;i++)hold(spawn);
  check(ts2.zones.player!==4,'initial point is claw room');
  const frozen=JSON.stringify(displays()),phase=ts2.textureAnimation.phase;
  const hanging=JSON.stringify(ts2.spaceScenery.objects.filter(o=>o.id<10));
  for(let i=0;i<100;i++)hold(spawn);
  check(JSON.stringify(displays())===frozen,'display moved outside room 4');
  check(ts2.textureAnimation.phase===phase,'claw texture advanced outside room');
  check(JSON.stringify(ts2.spaceScenery.objects.filter(o=>o.id<10))!==hanging,'hanging toys never moved');
  const button={x:453717,z:250592,y:-93888};
  for(let i=0;i<180;i++)hold(button);
  check(ts2.zones.player===4,'did not enter claw room');
  check(displays().every(o=>o.phase>0),'displays failed to animate');
  check(ts2.textureAnimation.phase!==phase,'claw texture failed to advance');
  for(const o of ts2.spaceScenery.objects){
    const value=ts2.viewer.objectTransforms.get(o.index);check(value,'missing animated object '+o.id);
    const [angle,offset]=value.split('|');
    check(angle===o.angles.join(','),'scenery angle drift '+o.id);
    const p=offset.split(',').map(Number);
    check(Math.abs(p[0]-(o.position.x-o.rest.x)/8192)<1e-6,'scenery X drift '+o.id);
    check(Math.abs(p[1]+(o.position.y-o.rest.y)/8192)<1e-6,'scenery Y drift '+o.id);
  }
  ts2.openMenu();const paused=JSON.stringify(ts2.spaceScenery);ts2.tickGame({},100,0);
  check(JSON.stringify(ts2.spaceScenery)===paused,'paused scenery moved');ts2.pressMenu('back');ts2.tickGame({},1,0);
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.spaceScenery.objects.every(o=>o.phase===0&&o.yaw===0),'restart retained animation');
  for(const o of ts2.spaceScenery.objects)check(ts2.viewer.objectTransforms.get(o.index).startsWith(o.restAngles.join(',')+'|0,0,0|'),'restart retained rendered transform');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.spaceScenery===null,'scenery leaked after exit');
  console.log('PASS Space Land scenery rendered motion, room gates, texture phase, pause/restart/exit');
})()
