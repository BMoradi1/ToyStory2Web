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
  await enter(5);await ts2.spawnPlayer();ts2.viewer.stop();
  const hold=(at)=>{ts2.setPlayerPos(at.x,at.z,at.y);Object.assign(ts2.player,{vy:0,fallTimer:0,fellOut:false,hitStun:1000,climb:0,climbGroup:-1,pole:-1,zipLine:-1,stomp:0});ts2.tickGame({},1,0);};
  let projectile=false,vent=false,sounded=false;
  const at=ts2.alleyEffects.points[2];
  for(let t=0;t<300;t++){hold({x:at.x+10000,y:at.y,z:at.z});projectile ||= ts2.effects.activeKinds.includes(76);sounded ||= ts2.sound.raised.some(e=>e.startsWith('a4:'));}
  check(projectile&&sounded,'paired path projectile/sound missing');
  for(let t=0;t<700;t++){hold({x:0x29630+10000,y:-0xa5660,z:-0x2eb06});vent ||= ts2.effects.activeKinds.includes(93);}
  check(ts2.zones.camera===2&&vent,'room-2 emitter missing '+JSON.stringify({zone:ts2.zones,vent}));
  for(const z of [900000,1100000]){
    const water=z>0xf329f?458752:65536;
    for(let t=0;t<90;t++)hold({x:0,y:water-20000,z});
    check(!ts2.player.inWater,'above-water Buzz marked submerged');
    let splash=false;
    for(let t=0;t<120;t++){
      hold({x:0,y:water+20000,z});splash ||= ts2.sound.raised.some(e=>e.startsWith('3a:'));
      check(ts2.player.inWater,'water plane did not affect player '+z+' '+JSON.stringify({p:ts2.player,talk:ts2.talk,menu:ts2.menu,front:ts2.front.screen}));
      for(const o of ts2.alleyEffects.objects)check(o.scale.every(v=>v===(ts2.camera.y>water?0:1)),'underwater artwork visibility mismatch');
    }
    check(splash,'water entry splash missing '+z);
  }
  ts2.openMenu();const before=[ts2.alleyEffects.timer,ts2.alleyEffects.node,ts2.alleyEffects.vent].join();ts2.tickGame({},120);
  check(before===[ts2.alleyEffects.timer,ts2.alleyEffects.node,ts2.alleyEffects.vent].join(),'paused emitter advanced');ts2.pressMenu('back');ts2.tickGame({},1);
  await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.alleyEffects.timer===0&&ts2.alleyEffects.node===0&&ts2.alleyEffects.vent===0,'restart retained emitters');
  await leave();check(ts2.alleyEffects===null,'Alley effects survived exit');
  console.log('PASS Alley paired projectile/sound, room-2 emitter, both water heights/swimming/splashes, underwater artwork, pause/restart/exit');
})()
