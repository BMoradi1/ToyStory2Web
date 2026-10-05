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
  const seen=new Set(),dead=new Set(),respawned=new Set();
  const sample=()=>{
    const crate=ts2.pushBlocks.blocks[0];
    for(const c of ts2.creatures.filter(c=>c.slot===10||c.slot===11)){
      if(c.flags&1)seen.add(c.slot);
      if(seen.has(c.slot)&&c.health===0)dead.add(c.slot);
      if(dead.has(c.slot)&&c.health===101)respawned.add(c.slot);
      if(c.health>0&&crate.z<0xae00){check(c.x<=crate.x-0x4800+Math.abs(c.vx)+c.accelSide+2,'hoop escaped crate X boundary');check(c.x>=(0xfff86271|0)-Math.abs(c.vx)-c.accelSide-2,'hoop escaped left bound '+JSON.stringify({c,crate}));}
    }
  };
  for(const slot of [10,11])for(let t=0;t<180;t++){
    const c=ts2.creatures.find(c=>c.slot===slot);ts2.setPlayerPos(c.x+18000,c.z-10000,c.y);Object.assign(ts2.player,{vy:0,fallTimer:0,hitStun:1000});ts2.tickGame({},1,0);sample();
  }
  check(seen.size===2,'hoops never became visible '+JSON.stringify([...seen]));
  for(let t=0;t<350;t++){ts2.setPlayerPos(300000,-300000,-200000);Object.assign(ts2.player,{vy:0,fallTimer:0,hitStun:1000});ts2.tickGame({},1,0);sample();}
  check(dead.size===2&&respawned.size===2,'hoops did not recycle/respawn '+JSON.stringify({seen:[...seen],dead:[...dead],respawned:[...respawned],hoops:ts2.creatures.filter(c=>c.slot===10||c.slot===11)}));
  ts2.openMenu();const frozen=JSON.stringify(ts2.toyBarnHoops);ts2.tickGame({},100,0);check(JSON.stringify(ts2.toyBarnHoops)===frozen,'pause changed hoops');ts2.pressMenu('back');ts2.tickGame({},1,0);
  await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.toyBarnHoops.seen.every(v=>!v),'restart retained hoop visibility');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.toyBarnPlatforms===null&&ts2.toyBarnRotors===null&&ts2.toyBarnEffects===null&&ts2.toyBarnHoops===null,'Toy Barn controller leaked after exit');
  console.log('PASS Toy Barn hoops visible/hidden recycling and respawn, crate bounds, pause/restart/exit');
})()
