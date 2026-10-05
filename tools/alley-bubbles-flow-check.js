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
  const x=-872107,y=-119040,z=-725269;
  for(let t=0;t<90;t++){ts2.setPlayerPos(x,z,y-50000);Object.assign(ts2.player,{vy:0,fallTimer:0});ts2.tickGame({},1,0);}
  ts2.setPlayerPos(x,z,y-3000);Object.assign(ts2.player,{vy:0,stomp:1,onGround:false,fallTimer:0});
  for(let t=0;t<100&&!ts2.alleyBubbles.active;t++)ts2.tickGame({},1,0);
  check(ts2.alleyBubbles.active,'real stomp did not activate bubble machine');
  for(let t=0;t<500;t++){
    const b=ts2.alleyBubbles.bubbles[0];
    if(b.phase>=4096&&b.position.y< -85000)break;
    ts2.setPlayerPos(x,z,y-10000);Object.assign(ts2.player,{vy:0,coyote:6,fallTimer:0,stomp:0});ts2.tickGame({},1,0);
  }
  let b=ts2.alleyBubbles.bubbles[0];
  // A grounded/coyote tick reopens attachment once the grown bubble is high enough.
  ts2.player.coyote=6;ts2.tickGame({},1,0);
  ts2.setPlayerPos(b.position.x,b.position.z,b.position.y+16000);Object.assign(ts2.player,{vy:0,stomp:0,coyote:0,onGround:false,pole:-1,poleLock:-1,hitStun:0,fallTimer:0});
  ts2.tickGame({},1,0);check(ts2.player.pole===0,'Buzz failed to acquire moving bubble '+JSON.stringify({p:ts2.player,b}));
  let carried=0,popped=false;
  for(let t=0;t<700;t++){
    ts2.tickGame({},1,0);b=ts2.alleyBubbles.bubbles[0];
    if(ts2.player.pole===0){carried++;check(Math.abs(ts2.player.x-b.position.x)<1&&Math.abs(ts2.player.z-b.position.z)<1,'bubble lost attached Buzz');}
    if(b.cycles>0){popped=true;break;}
  }
  check(carried>60&&popped&&ts2.player.pole!==0,'bubble ride/pop/release failed '+JSON.stringify({carried,popped,pole:ts2.player.pole}));
  for(let t=0;t<1600;t++){ts2.setPlayerPos(x,z,y-50000);Object.assign(ts2.player,{vy:0,fallTimer:0,hitStun:1000});ts2.tickGame({},1,0);}
  check(ts2.alleyBubbles.bubbles.every(b=>b.cycles>0),'both bubbles must recycle');
  for(const o of ts2.alleyBubbles.objects){const pose=ts2.viewer.objectTransforms.get(o.index);check(pose&&pose.split('|')[2]===o.scale.join(','),'bubble/machine scale mismatch');check(pose.startsWith(o.angles.join(',')+'|'),'bubble/machine angles mismatch');}
  ts2.openMenu();const before=JSON.stringify(ts2.alleyBubbles.bubbles.map(b=>[b.phase,b.position]));ts2.tickGame({},100);
  check(before===JSON.stringify(ts2.alleyBubbles.bubbles.map(b=>[b.phase,b.position])),'pause advanced bubbles');ts2.pressMenu('back');ts2.tickGame({},1);
  await ts2.spawnPlayer();ts2.viewer.stop();check(!ts2.alleyBubbles.active&&ts2.alleyBubbles.bubbles[0].phase===1&&ts2.alleyBubbles.bubbles[1].phase===0,'restart retained machine');
  await leave();check(ts2.alleyBubbles===null,'bubble controller survived exit');
  console.log('PASS Alley bubble machine: physical stomp, real pole grab/ride/pop/release, both recycling bubbles, artwork, pause/restart/exit');
})()
