/** Browser regression: Elevator Hop and Airport platform artwork and lifecycle.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/platforms.png --eval-file tools/level-platforms-flow-check.js
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
  for(const level of [10,13]) {
    await enter(level);await ts2.spawnPlayer();ts2.viewer.stop();
    const state=ts2.levelPlatforms;
    check(state?.level===level,'controller missing');
    const sample=()=>{
      const o=state.objects.find(o=>o.id===(level===10?24:21));
      const range=ts2.viewer.objectVertices.get(o.index)?.[0];check(range,'missing independent artwork');
      const at=range.start*3;return [...ts2.viewer.current.geometry.getAttribute('position').array.slice(at,at+3)];
    };
    if(level===10) {
      const initial=sample();ts2.tickGame({},60);check(JSON.stringify(sample())===JSON.stringify(initial),'locked lifts moved');
      // Position above each authored switch, then run the real stomp and host hook.
      for(const button of [1,0,1,2]) {
        const top=ts2.stompSurfaces.find(g=>g.surface===0x20+button).tops[0];
        const at=top.reduce((a,v)=>({x:a.x+v.x/3,y:a.y+v.y/3,z:a.z+v.z/3}),{x:0,y:0,z:0});
        Object.assign(ts2.player,{x:at.x*32,y:at.y*32-20000,z:at.z*32,onGround:false,contacts:[],stomp:1,climb:0,climbGroup:-1,hitStun:0,vy:0});
        ts2.tickGame({},65);
      }
      check(state.solved,'wire puzzle did not enable elevators');
    }
    const initial=sample(),m=state.movers[0],before={...m.position};
    ts2.tickGame({},80);check(JSON.stringify(sample())!==JSON.stringify(initial),'actual mesh stayed still');
    check(JSON.stringify(m.position)!==JSON.stringify(before),'collision stayed still');
    ts2.openMenu();const ticks=state.ticks;ts2.tickGame({},60);check(state.ticks===ticks,'movers advanced during pause');
    ts2.pressMenu('back');ts2.tickGame({},1);
    await ts2.spawnPlayer();ts2.viewer.stop();check(ts2.levelPlatforms!==state&&ts2.levelPlatforms.ticks===0,'restart retained mover state');
    check(!ts2.levelPlatforms.solved,'restart retained puzzle');
    ts2.openMenu();for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
    ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
    await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed');
    if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
    await wait(()=>ts2.front.screen==='select','selector missing');check(ts2.levelPlatforms===null,'controller leaked into menu');
    console.log('PASS level '+level+': rendered movement, switch gating, pause, restart, exit');
  }
})()
