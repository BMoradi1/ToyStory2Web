/** Browser regression: Penthouse alternate collision and ambient effects.
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
  ts2.player.hitStun=10;ts2.tickGame({},1,0);check(state.scenery.hurt,'hurt collision did not switch');
  ts2.player.hitStun=0;ts2.tickGame({},1,0);check(!state.scenery.hurt,'normal collision did not return');
  for(const b of state.scenery.farBlocks){
    const o=state.objects.get(b.art);check(ts2.viewer.objectVertices.has(o.index),'missing distant push artwork');
    check(ts2.viewer.objectTransforms.has(o.index),'distant push artwork not transformed');
  }
  for(const [at,kind]of [[{x:0xfffa381e|0,y:0x187a8,z:0xfffaadaf|0},76],[{x:0x1187c,y:0x2bd92,z:-0x13b72},101]]){
    closeDialogue();ts2.setPlayerPos(at.x,at.z,at.y);let seen=false;
    for(let i=0;i<700&&!seen;i++){
      Object.assign(ts2.player,{...at,vx:0,vy:0,vz:0,hitStun:1000});ts2.tickGame({},1,0);
      if(ts2.talk)closeDialogue();seen=ts2.effects.activeKinds.includes(kind);
    }
    check(seen,'ambient kind '+kind+' missing; zones '+JSON.stringify(ts2.zones));
  }
  ts2.openMenu();const clock=state.scenery.clock;ts2.tickGame({},100,0);check(clock===state.scenery.clock,'paused ambient timer advanced');ts2.pressMenu('back');ts2.tickGame({},1,0);
  await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.penthouse!==state&&!ts2.penthouse.scenery.hurt,'scenery restart failed');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');check(ts2.penthouse===null,'scenery leaked after exit');
  console.log('PASS: hurt/recovery collision state, distant push artwork, both ambient emitters, pause, restart and exit');
})()
