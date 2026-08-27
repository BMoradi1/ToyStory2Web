import { buildMeshData, parseAll } from './formats/all.ts';
import { parseNgn, type NgnTexture } from './formats/ngn.ts';
import {
  findLevels, findModels, gameDirFromDrop, pickGameDir, supportsDirectoryPicker,
  validateGameDir, type GameDir,
} from './loader/gamedir.ts';
import { Viewer } from './render/viewer.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const dropEl = $<HTMLDivElement>('drop');
const appEl = $<HTMLDivElement>('app');
const statusEl = $<HTMLParagraphElement>('status');
const levelEl = $<HTMLSelectElement>('level');
const modelEl = $<HTMLSelectElement>('model');
const infoEl = $<HTMLSpanElement>('info');
const texturesEl = $<HTMLDivElement>('textures');

let viewer: Viewer | null = null;
let levels: ReturnType<typeof findLevels> = [];
let models: ReturnType<typeof findModels> = [];

function setStatus(msg: string, isError = false): void {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', isError);
}

/**
 * Browsers decode BMP natively, which is the whole payoff of pconv having
 * converted the PSX textures during the PC port — no CLUT handling needed here.
 */
async function drawTexture(tex: NgnTexture): Promise<HTMLElement> {
  const figure = document.createElement('figure');
  const canvas = document.createElement('canvas');
  canvas.width = tex.width;
  canvas.height = tex.height;

  const caption = document.createElement('figcaption');
  caption.textContent = `${tex.tag} ${tex.width}×${tex.height}`;
  figure.append(canvas, caption);

  try {
    // Copy into a fresh buffer: `bmp` is a view onto the whole container, and
    // Blob would otherwise be handed the entire multi-megabyte file.
    const blob = new Blob([tex.bmp.slice()], { type: 'image/bmp' });
    const bitmap = await createImageBitmap(blob);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    bitmap.close();
  } catch {
    caption.textContent = `${tex.tag} (decode failed)`;
  }
  return figure;
}

async function showModel(index: number): Promise<void> {
  const model = models[index];
  if (!model || !viewer) return;

  const file = parseAll(await model.file.read());
  const mesh = buildMeshData(file);
  viewer.setModel(mesh);

  const groups = file.groups.length;
  infoEl.textContent = `${model.name}.all — ${groups} groups, ${mesh.triangleCount} triangles`;
}

async function showLevel(index: number): Promise<void> {
  const level = levels[index];
  if (!level) return;

  texturesEl.replaceChildren();
  infoEl.textContent = 'reading…';

  const textures = parseNgn(await level.ngn.read());
  const figures = await Promise.all(textures.map(drawTexture));
  texturesEl.replaceChildren(...figures);

  const slots = textures.map((t) => t.slot).filter((s): s is number => s !== null);
  infoEl.textContent =
    `${level.ngn.name} — ${textures.length} textures` +
    (slots.length ? ` (slots ${Math.min(...slots)}–${Math.max(...slots)}, sparse)` : '');
}

async function open(dir: GameDir): Promise<void> {
  const problem = validateGameDir(dir);
  if (problem) return setStatus(problem, true);

  levels = findLevels(dir);
  if (levels.length === 0) return setStatus('No level .ngn files found under data/.', true);

  levelEl.replaceChildren(
    ...levels.map(({ id }, i) => new Option(id, String(i))),
  );
  levelEl.onchange = () => void showLevel(levelEl.selectedIndex);

  models = findModels(dir);
  modelEl.replaceChildren(...models.map(({ name }, i) => new Option(name, String(i))));
  modelEl.onchange = () => void showModel(modelEl.selectedIndex);

  dropEl.hidden = true;
  appEl.hidden = false;

  viewer ??= new Viewer($<HTMLCanvasElement>('view'));
  viewer.start();

  await showLevel(0);

  const buzz = models.findIndex((m) => m.name.toLowerCase() === 'buzz');
  if (models.length > 0) {
    const start = buzz >= 0 ? buzz : 0;
    modelEl.selectedIndex = start;
    await showModel(start);
  }
}

$<HTMLButtonElement>('pick').onclick = async () => {
  if (!supportsDirectoryPicker()) {
    return setStatus('This browser has no folder picker — drag the folder in instead.', true);
  }
  try {
    setStatus('Reading folder…');
    const dir = await pickGameDir();
    if (dir) await open(dir);
  } catch (err) {
    // An AbortError just means the user closed the picker.
    if ((err as DOMException)?.name !== 'AbortError') {
      setStatus(`Could not read that folder: ${(err as Error).message}`, true);
    } else {
      setStatus('');
    }
  }
};

dropEl.addEventListener('dragover', (ev) => {
  ev.preventDefault();
  dropEl.classList.add('over');
});
dropEl.addEventListener('dragleave', () => dropEl.classList.remove('over'));
dropEl.addEventListener('drop', async (ev) => {
  ev.preventDefault();
  dropEl.classList.remove('over');
  try {
    setStatus('Reading folder…');
    await open(await gameDirFromDrop(ev));
  } catch (err) {
    setStatus(`Could not read that folder: ${(err as Error).message}`, true);
  }
});
