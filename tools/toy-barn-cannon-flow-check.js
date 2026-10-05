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
  const level=7;await enter(level);await ts2.spawnPlayer();ts2.viewer.stop();
  const at={x:-32544,y:-10880,z:-342155};
  for(let t=0;t<90;t++){ts2.setPlayerPos(at.x,at.z,at.y-50000);Object.assign(ts2.player,{vy:0,fallTimer:0});ts2.tickGame({},1,0);}
  ts2.setPlayerPos(at.x,at.z,at.y-20000);Object.assign(ts2.player,{vy:0,fallTimer:0,onGround:false,stomp:1});
  for(let t=0;t<100&&!ts2.toyBarnCannon.timer;t++)ts2.tickGame({},1,0);
  check(ts2.toyBarnCannon.timer===2700&&ts2.toyBarnCannon.pressed,'real cannon switch stomp failed');
  ts2.tickGame({},1,0);check(ts2.toyBarnCannon.clock===145,'cannon countdown missing');
  const c=ts2.toyBarnCannon;ts2.setPlayerPos(-7435,c.position.z-3595,c.position.y-60160);Object.assign(ts2.player,{vy:0,vx:0,vz:0,onGround:false,stomp:0,launched:false});
  for(let t=0;t<130&&!ts2.player.launched;t++)ts2.tickGame({},1,0);
  check(ts2.player.launched&&ts2.player.vy===-3072&&ts2.player.yaw===0xb90,'physical cannon landing did not launch');
  check(ts2.toyBarnCannon.recoil===1,'cannon recoil missing');
  for(const o of ts2.toyBarnCannon.objects){
    const pose=ts2.viewer.objectTransforms.get(o.index);check(pose,'missing cannon artwork');
    if(o.id===33)check(pose.startsWith('0,0,-384|'),'pressed switch not rendered');
    else{const delta=pose.split('|')[1].split(',').map(Number),shift=o.id?7:5,at=ts2.toyBarnCannon.position;
      for(const [a,axis] of ['x','y','z'].entries())check(Math.abs(delta[a]*8192-(((at[axis]>>shift)<<shift)-o.rest[axis])*(a?-1:1))<1e-6,'cannon near/far drift');}
  }
  ts2.openMenu();const frozen=JSON.stringify(ts2.toyBarnCannon);ts2.tickGame({},100,0);check(JSON.stringify(ts2.toyBarnCannon)===frozen,'pause advanced cannon');ts2.pressMenu('back');ts2.tickGame({},1,0);
  ts2.setPlayerPos(0,-0x11202,-2000000);Object.assign(ts2.player,{vy:0,fallTimer:0});ts2.tickGame({},1,0);
  check(ts2.toyBarnCannon.timer===0&&!ts2.toyBarnCannon.pressed,'leaving cannon region failed to reset switch');
  ts2.goToCreature(13);Object.assign(ts2.player,{vy:0,launched:false,fallTimer:0});
  for(let t=0;t<160&&!ts2.talk;t++)ts2.tickGame({},1,0);
  check(ts2.talk&&ts2.tasks.fetch===1,'ended cannon blocked next fetch offer');
  for(let t=0;t<2000&&ts2.talk;t++)ts2.tickGame({jump:(t&1)===0},1,0);
  await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.toyBarnCannon.timer===0&&ts2.toyBarnCannon.speed===0&&ts2.toyBarnCannon.angle===0,'restart retained cannon state');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.toyBarnPlatforms===null&&ts2.toyBarnRotors===null&&ts2.toyBarnEffects===null&&ts2.toyBarnSprings===null&&ts2.toyBarnCannon===null,'Toy Barn controller leaked after exit');
  console.log('PASS Toy Barn cannon real stomp/launch, recoil, HUD, near/far/button poses, NPC handoff, early end and pause/restart/exit');
})()
