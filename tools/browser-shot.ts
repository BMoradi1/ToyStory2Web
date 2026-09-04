/**
 * Screenshot the real viewer, headlessly.
 *
 * The offline rasteriser in render-level.ts is an oracle for the geometry the
 * browser is handed, but it cannot see what the browser then does with it —
 * texture upload, alpha test, mipmaps, depth precision, draw-group order. When
 * the two disagree, the fault is in that gap, and this tool is how it gets
 * looked at without a person clicking through the folder picker each time.
 *
 * Drives Chromium over the DevTools protocol on a pipe (no WebSocket client
 * needed), feeds the install directory to the page's own directory input, and
 * waits for the status line to report ready. The game directory is only ever
 * read by the browser, exactly as when a user picks it by hand.
 *
 *   npx tsx tools/browser-shot.ts "Toy Story 2" out.png [--level N] [--eval "js"]
 *
 * `--eval` runs after the level is up, with `ts2.viewer` in scope, so a camera
 * can be placed to reproduce a particular screenshot. Needs `npm run dev` on
 * port 5173 (or BASE_URL).
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const positional = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] ?? '').startsWith('--'));
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const [root, outPath = 'browser.png'] = positional;
if (!root) {
  console.error('usage: npx tsx tools/browser-shot.ts <game dir> <out.png> [--level N] [--eval js]');
  process.exit(1);
}
const gameDir = resolve(root);
const levelIndex = Number(flag('--level') ?? 0);
const evalJs = flag('--eval');
const baseUrl = process.env.BASE_URL ?? 'http://localhost:5173/';
const browser = process.env.CHROMIUM ?? 'chromium';

const chrome = spawn(browser, [
  '--headless=new', '--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  '--window-size=1200,900', '--hide-scrollbars', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
chrome.stderr!.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(d); });

const toChrome = chrome.stdio[3] as NodeJS.WritableStream;
const fromChrome = chrome.stdio[4] as NodeJS.ReadableStream;

let nextId = 1;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
const listeners: ((msg: any) => void)[] = [];
let buffer = '';
fromChrome.on('data', (chunk) => {
  buffer += chunk.toString();
  let nul: number;
  while ((nul = buffer.indexOf('\0')) >= 0) {
    const msg = JSON.parse(buffer.slice(0, nul));
    buffer = buffer.slice(nul + 1);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id)!; pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    } else for (const l of listeners) l(msg);
  }
});

function send(method: string, params: object = {}, sessionId?: string): Promise<any> {
  const id = nextId++;
  toChrome.write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method: string, params: object = {}) => send(method, params, sessionId);
  const evaluate = async (expression: string) => {
    const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'evaluate failed');
    return r.result.value;
  };

  await call('Page.enable');
  await call('Runtime.enable');
  listeners.push((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map((a: any) => a.value ?? a.description ?? '').join(' ');
      console.log(`[console.${msg.params.type}] ${text}`);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.log(`[exception] ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
    }
  });

  // Count WebGL contexts and renderers created on the view canvas, so a
  // second Viewer on the same canvas is visible from outside the page.
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__ts2diag = { contexts: 0, loads: (window.__ts2loads ?? 0) };
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...a) {
      if (this.id === 'view' && /webgl/.test(String(a[0]))) window.__ts2diag.contexts++;
      return orig.apply(this, a);
    };` });
  let loads = 0;
  listeners.push((m) => { if (m.method === 'Page.loadEventFired' && m.sessionId === sessionId) loads++; });
  const loaded = new Promise<void>((r) => listeners.push((m) => { if (m.method === 'Page.loadEventFired' && m.sessionId === sessionId) r(); }));
  await call('Page.navigate', { url: baseUrl });
  await loaded;

  const { root: doc } = await call('DOM.getDocument');
  const { nodeId } = await call('DOM.querySelector', { nodeId: doc.nodeId, selector: '#pickfile' });
  if (!nodeId) throw new Error('#pickfile not found — is the dev server serving the viewer?');
  // A directory path on a `webkitdirectory` input makes Chromium enumerate it,
  // exactly as the picker would.
  await call('DOM.setFileInputFiles', { nodeId, files: [gameDir] });

  const started = Date.now();
  let status = '';
  for (;;) {
    status = await evaluate(`document.getElementById('status').textContent`);
    if (/ready$/.test(status) || /failed|Error/.test(status)) break;
    if (Date.now() - started > 180_000) throw new Error(`timed out; last status: ${status}`);
    await sleep(500);
  }
  console.log(`status: ${status}`);
  if (levelIndex > 0) {
    await evaluate(`(() => { const s = document.getElementById('level'); s.selectedIndex = ${levelIndex}; s.dispatchEvent(new Event('change')); })()`);
    for (;;) {
      status = await evaluate(`document.getElementById('status').textContent`);
      if (/ready$/.test(status) || /failed|Error/.test(status)) break;
      await sleep(500);
    }
    console.log(`status: ${status}`);
  }
  console.log(`info: ${await evaluate(`document.getElementById('info').textContent`)}`);

  // `--touch file` rewrites a source file after the level is up, to see what
  // Vite's hot reload does to a live viewer: full page reload, or a second
  // module instance stacking a second renderer on the canvas.
  const touch = flag('--touch');
  if (touch) {
    const { readFileSync, writeFileSync: write } = await import('node:fs');
    const original = readFileSync(touch, 'utf8');
    write(touch, original + '\n');
    await sleep(4000);
    write(touch, original);
    await sleep(4000);
    console.log(`after touching ${touch}: page loads=${loads}, ` +
      `diag=${JSON.stringify(await evaluate('window.__ts2diag'))}, ` +
      `status="${await evaluate(`document.getElementById('status').textContent`)}"`);
  }
  if (evalJs) console.log(`eval: ${JSON.stringify(await evaluate(evalJs))}`);
  // Let a couple of frames render with the final camera.
  await sleep(700);
  const { data } = await call('Page.captureScreenshot', { format: 'png' });
  writeFileSync(outPath, Buffer.from(data, 'base64'));
  console.log(`wrote ${outPath}`);
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; }).finally(() => chrome.kill());
