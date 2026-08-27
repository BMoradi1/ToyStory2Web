import { buildMeshData, parseAll } from './formats/all.ts';
import * as THREE from 'three';
import { buildLevelGeometry, parseDat } from './formats/dat.ts';
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
/** Textures from the currently selected scene. Characters borrow these. */
let sceneTextures = new Map<number, THREE.Texture>();

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
  viewer.setModel(mesh, sceneTextures);

  const pages = [...new Set(mesh.groups.map((g) => g.page))].filter((p) => p !== null);
  const missing = pages.filter((p) => !sceneTextures.has(p));
  infoEl.textContent =
    `${model.name}.all — ${file.groups.length} groups, ${mesh.triangleCount} triangles, ` +
    `page ${pages.join(',')}` +
    (missing.length ? ` (not in this scene — try another level)` : '');
}

/**
 * Decode a scene's textures into GPU textures, keyed by slot id.
 *
 * The slot id is what a face's texture page resolves to, and slots are sparse,
 * so a Map rather than an array.
 */
async function loadTextures(textures: NgnTexture[]): Promise<Map<number, THREE.Texture>> {
  const out = new Map<number, THREE.Texture>();
  await Promise.all(textures.map(async (t) => {
    if (t.slot === null) return;
    try {
      const bitmap = await createImageBitmap(new Blob([t.bmp.slice()], { type: 'image/bmp' }));

      // Punch out the colour key. These textures have no alpha channel; the
      // engine treats pure green as transparent, which is why untreated models
      // show green fringes around cut-out shapes like Bo Peep's crook.
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();

      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const px = image.data;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] === 0 && px[i + 1] === 255 && px[i + 2] === 0) px[i + 3] = 0;
      }
      ctx.putImageData(image, 0, 0);

      const texture = new THREE.CanvasTexture(canvas);
      // 256x256 art drawn for a 1999 console: keep it crisp.
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      // UVs index rows from the top, so no vertical flip — flipping floods
      // surfaces with the colour key instead of their real art.
      texture.flipY = false;
      texture.needsUpdate = true;
      out.set(t.slot, texture);
    } catch { /* a texture that won't decode simply goes untextured */ }
  }));
  return out;
}

async function showLevel(index: number): Promise<void> {
  const level = levels[index];
  if (!level) return;

  texturesEl.replaceChildren();
  infoEl.textContent = 'reading…';

  let textureCount = 0;
  let gpuTextures = new Map<number, THREE.Texture>();
  if (level.ngn) {
    const textures = parseNgn(await level.ngn.read());
    textureCount = textures.length;
    texturesEl.replaceChildren(...(await Promise.all(textures.map(drawTexture))));
    gpuTextures = await loadTextures(textures);
    sceneTextures = gpuTextures;
  }

  // World geometry lives in the .dat; the .ngn holds only textures, and
  // TERRAIN.ALL holds only collision. See docs/FORMATS.md.
  let summary = `${level.id} — ${textureCount} textures`;
  if (level.dat && viewer) {
    try {
      const parsed = parseDat(await level.dat.read());
      const geometry = buildLevelGeometry(parsed);
      viewer.setLevel(geometry, gpuTextures);
      const textured = geometry.groups.filter((g) => g.page !== null && gpuTextures.has(g.page));
      summary +=
        `, ${geometry.objectCount}/${parsed.objects.length} objects, ` +
        `${geometry.triangleCount} triangles, ` +
        `${textured.length}/${geometry.groups.length} groups textured, ` +
        `${parsed.markers.length} markers`;
    } catch (err) {
      summary += ` — geometry failed: ${(err as Error).message}`;
    }
  }
  infoEl.textContent = summary;
}

async function open(dir: GameDir): Promise<void> {
  const problem = validateGameDir(dir);
  if (problem) return setStatus(problem, true);

  levels = findLevels(dir);
  if (levels.length === 0) return setStatus('No levels found under data/.', true);

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
  if (buzz >= 0) modelEl.selectedIndex = buzz;
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
