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
  v.setPlayer(null);for(const [o,visible] of visibility)o.visible=visible;
})();
