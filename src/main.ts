import { buildMeshData, parseAll, type AllFile } from './formats/all.ts';
import {
  DEFAULT_ANIMATION_FPS, buildPosedMeshData, parseAnm,
  type AnmFile, type Animation,
} from './formats/anm.ts';
import * as THREE from 'three';
import { buildLevelGeometry, parseDat, reachableZones, type DatLevel } from './formats/dat.ts';
import { decodeBmp, parseNgn, type NgnTexture } from './formats/ngn.ts';
import { assignZones, parseNgnScene } from './formats/ngnscene.ts';
import { parseCollision, type CollisionGroup } from './formats/collision.ts';
import {
  findLevels, findModels, gameDirFromDrop, gameDirFromFileList, pickGameDir,
  supportsDirectoryPicker, validateGameDir, type GameDir,
} from './loader/gamedir.ts';
import { Viewer } from './render/viewer.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const dropEl = $<HTMLDivElement>('drop');
const appEl = $<HTMLDivElement>('app');
const statusEl = $<HTMLParagraphElement>('status');
const levelEl = $<HTMLSelectElement>('level');
const modelEl = $<HTMLSelectElement>('model');
const animEl = $<HTMLSelectElement>('anim');
const infoEl = $<HTMLSpanElement>('info');
const texturesEl = $<HTMLDivElement>('textures');

let viewer: Viewer | null = null;
let levels: ReturnType<typeof findLevels> = [];
let models: ReturnType<typeof findModels> = [];
/** Textures from the currently selected scene. Characters borrow these. */
let sceneTextures = new Map<number, THREE.Texture>();

/** The loaded scene, kept so the zone picker can recompute what to show. */
let currentLevel: { level: DatLevel; zones: (number | null)[] } | null = null;
/** The scene's collision hull, loaded lazily the first time it is shown. */
let currentCollision: CollisionGroup[] | null = null;
let currentTerrainFile: { read(): Promise<Uint8Array> } | null = null;

/** Currently displayed character, if any, and its animation playback state. */
let current: { model: AllFile; anm: AnmFile | null } | null = null;
let playing: Animation | null = null;
let frameTime = 0;
let frame = 0;

function setStatus(msg: string, isError = false): void {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', isError);
  if (isError) console.error(msg); else console.log('[ts2]', msg);
}

/**
 * Hand control back to the browser so a status update is actually painted.
 * Without this every message is invisible: the main thread runs straight
 * through and only the final state is ever drawn, which makes a slow stage
 * indistinguishable from a hung one.
 */
const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));

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

/**
 * Decode a scene's textures into GPU textures, keyed by slot id.
 *
 * The slot id is what a face's texture page resolves to, and slots are sparse,
 * so a Map rather than an array. Characters borrow these too — their art lives
 * in the level files at slots 16-24, not in `chars*`.
 */
async function loadTextures(textures: NgnTexture[]): Promise<Map<number, THREE.Texture>> {
  const out = new Map<number, THREE.Texture>();
  for (const t of textures) {
    if (t.slot === null) continue;
    const image = decodeBmp(t.bmp);
    if (!image) continue;

    const texture = new THREE.DataTexture(image.rgba, image.width, image.height, THREE.RGBAFormat);
    // Point sampling both ways, and no mip chain. These are 256x256 images
    // drawn for a 1999 console whose hardware had no filtering at all, so
    // smoothing them is not a better picture of the same thing — it is a
    // different one. It also removes the whole class of bug where a filtered
    // or minified texel mixes the transparency key into the art.
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    // Rows come back top-down and UVs index from the top, so no flip.
    texture.flipY = false;
    texture.needsUpdate = true;
    out.set(t.slot, texture);
  }
  return out;
}

