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
  const level=8;await enter(level);await ts2.spawnPlayer();ts2.viewer.stop();
  const original=ts2.texturePixels(18).data;
  const mother=()=>ts2.creatures.find(c=>c.slot===2);
  let visibleFrames=0,hiddenFrames=0;
  const tick=()=>{
    const before=ts2.texturePixels(18).version,ticks=ts2.textureAnimation.ticks;
    ts2.tickGame({jump:!!ts2.talk},1,0);
    if(ts2.textureAnimation.ticks===ticks)return;
    const visible=(mother().flags&1)!==0,updated=ts2.texturePixels(18).version>before;
    check(visible===updated,'texture update did not follow Mother visibility');
    if(visible)visibleFrames++;else hiddenFrames++;
  };
  for(let i=0;i<120;i++){
    ts2.setPlayerPos(10000000,10000000,-2000000);ts2.player.fallTimer=0;tick();
  }
  const base=mother();
  for(let i=0;i<320&&visibleFrames<20;i++){
    const angle=Math.floor(i/80)*Math.PI/2;
    ts2.setPlayerPos(base.x+Math.round(Math.sin(angle)*18000),base.z+Math.round(Math.cos(angle)*18000),base.y);
    ts2.player.hitStun=1000;ts2.player.fallTimer=0;tick();
  }
  check(visibleFrames>=20&&hiddenFrames>=20,'did not exercise both visibility states '+JSON.stringify({visibleFrames,hiddenFrames,mother:mother()}));
  const texture=ts2.texturePixels(18),after=texture.data;
  check(after.some((v,i)=>v!==original[i]),'Mother texture pixels never changed');
  for(let y=0;y<texture.height;y++)for(let x=0;x<texture.width;x++){
    if(x>=64&&x<84&&y<64)continue;
    for(let c=0;c<4;c++){const i=(y*texture.width+x)*4+c;check(after[i]===original[i],'texture changed outside Mother strip');}
  }
  ts2.openMenu();const version=ts2.texturePixels(18).version;ts2.tickGame({},100,0);
  check(ts2.texturePixels(18).version===version,'paused texture updated');ts2.pressMenu('back');ts2.tickGame({},1,0);
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.texturePixels(18).data.every((v,i)=>v===original[i]),'restart retained animated pixels');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.textureAnimation.ticks===0,'texture phase leaked after exit');
  console.log('PASS Space Land Mother visible/hidden texture gate, exact pixel bounds, pause/restart/exit');
})()
