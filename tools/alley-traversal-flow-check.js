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
  const tests=[{x:-567253,y:-84928,z:-723499,seesaw:0},{x:-624277,y:-116768,z:-723392,seesaw:1},
    {x:-812821,y:-110987,z:-715115,stomp:false},{x:-812821,y:-110987,z:-715115,stomp:true}];
  for(const test of tests){
    await ts2.spawnPlayer();ts2.viewer.stop();
    for(let t=0;t<90;t++){ts2.setPlayerPos(test.x,test.z,test.y-50000);Object.assign(ts2.player,{vy:0,fallTimer:0,hitStun:1000});ts2.tickGame({},1,0);}
    ts2.setPlayerPos(test.x,test.z,test.y-3000);Object.assign(ts2.player,{vy:0,stomp:test.stomp?1:0,onGround:false,fallTimer:0,hitStun:0});
    let success=false;
    for(let t=0;t<180&&!success;t++){
      ts2.tickGame({},1,0);
      if(test.seesaw!==undefined){
        const r=ts2.alleyTraversal.seesaws[test.seesaw];success=Math.abs(r.angle)>20;
        for(const o of r.objects)check(ts2.viewer.objectTransforms.get(o.index)?.startsWith('0,0,'+(r.angle>>2)+'|'),'seesaw artwork mismatch');
      }else success=ts2.alleyTraversal.launched;
    }
    check(success,'physical interaction failed '+JSON.stringify(test));
    if(test.seesaw===undefined){check(ts2.player.vy===(test.stomp?-3072:-2432),'spring launch speed');check(!ts2.player.launched,'spring changed air control');check(ts2.sound.raised.some(e=>e.startsWith('1c:')),'spring sound absent');}
  }
  ts2.openMenu();const before=JSON.stringify(ts2.alleyTraversal.seesaws.map(r=>[r.angle,r.speed]));ts2.tickGame({},100);
  check(before===JSON.stringify(ts2.alleyTraversal.seesaws.map(r=>[r.angle,r.speed])),'pause advanced seesaws');ts2.pressMenu('back');ts2.tickGame({},1);
  await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.alleyTraversal.seesaws.every(r=>r.angle===0&&r.speed===0),'restart retained tilt');
  await leave();check(ts2.alleyTraversal===null,'traversal controller survived exit');
  console.log('PASS actual Alley seesaw landings/artwork, normal/stomp spring launches/sound, pause, restart and exit');
})()