async function showModel(index: number): Promise<void> {
  const entry = models[index];
  if (!entry || !viewer) return;

  playing = null;
  const model = parseAll(await entry.file.read());
  const anm = entry.anm ? parseAnm(await entry.anm.read()) : null;
  current = { model, anm };

  const available = anm
    ? anm.animations
        .map((a, i) => (a ? { a, i } : null))
        .filter((x): x is { a: Animation; i: number } => x !== null)
    : [];

  animEl.replaceChildren(
    new Option('rest pose', '-1'),
    ...available.map(({ a, i }) => new Option(`anim ${i} (${a.frameCount}f)`, String(i))),
  );
  animEl.onchange = () => {
    const slot = Number(animEl.value);
    playing = slot < 0 ? null : (anm?.animations[slot] ?? null);
    frame = 0;
    frameTime = 0;
    if (!playing) viewer!.setModel(buildMeshData(model), sceneTextures);
  };

  viewer.setModel(buildMeshData(model), sceneTextures);

  const pages = [...new Set(buildMeshData(model).groups.map((g) => g.page))].filter((p) => p !== null);
  const missing = pages.filter((p) => !sceneTextures.has(p));
  infoEl.textContent =
    `${entry.name}.all — ${model.groups.length} groups, page ${pages.join(',')}` +
    (available.length ? `, ${available.length} animations` : ', no animations') +
    (missing.length ? ' (texture not in this scene — try another level)' : '');
}

async function showLevel(index: number): Promise<void> {
  const level = levels[index];
  if (!level) return;

  texturesEl.replaceChildren();
  infoEl.textContent = 'reading…';
  // Collision is a separate file and only wanted on demand, so keep the handle
  // and drop whatever the previous scene had.
  currentCollision = null;
  currentTerrainFile = level.terrain;
  viewer?.setCollision(null);

  let textureCount = 0;
  let gpuTextures = new Map<number, THREE.Texture>();
  // The .ngn holds the textures and, after them, pconv's converted copy of the
  // scene. The scene is the only place object zones are recorded, so it is
  // read here too rather than only for the art.
  let sceneBytes: Uint8Array | null = null;
  if (level.ngn) {
    sceneBytes = await level.ngn.read();
    const textures = parseNgn(sceneBytes);
    textureCount = textures.length;
    texturesEl.replaceChildren(...(await Promise.all(textures.map(drawTexture))));
    setStatus(`${level.id}: decoding ${textures.length} textures\u2026`);
    await yieldToBrowser();
    gpuTextures = await loadTextures(textures);
    sceneTextures = gpuTextures;
    setStatus(`${level.id}: building geometry\u2026`);
    await yieldToBrowser();
  }

  // World geometry lives in the .dat; the .ngn holds only textures, and
  // TERRAIN.ALL holds only collision. See docs/FORMATS.md.
  let summary = `${level.id} — ${textureCount} textures`;
  if (level.dat && viewer) {
    try {
      // Reported stage by stage: node runs this whole path in ~135ms, so if
      // the browser stalls, knowing which call it stalls in is the difference
      // between a fix and a guess.
      setStatus(`${level.id}: reading scene file\u2026`);
      await yieldToBrowser();
      const bytes = await level.dat.read();

      setStatus(`${level.id}: parsing scene (${(bytes.length / 1024) | 0} KB)\u2026`);
      await yieldToBrowser();
      const parsed = parseDat(bytes);

      setStatus(`${level.id}: building ${parsed.objects.length} objects\u2026`);
      await yieldToBrowser();
      let zones: (number | null)[] = parsed.objects.map(() => null);
      if (sceneBytes) {
        try {
          zones = assignZones(
            parsed.objects.map((o) => ({ ...o, faceCount: parsed.meshes.get(o.meshOffset)?.faces.length ?? -1 })),
            parseNgnScene(sceneBytes),
          );
        } catch { /* no zones: the level still draws, just all at once */ }
      }
      currentLevel = { level: parsed, zones };
      const geometry = buildLevelGeometry(parsed, { zones });

      setStatus(`${level.id}: uploading ${geometry.triangleCount} triangles\u2026`);
      await yieldToBrowser();
      viewer.setLevel(geometry, gpuTextures);

      setStatus(`${level.id}: ready`);
      await yieldToBrowser();

      const textured = geometry.groups.filter((g) => g.page !== null && gpuTextures.has(g.page));
      const zoneCount = new Set(zones.filter((z) => z !== null)).size;
      summary +=
        `, ${geometry.objectCount}/${parsed.objects.length} objects, ` +
        `${geometry.triangleCount} triangles, ` +
        `${textured.length}/${geometry.groups.length} groups textured, ` +
        `${parsed.markers.length} markers, ` +
        `${zoneCount} zones / ${parsed.zones.length} portals`;
    } catch (err) {
      summary += ` — geometry failed: ${(err as Error).message}`;
      setStatus(`${level.id}: geometry failed — ${(err as Error).message}`, true);
    }
  }
  infoEl.textContent = summary;
}

