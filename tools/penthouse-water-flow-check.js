/** Browser regression: Penthouse water selectors and floating props.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/platforms.png --eval-file tools/penthouse-flow-check.js
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
  await enter(11);await ts2.spawnPlayer();ts2.viewer.stop();

  const state=ts2.penthouse,water=state.water;
  const closeDialogue=()=>{for(let j=0;j<2000&&ts2.talk;j++)ts2.tickGame({jump:(j&1)===0},1,0);check(!ts2.talk,'dialogue stuck');};
  const mesh=id=>{const o=state.objects.get(id),r=ts2.viewer.objectVertices.get(o.index)?.[0];check(r,'water artwork not separate '+id);return [...ts2.viewer.current.geometry.getAttribute('position').array.slice(r.start*3,r.start*3+9)];};
  for(const index of [1,2,3,0]){
    closeDialogue();
    const b=water.buttons[index],top=b.hull.polys.filter(p=>p.normal.y<-.8).sort((a,b)=>a.vertices[0].y-b.vertices[0].y)[0];
    const at=top.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});
    const place=()=>{ts2.setPlayerPos(at.x,at.z,at.y-20000);Object.assign(ts2.player,{vy:0,vx:0,vz:0,stomp:1,hitStun:0,onGround:false,contacts:[],climb:0,climbGroup:-1});};
    place();
    for(let i=0;i<100&&water.selected!==b.bit;i++){
      ts2.tickGame({},1,0);if(ts2.talk){closeDialogue();place();}
    }
    check(water.selected===b.bit&&water.target===b.target,'water switch failed '+index);
    ts2.openMenu();const frozen=water.offset;ts2.tickGame({},100,0);check(water.offset===frozen,'paused water advanced');ts2.pressMenu('back');
    const before=mesh(39);let moved=false;
    for(let i=0;i<2000&&water.offset!==water.target;i++){
      Object.assign(ts2.player,{x:at.x,y:at.y-20000,z:at.z,vy:0,vx:0,vz:0,hitStun:1000});
      ts2.tickGame({},1,0);if(ts2.talk)closeDialogue();
      moved||=JSON.stringify(before)!==JSON.stringify(mesh(39));
    }
    check(water.offset===b.target,'water did not reach target '+index);
    check(moved,'floating mesh stayed fixed '+index);
    check(water.y===(b.target===0?null:191000+b.target),'wrong water surface '+index);
    check(water.planes.filter(q=>state.objects.get(q.art).scale[0]!==0).length===(index===0?0:1),'surface visibility '+index);
    if(index===2){ts2.tickGame({},350,0);check(state.objects.get(91).scale[0]>.9,'water bubble did not grow');}
  }
  // Isolate vertical integration away from scenery, with a real live water plane.
  water.offset=water.target=-64000;ts2.tickGame({},1,0);closeDialogue();
  for(const [depth,wet,gravity]of [[8192,false,64],[8193,true,16]]){
    ts2.setPlayerPos(10000000,10000000,water.y+depth);
    Object.assign(ts2.player,{vx:0,vy:0,vz:0,stomp:0,onGround:false,coyote:0,hitStun:0,contacts:[],climb:0,climbGroup:-1,fallTimer:0});
    ts2.tickGame({},1,0);check(ts2.player.inWater===wet&&ts2.player.vy===gravity,'live water movement boundary '+depth);
  }
  ts2.player.vy=2000;ts2.tickGame({},1,0);check(ts2.player.vy===1024,'live water fall cap');
  // Let old effects expire, then cross the surface with the live particle pool.
  for(let i=0;i<200;i++){
    Object.assign(ts2.player,{x:10000000,z:10000000,y:water.y-10000,vx:0,vy:0,vz:0,hitStun:1000});ts2.tickGame({},1,0);
  }
  ts2.player.y=water.y-10;ts2.player.vy=100;ts2.tickGame({},1,0);
  check(ts2.effects.activeKinds.includes(13),'water entry splash missing');
  let bubbles=false;
  for(let i=0;i<250&&!bubbles;i++){
    Object.assign(ts2.player,{y:water.y+16000,vx:0,vy:0,vz:0,hitStun:1000});ts2.tickGame({},1,0);bubbles=ts2.effects.activeKinds.includes(45);
  }
  check(bubbles,'underwater bubbles missing');
  ts2.player.y=water.y-10000;ts2.player.vy=0;ts2.tickGame({},1,0);check(ts2.waterEffects.dripTicks===180,'water exit did not start wet footprints');
  ts2.openMenu();ts2.tickGame({},100,0);check(ts2.waterEffects.dripTicks===180,'paused water effect clock advanced');ts2.pressMenu('back');ts2.tickGame({},1,0);
  water.offset=water.target=0;ts2.tickGame({},1,0);ts2.player.vy=0;ts2.tickGame({},1,0);
  check(!ts2.player.inWater&&ts2.player.vy===64,'drained water retained movement override');
  const old=ts2.penthouse;
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.waterEffects.dripTicks===0,'water effects not reset');
  check(ts2.penthouse!==old&&ts2.penthouse.water.y===null&&ts2.penthouse.water.selected===16,'water restart failed');
  check(ts2.penthouse.water.floats.every(f=>f.step===0&&f.displacement===0),'float restart failed');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  check(ts2.penthouse===null,'water leaked after exit');
  console.log('PASS: four Penthouse water selectors, moving water/floating meshes, underwater movement/splashes/bubbles, pause, restart and exit');
})()
