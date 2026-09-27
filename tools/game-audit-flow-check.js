/** Browser-harness regression: all fifteen levels -> clean selector.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/selector.png --eval-file tools/game-audit-flow-check.js
 * Reads the supplied install; only the disposable browser's save is affected.
 * This checks loading, ten simulation ticks and exit cleanup, not mission parity.
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
  for(const position of Array.from({length:15},(_,i)=>i+1)) {
    ts2.frontDrive(0,70);
    if(ts2.viewer.backdrop.mesh.visible||ts2.viewer.aimModel)throw Error('selector retained gameplay backdrop or visor');
    if(ts2.front.state.open<position)throw Error('test levels not unlocked');
    while(ts2.front.state.pos>position){ts2.frontDrive(0x80);ts2.frontDrive(0);}
    while(ts2.front.state.pos<position){ts2.frontDrive(0x20);ts2.frontDrive(0);}
    ts2.frontDrive(0x4000);ts2.frontDrive(0,40);
    for(let i=0;i<500&&!ts2.front.inLevel;i++) {
      if(ts2.cutsceneUp){window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));}
      await pause(100);
    }
    await wait(()=>ts2.front.inLevel,'level failed '+position);
    const internal = position === 3 ? 6 : position === 6 ? 3 : position;
    const expected = 'level' + String(internal > 10 ? internal - 10 : internal).padStart(2, '0') + (internal > 10 ? '/level1' : '/level');
    if(document.querySelector('#level').selectedOptions[0].text!==expected||!ts2.player)throw Error('wrong scene '+position);
    ts2.tickGame({},10);
    if(!ts2.viewer.aimModel)throw Error('level missing visor model');
    console.log('AUDIT LEVEL LOADED',position,expected);
    ts2.openMenu();
    for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
    ts2.pressMenu('select');ts2.tickGame({},1);
    ts2.pressMenu('down');ts2.tickGame({},1);
    ts2.pressMenu('select');ts2.tickGame({},1);
    await wait(()=>['summary','select'].includes(ts2.front.screen),'exit failed '+position);
    if(ts2.front.screen==='summary'){ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);}
    await wait(()=>ts2.front.screen==='select','selector did not return');
  }
  if(ts2.viewer.backdrop.mesh.visible)throw Error('last backdrop leaked into selector');
  console.log('PASS: all fifteen levels launch through selector and return without a stale backdrop');
})()
