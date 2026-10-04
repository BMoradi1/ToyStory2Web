/** Browser regression: Penthouse spring and guard doors.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/platforms.png --eval-file tools/penthouse-flow-check.js
 * Reads the supplied install; only the disposable browser's save is affected.
 * Positions Buzz over puzzle buttons; this is not a full playthrough.
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
  await enter(11);await ts2.spawnPlayer();ts2.viewer.stop();

  const state=ts2.penthouse;
  const closeDialogue=()=>{for(let j=0;j<2000&&ts2.talk;j++)ts2.tickGame({jump:(j&1)===0},1,0);check(!ts2.talk,'dialogue stuck');};
  const mesh=id=>{const o=state.objects.get(id),r=ts2.viewer.objectVertices.get(o.index)?.[0];check(r,'door artwork not separate '+id);return [...ts2.viewer.current.geometry.getAttribute('position').array.slice(r.start*3,r.start*3+9)];};
  for(const stomp of [false,true]){
    closeDialogue();const top=state.spring.polys.filter(p=>p.normal.y<-.75).sort((a,b)=>a.vertices[0].y-b.vertices[0].y)[0];
    const at=top.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});
    const place=()=>{ts2.setPlayerPos(at.x,at.z,at.y-16000);Object.assign(ts2.player,{vy:0,vx:0,vz:0,stomp:stomp?1:0,launched:false,hitStun:0,onGround:false,contacts:[],climb:0,climbGroup:-1});};
    place();for(let i=0;i<150&&!ts2.player.launched;i++){ts2.tickGame({},1,0);if(ts2.talk){closeDialogue();place();}}
    check(ts2.player.launched&&ts2.player.vy===(stomp?-3072:-2432),'spring launch failed '+stomp);
  }
  for(const d of state.doors){
    closeDialogue();check(d.phase===0,'door opened before guard defeat');
    const before=mesh(d.models[0]);const guard=ts2.creatures.find(c=>c.slot===d.slot);
    check(guard.health===1,'expected one-health guard');ts2.hurtCreature(d.slot,4);ts2.tickGame({},1,0);
    check(d.phase===1,'guard defeat did not trigger door');
    ts2.openMenu();ts2.tickGame({},100,0);check(d.phase===1,'paused door advanced');ts2.pressMenu('back');
    for(let i=0;i<80;i++){ts2.player.hitStun=1000;ts2.tickGame({},1,0);if(ts2.talk)closeDialogue();}
    check(d.phase>=1024,'door did not finish opening');check(JSON.stringify(before)!==JSON.stringify(mesh(d.models[0])),'door mesh frozen');
  }
  await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.penthouse!==state&&ts2.penthouse.doors.every(d=>d.phase===0),'door restart failed');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');check(ts2.penthouse===null,'door state leaked after exit');
  console.log('PASS: normal/stomp spring launches, real guard damage opens both doors, mesh rotation, pause, restart and exit');
})()
