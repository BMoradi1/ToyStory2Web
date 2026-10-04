/** Browser regression: Penthouse train routing and switches.
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

  const state=ts2.penthouse,t=state.train;
  const closeDialogue=()=>{for(let j=0;j<2000&&ts2.talk;j++)ts2.tickGame({jump:(j&1)===0},1,0);check(!ts2.talk,'dialogue stuck');};
  const mesh=id=>{const o=state.objects.get(id),r=ts2.viewer.objectVertices.get(o.index)?.[0];check(r,'train artwork not separate '+id);return [...ts2.viewer.current.geometry.getAttribute('position').array.slice(r.start*3,r.start*3+9)];};
  const near=mesh(38),far=mesh(80);
  for(const index of [0,1,1,1,2]){
    closeDialogue();const b=t.buttons[index],previous=t.mask;
    const top=b.hull.polys.filter(p=>p.normal.y<-.8).sort((a,b)=>a.vertices[0].y-b.vertices[0].y)[0];
    const at=top.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});
    const place=()=>{ts2.setPlayerPos(at.x,at.z,at.y-20000);Object.assign(ts2.player,{vy:0,vx:0,vz:0,stomp:1,hitStun:0,onGround:false,contacts:[],climb:0,climbGroup:-1});};
    place();for(let i=0;i<100&&t.mask===previous;i++){ts2.tickGame({},1,0);if(ts2.talk){closeDialogue();place();}}
    check(t.mask!==previous,'train selector failed '+index);check(t.flash>0,'selector flash missing');
  }
  check(t.mask===70,'wrong solved route mask '+t.mask);
  check(JSON.stringify(near)!==JSON.stringify(mesh(38)),'near train mesh frozen');
  check(JSON.stringify(far)!==JSON.stringify(mesh(80)),'far train mesh frozen');
  ts2.openMenu();const frozen=JSON.stringify(t.position);ts2.tickGame({},100,0);check(JSON.stringify(t.position)===frozen,'paused train moved');ts2.pressMenu('back');
  // Keep Buzz at the last selector while the train traverses its authored routes.
  const safe={x:ts2.player.x,y:ts2.player.y-20000,z:ts2.player.z};let smoke=false;
  for(let i=0;i<20000&&t.path!==0;i++){
    Object.assign(ts2.player,{...safe,vx:0,vy:0,vz:0,hitStun:1000});ts2.tickGame({},1,0);
    smoke||=ts2.effects.activeKinds.includes(17);if(ts2.talk)closeDialogue();
  }
  check(t.path===0,'train did not reach end');check(smoke,'train smoke absent');
  await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.penthouse!==state&&ts2.penthouse.train.path===1&&ts2.penthouse.train.mask===37,'train restart failed');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');check(ts2.penthouse===null,'train leaked after exit');
  console.log('PASS: three train switches, route cycling, near/far mesh motion, finish, smoke, pause, restart and exit');
})()
