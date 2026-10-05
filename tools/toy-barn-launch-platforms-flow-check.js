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
  for(const [i,at] of [{x:-320000,y:-108096,z:295424},{x:-14560,y:-7456,z:486475}].entries()){
    await ts2.spawnPlayer();ts2.viewer.stop();const initial=ts2.toyBarnLaunchPlatforms.map(r=>({...r.position}));
    for(let t=0;t<90;t++){ts2.setPlayerPos(at.x,at.z,at.y-50000);Object.assign(ts2.player,{vy:0,fallTimer:0});ts2.tickGame({},1,0);}
    ts2.setPlayerPos(at.x,at.z,at.y-20000);Object.assign(ts2.player,{vy:0,fallTimer:0,onGround:false,launched:false});
    let riding=0;
    for(let t=0;t<500&&!ts2.player.launched;t++){
      ts2.tickGame({},1,0);const r=ts2.toyBarnLaunchPlatforms[i];
      if(ts2.player.onGround&&ts2.player.contacts.some(c=>c.group===r.hull.groupIndex))riding++;
      const actual=ts2.viewer.objectTransforms.get(r.index).split('|')[1].split(',').map(Number);
      const delta=[r.artPosition.x-r.rest.x,-(r.artPosition.y-r.rest.y),-(r.artPosition.z-r.rest.z)];
      for(let a=0;a<3;a++)check(Math.abs(actual[a]*8192-delta[a])<1e-6,'ride artwork drift');
    }
    check(ts2.player.launched&&riding>100,'physical ride did not launch '+i+' '+JSON.stringify({riding,p:ts2.player,ride:ts2.toyBarnLaunchPlatforms[i]}));
    check(ts2.player.vy===-2560&&ts2.player.yaw===0x81e,'wrong ride launch');
    ts2.openMenu();const frozen=JSON.stringify(ts2.toyBarnLaunchPlatforms);ts2.tickGame({},100,0);check(JSON.stringify(ts2.toyBarnLaunchPlatforms)===frozen,'paused ride moved');ts2.pressMenu('back');ts2.tickGame({},1,0);
    for(let t=0;t<400;t++){ts2.setPlayerPos(0,0,-2000000);Object.assign(ts2.player,{vy:0,fallTimer:0});ts2.tickGame({},1,0);}
    const r=ts2.toyBarnLaunchPlatforms[i];check(r.speed===(i?0:-1),'ride failed stop/return');
    await ts2.spawnPlayer();ts2.viewer.stop();
    check(ts2.toyBarnLaunchPlatforms.every((r,j)=>r.speed===0&&JSON.stringify(r.position)===JSON.stringify(initial[j])),'ride restart failed');
  }
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.toyBarnPlatforms===null&&ts2.toyBarnRotors===null&&ts2.toyBarnEffects===null&&ts2.toyBarnSprings===null&&ts2.toyBarnLaunchPlatforms===null,'Toy Barn controller leaked after exit');
  console.log('PASS Toy Barn both physical full rides and launches, return/deceleration, artwork, pause/restart/exit');
})()
