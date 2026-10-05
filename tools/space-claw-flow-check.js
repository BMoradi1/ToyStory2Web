/** Space Land claw: real stomp inputs and delivered token. */
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
  const button={x:453717,z:250592,y:-73888};
  const tick=()=>ts2.tickGame({jump:!!ts2.talk},1,0);
  const hover=()=>{ts2.setPlayerPos(button.x,button.z,button.y-20000);Object.assign(ts2.player,{stomp:0,vy:0,onGround:false,hitStun:0,fallTimer:0});tick();};
  for(let i=0;i<100;i++)hover();
  const stomp=()=>{
    const before=ts2.spaceClaw.phase;
    ts2.setPlayerPos(button.x,button.z,button.y-20000);
    Object.assign(ts2.player,{stomp:1,onGround:false,vy:0,hitStun:0,fallTimer:0});
    let n=0;for(;n<100&&ts2.spaceClaw.phase===before;n++)tick();
    check(n<100,'real stomp did not advance claw '+JSON.stringify({phase:ts2.spaceClaw.phase,player:ts2.player}));return n;
  };
  const duration=stomp();check(ts2.spaceClaw.phase===1,'first press failed');
  const fold=v=>{v&=65535;return v>32767?65536-v:v;};
  for(const axis of ['x','z']){
    const s=ts2.spaceClaw,target=s.prize[axis]-s.base[axis];let n=0;
    while((s.cooldown>duration||Math.abs(fold(s[axis]+128*(duration-1))-target)>128)&&n++<1024)hover();
    check(n<1024,'could not time claw '+axis);const actual=stomp();
    console.log('Claw press',axis,{duration,actual,target,locked:fold(s[axis])});
  }
  check(ts2.spaceClaw.phase===3,'third press failed');
  check(ts2.guideSparkles.points.some(p=>p.index===0&&p.spent),'claw guide not retired');
  let n=0;while(ts2.spaceClaw.prizeState!==3&&n++<2000){
    hover();const s=ts2.spaceClaw;
    for(const o of s.objects){
      const transform=ts2.viewer.objectTransforms.get(o.index);check(transform,'missing artwork '+o.id);
      const offset=transform.split('|')[1].split(',').map(Number);
      check(Math.abs(offset[0]-(o.position.x-o.rest.x)/8192)<1e-6,'X artwork drift '+o.id);
      check(Math.abs(offset[1]+(o.position.y-o.rest.y)/8192)<1e-6,'Y artwork drift '+o.id);
    }
  }
  check(n<2000,'claw did not deliver prize '+JSON.stringify(ts2.spaceClaw));
  const prize=ts2.clawPrize;check(prize.reach===40,'released token unreachable');
  ts2.setPlayerPos(prize.x*32,prize.z*32,(prize.y+230)*32);tick();
  check(prize.collected,'released token not collectible');
  ts2.openMenu();const frozen=JSON.stringify(ts2.spaceClaw);ts2.tickGame({},100,0);
  check(JSON.stringify(ts2.spaceClaw)===frozen,'paused claw moved');ts2.pressMenu('back');ts2.tickGame({},1,0);
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.spaceClaw.phase===0&&!ts2.spaceClaw.randomized,'restart retained claw state');
  check(!ts2.clawPrize.collected&&ts2.clawPrize.reach===0,'restart retained delivered prize');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.spaceClaw===null,'claw leaked after exit');
  console.log('PASS Space Land claw real three-stomp win, rendered positions, token collection, pause/restart/exit');
})()
