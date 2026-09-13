/** Isolated front-end host: final-level win -> ending -> credits -> selector.
 * Loads all pictures and text through the browser's selected install.
 */
(async () => {
  const { FrontEnd } = await import('/src/front/run.ts');
  const { loadFrontArt } = await import('/src/front/title.ts');
  const { CREDIT_SLOTS, CREDIT_TEXT } = await import('/src/front/endings.ts');
  const { gameDirFromFileList } = await import('/src/loader/gamedir.ts');
  const { exeString } = await import('/src/sim/level-data.ts');
  const { readFrontStrings } = await import('/src/front/screens.ts');
  const { readSpriteTable } = await import('/src/formats/sprite-table.ts');
  const dir = gameDirFromFileList(document.querySelector('input[type=file]').files);
  const exe = await dir.get('toy2.exe').read();
  const art = await loadFrontArt(dir);
  const creditsArt = await loadFrontArt(dir, 'levelt3', [31], CREDIT_SLOTS);
  const parent = document.createElement('div');
  parent.style.cssText = 'position:fixed;inset:0;z-index:100'; document.body.append(parent);
  const tracks = []; let endings = 0;
  const front = new FrontEnd({ strings:readFrontStrings(exe,exeString),
    menuTable:readSpriteTable(exe,0), selectTable:readSpriteTable(exe,16), ...art,
    pad:()=>0, playSound:()=>{}, music:(track,loop)=>tracks.push([track,loop]), musicEnded:()=>false,
    tokens:()=>Array(17).fill(255), cursor:()=>14, setCursor:()=>{}, enteredWith:()=>255,
    playLevel:async position=>{if(position!==15)throw Error('wrong finale position'); return 'won';},
    attract:async()=>{}, summary:()=>null, loadSummaryArt:async()=>null,
    loadCreditsArt:async()=>creditsArt, creditsText:()=>exeString(exe,CREDIT_TEXT),
    ending:async()=>{endings++;}, resetLives:()=>{}, quit:()=>{}, loadDiorama:async()=>null,
    unloadDiorama:()=>{}, dioramaLists:()=>[], camNode:()=>0,setCamNode:()=>{},rand:()=>0,
    applyDiorama:()=>{}, selectSheets:()=>null, sceneRect:()=>null,
  },parent);
  void front.run();
  const settle = ()=>new Promise(r=>setTimeout(r,50));
  const choose = async()=>{front.drive(0,70);front.drive(0x4000);front.drive(0,40);await settle();};
  await choose(); await choose(); await choose();
  if(front.current?.kind!=='credits'||endings!==1)throw Error('final win did not enter credits');
  front.drive(0,400);
  front.drive(0x4000);front.drive(0,53);await settle();
  if(front.current?.kind!=='select')throw Error('credits did not return to selector');
  await choose();front.drive(0,750);
  return {screen:front.current.kind,endings,tracks,pictureSlots:[...creditsArt.cards.keys()]};
})()
