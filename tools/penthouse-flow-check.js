/** Browser regression: Penthouse tracking hazards and switches.
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
  const state=ts2.penthouse;check(state,'Penthouse controller absent');
  const sample=id=>{
    const o=state.objects.get(id),range=ts2.viewer.objectVertices.get(o.index)?.[0];
    check(range,'missing separate artwork '+id);
    return [...ts2.viewer.current.geometry.getAttribute('position').array.slice(range.start*3,range.start*3+9)];
  };
  const closeDialogue=()=>{for(let j=0;j<2000&&ts2.talk;j++)ts2.tickGame({jump:(j&1)===0},1,0);check(!ts2.talk,'dialogue did not close');};
  for(let which=0;which<6;which++){
    closeDialogue();
    for(let j=0;j<300&&(ts2.cut.ticks>0||ts2.cut.zoneBlend>0);j++){
      ts2.player.hitStun=1000;ts2.tickGame({},1,0);closeDialogue();
    }
    const h=state.hazards[which],body=state.objects.get(h.models[0]),start=sample(body.id);
    let projectile=false,target=null;
    for(const [dx,dz] of [[70000,30000],[-70000,30000],[70000,-30000],[-70000,-30000],[0,90000],[0,-90000]]){
      const candidate={x:body.position.x+dx,y:body.position.y,z:body.position.z+dz};
      ts2.setPlayerPos(candidate.x,candidate.z,candidate.y);
      for(let j=0;j<150;j++){
        Object.assign(ts2.player,{...candidate,vx:0,vy:0,vz:0,hitStun:1000});ts2.tickGame({},1,0);
        if(ts2.talk)closeDialogue();
        if(ts2.zones.player===h.zone)break;
      }
      if(ts2.zones.player===h.zone){target=candidate;break;}
    }
    check(target,'no firing position in hazard room '+which);
    for(let i=0;i<650&&!projectile;i++){
      Object.assign(ts2.player,{...target,vx:0,vy:0,vz:0,hitStun:1000});
      ts2.tickGame({},1,0);projectile=ts2.effects.activeKinds.includes(92);
    }
    check(projectile,'hazard '+which+' did not fire; zones '+JSON.stringify(ts2.zones));
    check(JSON.stringify(start)!==JSON.stringify(sample(body.id)),'tracking mesh frozen '+which);
    const face=h.hull.polys.filter(p=>p.normal.y<-.8).sort((a,b)=>a.vertices[0].y-b.vertices[0].y)[0];
    const at=face.vertices.reduce((a,v)=>({x:a.x+v.x*32/3,y:a.y+v.y*32/3,z:a.z+v.z*32/3}),{x:0,y:0,z:0});
    const placeForStomp=()=>{
      ts2.setPlayerPos(at.x,at.z,at.y-20000);
      Object.assign(ts2.player,{vy:0,vx:0,vz:0,stomp:1,hitStun:0,onGround:false,contacts:[],climb:0,climbGroup:-1});
    };
    placeForStomp();
    for(let i=0;i<100&&h.timer===0;i++){
      ts2.tickGame({},1,0);
      if(ts2.talk){
        for(let j=0;j<2000&&ts2.talk;j++)ts2.tickGame({jump:(j&1)===0},1,0);
        check(!ts2.talk,'nearby dialogue did not close');placeForStomp();
      }
    }
    check(h.timer>0,'stomp switch failed '+which+' '+JSON.stringify({player:ts2.player,cut:ts2.cut,at}));
    ts2.openMenu();const before=h.timer;ts2.tickGame({},100,0);check(h.timer===before,'pause advanced disable countdown');ts2.pressMenu('back');
    let burst=false;
    for(let i=0;i<100&&h.timer>=0;i++){ts2.tickGame({},1,0);burst||=ts2.effects.activeKinds.includes(35);}
    check(state.disabled&(1<<which),'disable did not complete '+which);check(burst,'disable burst missing '+which);
    check(ts2.viewer.objectTransforms.get(body.index).endsWith('|0,0,0'),'active hazard model not hidden');
    for(const id of h.models.slice(2)){const o=state.objects.get(id);check(ts2.viewer.objectTransforms.get(o.index).endsWith('|1,1,1'),'disabled model not shown');}
  }
  await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.penthouse!==state&&ts2.penthouse.disabled===0,'restart retained disabled hazards');
  check(ts2.penthouse.hazards.every(h=>h.timer===0),'restart retained switch timers');
  ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
  if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
  await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.penthouse===null,'Penthouse state leaked after exit');
  console.log('PASS: six Penthouse hazards fire/turn, real stomp switches, disable effects/model swaps, pause/restart/exit');
})()
