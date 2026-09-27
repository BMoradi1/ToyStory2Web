/** Browser-harness regression: all fifteen selector ambience loops and scene transitions.
 * npm run dev
 * npx tsx tools/browser-shot.ts "Toy Story 2" /tmp/select-audio.png --eval-file tools/select-audio-flow-check.js --user-gesture
 * Reads the supplied install; only the disposable browser's save is affected.
 */
(async () => {
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const wait = async (test, message) => {
    for (let i = 0; i < 500; i++) { if (test()) return; await pause(100); }
    throw new Error(message + ': ' + JSON.stringify(ts2.front));
  };
  const voices = [];
  const originalStart = AudioBufferSourceNode.prototype.start;
  const originalStop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.start = function (...args) {
    if (this.loop) voices.push({ source: this, stopped: false });
    return originalStart.apply(this, args);
  };
  AudioBufferSourceNode.prototype.stop = function (...args) {
    const voice = voices.find(v => v.source === this);
    if (voice) voice.stopped = true;
    return originalStop.apply(this, args);
  };
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const active = () => voices.filter(v => !v.stopped);
  // Skip the boot's movies/cards through their normal input handlers.
  for (let i = 0; i < 100 && !ts2.front.running; i++) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }));
    ts2.closeTitleCard(); await pause(100);
  }
  await wait(() => ts2.front.screen === 'title', 'title did not open');
  ts2.frontDrive(0, 40); ts2.frontDrive(0x4000); ts2.frontDrive(0, 30);
  await wait(() => ts2.front.screen === 'menu', 'menu did not open');
  for (let level = 1; level <= 15; level++) ts2.save.tokens[level] = 31;
  ts2.frontDrive(0, 40); ts2.frontDrive(0x4000); ts2.frontDrive(0, 30);
  await wait(() => ts2.front.screen === 'select', 'selector did not open');
  check(ts2.front.state.pos === ts2.save.level + 1, 'initial selector skipped the saved level');
  ts2.frontDrive(0, 70);
  const hover = async pos => {
    for (let i = 0; i < 15 && ts2.front.state.pos !== pos; i++) {
      ts2.frontDrive(ts2.front.state.pos < pos ? 0x20 : 0x80);
      ts2.frontDrive(0);
    }
    check(ts2.front.state.pos === pos, 'could not navigate to ' + pos);
    const name = 'level' + String(pos).padStart(2, '0');
    await wait(() => { ts2.frontDrive(0); return ts2.sound.ambience === name; }, name + ' did not play');
    check(active().length === 1, 'preview loops overlap at ' + pos);
    check(active()[0].source.context.state === 'running', 'audio context is suspended');
    check(active()[0].source.buffer.duration > 0, 'empty decoded preview');
    const starts = voices.length;
    ts2.frontDrive(0, 30);
    check(voices.length === starts, 'stationary hover restarted preview');
  };
  for (let pos = 1; pos <= 15; pos++) await hover(pos);
  check(ts2.sound.raised.some(n => n === 'front:2:Switch'), 'wrong menu navigation bank');
  for (let pos = 14; pos >= 1; pos--) { ts2.frontDrive(0x80); ts2.frontDrive(0); }
  await hover(1);
  console.log('SELECT AUDIO ALL 15 / RAPID SWITCH / LOOP REUSE PASS');

  ts2.frontDrive(0x1000); ts2.frontDrive(0, 40);
  await wait(() => ts2.front.screen === 'menu', 'cancel did not return to menu');
  check(ts2.sound.ambience === null && active().length === 0, 'preview leaked into menu');
  ts2.frontDrive(0, 40); ts2.frontDrive(0x4000); ts2.frontDrive(0, 30);
  await wait(() => ts2.front.screen === 'select', 'selector did not reopen');
  check(ts2.front.state.pos === ts2.save.level + 1, 'reopening selector advanced the saved level');
  ts2.frontDrive(0, 70); await hover(1);
  ts2.frontDrive(0x4000); ts2.frontDrive(0, 40);
  for (let i = 0; i < 500 && !ts2.front.inLevel; i++) {
    if (ts2.cutsceneUp) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }));
    }
    await pause(100);
  }
  await wait(() => ts2.front.inLevel, 'level did not start');
  check(ts2.sound.ambience === null && active().length === 0, 'preview leaked into gameplay');
  ts2.tickGame({}, 10);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }));
  await pause(100);
  for (let i = 0; i < 3; i++) { ts2.pressMenu('down'); ts2.tickGame({}, 1); }
  ts2.pressMenu('select'); ts2.tickGame({}, 1);
  ts2.pressMenu('down'); ts2.tickGame({}, 1);
  ts2.pressMenu('select'); ts2.tickGame({}, 1);
  await wait(() => ts2.front.screen === 'summary', 'summary did not open');
  ts2.frontDrive(0, 650); ts2.frontDrive(0x4000); ts2.frontDrive(0, 130);
  await wait(() => ts2.front.screen === 'select', 'selector did not return after gameplay');
  await hover(2);
  console.log('SELECT AUDIO CANCEL / ENTER LEVEL / RETURN PASS');
  AudioBufferSourceNode.prototype.start = originalStart;
  AudioBufferSourceNode.prototype.stop = originalStop;
})();
