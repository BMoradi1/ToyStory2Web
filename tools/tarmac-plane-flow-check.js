/** Browser-harness regression: Tarmac plane render, physics and lifecycle.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/tarmac-plane.png --eval-file tools/tarmac-plane-flow-check.js
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
  const plane=ts2.tarmacPlane;
  check(plane&&plane.angle===0,'fresh plane state');
  const sample=id=>{
    const index=plane.objects.find(o=>o.id===id).index;
    const ranges=ts2.viewer.objectVertices.get(index);
    check(ranges?.length,'missing independent draw object '+id);
    const at=ranges[0].start*3;
    return [...ts2.viewer.current.geometry.getAttribute('position').array.slice(at,at+3)];
  };
  const near=sample(0),far=sample(16);
  const floor=plane.hull.polys.filter(p=>p.normal.y<-.99).sort((a,b)=>a.vertices[0].y-b.vertices[0].y)[0];
  const centre=floor.vertices.reduce((s,v)=>({x:s.x+v.x/3,y:s.y+v.y/3,z:s.z+v.z/3}),{x:0,y:0,z:0});
  // Face +Z for the landing test; the separate descending edge-grab test follows below.
  Object.assign(ts2.player,{x:centre.x*32,y:centre.y*32-5000,z:centre.z*32,yaw:0,targetYaw:0});
  ts2.tickGame({},100,0);
  check(ts2.player.onGround&&ts2.player.contacts.some(c=>c.group===plane.hull.groupIndex),'landing on plane');
  const radius=()=>Math.hypot(ts2.player.x-plane.position.x,ts2.player.z-plane.position.z);
  const r=radius();
  ts2.tickGame({},120,0);
  check(ts2.player.onGround&&Math.abs(radius()-r)<100,'rider drift/fall '+JSON.stringify({r,now:radius(),angle:plane.angle,player:ts2.player}));
  check(JSON.stringify(sample(0))!==JSON.stringify(near),'near plane mesh stayed still');
  check(JSON.stringify(sample(16))!==JSON.stringify(far),'far plane mesh stayed still');
  check(plane.angle===220,'one angle per simulation tick');
  ts2.openMenu();const paused=plane.angle;
  ts2.tickGame({},60);
  check(plane.angle===paused,'plane moved under pause');
  ts2.pressMenu('back');ts2.tickGame({},1);
  ts2.tickGame({jump:true},1,0);
  check(!ts2.player.onGround&&ts2.player.vy<0,'jump could not leave plane');
  ts2.tickGame({},10,0);
  check(plane.angle>paused,'plane did not resume');
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.tarmacPlane.angle===0,'restart did not reset angle');
  check(JSON.stringify(sample(0))===JSON.stringify(near),'restart did not restore artwork');
  // Descend across a verified edge in the installed aircraft hull. Do not
  // inject the climb timer/group: acquisition must identify collision object 0.
  Object.assign(ts2.player,{x:-626891.1572265625,y:-89252,z:-324867.3359375,
    yaw:1987,targetYaw:1987,vy:200,jumpState:3,onGround:false,coyote:0,contacts:[]});
  let grabbed=false, pauseChecked=false;
  for(let i=0;i<220;i++) {
    const moving=ts2.tarmacPlane;
    const before={x:ts2.player.x,y:ts2.player.y,z:ts2.player.z,climb:ts2.player.climb,origin:{...moving.position}};
    ts2.tickGame({},1,0);
    check(moving.angle===i+1,'climbing stopped or double-ticked the plane');
    if(ts2.player.climb>0) {
      grabbed=true;
      check(ts2.player.climbGroup===moving.hull.groupIndex,'grab lost moving collision identity');
      if(before.climb>1) {
        const a=Math.PI/2048,c=Math.cos(a),sn=Math.sin(a),x=before.x-before.origin.x,z=before.z-before.origin.z;
        check(Math.abs(ts2.player.x-Math.round(moving.position.x+x*c+z*sn))<2&&
          Math.abs(ts2.player.z-Math.round(moving.position.z+z*c-x*sn))<2,'climb anchor did not follow aircraft');
      }
      if(!pauseChecked) {
        const timer=ts2.player.climb,angle=moving.angle;
        ts2.openMenu();ts2.tickGame({},20);
        check(ts2.player.climb===timer&&moving.angle===angle,'climb moved during pause');
        ts2.pressMenu('back');ts2.tickGame({},1);pauseChecked=true;
      }
    }
  }
  check(grabbed&&pauseChecked,'natural moving ledge was not exercised');
  check(ts2.player.climb===0&&ts2.player.climbGroup===-1&&ts2.player.onGround&&
    ts2.player.contacts.some(c=>c.group===ts2.tarmacPlane.hull.groupIndex),'moving climb did not land aboard');
  await ts2.spawnPlayer();ts2.viewer.stop();
  check(ts2.player.climbGroup===-1,'restart retained climb attachment');
  const module=await import('/src/sim/tarmac-plane.ts');
  const hazard=module.planePoses(ts2.tarmacPlane).find(p=>p.id===10).hazard;
  Object.assign(ts2.player,{...hazard,onGround:false,contacts:[],vx:0,vy:0,vz:0,hitStun:0});
  const health=ts2.pickups.health;
  ts2.tickGame({},1,0);
  check(ts2.pickups.health===health-1,'wheel hazard did not damage Buzz');
  ts2.tickGame({},1,0);
  check(ts2.pickups.health===health-1,'wheel bypassed hit invulnerability');
  // A fall respawns the player while the independently moving plane continues.
  ts2.player.fellOut=true;ts2.tickGame({},1);
  check(!ts2.player.fellOut&&!ts2.player.dying,'fall failed to respawn');
  check(ts2.tarmacPlane.angle===2,'player respawn unexpectedly restarted world');
  ts2.openMenu();
  for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);
  ts2.pressMenu('down');ts2.tickGame({},1);
  ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector did not return');
  check(ts2.tarmacPlane===null,'plane state leaked into selector');
  await enter();
  check(ts2.tarmacPlane&&ts2.tarmacPlane.ticks<30,'re-entry retained old plane state');
  console.log('PASS: Tarmac near/far geometry, landing/riding/jump, natural moving ledge acquisition/anchor/landing, pause, reset, wheel damage/invulnerability, fall respawn and level exit/re-entry');
})()
