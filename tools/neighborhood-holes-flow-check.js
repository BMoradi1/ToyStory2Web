/** Positioned approach, real pole acquisition and lowering ride in Andy's House. */
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
  await enter(2);await ts2.spawnPlayer();ts2.viewer.stop();
  for(let t=0;t<2000&&ts2.talk;t++)ts2.tickGame({jump:(t&1)===0},1,0);
  const soldier=()=>ts2.creatures.find(c=>c.slot===4),heard=new Set();let warning=false,dust=false;
  const tick=()=>{ts2.tickGame({},1,0);for(const x of ts2.sound.raised)heard.add(x.split(':')[0]);warning ||= ts2.effects.activeKinds.includes(59);dust ||= ts2.effects.activeKinds.includes(58);};
  const park=(x,z,y)=>{ts2.setPlayerPos(x,z,y);Object.assign(ts2.player,{vx:0,vy:0,vz:0,stomp:0,stompImpact:false,onGround:false,hitStun:1000,fallTimer:0,fellOut:false,pole:-1,poleLock:-1,climb:0,zipLine:-1,launched:false,jumpState:0});};
  tick();
  for(let round=0;round<6;round++){
    let c=soldier();check(c?.type===13,'soldier disappeared early');
    for(let t=0;t<200&&ts2.neighborhoodHoles.timer===0;t++){c=soldier();park(c.x+18000,c.z,-3000);tick();}
    let s=ts2.neighborhoodHoles;check(s.timer>0,'soldier did not retreat '+JSON.stringify({s,c:soldier()}));const hole=s.points[s.last],last=s.last;
    for(let t=0;t<60&&(s.node===last||s.timer>=79);t++){park(hole.x+20000,hole.z,-3000);tick();s=ts2.neighborhoodHoles;}
    check(s.node!==last&&s.timer>0,'soldier failed to leave hole before deadline '+JSON.stringify({s,c:soldier()}));
    const enemies=ts2.creatures.filter(c=>c.live&&c.health<100);
    const spots=[[-7000,-4000],[-7000,4000],[7000,-4000],[7000,4000],[0,-8000],[0,8000]].map(([dx,dz])=>({x:hole.x+dx,z:hole.z+dz}));
    spots.sort((a,b)=>Math.min(...enemies.map(c=>(b.x-c.x)**2+(b.z-c.z)**2))-Math.min(...enemies.map(c=>(a.x-c.x)**2+(a.z-c.z)**2)));
    park(spots[0].x,spots[0].z,-19000);Object.assign(ts2.player,{stomp:1,hitStun:0});
    for(let t=0;t<80&&ts2.neighborhoodHoles.closed===round;t++)tick();
    check(ts2.neighborhoodHoles.closed===round+1,'actual hole stomp failed '+JSON.stringify({round,s:ts2.neighborhoodHoles,p:ts2.player,c:soldier()}));
  }
  check(!(soldier().flags&32),'soldier still trapped');check(warning&&heard.has('31'),'retreat/warning missing');
  for(let t=0;t<100&&soldier()?.type===13;t++){
    const c=soldier();park(c.x,c.z,c.y+(c.offsetY??0)+0x1cc0);ts2.player.hitStun=0;tick();
  }
  check(soldier()?.type===0,'freed soldier could not be rescued');
  ts2.openMenu();const frozen=JSON.stringify(ts2.neighborhoodHoles);ts2.tickGame({},100);check(JSON.stringify(ts2.neighborhoodHoles)===frozen,'paused holes changed');ts2.pressMenu('back');tick();
  await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.neighborhoodHoles.closed===0&&ts2.neighborhoodHoles.points.every(p=>!p.closed),'restart retained closed holes');
  await leave();check(ts2.neighborhoodHoles===null,'hole controller survived exit');
  console.log('PASS Neighborhood six actual retreat/stomp cycles, warning effects, freed soldier rescue, pause/restart/exit');
})()
