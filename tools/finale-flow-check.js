/** Browser-harness regression: Final Showdown lifecycle (positions Buzz and injects damage).
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/finale.png --eval-file tools/finale-flow-check.js
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
    while(ts2.front.state.pos<15){ts2.frontDrive(0x20);ts2.frontDrive(0);}
    while(ts2.front.state.pos>15){ts2.frontDrive(0x80);ts2.frontDrive(0);}
    ts2.frontDrive(0x4000);ts2.frontDrive(0,40);
    for(let i=0;i<500&&!ts2.front.inLevel;i++) {
      if(ts2.cutsceneUp){window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));}
      await pause(100);
    }
    await wait(()=>ts2.front.inLevel,'Finale failed to start');
    ts2.viewer.stop();
  }
  await enter();
  await ts2.spawnPlayer();
  ts2.viewer.stop();
  const check=(ok,message)=>{if(!ok)throw Error(message);};

  const cast=()=>ts2.creatures;
  const actor=i=>cast().find(c=>c.slot===i);
  const tick=(n=1)=>{for(let i=0;i<n;i++){ts2.player.hitStun=1000;ts2.tickGame({},1,0);}};
  const mesh=()=>ts2.viewer.current.geometry.getAttribute('position').array;
  const initialVertices=Array.from(mesh());
  async function begin(){
    check(ts2.tasks.finale?.entrance===0,'init missing');
    check([0,1,2].every(i=>actor(i).health===0),'bosses visible before entrance');
    Object.assign(ts2.player,{x:-100000,y:0,z:0,vx:0,vy:0,vz:0});
    tick();check(ts2.tasks.finale.entrance===80&&ts2.cut.noControl,'intro did not start');
    tick(205);
    check(Array.from(mesh()).some((v,i)=>v!==initialVertices[i]),'stage artwork did not bounce: '+JSON.stringify({s:ts2.tasks.finale,transforms:[...ts2.viewer.objectTransforms.entries()]}));
    const clock=ts2.tasks.finale.entrance,vertices=Array.from(mesh());
    ts2.openMenu();tick(100);check(ts2.tasks.finale.entrance===clock,'pause advanced stage');
    check(Array.from(mesh()).every((v,i)=>v===vertices[i]),'paused stage moved');
    ts2.pressMenu('back');tick(280);
    check(ts2.tasks.finale.active&&!ts2.cut.noControl,'fight handoff missing');
    check([0,1,2].every(i=>actor(i).health===29),'bosses not released');
    check(actor(3).health===0&&actor(4).health===0,'hostages not hidden');
  }
  await begin();
  const seen=new Set();let rolled=false;
  for(const slot of [0,1,2]){
    for(let i=0;i<1200&&!seen.has([102,97,104][slot]);i++){
      const c=actor(slot);Object.assign(ts2.player,{x:c.x+25000,y:c.y,z:c.z+10000,vx:0,vy:0,vz:0});
      tick();for(const kind of ts2.effects.kinds)seen.add(kind);
      rolled ||= ts2.tasks.finale.roll!==0;
    }
  }
  check([102,97,104].every(k=>seen.has(k)),'authored attacks missing: '+JSON.stringify({seen:[...seen],cast:cast(),s:ts2.tasks.finale}));
  for(let i=0;i<300&&!rolled;i++){tick();rolled ||= ts2.tasks.finale.roll!==0;}
  check(rolled,'camera roll never started');
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.tasks.finale.defeated===0&&ts2.tasks.finale.roll===0,'restart retained combat');
  check(Array.from(mesh()).every((v,i)=>Math.abs(v-initialVertices[i])<0.001),'restart retained stage deformation');
  await begin();
  for(const slot of [0,1,2]){
    for(let hit=0;hit<10;hit++){
      const c=actor(slot);Object.assign(ts2.player,{x:c.x+25000,y:c.y,z:c.z+10000,vx:0,vy:0,vz:0});
      ts2.hurtCreature(slot,4);tick();
      if(hit<9){check(actor(slot).vulnerable===4,'hit did not close shell');tick(60);}
    }
    check(ts2.tasks.finale.fighters[slot].phase===3,'boss defeat missing '+slot);
  }
  tick();check(ts2.tasks.finale.defeated===4&&ts2.cut.noControl,'last-boss cut missing');
  check((ts2.save.tokens[15]&128)===0,'completion saved before rescue');
  tick(120);
  check(ts2.tasks.finale.defeated===5&&actor(3).health===1&&actor(4).health===1,'rescue missing');
  check((ts2.save.tokens[15]&128)!==0,'final boss save bit missing');
  tick(240);
  for(let i=0;i<1000&&ts2.front.screen!=='credits';i++){
    if(ts2.cutsceneUp){window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));}
    await pause(50);
  }
  await wait(()=>ts2.front.screen==='credits','ending did not reach credits');
  check(ts2.tasks===null,'finale state leaked into credits');
  check(ts2.save.gameBeaten,'ending did not save game completion');
  ts2.frontDrive(0,120);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'credits did not exit');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector did not return');
  await enter();await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.tasks.finale.entrance===0&&ts2.tasks.finale.defeated===0,'replay did not reset');
  console.log('PASS: finale intro, rendered bounce/pause/reset, all three authored attacks, roll, injected-hit recovery/defeat, rescue/save, ending/credits and replay. Buzz positioned/protected.');
})()
