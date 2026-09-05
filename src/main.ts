import { buildMeshData, parseAll, type AllFile } from './formats/all.ts';
import {
  DEFAULT_ANIMATION_FPS, buildPosedMeshData, parseAnm,
  type AnmFile, type Animation,
} from './formats/anm.ts';
import * as THREE from 'three';
import { WORLD_SCALE, buildLevelGeometry, parseDat, reachableZones, type DatLevel } from './formats/dat.ts';
import { decodeBmp, parseNgn, type NgnTexture } from './formats/ngn.ts';
import { assignZones, parseNgnScene } from './formats/ngnscene.ts';
import { buildCollisionWorld, groundBelow, parseCollision, type CollisionGroup, type CollisionWorld } from './formats/collision.ts';
import {
  findLevels, findModels, gameDirFromDrop, gameDirFromFileList, pickGameDir,
  supportsDirectoryPicker, validateGameDir, type GameDir,
} from './loader/gamedir.ts';
import { Viewer } from './render/viewer.ts';
import { InputSource } from './sim/input.ts';
import { GAME_UNITS_PER_LEVEL_UNIT } from './sim/player-constants.ts';
import {
  createPlayer, createRuntime, groundFromCollision, stepPlayer,
  type PlayerRuntime, type PlayerState,
} from './sim/player.ts';
import { toRadians, yawOf } from './sim/trig.ts';
import { createCamera, stepCamera, cameraTarget, type CameraState } from './sim/camera.ts';
import { SoundBank, PLAYER_EFFECTS } from './audio/sfx.ts';
import { createPickups, stepPickups, type PickupState } from './sim/pickups.ts';
import {
  createAnimation, stepAnimation, type AnimationPlayback,
} from './sim/player-animation.ts';

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
let currentCollisionWorld: CollisionWorld | null = null;
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
  currentCollisionWorld = null;
  currentTerrainFile = level.terrain;
  viewer?.setCollision(null);
  viewer?.setPlayer(null);

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
  sound = new SoundBank(dir);
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
    // scene state from outside the page. Harmless for users. `drive` pushes
    // synthetic input through the real controller so the play path can be
    // exercised headlessly, without a keyboard.
    (window as unknown as { ts2: object }).ts2 = {
      get viewer() { return viewer; },
      THREE,
      get player() { return player; },
      get anim() { return playerAnim; },
      get hasAnm() { return playerModel?.anm ? playerModel.anm.animations.length : null; },
      get sound() { return sound ? { enabled: sound.enabled, ready: sound.ready } : null; },
      get pickups() {
        return pickups ? { total: pickups.items.length, taken: pickups.taken } : null;
      },
      /** Put the player on the nearest uncollected pickup. For the harness. */
      goToPickup() {
        if (!player || !pickups) return null;
        let best = -1, bestD = Infinity;
        for (let i = 0; i < pickups.items.length; i++) {
          const it = pickups.items[i]!;
          if (it.collected) continue;
          const d = Math.hypot(it.x - player.x, it.z - player.z);
          if (d < bestD) { bestD = d; best = i; }
        }
        if (best < 0) return null;
        const it = pickups.items[best]!;
        player.x = it.x; player.z = it.z; player.y = it.y;
        return { index: best, wasAway: Math.round(bestD / 32) };
      },
      get modelInfo() {
        const e = models[modelEl.selectedIndex];
        return { index: modelEl.selectedIndex, name: e?.name, hasAnmFile: !!e?.anm,
                 total: models.length, withAnm: models.filter((m) => m.anm).length };
      },
      spawnPlayer,
      togglePlay,
      drive(held: Partial<import('./sim/player.ts').PlayerInput>, ticks = 1) {
        if (!player || !playerRuntime || !currentCollisionWorld || !viewer) return null;
        const ground = groundFromCollision(currentCollisionWorld);
        const full = {
          moveX: 0, moveY: 0, jump: false, spin: false, fire: false,
          cameraLeft: false, cameraRight: false, ...held,
        };
        for (let i = 0; i < ticks; i++) stepPlayer(player, full, playerRuntime, ground, 0);
        return { ...player };
      },
    };
  } catch (err) {
    return setStatus(`WebGL failed to start: ${(err as Error).message}`, true);
  }

  // Animation advances on the engine's fixed tick, then rebuilds the posed
  // mesh. The render loop is uncapped, game logic runs at the original ~59 FPS,
  // and animation plays at its own (unverified) 20 FPS.
  viewer.onTick = (dt) => {
    if (viewer?.playMode) playTick();
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

  // Buzz is the playable character, so default to him — and to the copy that
  // has animations, since more than one `chars` directory can hold a model of
  // the same name and only one of them is the full one.
  const isBuzz = (n: string) => n.toLowerCase() === 'buzz' || n.toLowerCase().endsWith('/buzz');
  const buzz = models.findIndex((m) => isBuzz(m.name) && m.anm !== null);
  const anyBuzz = models.findIndex((m) => isBuzz(m.name));
  if (buzz >= 0) modelEl.selectedIndex = buzz;
  else if (anyBuzz >= 0) modelEl.selectedIndex = anyBuzz;

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
/** Read and cache the scene's collision, or null if it has none. */
async function loadCollision(): Promise<CollisionGroup[] | null> {
  if (currentCollision) return currentCollision;
  if (!currentTerrainFile) return null;
  const parsed = parseCollision(parseAll(await currentTerrainFile.read()));
  currentCollision = parsed.groups;
  currentCollisionWorld = buildCollisionWorld(parsed.groups);
  return currentCollision;
}

/**
 * Choose a marker to spawn at: the one standing on the largest floor.
 *
 * Markers all sit over walkable floor, but most of them are on furniture. An
 * earlier version of this scored a ring around each marker, which cannot tell
 * a box top from a bedroom: it picked a surface with 274 cells of connected
 * floor when the room itself has 2,419, so Buzz spawned on a shelf and walked
 * off it within seconds. Flood-filling the floor he can actually reach — from
 * cell to cell, refusing steps taller than `STEP` — measures the thing that
 * matters instead.
 *
 * Still a stand-in, not the original's spawn, which lives in the level's own
 * code and is not decoded. Units are the file's own.
 */
const SPAWN_CELL = 200;
/**
 * Height change treated as walkable between neighbouring samples. Matches the
 * floor query's own tolerance: anything taller is a step the controller cannot
 * climb, so counting it as connected would flood across furniture and stairs
 * and overstate how much floor there really is.
 */
const SPAWN_STEP = 64;
/** Cap on the flood, so scoring every marker stays cheap. */
const SPAWN_CAP = 2500;

function walkableArea(world: CollisionWorld, x: number, y: number, z: number): number {
  const seen = new Set<string>();
  const stack: [number, number, number][] = [[x, z, y]];
  let count = 0;
  while (stack.length > 0 && count < SPAWN_CAP) {
    const [cx, cz, cy] = stack.pop()!;
    const key = `${Math.round(cx / SPAWN_CELL)},${Math.round(cz / SPAWN_CELL)}`;
    if (seen.has(key)) continue;
    const hit = groundBelow(world, cx, cy - SPAWN_STEP, cz, SPAWN_STEP * 2);
    if (!hit || Math.abs(hit.y - cy) > SPAWN_STEP) continue;
    seen.add(key);
    count++;
    stack.push([cx + SPAWN_CELL, cz, hit.y], [cx - SPAWN_CELL, cz, hit.y]);
    stack.push([cx, cz + SPAWN_CELL, hit.y], [cx, cz - SPAWN_CELL, hit.y]);
  }
  return count;
}

function pickSpawnMarker(
  markers: { position: { x: number; y: number; z: number } }[],
  world: CollisionWorld,
): { marker: { position: { x: number; y: number; z: number } }; ground: { y: number; normal: { x: number; y: number; z: number } }; area: number } | null {
  let best: { marker: { position: { x: number; y: number; z: number } }; ground: { y: number; normal: { x: number; y: number; z: number } }; area: number } | null = null;
  for (const marker of markers) {
    const ground = groundBelow(world, marker.position.x, marker.position.y, marker.position.z, 4096);
    if (!ground) continue;
    const area = walkableArea(world, marker.position.x, ground.y, marker.position.z);
    if (!best || area > best.area) best = { marker, ground, area };
  }
  return best;
}

/**
 * `p`: stand the selected character on the floor of the level.
 *
 * The spawn point is a pickup marker, because those are the one thing in the
 * file known to sit over walkable floor — every one of them does, in every
 * level checked. The real spawn is presumably in the level's own code, which
 * is not decoded, so this is a stand-in that is at least always somewhere a
 * player could be.
 */
async function spawnPlayer(): Promise<void> {
  if (!viewer || !currentLevel) return;
  const entry = models[modelEl.selectedIndex];
  if (!entry) { infoEl.textContent = 'no character selected'; return; }

  infoEl.textContent = 'placing character…';
  await loadCollision();
  if (!currentCollisionWorld) { infoEl.textContent = 'no collision for this scene'; return; }

  const chosen = pickSpawnMarker(currentLevel.level.markers, currentCollisionWorld);
  if (!chosen) { infoEl.textContent = 'no marker with floor under it'; return; }
  const { marker, ground, area } = chosen;

  const model = parseAll(await entry.file.read());
  const anm = entry.anm ? parseAnm(await entry.anm.read()) : null;
  playerModel = { model, anm };
  playerAnim = createAnimation();
  viewer.setPlayer(buildMeshData(model), sceneTextures);
  // The hull is in PlayStation axes: +Y down, 256 units to the world unit.
  viewer.setPlayerPosition(marker.position.x / WORLD_SCALE, -ground.y / WORLD_SCALE, -marker.position.z / WORLD_SCALE);

  // The sim runs 32x finer than the file, so scale on the way in. Standing on
  // the floor means y equal to the surface: the model's origin is at its feet.
  player = createPlayer(
    marker.position.x * GAME_UNITS_PER_LEVEL_UNIT,
    ground.y * GAME_UNITS_PER_LEVEL_UNIT,
    marker.position.z * GAME_UNITS_PER_LEVEL_UNIT,
    0,
  );
  playerRuntime = createRuntime();
  camera = createCamera(player);
  // One collectible per marker. See src/sim/pickups.ts for what a marker is.
  pickups = createPickups(currentLevel.level.markers);
  viewer.setPickups(pickups.items.map((i) => ({
    x: i.x * GAME_TO_RENDER, y: -i.y * GAME_TO_RENDER, z: -i.z * GAME_TO_RENDER,
  })));
  spawnPoint = { x: player.x, y: player.y, z: player.z };
  const slope = (Math.acos(Math.min(1, -ground.normal.y)) * 180) / Math.PI;
  infoEl.textContent =
    `${entry.name} standing on floor ${(ground.y / WORLD_SCALE).toFixed(2)} ` +
    `(${slope.toFixed(0)}\u00b0 slope), ${area} cells of floor to walk on. Enter to play.`;
}

/**
 * Play mode: the character controller driving Buzz around the level.
 *
 * The sim works in the original's units and axes — 32 per level unit, +Y down,
 * 12-bit yaw — and the renderer works in level units / 256 with Y up and Z
 * negated. All of that conversion happens here, in one place, so neither side
 * has to know about the other's conventions.
 */
const GAME_TO_RENDER = 1 / (GAME_UNITS_PER_LEVEL_UNIT * WORLD_SCALE);

let player: PlayerState | null = null;
let playerRuntime: PlayerRuntime | null = null;
/** The character's model and animations, kept so each tick can re-pose it. */
let playerModel: { model: AllFile; anm: AnmFile | null } | null = null;
let playerAnim: AnimationPlayback | null = null;
let camera: CameraState | null = null;
/** Effects, read from the install. Silent until play starts. */
let sound: SoundBank | null = null;
let pickups: PickupState | null = null;
let pickupSpin = 0;
const input = new InputSource();

/** `space` etc. must reach the game, not scroll the page, but only while playing. */
function setPlaying(on: boolean): void {
  if (!viewer) return;
  viewer.playMode = on;
  if (on) {
    input.attach();
    // Entering play is a key press, which is the gesture browsers want before
    // they will start an audio device.
    void sound?.start().then(() => sound?.preload(PLAYER_EFFECTS));
  } else {
    input.detach();
    sound?.stop();
  }
}

function playTick(): void {
  if (!viewer || !player || !playerRuntime || !currentCollisionWorld) return;

  if (player.fellOut) { void respawn(); return; }
  // The camera's bearing to the player, taken from the sim camera rather than
  // the rendered one, so the controls do not depend on how the view is drawn.
  const cameraYaw = camera ? yawOf(player.x - camera.x, player.z - camera.z) : 0;
  const held = input.read();
  stepPlayer(player, held, playerRuntime, groundFromCollision(currentCollisionWorld), cameraYaw);

  // Game space to renderer space. A game facing of (sin yaw, cos yaw) becomes
  // (sin yaw, -cos yaw) once Z is negated. Characters are authored facing +Z
  // and stay that way through buildMeshData's flip, checked by rendering the
  // unrotated model from +Z and seeing its front, so the rotation that lands
  // an unrotated +Z on the wanted direction is pi - yaw.
  viewer.setPlayerTransform(
    player.x * GAME_TO_RENDER,
    -player.y * GAME_TO_RENDER,
    -player.z * GAME_TO_RENDER,
    Math.PI - toRadians(player.yaw),
  );
  if (camera) {
    stepCamera(camera, player, currentCollisionWorld, held);
    const look = cameraTarget(player);
    viewer.placeCamera(
      camera.x * GAME_TO_RENDER, -camera.y * GAME_TO_RENDER, -camera.z * GAME_TO_RENDER,
      look.x * GAME_TO_RENDER, -look.y * GAME_TO_RENDER, -look.z * GAME_TO_RENDER,
    );
  }
  for (const effect of player.sounds) sound?.play(effect);

  if (pickups) {
    const taken = stepPickups(pickups, player);
    // PICKUP1 is the engine's own name for a collect; which of PICKUP1 and
    // PICKUP5 belongs to which collectible is in the sound EVENT table, which
    // is not ported (docs/PLAYER.md).
    if (taken.length > 0) sound?.play('PICKUP1');
    pickupSpin = (pickupSpin + 0.06) % (Math.PI * 2);
    const gone = new Set<number>();
    for (let i = 0; i < pickups.items.length; i++) if (pickups.items[i]!.collected) gone.add(i);
    viewer.updatePickups(gone, pickupSpin);
    if (taken.length > 0) {
      infoEl.textContent = `${pickups.taken}/${pickups.items.length} collected`;
    }
  }
  poseAnimation(Math.hypot(held.moveX, held.moveY) > 0);
}

/**
 * Re-pose the character for this tick.
 *
 * The state machine hands back two animation slots and a frame. Both slots are
 * passed to the poser because Buzz's animations are layered — a state pairs a
 * legs set with an upper-body set, and a bone missing from the first is taken
 * from the second. Posing rebuilds the mesh, which is 927 vertices, so it is
 * cheap enough to do every tick.
 */
function poseAnimation(hasInput: boolean): void {
  if (!viewer || !player || !playerAnim || !playerModel?.anm) return;
  const speed = Math.hypot(player.vx, player.vz);
  const { slotA, slotB, frame } = stepAnimation(playerAnim, player, hasInput, speed);

  const anm = playerModel.anm;
  const primary = anm.animations[slotA];
  if (!primary) return;
  const secondary = slotB === slotA ? null : anm.animations[slotB];
  viewer.setPlayerPose(
    buildPosedMeshData(
      playerModel.model, anm, primary, frame % Math.max(1, primary.frameCount),
      secondary ? { animation: secondary, frame: frame % Math.max(1, secondary.frameCount) } : null,
    ),
    sceneTextures,
  );
}

/**
 * Put the player back after falling out of the level.
 *
 * The original respawns at the last place you stood safely, not at the level's
 * spawn, so a fall costs you the ledge rather than all your progress. The
 * controller records that position every tick; this only has to read it.
 */
let spawnPoint: { x: number; y: number; z: number } | null = null;
async function respawn(): Promise<void> {
  if (!player) return;
  const safe = { x: player.safeX, y: player.safeY, z: player.safeZ, yaw: player.safeYaw };
  const back = spawnPoint && !Number.isFinite(safe.x) ? spawnPoint : safe;
  Object.assign(player, createPlayer(back.x, back.y, back.z, safe.yaw));
  playerRuntime = createRuntime();
  infoEl.textContent = 'fell out of the level — put back where you last stood';
}

/** `space`: start or stop playing, spawning the character if it isn't there. */
async function togglePlay(): Promise<void> {
  if (!viewer) return;
  if (viewer.playMode) {
    setPlaying(false);
    infoEl.textContent = 'play stopped';
    return;
  }
  if (!player) {
    await spawnPlayer();
    if (!player) return;
  }
  setPlaying(true);
  infoEl.textContent =
    'playing — WASD or stick to move, space to jump, J spin, K fire, M mutes';
}

/** `k`: show or hide the collision hull, reading TERRAIN.ALL the first time. */
async function toggleCollision(): Promise<void> {
  if (!viewer) return;
  if (viewer.collisionShown) { infoEl.textContent = viewer.setCollision(null); return; }
  infoEl.textContent = 'reading collision…';
  try {
    if (!(await loadCollision())) { infoEl.textContent = 'no collision file for this scene'; return; }
  } catch (err) {
    infoEl.textContent = `collision failed: ${(err as Error).message}`;
    return;
  }
  infoEl.textContent = viewer.setCollision(currentCollision);
}

// `0`-`9` show one zone as the engine would from inside it: the zone itself,
// zone 0, and whatever its portals lead to. `a` goes back to the whole level.
window.addEventListener('keydown', (ev) => {
  if (!viewer) return;
  // Enter toggles play; while playing, the movement keys belong to the game
  // and the inspection shortcuts would collide with them.
  if (ev.key === 'Enter') { void togglePlay(); return; }
  if (ev.key === 'm' && sound) {
    sound.volume = sound.volume > 0 ? 0 : 0.6;
    infoEl.textContent = sound.volume > 0 ? 'sound on' : 'sound muted';
    return;
  }
  if (viewer.playMode) return;
  if (ev.key === 'c') infoEl.textContent = `culling: ${viewer.cycleSide()}`;
  if (ev.key === 'g') infoEl.textContent = `draw groups: ${viewer.toggleSingleMaterial()}`;
  if (ev.key === 's') infoEl.textContent = viewer.describeScene();
  if (ev.key === 'a') infoEl.textContent = viewer.setVisibleZones(null);
  if (ev.key === 'k') void toggleCollision();
  if (ev.key === 'p') void spawnPlayer();
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
