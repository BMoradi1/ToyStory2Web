/** Browser regression: authored ZPOD attack, impact flare, damage and scene reset.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/pod-beam.png --eval-file tools/pod-beam-flow-check.js
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
  const selector=document.querySelector('#level');
  const scene='level04/level';
  selector.selectedIndex=[...selector.options].findIndex(o=>o.text===scene);
  selector.dispatchEvent(new Event('change'));
  await wait(()=>document.querySelector('#status').textContent.includes(scene+': ready'),scene);
  await ts2.spawnPlayer();ts2.viewer.stop();
  const pod=ts2.creatures.find(c=>c.type===20&&c.health>0);
  if(!pod)throw Error('authored ZPOD missing');
  const playerY=pod.y;
  let beam=null;
  for(let i=0;i<400;i++){
    ts2.goToCreature(pod.slot);ts2.player.y=playerY;ts2.tickGame({},1);
    beam=ts2.effects.podBeams[0];
    if(beam)break;
  }
  if(!beam)throw Error('ZPOD never fired');
  if(beam.colour.join(',')!=='0,1,0'||beam.to.y<=beam.from.y)throw Error('wrong beam direction/colour');
  if(!ts2.effects.cards)throw Error('beam art missing');
  let impactLit=false;
  for(let i=0;i<160;i++){
    const previous=ts2.effects.podBeams.find(b=>b.flareSize===32);
    // Stay inside the authored chase box while approaching the beam endpoint.
    const caster=ts2.creatures.find(c=>c.slot===pod.slot);
    const toward=previous?.to??beam.to;
    ts2.player.x=caster.homeX+Math.max(-caster.rangeX*200,Math.min(caster.rangeX*200,toward.x-caster.homeX));
    ts2.player.z=caster.homeZ+Math.max(-caster.rangeZ*200,Math.min(caster.rangeZ*200,toward.z-caster.homeZ));
    ts2.player.y=toward.y+8192;
    ts2.player.hitStun=1000;ts2.tickGame({},1);
    const pool=ts2.effects.pointLights,selected=ts2.effects.lightTransition.selected;
    const light=pool.find(l=>l.owner===-2&&l.life>0);
    if(light){
      if(light.r!==0||light.g!==192||light.b!==0||light.life>15)throw Error('wrong impact light');
      if(selected>=0&&pool[selected].owner===-2&&ts2.effects.playerLight?.colour[1]>0){impactLit=true;break;}
    }
  }
  if(!impactLit)throw Error('ZPOD impact never lit Buzz '+JSON.stringify({player:ts2.player,pod:ts2.creatures.find(c=>c.slot===pod.slot),beams:ts2.effects.podBeams,lights:ts2.effects.pointLights}));
  beam=ts2.effects.podBeams.find(b=>b.flareSize===32)??beam;
  const frozenLights=JSON.stringify(ts2.effects.pointLights);
  for(let i=0;i<5;i++)ts2.redrawHud();
  if(JSON.stringify(ts2.effects.pointLights)!==frozenLights)throw Error('drawing aged impact lights');
  console.log('ZPOD IMPACT CHARACTER LIGHT PASS');
  const viewer=ts2.viewer;
  let visible=false;
  for(const [x,y,z] of [[0,-1,0],[0,0,1],[1,0,0],[0,0,-1],[-1,0,0]]){
    viewer.camera.position.set(beam.to.x/8192+x,-beam.to.y/8192+y,-beam.to.z/8192+z);
    viewer.camera.lookAt(beam.to.x/8192,-beam.to.y/8192,-beam.to.z/8192);
    if(ts2.redrawHud().some(s=>s.colour[0]===0&&s.colour[1]>0&&s.colour[2]===0)){visible=true;break;}
  }
  if(!visible)throw Error('impact flare missing');
  console.log('ZPOD BROWSER ATTACK PASS',JSON.stringify(beam));
  ts2.player.x=beam.to.x;ts2.player.y=beam.to.y;ts2.player.z=beam.to.z;
  ts2.player.hitStun=0;
  const health=ts2.pickups.health;
  ts2.resolveCreatureBeams();
  if(ts2.pickups.health!==health-1)throw Error('beam impact did not damage Buzz');
  ts2.resolveCreatureBeams();
  if(ts2.pickups.health!==health-1)throw Error('impact bypassed hit invulnerability');
  console.log('ZPOD IMPACT DAMAGE PASS');
  const frozen=JSON.stringify(ts2.effects.podBeams);
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
  window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));
  ts2.tickGame({},10);
  if(JSON.stringify(ts2.effects.podBeams)!==frozen)throw Error('pause changed beam');
  // Exit using the real pause/summary path.
  for(let i=0;i<3;i++){ts2.pressMenu('down');ts2.tickGame({},1);}
  ts2.pressMenu('select');ts2.tickGame({},1);ts2.pressMenu('down');ts2.tickGame({},1);ts2.pressMenu('select');ts2.tickGame({},1);
  await wait(()=>ts2.front.screen==='summary','summary');
  ts2.frontDrive(0,650);ts2.frontDrive(0x4000);ts2.frontDrive(0,130);
  await wait(()=>ts2.front.screen==='select','selector');
  if(ts2.effects?.podBeams.length||ts2.lensFlares.sprites.length)throw Error('pod beam leaked into selector');
  console.log('ZPOD PAUSE/CLEANUP PASS');
})();
