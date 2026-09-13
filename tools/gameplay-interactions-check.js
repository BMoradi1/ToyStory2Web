/** Browser regression: earlier NPC animation, rope traversal, and real pushable artwork.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/interactions.png --eval-file tools/gameplay-interactions-check.js
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
  ts2.frontDrive(0, 40); ts2.frontDrive(0x4000); ts2.frontDrive(0, 30);
  await wait(() => ts2.front.screen === 'select', 'selector did not open');
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
  const npc = ts2.creatures.find(c => c.type === 10);
  if(!npc) throw Error('Hamm not found');
  // Outside the old inner cutoff, inside the retained outer activation bound.
  ts2.player.x=npc.x+npc.offsetX+(500+(npc.hitRadius>>3))*256; ts2.player.y=npc.y+npc.offsetY; ts2.player.z=npc.z+npc.offsetZ;
  const frames=new Set();
  for(let i=0;i<60;i++) { ts2.player.y=npc.y+npc.offsetY; ts2.player.vy=0; ts2.tickGame({},1); const c=ts2.creatures.find(c=>c.slot===npc.slot); frames.add(c.frame); }
  const active=ts2.creatures.find(c=>c.slot===npc.slot);
  if(!active.near || frames.size<2) throw Error('distant NPC is frozen');
  const rope = ts2.goToPole(0);
  const startY = ts2.player.y;
  ts2.tickGame({moveY:1}, 60, 0);
  if(ts2.player.pole !== 0 || ts2.player.y >= startY - 10000) throw Error('rope did not climb');
  const climbing = {y:ts2.player.y, pole:ts2.player.pole, phase:ts2.player.animPhase};
  ts2.tickGame({moveY:-1}, 25, 0);
  if(ts2.player.y <= climbing.y) throw Error('rope did not slide');
  ts2.tickGame({jump:true}, 1, 0);
  if(ts2.player.pole !== -1 || ts2.player.vy >= 0) throw Error('rope jump-off failed');
  ts2.tickGame({},1,0);
  if(ts2.player.pole !== -1) throw Error('immediate rope regrab');
  ts2.player.poleLock = -1;
  ts2.player.jumpState=0; ts2.player.spin=0; ts2.player.laser=0;
  ts2.player.climb=0; ts2.player.fallTimer=0;
  const setup=ts2.goToPushBlock(0);
  const before=ts2.pushBlocks.blocks[0];
  const sceneMesh = ts2.viewer.scene.children.find(c=>c.isMesh && c.geometry?.attributes.position?.count>90000);
  if(!sceneMesh) throw Error('level mesh missing');
  const position=sceneMesh.geometry.attributes.position;
  const basePositions=position.array.slice();
  const ranges=ts2.viewer.objectVertices.get(before.object);
  if(!ranges?.length)throw Error('crate is still baked into static geometry');
  ts2.tickGame({moveY:1}, 70, setup.yaw);
  const after=ts2.pushBlocks.blocks[0];
  if(after.run <= before.run) throw Error('crate did not move');
  if(Math.hypot(ts2.player.x-setup.player.x,ts2.player.z-setup.player.z)<5000) throw Error('Buzz did not follow crate');
  if(!ts2.player.contacts.some(c=>c.group===after.group)) throw Error('crate collision separated from Buzz');
  const displacement=[(after.x-before.x)/8192,-(after.y-before.y)/8192,-(after.z-before.z)/8192];
  for(const range of ranges)for(let v=range.start;v<range.start+range.count;v++)for(let axis=0;axis<3;axis++){
    if(Math.abs(position.array[v*3+axis]-basePositions[v*3+axis]-displacement[axis])>0.0001)
      throw Error('crate artwork displacement differs from collision');
  }
  ts2.tickGame({}, 1, setup.yaw);
  if(ts2.pushBlocks.held!==0) throw Error('crate did not release');
  console.log('GAMEPLAY INTERACTIONS PASS', JSON.stringify({rope,climbing,before,after,player:{x:ts2.player.x,y:ts2.player.y,z:ts2.player.z}}));
  ts2.viewer.renderer.render(ts2.viewer.scene,ts2.viewer.camera);
})()
