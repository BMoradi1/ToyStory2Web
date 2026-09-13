/** Browser regression: ground-pound animation, chair launch, and all trailer paint mixes.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/stomp.png --eval-file tools/stomp-flow-check.js
 * Reads the supplied install; only the disposable browser's save is affected.
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
  ts2.frontDrive(0, 40); ts2.frontDrive(0x4000); ts2.frontDrive(0, 30);
  await wait(() => ts2.front.screen === 'menu', 'menu did not open');
  ts2.frontDrive(0, 40); ts2.frontDrive(0x4000); ts2.frontDrive(0, 30);
  await wait(() => ts2.front.screen === 'select', 'selector did not open');
  ts2.frontDrive(0, 70);
  while (ts2.front.state.pos > 1) { ts2.frontDrive(0x80); ts2.frontDrive(0); }
  ts2.frontDrive(0x4000); ts2.frontDrive(0, 40);
  for (let i=0; i<500 && !ts2.front.inLevel; i++) {
    if (ts2.cutsceneUp) {
      window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
      window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));
    }
    await pause(100);
  }
  await wait(() => ts2.front.inLevel, 'level did not start');
  ts2.viewer.stop();
  function reset() {
    Object.assign(ts2.player,{vx:0,vy:0,vz:0,stomp:0,launched:false,spin:0,spinCharge:0,laser:0,
      climb:0,hitStun:0,pole:-1,poleLock:-1,zipLine:-1,zipPhase:0,fallTimer:0,onGround:false,coyote:0,jumpState:1});
    ts2.tickGame({},1,0);
  }
  function pound(surface) {
    reset();
    const top=ts2.stompSurfaces.find(s=>s.surface===surface).tops[0];
    const y=top.reduce((s,v)=>s+v.y,0)/top.length;
    Object.assign(ts2.player,{x:top.reduce((s,v)=>s+v.x,0)/top.length*32,
      y:y*32-18000,z:top.reduce((s,v)=>s+v.z,0)/top.length*32,jumpState:1,coyote:0,onGround:false,vy:0});
    ts2.tickGame({spin:true},1,0);
    if(ts2.anim.state!==23)throw Error('stomp animation missing '+JSON.stringify(ts2.player));
    for(let i=0;i<80&&!ts2.player.stompImpact;i++)ts2.tickGame({},1,0);
    if(!ts2.player.stompImpact)throw Error('stomp missed surface '+surface);
  }
  pound(8);
  ts2.tickGame({},4,0);
  if(!ts2.player.launched||ts2.player.vy!==-4736)throw Error('chair failed to fling Buzz '+JSON.stringify({player:ts2.player,props:ts2.stompProps,zones:ts2.zones}));
  const chair={vy:ts2.player.vy,timer:ts2.stompProps.chair};
  const selector=document.querySelector('#level');
  selector.selectedIndex=[...selector.options].findIndex(o=>o.text==='level04/level');
  selector.dispatchEvent(new Event('change'));
  await wait(()=>document.querySelector('#status').textContent.includes('level04/level: ready'), 'construction did not load');
  await ts2.spawnPlayer();
  ts2.viewer.stop();
  function pushTo(x) {
    reset();ts2.goToPushBlock(0);
    let b=ts2.pushBlocks.blocks[0];
    const dir=x*32>b.x?1:-1;
    if(dir<0){ts2.player.x=b.x+(b.x-ts2.player.x);ts2.player.yaw=3072;}
    let ticks=0;
    while(Math.abs(ts2.pushBlocks.blocks[0].x-x*32)>100*32&&ticks++<700)
      ts2.tickGame({moveY:1},1,dir>0?1024:3072);
    ts2.tickGame({},1,0);
    if(ticks>=700)throw Error('bucket cannot reach '+x+': '+JSON.stringify({blocks:ts2.pushBlocks,player:ts2.player}));
  }
  const mixes=[];
  for(const [target,colours] of [[7300,[1,2]],[8000,[1,3]],[8700,[2,3]]]) {
    for(const colour of colours) {
      pushTo(10300+(colour-1)*700);
      pound(32+colour);ts2.tickGame({},65,0);
      if(ts2.stompProps.paint.first===0)throw Error('outlet did not fill bucket '+colour);
    }
    const liquid=ts2.viewer.creatureMeshes.get(5);
    if(!liquid||liquid.scale.y<0.4)throw Error('liquid mesh did not fill');
    pushTo(target);ts2.tickGame({},35,0);
    mixes.push({...ts2.stompProps.paint});
  }
  if(ts2.stompProps.paint.solved!==7||!ts2.stompProps.paint.reward)throw Error('paint puzzle did not reveal its token');
  ts2.zoneCulling(false);
  ts2.viewer.renderer.render(ts2.viewer.scene,ts2.viewer.camera);
  console.log('STOMP BROWSER PASS',JSON.stringify({chair,mixes,blocks:ts2.pushBlocks}));
})()
