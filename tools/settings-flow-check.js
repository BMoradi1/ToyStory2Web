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
  const original = {...ts2.save};
  await choose(1);
  const setVolume = value => {
    const slider=document.querySelector('dialog input[name=bgm]');slider.value=String(value);slider.dispatchEvent(new Event('input'));
  };
  setVolume(0);
  if(ts2.menu.bgm!==0)throw Error('volume preview not applied');
  await close('Cancel');
  if(ts2.menu.bgm!==original.bgm||ts2.save.bgm!==original.bgm)throw Error('cancel failed to restore volume');
  await choose(1);setVolume(3);await close('Apply');
  if(ts2.save.bgm!==3)throw Error('applied volume not saved');
  const saved = JSON.stringify(ts2.save);
  await choose(2);
  const selectFile=(bytes,name='Toy200.sav')=>{
    const data=new DataTransfer();data.items.add(new File([bytes],name));
    const input=document.querySelector('dialog input[type=file]');input.files=data.files;input.dispatchEvent(new Event('change'));
  };
  selectFile(new Uint8Array([1,2,3]));await pause(100);
  if(![...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Load selected save').disabled)throw Error('invalid save enabled load');
  await close('Cancel');
  if(JSON.stringify(ts2.save)!==saved)throw Error('cancel changed save');
  const bytes=ts2.exportSave();
  const offset=4+new DataView(bytes.buffer,bytes.byteOffset).getUint32(0,true);
  bytes[offset+0x138]=7;bytes[offset+0x139]=0;bytes[offset+0x144]=6;bytes[offset+0x145]=0;
  await choose(2);selectFile(bytes);
  await wait(()=>![...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Load selected save').disabled,'valid save not ready');
  await close('Load selected save');
  if(ts2.save.lives!==7||ts2.save.health!==6||ts2.save.level!==0)throw Error('loaded fields not applied');
  const {loadProgress}=await import('/src/loader/save.ts');
  const reloaded=await loadProgress(new Map());
  if(reloaded.p.lives!==7||reloaded.p.health!==6||reloaded.p.bgm!==3)throw Error('loaded save not persisted');
  // Check that a later selector cursor save cannot copy the old resources back.
  ts2.frontDrive(0,70);ts2.frontDrive(0x4000);ts2.frontDrive(0,40);
  await wait(()=>ts2.front.screen==='select','selector did not reopen');
  if(ts2.save.lives!==7||ts2.save.health!==6||ts2.player!==null)throw Error('old gameplay survived loading');
  ts2.frontDrive(0,70);ts2.frontDrive(0x1000);ts2.frontDrive(0,50);
  await wait(()=>ts2.front.screen==='menu','cancel selector failed');
  await choose(1);
  return {dialog:document.querySelector('dialog h1').textContent,bgm:ts2.save.bgm,lives:ts2.save.lives,health:ts2.save.health};
})()
