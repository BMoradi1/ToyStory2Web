/** Browser-harness regression: Tarmac scenery and aircraft/rain ambience.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/tarmac-scenery.png --eval-file tools/tarmac-scenery-flow-check.js
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

  const state=ts2.tarmacScenery;
  check(state&&state.phase===0,'scenery did not initialize');
  function sample(id) {
    const index=state.objects.find(o=>o.id===id).index;
    const ranges=ts2.viewer.objectVertices.get(index);
    check(ranges?.length,'scenery not split from static geometry: '+id);
    const at=ranges[0].start*3;
    return [...ts2.viewer.current.geometry.getAttribute('position').array.slice(at,at+Math.min(ranges[0].count,50)*3)];
  }
  const rest=[sample(69),sample(70)];
  const soundUrl=performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname==='/src/audio/sfx.ts')?.name;
  const {SoundBank}=await import(soundUrl??'/src/audio/sfx.ts');
  const play=SoundBank.prototype.play;
  let bank;
  SoundBank.prototype.play=function(...args){bank=this;return play.apply(this,args);};
  try {
    const floor=ts2.tarmacPlane.hull.polys.filter(p=>p.normal.y<-.99).sort((a,b)=>a.vertices[0].y-b.vertices[0].y)[0];
    const centre=floor.vertices.reduce((s,v)=>({x:s.x+v.x/3,y:s.y+v.y/3,z:s.z+v.z/3}),{x:0,y:0,z:0});
    Object.assign(ts2.player,{x:centre.x*32,y:centre.y*32-5000,z:centre.z*32});
    ts2.tickGame({},100,0);
    check(state.phase===100,'scenery did not advance once per tick');
    for(let i=0;i<2;i++)check(JSON.stringify(sample(69+i))!==JSON.stringify(rest[i]),'scenery vertices stayed static');
    const {sceneryPoses}=await import('/src/sim/tarmac-scenery.ts');
    for(const p of sceneryPoses(state))check(ts2.viewer.objectTransforms.get(p.index).startsWith(p.angles.join(',')+'|'),'draw pose mismatch');
    await bank.start();
    await wait(()=>{ts2.tickGame({},1,0);return bank.sustainedSources.has('rainloop')&&bank.sustainedSources.has('proplane');},'real rain/engine buffers did not play');
    check(bank.context.state==='running','audio context not running');
    const voices=new Map(bank.sustainedSources);
    ts2.tickGame({},10,0);
    for(const key of ['rainloop','proplane'])check(bank.sustainedSources.get(key)===voices.get(key),'duplicate sustained voice '+key);
    check(ts2.sound.raised.includes('6f:RainLoop')&&ts2.sound.raised.includes('9c:proplane'),'ambient event mapping missing');
    ts2.openMenu();const paused=state.phase,pose=sample(69);ts2.tickGame({},60);
    check(state.phase===paused&&JSON.stringify(sample(69))===JSON.stringify(pose),'pause advanced scenery');
    ts2.pressMenu('back');ts2.tickGame({},1);ts2.tickGame({},1,0);
    check(state.phase!==paused,'scenery did not resume');
    bank.stop();ts2.tickGame({},2,0);check(bank.sustainedSources.size===0,'mute left voices running');
    await bank.start();ts2.tickGame({},1,0);
    check(bank.sustainedSources.has('rainloop')&&bank.sustainedSources.has('proplane'),'unmute did not restore ambience');
    await ts2.spawnPlayer();ts2.viewer.stop();
    check(ts2.tarmacScenery.phase===0,'restart retained phase');
    for(let i=0;i<2;i++)check(JSON.stringify(sample(69+i))===JSON.stringify(rest[i]),'restart did not restore mesh');
    ts2.openMenu();
    for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
    ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
    await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
    if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
    await wait(()=>ts2.front.screen==='select','selector did not return');
    check(ts2.tarmacScenery===null&&bank.sustainedSources.size===0,'scenery/audio leaked into selector');
    await enter();await ts2.spawnPlayer();ts2.viewer.stop();
    check(ts2.tarmacScenery.phase===0,'re-entry retained phase');
    ts2.tickGame({},1,0);check(ts2.tarmacScenery.phase===1,'re-entry did not animate');
    console.log('PASS: near/far mesh sway, actual decoded rain/engine playback, voice reuse, pause/resume, mute/unmute, restart, exit and re-entry');
  } finally { SoundBank.prototype.play=play; }
})()
