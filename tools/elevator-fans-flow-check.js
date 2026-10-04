/** Browser regression: Elevator fan artwork, switches, wind and lifecycle.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/platforms.png --eval-file tools/elevator-fans-flow-check.js
 * Reads the supplied install; only the disposable browser's save is affected.
 * Positions Buzz over puzzle buttons; this is not a full playthrough.
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
  await enter(10);await ts2.spawnPlayer();ts2.viewer.stop();
  const state=ts2.levelPlatforms,f=state.fans;check(f,'fan controller absent');
  const meshSample=id=>{
    const o=state.objects.find(o=>o.id===id),range=ts2.viewer.objectVertices.get(o.index)?.[0];
    check(range,'fan artwork not separated: '+id);
    return [...ts2.viewer.current.geometry.getAttribute('position').array.slice(range.start*3,range.start*3+9)];
  };
  const start=meshSample(6);ts2.tickGame({},10,0);check(JSON.stringify(start)!==JSON.stringify(meshSample(6)),'running fan mesh frozen');
  for(let which=0;which<2;which++){
    const h=f.hulls[which],face=h.polys.filter(p=>p.normal.y<-.8).sort((a,b)=>a.vertices[0].y-b.vertices[0].y)[0];
    const at=face.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});
    Object.assign(ts2.player,{...at,y:at.y-20000,vy:0,vx:0,vz:0,stomp:1,hitStun:0,onGround:false,climb:0,climbGroup:-1,contacts:[]});
    for(let i=0;i<100&&!(f.switches&(1<<which));i++)ts2.tickGame({},1,0);
    check(f.switches&(1<<which),'real stomp did not activate switch '+which);
    const rotor=which===0?4:5,initial=meshSample(rotor);ts2.tickGame({},8,0);
    check(JSON.stringify(initial)!==JSON.stringify(meshSample(rotor)),'switched fan mesh frozen');
    const o=state.objects.find(o=>o.id===(which===0?17:16));
    check(ts2.viewer.objectTransforms.get(o.index).startsWith(which===0?'384,0,0|':'0,0,384|'),'switch artwork not tilted');
    const base=f.paths.get(which===0?10:1)[0];let lifted=false,particles=false,sound=false;
    for(let i=0;i<150;i++){
      Object.assign(ts2.player,{x:base.x,y:base.y-25000,z:base.z,vx:0,vy:0,vz:0,stomp:0,hitStun:0,onGround:false,contacts:[]});
      ts2.tickGame({},1,0);
      lifted||=ts2.player.vy<0;particles||=ts2.effects.activeKinds.includes(79);
      sound||=ts2.sound.raised.some(s=>s.startsWith('8c:'));
    }
    check(lifted&&particles&&sound,'shaft airflow/particles/sound missing '+which+' '+JSON.stringify({lifted,particles,sound,player:ts2.player,emitters:f.emitters}));
  }
  // Let the real boss trigger and spin clock drive its arena rotors and wind.
  ts2.setPlayerPos(60000,60000,-1800000);
  Object.assign(ts2.player,{vy:0,vx:0,vz:0,stomp:0,hitStun:1000});
  for(let i=0;i<100&&!ts2.talk;i++)ts2.tickGame({},1,0);
  check(ts2.talk,'boss intro missing');
  for(let i=0;i<2000&&ts2.talk;i++){
    if(i%30===0){window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter'}));}
    ts2.tickGame({},1,0);
  }
  let blowing=false,turned=false;const initial=meshSample(7);
  for(let i=0;i<1200&&!blowing;i++){
    const base=f.paths.get(8)[0];Object.assign(ts2.player,{x:base.x,y:base.y-256,z:base.z,vx:0,vy:0,vz:0,hitStun:1000});
    ts2.tickGame({},1,0);
    turned||=JSON.stringify(initial)!==JSON.stringify(meshSample(7));
    blowing=ts2.tasks.gunslinger.spin>1024&&ts2.player.vy<0;
  }
  check(turned&&blowing,'boss spin did not drive actual arena mesh and airflow');
  ts2.openMenu();const phase=f.phase;ts2.tickGame({},100,0);check(f.phase===phase,'pause advanced fans');ts2.pressMenu('back');ts2.tickGame({},30,0);
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.levelPlatforms.fans!==f&&ts2.levelPlatforms.fans.switches===0&&ts2.levelPlatforms.fans.phase===0,'restart retained fan state');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.levelPlatforms===null,'fan state leaked after exit');
  console.log('PASS: actual fan mesh rotation, two real stomp switches, shafts/particles/sound, boss spin/arena airflow, pause/restart/exit');
})()