async function open(dir: GameDir): Promise<void> {
  const problem = validateGameDir(dir);
  if (problem) return setStatus(problem, true);

  // Each stage announces itself and yields, so if one hangs the last message
  // on screen names it. The drop panel deliberately stays up until the first
  // level has rendered, so these remain visible throughout.
  setStatus(`Loaded ${dir.size} files. Finding levels\u2026`);
  await yieldToBrowser();

  levels = findLevels(dir);
  models = findModels(dir);
  if (levels.length === 0) return setStatus('No levels found under data/.', true);

  setStatus(`${levels.length} scenes, ${models.length} models. Building UI\u2026`);
  await yieldToBrowser();

  levelEl.replaceChildren(...levels.map(({ id }, i) => new Option(id, String(i))));
  levelEl.onchange = () => void showLevel(levelEl.selectedIndex);
  modelEl.replaceChildren(...models.map(({ name }, i) => new Option(name, String(i))));
  modelEl.onchange = () => void showModel(modelEl.selectedIndex);

  setStatus('Starting renderer\u2026');
  await yieldToBrowser();

  // The canvas must be laid out before WebGL sizes itself to it.
  appEl.hidden = false;
  await yieldToBrowser();

  try {
    viewer ??= new Viewer($<HTMLCanvasElement>('view'));
    // Exposed for tools/browser-shot.ts, which places the camera and reads
    // scene state from outside the page. Harmless for users.
    (window as unknown as { ts2: object }).ts2 = { get viewer() { return viewer; }, THREE };
  } catch (err) {
    return setStatus(`WebGL failed to start: ${(err as Error).message}`, true);
  }

  // Animation advances on the engine's fixed tick, then rebuilds the posed
  // mesh. The render loop is uncapped, game logic runs at the original ~59 FPS,
  // and animation plays at its own (unverified) 20 FPS.
  viewer.onTick = (dt) => {
    if (!playing || !current || !viewer) return;
    frameTime += dt;
    const step = 1 / DEFAULT_ANIMATION_FPS;
    if (frameTime < step) return;
    while (frameTime >= step) frameTime -= step;
    frame = (frame + 1) % Math.max(1, playing.frameCount);
    if (current.anm) {
      viewer.setModel(buildPosedMeshData(current.model, current.anm, playing, frame), sceneTextures);
    }
  };
  viewer.start();

  setStatus(`Loading ${levels[0]!.id}\u2026`);
  await yieldToBrowser();

  try {
    await showLevel(0);
  } catch (err) {
    // Don't strand the user on the loading panel — the UI is usable and they
    // can pick a different scene from the dropdown.
    setStatus(`${levels[0]!.id} failed: ${(err as Error).message}. Pick another scene.`, true);
    infoEl.textContent = `${levels[0]!.id} failed to load`;
  }

  const buzz = models.findIndex((m) => m.name.toLowerCase() === 'buzz');
  if (buzz >= 0) modelEl.selectedIndex = buzz;

  // Everything worked — only now take the panel down.
  dropEl.hidden = true;
}

