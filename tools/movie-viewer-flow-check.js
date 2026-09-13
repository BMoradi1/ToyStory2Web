/** Browser-harness regression: movie selection, decoding and replay return.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/movies.png --eval-file tools/movie-viewer-flow-check.js
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
  const before=JSON.stringify(ts2.save);
  ts2.frontDrive(0,70);
  for(let i=0;i<3;i++){ts2.frontDrive(0x40);ts2.frontDrive(0,20);}
  ts2.frontDrive(0x4000);ts2.frontDrive(0,30);
  await wait(()=>ts2.front.screen==='movies','retail movie screen did not open');
  ts2.frontDrive(0,70);
  const listed=ts2.front.state.choices.map(c=>c.index);
  ts2.frontDrive(0x4000);ts2.frontDrive(0,54);
  await wait(()=>ts2.cutsceneUp,'movie did not start');
  await wait(()=>ts2.cutsceneProgress?.frames>0,'movie did not decode');
  const frames=ts2.cutsceneProgress.frames;
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
  window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));
  await wait(()=>ts2.front.screen==='movies','movie screen did not return');
  ts2.frontDrive(0,70);
  if(JSON.stringify(ts2.save)!==before)throw Error('replay changed progress');
  if(document.querySelector('dialog[open]'))throw Error('browser dialog remains');
  ts2.frontDrive(0x20);ts2.frontDrive(0,70);
  return {listed,frames,cursor:ts2.front.state.cursor,returned:true,progressUnchanged:true};
})()
