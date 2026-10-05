/** Toy Barn shuttle lifecycle: installed movement scripts. */
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
  async function leave(){
    ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
    ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
    await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
    if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
    await wait(()=>ts2.front.screen==='select','selector missing');
  }
  const cases=[
    [1,'FUN_00416a60',null,0x20],[2,'FUN_00418610',0x48,0x49],
    [4,'FUN_0041bb80',0x6b,0x6c],[5,'FUN_0041dec0',0xa2,0xa2],
    [7,'FUN_00420ed0',0x77,0x77],[8,'FUN_00422c70',0x80,0xb8],
    [10,'FUN_004259b0',0x8e,0x8e],[11,'FUN_00428650',0x96,0x96],
    [13,'FUN_0042c150',0x6b,0x6c],[14,'FUN_0042d620',null,0x1f],
  ];
  for(const [level,handler,idle,pickup] of cases){
    await enter(level);await ts2.spawnPlayer();ts2.viewer.stop();
    const first=ts2.creatures.find(c=>c.handler===handler&&c.health===102&&(c.flags&8192)===0);check(first,'missing rescue '+level);
    const get=()=>ts2.creatures.find(c=>c.slot===first.slot);let heard=false,projectile=false;
    for(let t=0;t<(level===2?800:600);t++){
      const c=get();ts2.setPlayerPos(c.x+16000,c.z,c.y);Object.assign(ts2.player,{vy:0,fallTimer:0,hitStun:1000});ts2.tickGame({},1,0);
      if(idle!==null)heard ||= ts2.sound.raised.some(e=>e.startsWith(idle.toString(16)+':'));
      projectile ||= ts2.effects.activeKinds.includes(121);
    }
    check(idle===null||heard,'native idle sound absent '+level+' '+JSON.stringify({creature:get(),talk:ts2.talk,menu:ts2.menu,player:ts2.player,sounds:ts2.sound.raised}));
    if(level===2)check(projectile,'visible duck projectile absent');
    for(let t=0;t<2000&&ts2.talk;t++)ts2.tickGame({jump:(t&1)===0},1,0);
    let pickupSound=false;
    for(let t=0;t<100&&get().health!==0;t++){
      const c=get();ts2.setPlayerPos(c.x,c.z,c.y+c.offsetY+0x1cc0);Object.assign(ts2.player,{vy:0,fallTimer:0,hitStun:0});ts2.tickGame({},1,0);
      pickupSound ||= ts2.sound.raised.some(e=>e.startsWith(pickup.toString(16)+':'));
    }
    check(get().health===0&&pickupSound,'actual rescue/cue failed '+level+' '+JSON.stringify(get()));
    await ts2.spawnPlayer();ts2.viewer.stop();check(get().health===102,'rescue restart failed '+level);
    await leave();console.log('PASS rescue idle/collection/restart level '+level);
  }
  console.log('PASS all ten rescue levels: native idle cues, visible duck effect, actual collection cues, restart and exit');
})()
