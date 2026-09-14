/** Browser regression: gamma menu, persistence and actual renderer colours.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/gamma.png --eval-file tools/gamma-flow-check.js
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
  for(let i=0;i<3;i++){ts2.frontDrive(64);ts2.frontDrive(0,35);}
  ts2.frontDrive(0x4000);ts2.frontDrive(0);ts2.frontDrive(64);ts2.frontDrive(0);
  const gammaURL=performance.getEntriesByType('resource').find(e=>/\/src\/render\/gamma\.ts(?:\?|$)/.test(e.name))?.name;
  if(!gammaURL)throw Error('loaded gamma module not found');
  const gamma=await import(gammaURL);
  const step=()=>{ts2.frontDrive(32);ts2.frontDrive(0,16);};
  step();if(gamma.getGamma()!==2.5)throw Error('gamma preview');
  ts2.frontDrive(0x1000);ts2.frontDrive(0);
  if(gamma.getGamma()!==2)throw Error('gamma cancel rollback');
  ts2.frontDrive(0x4000);ts2.frontDrive(0);ts2.frontDrive(64);ts2.frontDrive(0);
  step();step();step();if(gamma.getGamma()!==3)throw Error('gamma high clamp');
  ts2.frontDrive(0x4000);ts2.frontDrive(0);
  ts2.frontDrive(0x1000);ts2.frontDrive(0,45);
  await wait(()=>ts2.front.screen==='menu','options exit');
  if(localStorage.getItem('ts2.gamma')!=='3')throw Error('gamma persistence');
  // Verify canvas modulation on a dark texel: clamping occurs before the texel multiply.
  const {HudPainter}=await import('/src/render/hud-draw.ts');
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
  const painter=new HudPainter(canvas),sheet=document.createElement('canvas');sheet.width=sheet.height=1;
  sheet.getContext('2d').fillStyle='rgb(100,80,60)';sheet.getContext('2d').fillRect(0,0,1,1);
  const pixel=colour=>[...painter.tinted(sheet,colour).getContext('2d').getImageData(0,0,1,1).data];
  const equal=(a,b,label)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(label+': '+JSON.stringify(a));};
  equal(pixel(255),[100,80,60,255],'pre-texture clamp');
  gamma.setGamma(2);equal(pixel(64),[50,40,30,255],'normal HUD');
  gamma.setGamma(3);equal(pixel(64),[75,60,45,255],'high HUD/cache invalidation');
  // Existing world geometry changes without a level reload and returns exactly.
  const viewer=ts2.viewer;viewer.stop();gamma.setGamma(2);viewer.refreshGamma();
  const attribute=viewer.current.geometry.getAttribute('color');
  const original=[...attribute.array];gamma.setGamma(3);viewer.refreshGamma();
  if(!original.some((v,i)=>attribute.array[i]>v))throw Error('loaded geometry unchanged');
  if([...attribute.array].some(v=>v>1||v<0))throw Error('geometry gain unclamped');
  gamma.setGamma(2);viewer.refreshGamma();equal([...attribute.array],original,'geometry rollback');
  // The production world-sprite buffer also uses the lookup while preserving opacity.
  const {SpriteBatch}=await import('/src/render/world-sprites.ts');
  const batch=new SpriteBatch(false,'normal');
  const card={x:0,y:0,z:0,width:1,height:1,u0:0,v0:0,u1:1,v1:1,r:0.5,g:1,b:2,alpha:0.25};
  gamma.setGamma(3);batch.update([card],viewer.camera);
  const c=batch.mesh.geometry.getAttribute('acolour');
  if(Math.abs(c.getX(0)-192/255)>1e-6||c.getY(0)!==1||c.getZ(0)!==1||c.getW(0)!==0.25)throw Error('world sprite gamma/alpha');
  gamma.setGamma(3);viewer.start();
  // Leave the real graphics page visible for the screenshot.
  await choose(1);
  for(let i=0;i<3;i++){ts2.frontDrive(64);ts2.frontDrive(0,35);}
  ts2.frontDrive(0x4000);ts2.frontDrive(0);ts2.frontDrive(64);ts2.frontDrive(0,20);
  ts2.frontDrive(0x10);ts2.frontDrive(0);
  console.log('GAMMA BROWSER PASS: preview, rollback, persistence, HUD pixels, loaded geometry and world sprite RGB/alpha');
})();
