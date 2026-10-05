/** Andy cot: positioned approaches with actual laser input and installed hit shapes. */
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
  await enter(1);await ts2.spawnPlayer();ts2.viewer.stop();
  const dismiss=()=>{for(let t=0;t<2000&&ts2.talk;t++)ts2.tickGame({jump:(t&1)===0},1,0);};dismiss();
  const support=slot=>ts2.creatures.find(c=>c.slot===slot);
  let heard=false;
  const park=(slot,side)=>{
    heard ||= ts2.sound.raised.some(e=>e.startsWith('32:'));
    const c=support(slot),yaw=side<0?1024:3072;
    ts2.setPlayerPos(c.x+side*10000,c.z,c.y-3296+0x2c00);Object.assign(ts2.player,{vx:0,vy:0,vz:0,yaw,targetYaw:yaw,fallTimer:0,fellOut:false,hitStun:0,climb:0,climbGroup:-1,pole:-1,zipLine:-1,stomp:0,jumpState:0,spin:0,laserCharge:0});return yaw;
  };
  for(const slot of [0,2]){
    for(let t=0;t<100;t++){const yaw=park(slot,-1);ts2.tickGame({},1,yaw);if(ts2.talk)dismiss();}
    check(ts2.zones.camera===1&&support(slot).vulnerable===4,'protected side gating '+slot);
    for(let t=0;t<40;t++){const yaw=park(slot,-1);ts2.tickGame({fire:t<20},1,yaw);}
    check(support(slot).health===80&&support(slot).vulnerable===4,'protected cot took damage');
    for(let t=0;t<80&&support(slot).vulnerable!==0;t++){const yaw=park(slot,1);ts2.tickGame({fire:t<40},1,yaw);}
    check(support(slot).vulnerable===0,'exposed cot laser failed '+slot+' '+JSON.stringify({c:support(slot),p:ts2.player,beams:ts2.effects.beams,zones:ts2.zones}));
    if(slot===0)check(ts2.andyCot.timer===0,'single support dropped cot');
    for(let t=0;t<200;t++){const yaw=park(slot,1);ts2.tickGame({},1,yaw);}
    check(support(slot).health===80&&support(slot).roll===(slot===0?1792:2304),'cot support did not settle '+slot);
    check(Math.abs(ts2.viewer.creatureMeshes.get(slot).rotation.z+support(slot).roll*Math.PI/2048)<1e-8,'support render roll mismatch');
  }
  check(ts2.andyCot.timer===-1,'cot drop did not finish');
  check(ts2.andyCot.objects.every(o=>o.position.y!==o.rest.y),'cot artwork did not fall');
  for(const o of ts2.andyCot.objects){const pose=ts2.viewer.objectTransforms.get(o.index);check(pose,'cot render transform missing');const dy=Number(pose.split('|')[1].split(',')[1]);check(Math.abs(dy*8192+o.position.y-o.rest.y)<1,'cot rendered offset mismatch');}
  check(heard,'cot bounce sound missing');
  ts2.openMenu();const frozen=JSON.stringify(ts2.andyCot);ts2.tickGame({},100);check(JSON.stringify(ts2.andyCot)===frozen,'paused cot changed');ts2.pressMenu('back');ts2.tickGame({},1,0);
  await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.andyCot.timer===0&&[0,2].every(slot=>support(slot).vulnerable===4&&support(slot).roll===0),'restart retained cot state');
  await leave();check(ts2.andyCot===null,'cot survived exit');
  console.log('PASS actual protected/exposed cot laser shots, both support rolls, one-shot near/far drop, audio, pause/restart/exit');
})()
