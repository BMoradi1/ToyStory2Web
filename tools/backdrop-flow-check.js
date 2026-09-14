/** Framebuffer regression for the installed level backdrop: rotation and translation. */
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
  ts2.frontDrive(0, 40); ts2.frontDrive(0x4000); ts2.frontDrive(0, 30);
  await wait(() => ts2.front.screen === 'select' , 'selector did not open');
  ts2.frontDrive(0, 70);
  while (ts2.front.state.pos > 1) { ts2.frontDrive(0x80); ts2.frontDrive(0); }
  ts2.frontDrive(0x4000); ts2.frontDrive(0, 40);
  for (let i=0; i<500 && !ts2.front.inLevel; i++) {
    if (ts2.cutsceneUp) {
      window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
      window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));
    }
    await pause(100);
  }
  await wait(() => ts2.front.inLevel, 'level did not start');
  ts2.viewer.stop();
  const v=ts2.viewer;
  for(const child of v.scene.children)child.visible=child===v.backdrop.mesh;
  const r=v.renderer,gl=r.getContext();
  const sample=(x,y,z,dx,dy,dz)=>{
    v.camera.position.set(x,y,z);v.camera.lookAt(x+dx,y+dy,z+dz);v.camera.updateMatrixWorld();
    v.backdrop.update(v.camera,2);r.render(v.scene,v.camera);
    const out=new Uint8Array(64*64*4);
    gl.readPixels((gl.drawingBufferWidth>>1)-32,(gl.drawingBufferHeight>>1)-32,64,64,gl.RGBA,gl.UNSIGNED_BYTE,out);
    return out;
  };
  const first=sample(0,0,0,0,0,-1),translated=sample(100,40,-30,0,0,-1),turned=sample(0,0,0,1,-0.2,0);
  if(first.some((c,i)=>c!==translated[i]))throw Error('backdrop moves with camera translation');
  if(!first.some((c,i)=>c!==turned[i]))throw Error('backdrop does not respond to camera rotation');
  if(new Set(first).size<5)throw Error('backdrop is still flat colour');
  const colours=new Set();
  for(let i=0;i<first.length;i+=4)colours.add((first[i]<<16)|(first[i+1]<<8)|first[i+2]);
  if(colours.size<=256)throw Error('backdrop still uses blocky palette-only magnification');
  console.log('BACKDROP FRAMEBUFFER PASS: textured, rotation responsive, translation invariant');
})();
