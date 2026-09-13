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
  const choose = async row => {
    ts2.frontDrive(0,70);
    for(let i=0;i<row;i++){ts2.frontDrive(0x40);ts2.frontDrive(0,20);}
    ts2.frontDrive(0x4000);ts2.frontDrive(0,30);
    await wait(()=>document.querySelector('dialog[open]'),'dialog did not open');
  };
  const click = label => {
    const button=[...document.querySelectorAll('dialog button')].find(b=>b.textContent===label);
    if(!button||button.disabled)throw Error('unavailable button '+label);button.click();
  };
  const close = async label => {click(label);await wait(()=>ts2.front.screen==='menu','menu did not return');};
  const before = JSON.stringify(ts2.save);
  await choose(3);
  const listed=[...document.querySelectorAll('[data-movie]')].map(b=>Number(b.dataset.movie));
  if(listed[0]!==10)throw Error('trailer missing');
  document.querySelector('[data-movie="10"]').click();
  await wait(()=>ts2.cutsceneUp,'movie did not start');
  await wait(()=>ts2.cutsceneProgress?.frames>0,'movie did not decode');
  if(document.querySelector('dialog[open]'))throw Error('modal obscures video');
  const frames=ts2.cutsceneProgress.frames;
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
  window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));
  await wait(()=>document.querySelector('dialog[open]'),'viewer did not return');
  if(document.activeElement?.dataset.movie!=='10')throw Error('selection not restored');
  if(JSON.stringify(ts2.save)!==before)throw Error('replay changed progress');
  await close('Back');
  await choose(3);
  return {listed,frames,returned:true,progressUnchanged:JSON.stringify(ts2.save)===before};
})()
