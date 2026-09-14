/** Framebuffer check using a synthetic triangle; no copyrighted fixture data. */
(async()=>{
  const v=ts2.viewer;v.stop();
  const visibility=v.scene.children.map(o=>[o,o.visible]);
  for(const [o] of visibility)o.visible=false;
  v.scene.fog=null;
  v.setPlayer({triangleCount:1,positions:new Float32Array([-1,-1,0,1,-1,0,0,1,0]),
    colors:new Float32Array(9).fill(0.1),uvs:new Float32Array(6),groups:[{start:0,count:3,page:null}]});
  v.camera.position.set(0,0,2);v.camera.lookAt(0,0,0);v.camera.updateMatrixWorld();
  const r=v.renderer,gl=r.getContext();
  const sample=()=>{
    r.clear();r.render(v.scene,v.camera);
    const p=new Uint8Array(4);gl.readPixels(gl.drawingBufferWidth>>1,gl.drawingBufferHeight>>1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);
    return [...p];
  };
  const base=sample();
  v.setPlayerLight([0,0,1],[80,40,0]);const lit=sample();
  if(!(lit[0]>lit[1]&&lit[1]>lit[2]&&lit[0]>base[0]+30))throw Error('orange light not rendered '+JSON.stringify({base,lit}));
  v.setPlayerLight([0,0,-1],[80,40,0]);const back=sample();
  if(back.some((x,i)=>x!==base[i]))throw Error('back-facing triangle lit');
  v.setPlayerLight([0,0,1],[80,40,0]);
  v.setPlayerLight([0,0,0],[0,0,0]);const reset=sample();
  if(reset.some((x,i)=>x!==base[i]))throw Error('light tint persists after reset');
  console.log('PLAYER LIGHT FRAMEBUFFER PASS',JSON.stringify({base,lit,back,reset}));
  const {createPointLights,addPointLight,stepPointLights}=await import('/src/sim/point-light.ts');
  let lights=createPointLights();const buzz={x:0,y:8192,z:0};
  addPointLight(lights,{x:0,y:0,z:16384,r:80,g:40,b:0,life:2,owner:1});
  const lightTick=()=>{
    const light=stepPointLights(lights,buzz);
    v.setPlayerLight(light?[light.direction.x,light.direction.y,light.direction.z]:[0,0,0],light?.colour??[0,0,0]);
    return sample();
  };
  const peak=lightTick(),firstReturn=lightTick();
  if(peak.some((x,i)=>x!==firstReturn[i]))throw Error('return starts with a visible snap');
  let midpoint;
  for(let i=0;i<32;i++)midpoint=lightTick();
  if(!(midpoint[0]>base[0]&&midpoint[0]<peak[0]))throw Error('return blend not visible '+JSON.stringify({peak,midpoint,base}));
  for(let i=0;i<32;i++)lightTick();
  const faded=sample();
  if(faded.some((x,i)=>x!==base[i]))throw Error('return failed to restore base pixels');
  console.log('PLAYER LIGHT TRANSITION FRAMEBUFFER PASS',JSON.stringify({peak,firstReturn,midpoint,faded}));
  lights=createPointLights({offset:{x:0,y:0,z:16384},colour:[16,32,48]});
  const reserved=lightTick();
  if(!(reserved[2]>reserved[1]&&reserved[1]>reserved[0]&&reserved[0]>base[0]))throw Error('reserved colour missing');
  addPointLight(lights,{x:0,y:0,z:16384,r:80,g:40,b:0,life:2,owner:1});
  lightTick();lightTick();
  for(let i=0;i<64;i++)lightTick();
  const restored=sample();
  if(restored.some((x,i)=>x!==reserved[i]))throw Error('return failed to restore reserved pixels');
  console.log('RESERVED LIGHT FRAMEBUFFER PASS',JSON.stringify({reserved,restored}));
  const [{readEffectTable,EFFECT_FLAGS},{createEffects,spawnEffect,stepEffects},{RandomStream}]=await Promise.all([
    import('/src/formats/effect-table.ts'),import('/src/sim/effects.ts'),import('/src/sim/creatures.ts')]);
  const file=[...document.querySelector('#pickfile').files].find(f=>f.name.toLowerCase()==='toy2.exe');
  const {kinds,modes}=readEffectTable(new Uint8Array(await file.arrayBuffer()));
  const world={cameraX:0,cameraY:0,cameraZ:0,playerX:0,playerY:8192,playerZ:0,
    playerYaw:0,playerVx:0,playerVz:0,groundAt:()=>null,waterY:null};
  buzz.x=512;
  for(const code of [3,5,8]){
    const sim=createEffects(kinds,modes,new RandomStream(new Uint8Array([0])));
    const kind=kinds.findIndex(t=>t?.death===(code===5?3:code));
    const e=spawnEffect(sim,world,512,0,8192,0,0,0,0,0,0,kind);
    Object.assign(e,{life:1,death:code,mode:0,flags:EFFECT_FLAGS.keep,frames:1});
    e.y=code===5?0:-e.height*32;
    stepEffects(sim,world);
    if(sim.pointLights.length!==1)throw Error('missing death light '+code);
    lights=createPointLights();
    for(const light of sim.pointLights.splice(0))addPointLight(lights,light);
    const flash=lightTick();
    if(!(flash[0]>base[0]+30&&flash[2]===base[2]))throw Error('death flash missing '+code);
    if(code===5?!(flash[1]>base[1]&&flash[0]>flash[1]):flash[1]!==base[1])throw Error('wrong death tint '+code);
    for(let i=0;i<90;i++)lightTick();
    const returned=sample();
    if(returned.some((x,i)=>x!==base[i]))throw Error('death light did not fade '+code);
    console.log('EFFECT DEATH LIGHT FRAMEBUFFER PASS',code,JSON.stringify({flash,returned}));
  }
  v.setPlayer(null);for(const [o,visible] of visibility)o.visible=visible;
})();
