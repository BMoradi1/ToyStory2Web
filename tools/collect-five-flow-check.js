/** Installed collect-five task lifecycle, using protected teleports for contacts. */
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
  const dismiss=()=>{for(let t=0;t<2000&&ts2.talk;t++)ts2.tickGame({jump:(t&1)===0},1,0);check(!ts2.talk,'dialogue stuck');};
  const hold=at=>{ts2.setPlayerPos(at.x,at.z,at.y);Object.assign(ts2.player,{vx:0,vy:0,vz:0,fallTimer:0,fellOut:false,hitStun:0,climb:0,climbGroup:-1,pole:-1,zipLine:-1,stomp:0});};
  for(const [level,giver] of [[4,26],[5,18],[11,2],[13,5]]){
    await enter(level);await ts2.spawnPlayer();ts2.viewer.stop();dismiss();
    check(ts2.pickups.challengeItems.length===5&&ts2.pickups.challengeItems.every(i=>!i.enabled),'items visible before acceptance '+level);
    const contact=()=>{
      const c=ts2.creatures.find(c=>c.slot===giver);
      for(let t=0;t<100&&!ts2.talk;t++){hold({x:c.x,y:c.y+c.offsetY+0x1cc0,z:c.z});ts2.tickGame({},1,0);}
      check(ts2.talk,'giver contact failed '+level);
    };
    contact();check(ts2.tasks.challenge===1,'offer phase '+level);check(ts2.pickups.challengeItems.every(i=>i.enabled),'offer did not reveal items '+level);
    dismiss();ts2.tickGame({},1,0);check(ts2.tasks.challenge===2,'clock did not start '+level);
    ts2.openMenu();const paused=ts2.tasks.challengeClock;ts2.tickGame({},130);check(ts2.tasks.challengeClock===paused,'paused challenge advanced '+level);ts2.pressMenu('back');ts2.tickGame({},1,0);
    const origin={x:ts2.player.x,y:ts2.player.y,z:ts2.player.z};
    // Partial pickup, then let the full deadline expire near the giver.
    const first=ts2.pickups.challengeItems[0];hold({x:first.x*32,y:(first.y+230)*32,z:first.z*32});ts2.tickGame({},1,0);
    check(ts2.pickups.itemsFound===1,'first item contact failed '+level);
    for(let t=0;t<4000&&ts2.tasks.challenge!==0;t++){hold({x:origin.x+12000,y:origin.y,z:origin.z});ts2.tickGame({},1,0);if(ts2.talk)dismiss();}
    check(ts2.tasks.challenge===0&&ts2.pickups.challengeItems.every(i=>!i.enabled),'failure failed '+level);
    contact();check(ts2.pickups.challengeItems.every(i=>i.enabled&&!i.collected),'retry failed '+level);dismiss();
    for(const item of ts2.pickups.challengeItems){hold({x:item.x*32,y:(item.y+230)*32,z:item.z*32});ts2.tickGame({},1,0);}
    check(ts2.pickups.itemsFound-ts2.tasks.challengeFrom===5,'five pickups failed '+level+' '+JSON.stringify(ts2.tasks));
    contact();check(ts2.tasks.challenge===3,'return reward failed '+level);dismiss();
    check(ts2.pickups.tokenItems.find(i=>i.slot===2).enabled,'reward token missing '+level);
    await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.tasks.challenge===0&&ts2.pickups.challengeItems.every(i=>!i.enabled),'restart retained task '+level);
    await leave();console.log('PASS collect-five contacts/failure/retry/reward/restart level '+level);
  }
})()
