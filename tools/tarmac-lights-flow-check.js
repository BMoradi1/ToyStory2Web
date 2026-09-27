/** Browser-harness regression: Tarmac light puzzle and helicopter reward.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/tarmac-lights.png --eval-file tools/tarmac-lights-flow-check.js
 * Reads the supplied install; only the disposable browser's save is affected.
 * Positions Buzz for focused landing and hazard checks; this is not a full playthrough.
 */
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
  ts2.save.tokens.fill(31);
  ts2.frontDrive(0, 40); ts2.frontDrive(0x4000); ts2.frontDrive(0, 30);
  await wait(() => ts2.front.screen === 'menu', 'menu did not open');
  ts2.frontDrive(0, 40); ts2.frontDrive(0x4000); ts2.frontDrive(0, 30);
  await wait(() => ts2.front.screen === 'select', 'selector did not open');
  async function enter() {
    ts2.frontDrive(0,70);
    while(ts2.front.state.pos<14){ts2.frontDrive(0x20);ts2.frontDrive(0);}
    while(ts2.front.state.pos>14){ts2.frontDrive(0x80);ts2.frontDrive(0);}
    ts2.frontDrive(0x4000);ts2.frontDrive(0,40);
    for(let i=0;i<500&&!ts2.front.inLevel;i++) {
      if(ts2.cutsceneUp){window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));}
      await pause(100);
    }
    await wait(()=>ts2.front.inLevel,'Tarmac failed to start');
    ts2.viewer.stop();
  }
  await enter();
  await ts2.spawnPlayer();
  ts2.viewer.stop();
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  function position(surface,air=false) {
    const top=ts2.stompSurfaces.find(s=>s.surface===surface).tops[0];
    const centre=top.reduce((s,v)=>({x:s.x+v.x/top.length,y:s.y+v.y/top.length,z:s.z+v.z/top.length}),{x:0,y:0,z:0});
    Object.assign(ts2.player,{x:centre.x*32,y:centre.y*32-(air?18000:-192),z:centre.z*32,
      vx:0,vy:0,vz:0,onGround:false,contacts:[],stomp:0,stompImpact:false,climb:0,climbGroup:-1,
      spin:0,spinCharge:0,hitStun:0,fallTimer:0,coyote:0,jumpState:1,pole:-1,zipLine:-1,zipPhase:0});
  }
  function pound(pad) {
    position(32+pad,true);ts2.tickGame({spin:true},1,0);
    for(let i=0;i<100&&!ts2.player.stompImpact;i++)ts2.tickGame({},1,0);
    check(ts2.player.stompImpact,'ground pound missed actual pad '+pad);
  }
  const {pressLight}=await import('/src/sim/tarmac-lights.ts');
  const solve=bits=>{
    for(let a=0;a<4;a++)for(let b=0;b<4;b++)for(let c=0;c<4;c++) {
      let next=bits;for(const pad of[a,b,c])next=pressLight(next,pad).bits;
      if((next&15)===(next>>4))return[a,b,c];
    }
    throw Error('unsolvable game puzzle');
  };
  position(32);ts2.tickGame({},2,0);
  check(ts2.tarmacLights.entered&&ts2.tarmacLights.attempts===3,'puzzle did not initialize on approach');
  const unchanged=ts2.tarmacLights.bits;ts2.tickGame({},10,0);
  check(ts2.tarmacLights.bits===unchanged&&ts2.tarmacLights.attempts===3,'ordinary standing pressed a pad');
  // Fail using the same ineffective pad, then let the original retry timer run.
  const bad=[0,1,2,3].find(p=>{let b=unchanged;for(let i=0;i<3;i++)b=pressLight(b,p).bits;return(b&15)!==(b>>4);});
  for(let i=0;i<3;i++)pound(bad);
  check(ts2.tarmacLights.attempts===0,'three actual pounds did not spend three attempts');
  ts2.tickGame({},60,0);check(ts2.tarmacLights.attempts===-60,'retry occurred too early');
  ts2.tickGame({},1,0);check(ts2.tarmacLights.attempts===3&&ts2.tarmacLights.sequence===-6,'retry cue/new puzzle missing');
  const steps=solve(ts2.tarmacLights.bits);
  for(const pad of steps) {
    pound(pad);
    const state=ts2.tarmacLights;
    check(state.button===pad&&state.flash===11,'pad feedback did not fire');
    if((state.bits&15)===(state.bits>>4))break;
  }
  const before=ts2.helicopterToken.y;
  ts2.tickGame({},1,0);
  check(ts2.tarmacLights.height===128&&ts2.cut.ticks===300&&ts2.cut.noControl,'success did not lower helicopter/start camera');
  check(ts2.tarmacLights.sequence===-5,'success sequence missing');
  ts2.openMenu();const stopped=ts2.tarmacLights.height;ts2.tickGame({},30);
  check(ts2.tarmacLights.height===stopped&&ts2.cut.ticks===300,'pause advanced lowering/camera');
  ts2.pressMenu('back');ts2.tickGame({},1);
  ts2.tickGame({},299,0);
  check(ts2.tarmacLights.cameraTicks===-1,'camera tracking repeated past 300 ticks');
  ts2.tickGame({},75,0);
  check(ts2.tarmacLights.height===48000&&!ts2.cut.noControl,'lowering did not finish/release control');
  check(ts2.helicopterToken.y>before+1000,'token did not descend with helicopter');
  check(ts2.sound.raised.some(s=>s==='9b:Helicopt'),'helicopter ambient sound event missing');
  const token=ts2.helicopterToken;
  Object.assign(ts2.player,{x:token.x*32,y:(token.y+230)*32,z:token.z*32,vx:0,vy:0,vz:0,onGround:false,contacts:[]});
  ts2.tickGame({},1,0);
  check(ts2.helicopterToken.collected&&(ts2.pickups.tokens&8)!==0,'lowered token could not be collected');
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.tarmacLights.height===0&&!ts2.tarmacLights.entered&&ts2.tarmacLights.attempts===3,'puzzle state survived restart');
  check(ts2.tarmacHelicopter.height===0&&!ts2.helicopterToken.collected,'reward/height survived restart');
  ts2.openMenu();
  for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector did not return');
  check(ts2.tarmacLights===null&&ts2.tarmacHelicopter===null,'puzzle leaked into selector');
  console.log('PASS: actual pad ground-pounds, failure/retry, solved lights, helicopter lowering, camera/pause, sound event, token collection, restart and exit');
})()
