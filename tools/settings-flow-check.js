/** Browser-harness regression: options preview/apply/cancel and save import.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/options.png --eval-file tools/settings-flow-check.js
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
  const choose=async row=>{
    ts2.frontDrive(0,70);for(let i=0;i<row;i++){ts2.frontDrive(0x40);ts2.frontDrive(0,20);}
    ts2.frontDrive(0x4000);ts2.frontDrive(0,30);
    await wait(()=>ts2.front.screen===(row===1?'options':'load'),'retail screen did not open');
    ts2.frontDrive(0,70);
  };
  await choose(1);
  // Configure a physical key, then accept through the controller page.
  ts2.frontDrive(0x4000);ts2.frontDrive(0);
  ts2.frontDrive(0x4000);ts2.frontDrive(0);
  if(!ts2.front.state.capture)throw Error('controller did not enter key capture');
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'l',code:'KeyL'}));
  window.dispatchEvent(new KeyboardEvent('keyup',{key:'l',code:'KeyL'}));
  if(ts2.front.state.value.keys.up[0]!=='KeyL')throw Error('key capture failed');
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter'}));
  window.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter'}));
  if(JSON.parse(localStorage.getItem('ts2.controls')).up[0]!=='KeyL')throw Error('binding did not persist');
  const before=ts2.save.bgm;
  ts2.frontDrive(0x40);ts2.frontDrive(0,35);ts2.frontDrive(0x4000);ts2.frontDrive(0);
  if(ts2.front.state.page!==1)throw Error('music page did not open');
  ts2.frontDrive(0x80);ts2.frontDrive(0);ts2.frontDrive(0x1000);ts2.frontDrive(0);
  if(ts2.menu.bgm!==before)throw Error('volume cancel did not restore');
  ts2.frontDrive(0x4000);ts2.frontDrive(0);ts2.frontDrive(0x80);ts2.frontDrive(0);ts2.frontDrive(0x4000);ts2.frontDrive(0);
  const value=ts2.menu.bgm;
  ts2.frontDrive(0x1000);ts2.frontDrive(0,45);
  await wait(()=>ts2.front.screen==='menu','options did not exit');
  if(ts2.save.bgm!==value)throw Error('volume was not saved');
  await choose(2);
  if(document.querySelector('dialog'))throw Error('replacement dialog remains');
  // Import is a native file picker, while preview/confirmation stays on canvas.
  [...document.querySelectorAll('button')].find(b=>b.textContent==='Import save file').click();
  const fileInput=document.querySelector('input[aria-label="Import save file"]');
  const bytes=ts2.exportSave();const offset=4+new DataView(bytes.buffer,bytes.byteOffset).getUint32(0,true);
  bytes[offset+0x138]=7;bytes[offset+0x144]=6;bytes[offset+0x145]=0;
  const transfer=new DataTransfer();transfer.items.add(new File([bytes],'Toy200.sav'));
  fileInput.files=transfer.files;fileInput.dispatchEvent(new Event('change'));
  await wait(()=>ts2.front.state.row===7,'import did not populate slot');
  if(ts2.save.lives===7)throw Error('import replaced progress before selecting load');
  ts2.frontDrive(0x4000);ts2.frontDrive(0);
  await wait(()=>ts2.front.screen==='menu','imported save did not load');
  if(ts2.save.lives!==7||ts2.save.health!==6)throw Error('import resources not applied');
  await choose(2);
  ts2.frontDrive(0x40);ts2.frontDrive(0);ts2.frontDrive(0x4000);ts2.frontDrive(0);
  if(ts2.front.state.page!=='save')throw Error('save page did not open');
  ts2.frontDrive(0x4000);ts2.frontDrive(0);await pause(50);
  if(!localStorage.getItem('ts2.slot.0'))throw Error('save slot did not persist');
  ts2.frontDrive(0x1000);ts2.frontDrive(0);
  ts2.frontDrive(0x4000);ts2.frontDrive(0);
  if(ts2.front.state.page!=='load' ||!ts2.front.state.slots[0].progress)throw Error('load slots did not open');
  ts2.frontDrive(0x4000);ts2.frontDrive(0);
  await wait(()=>ts2.front.screen==='menu','load did not return');
  await choose(1);
  return {screen:ts2.front.screen,originalVolume:before,savedVolume:ts2.save.bgm,loadPassed:true};
})()
