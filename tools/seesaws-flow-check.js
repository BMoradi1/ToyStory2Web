/** Five native seesaws: protected approach, actual physics landing, rendered near/far and lifecycle. */
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
  const dismiss=()=>{for(let t=0;t<2000&&ts2.talk;t++)ts2.tickGame({jump:(t&1)===0},1,0);};
  for(const level of [1,2,13]){
    await enter(level);await ts2.spawnPlayer();ts2.viewer.stop();dismiss();
    const count=ts2.seesaws.platforms.length;
    for(let i=0;i<count;i++){
      if(i){await ts2.spawnPlayer();ts2.viewer.stop();dismiss();}
      const r=ts2.seesaws.platforms[i],origin=r.hull.origin;
      const area=q=>Math.abs((q.vertices[1].x-q.vertices[0].x)*(q.vertices[2].z-q.vertices[0].z)-(q.vertices[2].x-q.vertices[0].x)*(q.vertices[1].z-q.vertices[0].z));
      const floor=r.hull.polys.filter(q=>q.normal.y<-.99).sort((a,b)=>area(b)-area(a))[0];check(floor,'missing seesaw floor');
      const rest=floor.vertices.reduce((a,v)=>({x:a.x+v.x/3,y:a.y+v.y/3,z:a.z+v.z/3}),{x:0,y:0,z:0});
      const point=()=>{
        const yaw=r.profile.yaw*Math.PI/2048,roll=r.angle/4*Math.PI/2048;
        const x=rest.x-origin.x,y=rest.y-origin.y,z=rest.z-origin.z,xx=x*Math.cos(roll)-y*Math.sin(roll),yy=x*Math.sin(roll)+y*Math.cos(roll);
        return {x:(origin.x+xx*Math.cos(yaw)+z*Math.sin(yaw))*32,y:(origin.y+yy)*32,z:(origin.z+z*Math.cos(yaw)-xx*Math.sin(yaw))*32};
      };
      for(let t=0;t<120;t++){const at=point();ts2.setPlayerPos(at.x,at.z,at.y-20000);Object.assign(ts2.player,{vx:0,vy:0,vz:0,fallTimer:0,fellOut:false,hitStun:1000,climb:0,climbGroup:-1,pole:-1,zipLine:-1});ts2.tickGame({},1,0);if(ts2.talk)dismiss();}
      const at=point();ts2.setPlayerPos(at.x,at.z,at.y-300);Object.assign(ts2.player,{vx:0,vy:0,vz:0,fallTimer:0,fellOut:false,hitStun:0,onGround:false});
      let contacts=0;const rolls=new Set();
      for(let t=0;t<160;t++){
        ts2.tickGame({},1,0);if(ts2.talk)dismiss();
        if(ts2.player.onGround&&ts2.player.contacts.some(c=>c.group===r.hull.groupIndex))contacts++;
        rolls.add(r.angle);
        for(const o of r.objects)check(ts2.viewer.objectTransforms.get(o.index)?.startsWith(o.angles.join(',')+'|'),'seesaw render mismatch '+level+'/'+i);
      }
      check(contacts>3&&rolls.size>3,'actual seesaw interaction failed '+level+'/'+i+' '+JSON.stringify({contacts,rolls:rolls.size,zones:ts2.zones,angle:r.angle,player:ts2.player}));
    }
    ts2.openMenu();const frozen=JSON.stringify(ts2.seesaws);ts2.tickGame({},130);check(JSON.stringify(ts2.seesaws)===frozen,'paused seesaw advanced');ts2.pressMenu('back');ts2.tickGame({},1,0);
    await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.seesaws.platforms.every(r=>r.angle===0&&r.speed===0),'restart retained seesaw');
    await leave();check(ts2.seesaws===null,'seesaw survived exit');console.log('PASS actual seesaw landings/weight/render/pause/restart/exit level '+level);
  }
})()
