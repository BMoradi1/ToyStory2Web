/** Space Land paired lasers: rendered beams, damage and lifecycle. */
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
  const tick=()=>ts2.tickGame({jump:!!ts2.talk},1,0);
  const at={x:250000,z:-250000,y:-4000};
  const hold=p=>{ts2.setPlayerPos(p.x,p.z,p.y);ts2.player.fallTimer=0;ts2.player.vy=0;tick();};
  check(ts2.spaceLasers.beams.length===0,'beams active before entering region');
  const health=ts2.pickups.health;let red=false,blue=false,flash=false,moved=false;
  for(let i=0;i<240;i++){
    hold(at);check(ts2.spaceLasers.beams.length===2,'paired beams missing');
    red ||= ts2.viewer.effects.some(c=>c.axis&&c.r===1&&c.g===0&&c.b===0);
    blue ||= ts2.viewer.effects.some(c=>c.axis&&c.r===0&&c.g===.5&&c.b===1);
    flash ||= ts2.effects.pointLights.some(l=>l.life>0&&((l.r===240&&l.g===0)||(l.b===240&&l.g===120)));
    moved ||= ts2.spaceLasers.guns.some(g=>g.ticks<g.period&&g.node>0);
  }
  check(red&&blue&&flash&&moved,'missing rendered beam/light state '+JSON.stringify({red,blue,flash,moved}));
  check(ts2.pickups.health<health,'floor-level lasers never hurt Buzz');
  check(ts2.sound.raised.some(s=>s.startsWith('7:')),'laser sound missing');
  ts2.openMenu();const frozen=JSON.stringify(ts2.spaceLasers);ts2.tickGame({},100,0);
  check(JSON.stringify(ts2.spaceLasers)===frozen,'paused lasers moved');ts2.pressMenu('back');tick();
  hold({x:0,z:0,y:-2000000});const guns=JSON.stringify(ts2.spaceLasers.guns);
  for(let i=0;i<50;i++)hold({x:0,z:0,y:-2000000});
  check(ts2.spaceLasers.beams.length===0&&JSON.stringify(ts2.spaceLasers.guns)===guns,'laser area gate failed');
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.spaceLasers.beams.length===0&&ts2.spaceLasers.guns.every(g=>g.node===0&&g.ticks===0),'restart retained laser state');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.spaceLasers===null,'lasers leaked after exit');
  console.log('PASS Space Land paired rendered laser colours, floor damage/lights, region gate, pause/restart/exit');
})()