// Surface failures instead of leaving the page looking inert. A silent
// exception is indistinguishable from "nothing happened".
window.addEventListener('error', (ev) => setStatus(`Error: ${ev.message}`, true));
window.addEventListener('unhandledrejection', (ev) =>
  setStatus(`Error: ${(ev.reason as Error)?.message ?? ev.reason}`, true));

// A `webkitdirectory` input is the most reliable way in: it works in every
// current browser and needs none of the FileSystemEntry tree walking that
// drag-and-drop requires.
// Vite replaces this module on every edit, but the previously created Viewer
// keeps its animation loop running against the same canvas. That stacks
// renderers, and each one draws the scene again — the level appears two or
// three times over. Dispose the old one when the module is replaced.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    viewer?.stop();
    viewer = null;
  });
}

// `c` cycles face culling. Which winding three.js considers front-facing
// can't be determined offline, so make it one keystroke to find out.
/** `k`: show or hide the collision hull, reading TERRAIN.ALL the first time. */
async function toggleCollision(): Promise<void> {
  if (!viewer) return;
  if (viewer.collisionShown) { infoEl.textContent = viewer.setCollision(null); return; }
  if (!currentCollision) {
    if (!currentTerrainFile) { infoEl.textContent = 'no collision file for this scene'; return; }
    infoEl.textContent = 'reading collision…';
    try {
      const parsed = parseCollision(parseAll(await currentTerrainFile.read()));
      currentCollision = parsed.groups;
    } catch (err) {
      infoEl.textContent = `collision failed: ${(err as Error).message}`;
      return;
    }
  }
  infoEl.textContent = viewer.setCollision(currentCollision);
}

// `0`-`9` show one zone as the engine would from inside it: the zone itself,
// zone 0, and whatever its portals lead to. `a` goes back to the whole level.
window.addEventListener('keydown', (ev) => {
  if (!viewer) return;
  if (ev.key === 'c') infoEl.textContent = `culling: ${viewer.cycleSide()}`;
  if (ev.key === 'g') infoEl.textContent = `draw groups: ${viewer.toggleSingleMaterial()}`;
  if (ev.key === 's') infoEl.textContent = viewer.describeScene();
  if (ev.key === 'a') infoEl.textContent = viewer.setVisibleZones(null);
  if (ev.key === 'k') void toggleCollision();
  if (/^[0-9]$/.test(ev.key) && currentLevel) {
    const zone = Number(ev.key);
    infoEl.textContent = viewer.setVisibleZones(reachableZones(currentLevel.level.zones, zone));
  }
});

const fileInput = $<HTMLInputElement>('pickfile');
fileInput.onchange = async () => {
  const files = fileInput.files;
  if (!files || files.length === 0) return setStatus('No files selected.', true);
  setStatus(`Reading ${files.length} files\u2026`);
  await yieldToBrowser();
  await open(gameDirFromFileList(files));
};

$<HTMLButtonElement>('pick').onclick = async () => {
  // The file input works everywhere, so fall back to it rather than
  // dead-ending whenever the fancier picker is missing or refuses.
  if (!supportsDirectoryPicker()) return fileInput.click();
  try {
    setStatus('Reading folder\u2026');
    const dir = await pickGameDir();
    if (dir) await open(dir);
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return setStatus('');
    setStatus(`Picker failed (${(err as Error).message}) — opening file chooser\u2026`);
    fileInput.click();
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
    setStatus('Reading folder\u2026');
    const dir = await gameDirFromDrop(ev);
    setStatus(`Read ${dir.size} files, opening\u2026`);
    await open(dir);
  } catch (err) {
    setStatus(`Drag-and-drop failed: ${(err as Error).message}. Use the button instead.`, true);
  }
});
