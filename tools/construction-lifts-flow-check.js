/** Construction Yard shuttle lifecycle: installed movement scripts. */
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
  const level=4;await enter(level);await ts2.spawnPlayer();ts2.viewer.stop();
  const initial=ts2.constructionLifts.lifts.map(l=>({...l.position}));
  const far=new Set(),back=new Set(),flags=new Set();
  for(let t=0;t<2000;t++){
    ts2.setPlayerPos(0,0,-2000000);ts2.player.fallTimer=0;
    ts2.tickGame({},1,0);flags.add(ts2.constructionLifts.bits);
    for(const [i,l] of ts2.constructionLifts.lifts.entries()){
      if(l.position.y<initial[i].y-30000)far.add(i);
      if(far.has(i)&&Math.abs(l.position.y-l.rest.y)<2048)back.add(i);
      for(const o of l.objects){
        const transform=ts2.viewer.objectTransforms.get(o.index);
        check(transform&&transform.startsWith(o.angles.join(',')+'|'),'missing lift artwork transform');
        const offset=transform.split('|')[1].split(',').map(Number),scale=transform.split('|')[2].split(',').map(Number);
        check(Math.abs(offset[1]+(o.position.y-o.rest.y)/8192)<1e-6,'lift artwork position mismatch');
        check(Math.abs(scale[1]-o.scale[1])<1e-6,'cable scale mismatch');
      }
    }
  }
  check(far.size===4&&back.size===4,'incomplete lift routes');check(flags.has(256)&&flags.has(0),'lift synchronization missing');
  ts2.openMenu();const frozen=JSON.stringify(ts2.constructionLifts);ts2.tickGame({},100,0);
  check(JSON.stringify(ts2.constructionLifts)===frozen,'paused lifts moved');ts2.pressMenu('back');ts2.tickGame({},1,0);
  await ts2.spawnPlayer();ts2.viewer.stop();
  for(const [i,l] of ts2.constructionLifts.lifts.entries()){
    check(JSON.stringify(l.position)===JSON.stringify(initial[i]),'restart retained lift position');
    check(l.script.pc===0&&l.script.wait===0&&l.angle===0&&l.rockSpeed===0,'restart retained lift state');
  }
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.constructionLifts===null,'lift controller leaked after exit');
  console.log('PASS Construction Yard four lift out/back cycles, synchronization, artwork/supports/cable scale, pause/restart/exit');
})()
