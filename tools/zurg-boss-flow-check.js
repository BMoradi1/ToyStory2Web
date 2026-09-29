/** Browser-harness regression: Zurg encounter lifecycle (positions Buzz and injects damage).
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/zurg-boss.png --eval-file tools/zurg-boss-flow-check.js
 * Reads the supplied install; only the disposable browser's save is affected.
 * Positions Buzz for focused task and collision checks; this is not a full playthrough.
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
  async function enter() {
    ts2.frontDrive(0,70);
    while(ts2.front.state.pos<12){ts2.frontDrive(0x20);ts2.frontDrive(0);}
    while(ts2.front.state.pos>12){ts2.frontDrive(0x80);ts2.frontDrive(0);}
    ts2.frontDrive(0x4000);ts2.frontDrive(0,40);
    for(let i=0;i<500&&!ts2.front.inLevel;i++) {
      if(ts2.cutsceneUp){window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));}
      await pause(100);
    }
    await wait(()=>ts2.front.inLevel,'Zurg level failed to start');
    ts2.viewer.stop();
  }
  await enter();
  await ts2.spawnPlayer();
  ts2.viewer.stop();
  const check=(ok,message)=>{if(!ok)throw Error(message);};

  const boss=()=>ts2.creatures.find(c=>c.slot===0);
  const tick=(n=1)=>{for(let i=0;i<n;i++){ts2.player.hitStun=1000;ts2.tickGame({},1,0);}};
  async function begin() {
    check(ts2.tasks.zurg?.phase===0,'init missing');
    Object.assign(ts2.player,{x:-100000,y:-76752,z:63129,vx:0,vy:0,vz:0});
    tick();check(ts2.tasks.zurg.phase===1&&ts2.cut.noControl,'intro/cut did not start');
    const y=boss().y,clock=ts2.tasks.zurg.cutTicks;
    ts2.openMenu();tick(100);
    check(boss().y===y&&ts2.tasks.zurg.cutTicks===clock,'pause advanced entrance');
    ts2.pressMenu('back');tick(310);
    check(ts2.tasks.zurg.phase===2&&!ts2.cut.noControl,'entrance did not hand back control: '+JSON.stringify(ts2.tasks));
    check(boss().vulnerable===6,'fight shell remained closed');
  }
  await begin();
  let ballistic=false,homing=false,windup=false;
  for(let i=0;i<360;i++) {
    tick();windup ||= boss().animState===0;
    ballistic ||= ts2.effects.kinds.includes(0x6c);
  }
  check(windup&&ballistic,'first volley missing');
  ts2.hurtCreature(0,4);tick();
  check(boss().health===27&&boss().vulnerable===4&&ts2.tasks.zurg.hurt===60,'hit recovery missing');
  const scales=new Set();
  for(let i=0;i<4;i++){
    tick();const scale=ts2.viewer.creatureMeshes.get(0)?.scale.x;
    check(scale===ts2.tasks.zurg.flashScale,'hurt scale not applied to rendered boss');scales.add(scale);
  }
  check(scales.has(1)&&scales.has(2),'recovery did not alternate draw scale');
  tick(56);check(boss().vulnerable===4,'recovery reopened early');tick();check(boss().vulnerable===6,'recovery stuck');
  for(let i=0;i<250;i++){tick();homing ||= ts2.effects.kinds.includes(0x6d);}
  check(homing,'retaliation volley missing');
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(boss().health===29&&ts2.tasks.zurg.hurt===0&&!ts2.effects.kinds.some(k=>k===108||k===109),'restart retained encounter');
  await begin();
  for(let i=0;i<10;i++){ts2.hurtCreature(0,4);tick();if(i<9)tick(61);}
  check(ts2.tasks.zurg.phase===3&&boss().health===9&&ts2.cut.noControl,'defeat cut missing');
  check((ts2.save.tokens[12]&128)!==0,'boss save bit missing');
  const deathY=boss().y;
  tick(250);
  check(ts2.tasks.zurg.phase===3,'victory fired before cut ended');
  check(boss().y>deathY&&ts2.tasks.zurg.fallSpeed>0,'defeat did not leave arena and fall: '+JSON.stringify({boss:boss(),zurg:ts2.tasks.zurg}));
  tick(60);
  // Exercise the ordinary movie completion/skip and front-end win handoff.
  for(let i=0;i<500&&ts2.front.inLevel;i++) {
    if(ts2.cutsceneUp){window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));}
    await pause(50);
  }
  await wait(()=>['summary','select'].includes(ts2.front.screen),'victory did not exit level');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector did not return');
  check(ts2.tasks===null,'Zurg task leaked after victory');
  await enter();await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.tasks.zurg.phase===0&&boss().health===29,'replay retained defeat');
  await begin();
  tick(80);ts2.viewer.frame(ts2.viewer.lastTime);
  console.log('PASS: Zurg natural intro/camera/pause, authored ballistic and retaliation volleys, injected-hit recovery/defeat, falling death, save bit, movie/win handoff, restart and replay. Buzz positioned and protected for focused checks.');
})()
