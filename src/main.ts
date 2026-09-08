import { GroupType, buildMeshData, parseAll, readHitShapes, type AllFile } from './formats/all.ts';
import {
  DEFAULT_ANIMATION_FPS, buildPosedMeshData, parseAnm,
  type AnmFile, type Animation,
} from './formats/anm.ts';
import * as THREE from 'three';
import {
  OBJECT_ANGLE_UNITS, WORLD_SCALE, buildLevelGeometry, objectFaceCount, parseDat,
  reachableZones, type DatLevel,
} from './formats/dat.ts';
import { decodeBmp, parseNgn, type NgnTexture } from './formats/ngn.ts';
import { assignZones, parseNgnScene } from './formats/ngnscene.ts';
import {
  buildCollisionWorld, collisionGroupByObject, groundBelow, moveCollisionGroup, parseCollision,
  type CollisionGroup, type CollisionWorld,
} from './formats/collision.ts';
import {
  findLevels, findModels, gameDirFromDrop, gameDirFromFileList, pickGameDir,
  supportsDirectoryPicker, validateGameDir, type GameDir, type GameFile,
} from './loader/gamedir.ts';
import { Viewer } from './render/viewer.ts';
import { InputSource } from './sim/input.ts';
import { GAME_UNITS_PER_LEVEL_UNIT } from './sim/player-constants.ts';
import {
  createPlayer, createRuntime, groundFromCollision, stepPlayer,
  type PlayerInput, type PlayerRuntime, type PlayerState,
} from './sim/player.ts';
import { cos as cosOf, sin as sinOf, toRadians, yawOf } from './sim/trig.ts';
import { createCamera, stepCamera, cameraTarget, type CameraState } from './sim/camera.ts';
import { createZones, resetZones, stepZones, type ZoneState, detailRowFor } from './sim/zones.ts';
import { basisFromCamera, walkPortals, type Rect } from './sim/portal-walk.ts';
import { createCut, releaseToFollow, startCut, stepCutCamera, stepCutClock, type CutState } from './sim/camera-cut.ts';
import {
  MENU, MENU_TEXT, MenuPage, createMenu, highlight, menuRows, openMenu, openTokenScreen, stepMenu,
  type MenuInput, type MenuState,
} from './sim/menu.ts';
import {
  createEffects, liveEffects, spawnChild, spawnEffect, stepEffects, touchPlayer,
  type EffectSim, type EffectWorld,
} from './sim/effects.ts';
import { EFFECT_FLAGS, EFFECT_KIND, readEffectTable } from './formats/effect-table.ts';
import { SoundBank, PLAYER_EFFECTS } from './audio/sfx.ts';
import { commitProgress, exportProgress, forgetProgress, loadProgress, type Progress } from './loader/save.ts';
import { BOOT_MOVIES, MOVIES, MOVIE_FLAG, playCutscene } from './video/cutscene.ts';
import { selectIndexOf, tokenCount } from './formats/save-file.ts';
import { MUSIC, MUSIC_SLIDER_MAX, MUSIC_TRACKS, MUSIC_VOLUME_CURVE, MusicPlayer, trackForLevel } from './audio/music.ts';
import {
  PICKUP, createPickups, pickupObjects, PickupKind, revealToken, stepPickups, type PickupState,
} from './sim/pickups.ts';
import {
  COIN_DRAW, SPRITE, SPRITE_SHEET, readSpriteTable, type SpriteHeader,
} from './formats/sprite-table.ts';
import { HudPainter, type HudReadout, type MenuDraw, type Sheet, type TalkDraw } from './render/hud-draw.ts';
import { readSoundTable, type SoundTable } from './audio/events.ts';
import {
  HUD, HudElement, createHud, offsetOf, showHud, startHud, stepCoinSpin, stepHud,
  type HudState,
} from './sim/hud.ts';
import type { WorldSprite } from './render/world-sprites.ts';
import {
  exeString, HINT_SIGNS, levelNumber, PUSH_BLOCKS, SPAWN_TABLE, TALK_SCRIPTS, tokenSlotsAtStart,
} from './sim/level-data.ts';
import { createPushBlocks, stepPushBlocks, type PushState } from './sim/push-blocks.ts';
import {
  BoxPhase, TALK_SCRIPT, buildDialogueScript, startTalk, stepTalk, talkVisibleRows,
  type TalkState,
} from './sim/talk.ts';
import { LEVEL_TASKS, TASK_TEXT } from './sim/level-data.ts';
import {
  RaceState, createTasks, markSlotDone, startLevelTasks, stepTasks, type TaskState,
} from './sim/tasks.ts';
import { unpackRaw } from './formats/rnc.ts';
import {
  CREATURE_LIST_TYPE, parseCreatureList, parseCreatureModels, parseCreatureNames,
  type CreaturePlacement,
} from './formats/creatures.ts';
import { AI_SCRIPTS } from './sim/creature-data.ts';
import {
  RandomStream, attackFromPlayer, contactCreatures, createCreatureSim, damageCreature,
  creatureWorldFromCollision, killCreature, setCreatureModels, stepCreatures,
  CREATURE_FLAGS, type Creature, type CreatureModel, type CreatureSim,
  CREATURE_HEALTH,
} from './sim/creatures.ts';
import {
  createAnimation, stepAnimation, type AnimationPlayback,
} from './sim/player-animation.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const dropEl = $<HTMLDivElement>('drop');
const appEl = $<HTMLDivElement>('app');
const statusEl = $<HTMLParagraphElement>('status');
const levelEl = $<HTMLSelectElement>('level');
const saveEl = $<HTMLButtonElement>('save');
saveEl.onclick = () => downloadSave();
const modelEl = $<HTMLSelectElement>('model');
const animEl = $<HTMLSelectElement>('anim');
const infoEl = $<HTMLSpanElement>('info');
const texturesEl = $<HTMLDivElement>('textures');
const hudEl = $<HTMLCanvasElement>('hud');

let viewer: Viewer | null = null;
let levels: ReturnType<typeof findLevels> = [];
let models: ReturnType<typeof findModels> = [];
/** Textures from the currently selected scene. Characters borrow these. */
let sceneTextures = new Map<number, THREE.Texture>();

/** The loaded scene, kept so the zone picker can recompute what to show. */
let currentLevel: { level: DatLevel; zones: (number | null)[] } | null = null;
/** The scene's creature placements from its `.raw` packet, and the names from creatures.cfg. */
let currentCreatures: CreaturePlacement[] = [];
let creatureNames = new Map<number, string>();
/** The running cast, once the player has spawned. Null before that. */
let creatureSim: CreatureSim | null = null;
/** `data/rand.dat`: every random choice a creature makes comes out of it. */
let randomBytes: Uint8Array | null = null;
/** The opened install, kept so creature models can be read on demand. */
let currentDir: GameDir | null = null;
/** Where each creature type's model lives, from creatures.cfg's third field. */
let creatureModelPaths = new Map<number, { name: string; path: string }>();
/** The hit geometry per type, read from those models on demand. */
const creatureModels = new Map<number, CreatureModel>();
/** The art beside it: the model to draw and the animations to pose it with. */
const creatureArt = new Map<number, { model: AllFile; anm: AnmFile | null }>();
/** What each drawn creature was last posed as, so a pose is rebuilt only on a change. */
let creaturePosed = new Map<number, string>();
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
  sceneSheets = new Map<number, Sheet>();
  for (const t of textures) {
    if (t.slot === null) continue;
    const image = decodeBmp(t.bmp);
    if (!image) continue;

    // The same pixels again as a canvas, which is what the HUD's 2D context
    // can blit from. Decoding once and keeping both is cheaper than asking
    // the GPU for them back.
    const sheet = document.createElement('canvas');
    sheet.width = image.width;
    sheet.height = image.height;
    const sheetCtx = sheet.getContext('2d');
    if (sheetCtx) {
      sheetCtx.putImageData(
        new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height), 0, 0,
      );
      sceneSheets.set(t.slot, sheet);
    }

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
  creatureSim = null;
  pushBlocks = null;
  tasks = null;
  talk = null;
  creatureArt.clear();
  viewer?.clearCreatureMeshes();
  music?.stop();
  currentTerrainFile = level.terrain;
  viewer?.setCollision(null);
  viewer?.setPlayer(null);

  let textureCount = 0;
  let gpuTextures = new Map<number, THREE.Texture>();
  // The .ngn holds the textures and, after them, pconv's converted copy of the
  // scene. The scene is the only place object zones are recorded, so it is
  // read here too rather than only for the art.
  let sceneBytes: Uint8Array | null = null;
  let textureList: NgnTexture[] = [];
  if (level.ngn) {
    sceneBytes = await level.ngn.read();
    const textures = parseNgn(sceneBytes);
    textureList = textures;
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
          // The room is in level.dat itself (the loader's object list); the
          // scene-file matching stays as the fallback for a file the walk
          // could not reach, and agrees with the byte wherever both exist.
          const native = parsed.objects.map((o) => o.zone);
          zones = native.every((z) => z !== null)
            ? native
            : assignZones(
              parsed.objects.map((o) => ({ ...o, faceCount: objectFaceCount(parsed, o) })),
              parseNgnScene(sceneBytes),
            );
        } catch { /* no zones: the level still draws, just all at once */ }
      }
      currentLevel = { level: parsed, zones };
      // A pickup is one of the level's own objects, so it is drawn by the
      // level mesh. Keeping each in a draw group of its own is what lets a
      // collected one, or a token whose task is not done, be taken away.
      const geometry = buildLevelGeometry(parsed, {
        zones,
        separate: pickupObjects(parsed, levelNumber(level.id) ?? 0),
      });

      setStatus(`${level.id}: uploading ${geometry.triangleCount} triangles\u2026`);
      await yieldToBrowser();
      // tex14 is the environment map the reflection pass uses; every level's
      // .ngn carries one under that name (docs/FORMATS.md).
      const reflectionSlot = textureList.find((t) => t.tag === 'tex14')?.slot ?? null;
      viewer.setLevel(geometry, gpuTextures, reflectionSlot === null ? undefined : gpuTextures.get(reflectionSlot));
      // The render pass's fog. Every shipped scene carries the slot-0x25
      // sheet that keeps the engine's general band off, so only level 14's
      // own 24,000-46,000 band ever shows; its colour is the clear colour
      // halved, 0x20 a channel to 0x10 (docs/FORMATS.md).
      const fog = FOG_BY_LEVEL[levelNumber(level.id) ?? 0];
      viewer.setFog(fog ? FOG_COLOUR : null, fog?.[0], fog?.[1]);

      setStatus(`${level.id}: ready`);
      await yieldToBrowser();

      // Creatures come from the RNC packet beside the scene, record type
      // 0x23. Until the player spawns these are just start positions; from
      // then on `creatureSim` runs them (src/sim/creatures.ts).
      currentCreatures = [];
      if (level.raw) {
        try {
          const record = unpackRaw(await level.raw.read()).find((r) => r.type === CREATURE_LIST_TYPE);
          if (record) currentCreatures = parseCreatureList(record.data);
        } catch (err) {
          console.warn(`${level.id}: creature list failed: ${(err as Error).message}`);
        }
      }
      drawCreatures();

      const textured = geometry.groups.filter((g) => g.page !== null && gpuTextures.has(g.page));
      const zoneCount = new Set(zones.filter((z) => z !== null)).size;
      summary +=
        `, ${geometry.objectCount}/${parsed.objects.length} objects, ` +
        `${geometry.triangleCount} triangles, ` +
        `${textured.length}/${geometry.groups.length} groups textured, ` +
        `${parsed.markers.length} markers, ` +
        `${zoneCount} zones / ${parsed.zones.length} portals, ` +
        `${currentCreatures.length} creatures`;
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
  currentDir = dir;

  // Each stage announces itself and yields, so if one hangs the last message
  // on screen names it. The drop panel deliberately stays up until the first
  // level has rendered, so these remain visible throughout.
  setStatus(`Loaded ${dir.size} files. Finding levels\u2026`);
  await yieldToBrowser();

  levels = findLevels(dir);
  models = findModels(dir);
  const cfg = dir.get('data/creatures.cfg');
  creatureNames = cfg ? parseCreatureNames(new TextDecoder('latin1').decode(await cfg.read())) : new Map();
  const rand = dir.get('data/rand.dat');
  randomBytes = rand ? await rand.read() : null;
  // The hint signs' text is inside the executable, so it is read from the
  // user's own copy at run time rather than kept in this repository.
  const exe = dir.get('toy2.exe');
  exeBytes = exe ? await exe.read() : null;
  creatureModelPaths = cfg ? parseCreatureModels(new TextDecoder('latin1').decode(await cfg.read())) : new Map();
  creatureModels.clear();
  sound = new SoundBank(dir);
  music = new MusicPlayer(dir);
  gameFiles = dir;
  // The player's progress: the browser's copy, else the install's own
  // Toy200.sav, else a fresh record (src/loader/save.ts). The camera choice
  // and the two sliders come from it, as the original's options do.
  progress = await loadProgress(dir);
  applyProgressOptions();
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
      get sound() {
        return sound
          ? { enabled: sound.enabled, ready: sound.ready, raised: [...soundLog] }
          : null;
      },
      get pickups() {
        return pickups ? {
          total: pickups.items.length, taken: pickups.taken, coins: pickups.coins,
          health: pickups.health, lives: pickups.lives, tokens: pickups.tokens,
          kinds: pickups.items.reduce<Record<string, number>>((acc, it) => {
            const k = PickupKind[it.kind] ?? String(it.kind); acc[k] = (acc[k] ?? 0) + 1; return acc;
          }, {}),
        } : null;
      },
      get creatures() {
        // Live once the sim is up, in game units; the placements, in level
        // units, before that. `near` is what the tick is actually updating.
        if (creatureSim) {
          return creatureSim.creatures.map((c) => ({
            slot: c.slot, type: c.type, name: creatureNames.get(c.type) ?? null,
            script: c.record.script, scriptWords: c.script.length,
            x: c.x, y: c.y, z: c.z, heading: c.heading, health: c.health,
            flags: c.flags, near: (c.flags & CREATURE_FLAGS.near) !== 0,
            vulnerable: c.record.vulnerable,
            pc: c.pc, wait: c.wait, animState: c.animState, frame: c.frame >>> 16,
            homeX: c.homeX, homeY: c.homeY, homeZ: c.homeZ,
            targetX: c.targetX, targetY: c.targetY, targetZ: c.targetZ,
            bodyRadius: c.bodyRadius, hitRadius: c.hitRadius,
            offsetX: c.offsetX, offsetY: c.offsetY, offsetZ: c.offsetZ,
            stun: c.stun, respawn: c.respawn, deathTimer: c.deathTimer, partSpin: c.partSpin,
            speed: c.record.speed, speedMax: c.record.speedMax, turnRate: c.record.turnRate, accel: c.record.accel, accelSide: c.record.accelSide,
            vx: c.vx, vz: c.vz, handler: c.handler,
            rangeX: c.record.rangeX, rangeZ: c.record.rangeZ, rangeYaw: c.record.rangeYaw,
            live: true,
          }));
        }
        return currentCreatures.map((c) => ({
          slot: c.slot, type: c.type, name: creatureNames.get(c.type) ?? null, script: c.script,
          scriptWords: AI_SCRIPTS[c.script]?.length ?? null,
          x: c.x, y: c.y, z: c.z, flags: c.flags, health: c.health, live: false,
        }));
      },
      /** Put the player on the nearest uncollected pickup. For the harness. */
      goToPickup() {
        if (!player || !pickups) return null;
        let best = -1, bestD = Infinity;
        for (let i = 0; i < pickups.items.length; i++) {
          const it = pickups.items[i]!;
          // A hint sign is never consumed, so it would be "nearest" for ever.
          if (it.collected || !it.enabled || it.kind === PickupKind.HintSign) continue;
          // Pickups are stored in level units; the player is in game units.
          const d = Math.hypot(it.x * GAME_UNITS_PER_LEVEL_UNIT - player.x, it.z * GAME_UNITS_PER_LEVEL_UNIT - player.z);
          if (d < bestD) { bestD = d; best = i; }
        }
        if (best < 0) return null;
        const it = pickups.items[best]!;
        player.x = it.x * GAME_UNITS_PER_LEVEL_UNIT; player.z = it.z * GAME_UNITS_PER_LEVEL_UNIT;
        player.y = it.y * GAME_UNITS_PER_LEVEL_UNIT;
        resetZones(zones);
        return { index: best, kind: PickupKind[it.kind], wasAway: Math.round(bestD / 32) };
      },
      get modelInfo() {
        const e = models[modelEl.selectedIndex];
        return { index: modelEl.selectedIndex, name: e?.name, hasAnmFile: !!e?.anm,
                 total: models.length, withAnm: models.filter((m) => m.anm).length };
      },
      spawnPlayer,
      togglePlay,
      get music() {
        if (!music) return null;
        const level = levelNumber(levels[levelEl.selectedIndex]?.id ?? '') ?? 0;
        const want = musicFor(level);
        return {
          enabled: music.enabled, playing: music.current, name: music.currentName,
          level, wantTrack: want, wantName: want === null ? null : MUSIC_TRACKS[want],
          slider: music.volume,
        };
      },
      playMusic(track: number, loop = true) {
        if (!music) return null;
        music.start();
        music.play(track, loop);
        return { track, name: MUSIC_TRACKS[track] ?? null };
      },
      /**
       * Run the creature sim without the player controller, so a test can
       * watch the cast on its own. Returns how many the tick updated.
       */
      tickCreatures(ticks = 1) {
        if (!creatureSim || !player) return null;
        let touches = 0;
        for (let i = 0; i < ticks; i++) {
          stepCreatures(creatureSim, player);
          // The same contact pass the real tick runs, so a test sees what
          // play sees.
          const hits = contactCreatures(creatureSim, player, attackFromPlayer(player));
          touches += hits.length;
          for (const touch of hits) applyCreatureTouch(touch.angle, touch.reaction);
          for (const raised of creatureSim.sounds) playEvent(raised.event, raised);
          creatureSim.sounds.length = 0;
        }
        drawCreatures();
        return { ticks, touches, updated: creatureSim.near.length, total: creatureSim.creatures.length };
      },
      /**
       * Run whole frames of play, pad and all, which `drive` does not: it
       * steps only the controller. Anything that lives in the tick — pushing,
       * creatures, pickups, the talk box — needs this one.
       */
      tickGame(held: Partial<PlayerInput> = {}, ticks = 1, bearing?: number) {
        if (!player) return null;
        for (let i = 0; i < ticks; i++) playTick(held, bearing);
        return { x: player.x, y: player.y, z: player.z, yaw: player.yaw, onGround: player.onGround };
      },
      /** Put the player against a push block's face, ready to shove it. */
      goToPushBlock(which = 0) {
        if (!player || !pushBlocks) return null;
        const b = pushBlocks.blocks[which];
        if (!b) return null;
        // Stand him one step back along the segment, facing down it.
        // Clear of the crate: it is as wide as Buzz is tall, so a small step
        // back puts him inside it and the sweep shoves him straight through.
        const S3 = GAME_UNITS_PER_LEVEL_UNIT;
        let reach = 900;
        const grp = currentCollisionWorld?.groups[b.group];
        if (grp) {
          let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
          for (const i of grp.polys) {
            for (const v of currentCollisionWorld!.polys[i]!.vertices) {
              minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
              minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
            }
          }
          if (Number.isFinite(minX)) reach = (Math.max(maxX - minX, maxZ - minZ) / 2 + 40) * S3;
        }
        const back = reach;
        player.x = b.x - Math.round((sinOf(b.segYaw) / 0x4000) * back);
        player.z = b.z - Math.round((cosOf(b.segYaw) / 0x4000) * back);
        // Stand him on whatever is under that point: a block can sit high up
        // on a shelf, and dropping him in at its own height makes him fall
        // past it before he ever touches it.
        const S2 = GAME_UNITS_PER_LEVEL_UNIT;
        const floor = currentCollisionWorld
          ? groundBelow(currentCollisionWorld, player.x / S2, (b.y - 4000) / S2, player.z / S2)
          : null;
        player.y = floor ? floor.y * S2 : b.y;
        resetZones(zones);
        player.vx = 0; player.vy = 0; player.vz = 0;
        player.yaw = b.segYaw;
        return { index: which, yaw: b.segYaw, block: { x: b.x, y: b.y, z: b.z }, player: { x: player.x, y: player.y, z: player.z } };
      },
      get pushBlocks() {
        if (!pushBlocks) return null;
        return {
          held: pushBlocks.held,
          blocks: pushBlocks.blocks.map((b) => ({
            index: b.index, seg: b.seg, run: b.run, segLen: b.segLen, tipPoint: b.tipPoint,
            fall: b.fallSpeed, x: b.x, y: b.y, z: b.z, group: b.group,
          })),
        };
      },
      /** Stand the player on the first pickup of a kind, by its name. */
      goToPickupKind(kind: string) {
        if (!player || !pickups) return null;
        const item = pickups.items.find((i) => i.enabled && !i.collected && PickupKind[i.kind] === kind);
        if (!item) return null;
        const S = GAME_UNITS_PER_LEVEL_UNIT;
        player.x = item.x * S; player.y = item.y * S; player.z = item.z * S;
        resetZones(zones);
        player.vx = 0; player.vy = 0; player.vz = 0;
        return { kind, id: item.id, x: player.x, y: player.y, z: player.z };
      },
      /** Stand the player on a hint sign, so touching it opens the talk box. */
      goToHintSign(which = 0) {
        if (!player || !pickups) return null;
        const signs = pickups.items.filter((i) => i.kind === PickupKind.HintSign && i.enabled);
        const item = signs[which];
        if (!item) return null;
        const S = GAME_UNITS_PER_LEVEL_UNIT;
        player.x = item.x * S; player.y = item.y * S; player.z = item.z * S;
        resetZones(zones);
        return { id: item.id, of: signs.length, x: player.x, y: player.y, z: player.z };
      },
      /** Move the player straight to a spot, for tests that need a route. */
      setPlayerPos(x: number, z: number, y?: number) {
        if (!player) return null;
        player.x = x; player.z = z;
        if (y !== undefined) player.y = y;
        resetZones(zones);
        player.vx = 0; player.vz = 0;
        return { x: player.x, y: player.y, z: player.z };
      },
      get tasks() {
        return tasks ? {
          done: tasks.done, hintIndex: tasks.hintIndex,
          boss: tasks.boss, potatoPart: tasks.potatoPart, powerUps: tasks.powerUps,
          bossPhase: tasks.bossPhase, bossClock: tasks.bossClock, bossHurt: tasks.bossHurt,
          bossCut: tasks.bossCut, bossRamp: tasks.bossRamp, bossSwing: tasks.bossSwing,
          bossBeaten: tasks.bossBeaten, levelWon: tasks.levelWon,
          fetch: tasks.fetch, fetchDone: tasks.fetchDone, fetchClock: tasks.fetchClock,
          slowTick: tasks.slowTick,
          race: tasks.race, laps: tasks.laps, quadrant: tasks.raceQuadrant,
          carNode: tasks.carNode, carLaps: tasks.carLaps,
          checkpoint: tasks.checkpoint, challenge: tasks.challenge, blocked: tasks.raceBlocked,
        } : null;
      },
      get talk() {
        if (!talk) return null;
        return {
          phase: BoxPhase[talk.phase], scale: talk.scale, rows: talk.lines.length,
          topRow: talk.topRow, shown: talk.shown, flying: talk.flying,
          visible: talkVisibleRows(talk).map((r) => r.text),
          eye: talk.eye, look: talk.look,
        };
      },
      /** Put the player beside a creature, so it comes into the update radius. */
      goToCreature(slot: number) {
        if (!creatureSim || !player) return null;
        const c = creatureSim.creatures.find((q) => q.slot === slot);
        if (!c) return null;
        player.x = c.x + 400; player.y = c.y; player.z = c.z + 400;
        resetZones(zones);
        return { slot, x: player.x, y: player.y, z: player.z };
      },
      /**
       * Take a creature out of the world the way its own death does, so a
       * test can reach the state a task waits on without playing the fight.
       */
      /**
       * Hurt a creature the way an attack does, so a test can watch a real
       * death rather than the shortcut below, which skips straight to
       * removal.
       */
      /** Force the race state, for the harness. 2 is running; anything past idle also does what accepting does to the car. */
      setRace(state: number) {
        if (!tasks) return false;
        tasks.race = state;
        const level = levelNumber(levels[levelEl.selectedIndex]?.id ?? '') ?? 0;
        const race = LEVEL_TASKS[level]?.race;
        const car = race && creatureSim ? creatureSim.creatures.find((c) => c.slot === race.creature) : undefined;
        if (state >= 1 && car) {
          tasks.laps = 0; tasks.carNode = 0; tasks.carLaps = 0;
          car.flags |= CREATURE_FLAGS.scriptVelocity;
          car.health = CREATURE_HEALTH.alwaysAwake;
        }
        return true;
      },
      hurtCreature(slot: number, kind = 1) {
        if (!creatureSim || !player) return null;
        const c = creatureSim.creatures.find((q) => q.slot === slot);
        if (!c) return null;
        c.stun = 0;
        damageCreature(creatureSim, c, 0, kind);
        return { slot, health: c.health, deathTimer: c.deathTimer };
      },
      killCreature(slot: number) {
        if (!creatureSim) return null;
        const c = creatureSim.creatures.find((q) => q.slot === slot);
        if (!c) return null;
        killCreature(c, 3, creatureSim);
        drawCreatures();
        return { slot, type: c.type };
      },
      /** The HUD's own state, so a test can see what is showing and where. */
      get hud() {
        return {
          timer: [...hud.timer], phase: [...hud.phase],
          offsets: hud.timer.map((_, n) => offsetOf(hud, n)),
          coinSpin: hud.coinSpin,
          div8: hud.div8, div16: hud.div16, div32: hud.div32, div64: hud.div64,
          sprites: spriteTable.filter(Boolean).length,
          sheets: [...sceneSheets.keys()],
          coins: coinCards.length, shadows: coinShadows.length,
        };
      },
      /** Put a HUD element on screen, as the thing that owns it would. */
      showHud(element: number, ticks = 0xb4) {
        showHud(hud, element, ticks);
        return { element, ticks };
      },
      /** The floor under a point, level units, as the shadows are placed. */
      floorAt(x: number, y: number, z: number) {
        if (!currentCollisionWorld) return null;
        const hit = groundBelow(currentCollisionWorld, x, y, z);
        return hit ? { y: hit.y, normal: hit.normal } : null;
      },
      /** The follow camera's own state, in game units. */
      get camera() {
        return camera ? { ...camera } : null;
      },
      /** Which room the level scripts think Buzz is in (docs/LEVELS.md). */
      get zones() {
        return { camera: zones.camera, player: zones.player, floor: zones.floor };
      },
      /** Turn the portal walk's culling off, to compare what it removes. */
      zoneCulling(on = true) {
        zoneCulling = on;
        walkKey = '';
        if (!on) viewer?.setVisibleZones(null);
        return zoneCulling;
      },
      /** Play a cutscene by index or name and wait for it; `movies` lists what the install has. */
      cutscene(which: number | string, options: { audio?: boolean; decodeFirstFrame?: boolean } = {}) {
        const index = typeof which === 'number' ? which
          : Number(Object.keys(MOVIES).find((k) => MOVIES[Number(k)] === which) ?? -1);
        return playMovie(index, options);
      },
      movies() {
        return Object.entries(MOVIES).map(([k, name]) => ({ index: Number(k), name, present: movieFile(Number(k)) !== null }));
      },
      get cutsceneUp() { return cutsceneUp; },
      get cutsceneProgress() { return lastCutscene ? lastCutscene.progress() : null; },
      /** The camera cut: ticks left, its eye, and what the renderer was given. */
      get cut() {
        return { ticks: cut.ticks, noControl: cut.noControl, blend: cut.blend, zoneBlend: cut.zoneBlend,
          eye: cut.eye, look: cut.look, out: cut.out };
      },
      /** The level's doorways, as from/to pairs. */
      zoneGraph() {
        return currentLevel ? currentLevel.level.zones.map((z) => [z.from, z.to]) : null;
      },
      /** Re-run the walk from where the camera is now, reporting every doorway. */
      walkTrace() {
        if (!currentLevel || !camera || !player) return null;
        const log: unknown[] = [];
        const seen = walkPortals(
          currentLevel.level.zones, zones.camera,
          basisFromCamera(camera, cameraTarget(player, camera)),
          { backdropZone: BACKDROP_ZONE[levelNumber(levels[levelEl.selectedIndex]?.id ?? '') ?? 0] ?? null,
            alsoFrom: zones.floor, trace: (t) => log.push(t) },
        );
        return { cameraZone: zones.camera, playerZone: zones.player, seen: [...seen.keys()], log };
      },
      /** What the portal walk saw this frame: each room and its screen rectangle. */
      get walk() {
        return [...walkRects.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([zone, r]) => ({ zone, ...r }));
      },
      /** The effect pool, for a test that wants to see what is alive. */
      get effects() {
        if (!effects) return null;
        const live = liveEffects(effects);
        return {
          hits: effects.hits.length,
          cards: effectCards.length, flat: effectFlat.length,
          lastHitAngle: effects.hits[0]?.angle ?? null,
          live: live.length,
          kinds: live.map((e) => e.kind),
          sprites: live.map((e) => e.sprite),
          first: live[0]
            ? {
              kind: live[0].kind, x: live[0].x, y: live[0].y, z: live[0].z,
              life: live[0].life, mode: live[0].mode, pitch: live[0].pitch,
              yaw: live[0].gravity, flags: live[0].flags,
              target: live[0].target ? { x: live[0].target.x, y: live[0].target.y, z: live[0].target.z } : null,
            }
            : null,
        };
      },
      /** The detail split (docs/FORMATS.md): a table row 0..2, or null for everything. */
      setDetail(row: number | null) { detailOption = row; detailNow = row; return viewer?.setDetail(row) ?? null; },
      /** The detail row drawn this frame, after the level's own forcing. */
      get detail() { return { option: detailOption, now: detailNow }; },
      /** The pause menu, for a test: open it, read it, press its keys. */
      get menu() {
        return {
          open: menu.open, page: menu.page, item: menu.item,
          sfx: menu.sfx, bgm: menu.bgm,
          rows: exeBytes ? menuRows(menu, (a) => exeString(exeBytes!, a)) : null,
        };
      },
      openMenu() { openMenu(menu); return menu.open; },
      /** The save record as decoded, and where it came from. */
      get save() {
        return progress ? { origin: progress.origin, ...progress.p, tokenCount: tokenCount(progress.p) } : null;
      },
      /** The bytes a download would hold. */
      exportSave() { return progress ? exportProgress(progress) : null; },
      forgetSave() { forgetProgress(); return true; },
      pressMenu(which: keyof MenuInput) {
        menuPress = { ...menuPress, [which]: true };
        return true;
      },
      /**
       * Enter or leave play. A shot taken without this shows the ORBIT
       * camera, not the follow camera: the orbit controls own the camera
       * until play mode takes it, and they put it back every frame.
       */
      play(on = true) {
        setPlaying(on);
        return viewer?.playMode ?? false;
      },
      revealTokens: revealAllTokens,
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
  // The original boots through its three logos, tt, dlogo and acti, each
  // skippable, and a skip drops the rest (the game flow's own chain).
  void playBoot();
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
 * Read the hit geometry of each creature type from its `.all`, caching as it
 * goes. The last group of a creature model is type 9: its entry carries the
 * coarse sphere the near and contact tests use, and its payload one hit
 * ellipsoid per animation state (docs/CREATURES.md).
 */
async function loadCreatureModels(types: ReadonlySet<number>): Promise<void> {
  if (!currentDir) return;
  for (const type of types) {
    if (creatureModels.has(type)) continue;
    const entry = creatureModelPaths.get(type);
    if (!entry) continue;
    const file = currentDir.get(entry.path);
    if (!file) continue;
    try {
      const model = parseAll(await file.read());
      // The animations sit beside the model, and a creature's animState is a
      // slot in this file (docs/CREATURES.md) — no per-type table needed.
      const anmFile = currentDir.get(entry.path.replace(/\.all$/, '.anm'));
      let anm: AnmFile | null = null;
      if (anmFile) {
        try { anm = parseAnm(await anmFile.read()); } catch { anm = null; }
      }
      creatureArt.set(type, { model, anm });
      const groups = model.groups;
      const last = groups[groups.length - 1];
      if (!last || last.type !== GroupType.HitShapes || !last.hitSphere) continue;
      const shapes = readHitShapes(last);
      if (!shapes) continue;
      creatureModels.set(type, {
        offsetX: last.hitSphere.x, offsetY: last.hitSphere.y, offsetZ: last.hitSphere.z,
        hitRadius: last.hitSphere.radius,
        shapes,
      });
    } catch (err) {
      console.warn(`creature type ${type} (${entry.name}): ${(err as Error).message}`);
    }
  }
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
 * The level's own start point, if this scene is the one the game starts a
 * level in and the executable's table has floor under it.
 *
 * `SPAWN_TABLE` is per level number; `levelNumber` says which scene a level
 * plays in. Scenes that are no level's start fall back to the marker
 * heuristic below. The y in the table is a seed for a ground ray, not a
 * resting height.
 */
function tableSpawn(
  sceneId: string, world: CollisionWorld,
): { x: number; z: number; yaw: number; ground: { y: number; normal: { x: number; y: number; z: number } } } | null {
  const level = levelNumber(sceneId);
  if (level === null) return null;
  const spawn = SPAWN_TABLE[level];
  if (!spawn) return null;
  const S = GAME_UNITS_PER_LEVEL_UNIT;
  // The original starts its ray 0x400 above the seed; the same allowance here.
  const ground = groundBelow(world, spawn.x / S, spawn.y / S - 0x400 / S, spawn.z / S, 0x400 / S);
  if (!ground) return null;
  return { x: spawn.x, z: spawn.z, yaw: spawn.yaw, ground };
}

/**
 * `p`: stand the selected character on the floor of the level.
 *
 * The start point is the executable's spawn table where that applies (see
 * `tableSpawn`). Otherwise it is a pickup marker, because those are the one
 * thing in the file known to sit over walkable floor — every one of them does,
 * in every level checked.
 */
async function spawnPlayer(): Promise<void> {
  if (!viewer || !currentLevel) return;
  const entry = models[modelEl.selectedIndex];
  if (!entry) { infoEl.textContent = 'no character selected'; return; }

  infoEl.textContent = 'placing character…';
  await loadCollision();
  if (!currentCollisionWorld) { infoEl.textContent = 'no collision for this scene'; return; }

  const sceneId = levels[levelEl.selectedIndex]?.id ?? '';
  const fromTable = tableSpawn(sceneId, currentCollisionWorld);
  let start: { x: number; z: number; yaw: number; ground: { y: number; normal: { x: number; y: number; z: number } } };
  let area = -1;
  if (fromTable) {
    start = fromTable;
  } else {
    const chosen = pickSpawnMarker(currentLevel.level.markers, currentCollisionWorld);
    if (!chosen) { infoEl.textContent = 'no marker with floor under it'; return; }
    const S = GAME_UNITS_PER_LEVEL_UNIT;
    start = { x: chosen.marker.position.x * S, z: chosen.marker.position.z * S, yaw: 0, ground: chosen.ground };
    area = chosen.area;
  }
  const { ground } = start;

  const model = parseAll(await entry.file.read());
  const anm = entry.anm ? parseAnm(await entry.anm.read()) : null;
  playerModel = { model, anm };
  playerAnim = createAnimation();
  viewer.setPlayer(buildMeshData(model), sceneTextures);
  // The hull is in PlayStation axes: +Y down, 256 units to the world unit.
  viewer.setPlayerPosition(start.x * GAME_TO_RENDER, -ground.y / WORLD_SCALE, -start.z * GAME_TO_RENDER);

  // The sim runs 32x finer than the file, so scale on the way in. Standing on
  // the floor means y equal to the surface: the model's origin is at its feet.
  player = createPlayer(start.x, ground.y * GAME_UNITS_PER_LEVEL_UNIT, start.z, start.yaw);
  playerRuntime = createRuntime();
  camera = createCamera(player);
  // Coins from the markers, everything else from the object-id list. See
  // src/sim/pickups.ts. The five tokens start hidden in the original and are
  // revealed one by one as the level's tasks are done (docs/LEVELS.md). Only
  // the one the level's own init reveals is shown; the tasks are not
  // implemented, so the rest stay hidden until `ts2.revealTokens()`.
  const level = levelNumber(sceneId) ?? 0;
  // The cast starts running now. The engine builds its entities at level load
  // and ticks them beside the player, so the random stream is rewound here to
  // match: a level replays the same way every time.
  creatureSim = null;
  if (currentCreatures.length > 0) {
    if (!randomBytes) {
      console.warn('data/rand.dat is missing: creatures need its byte stream, so they stay still');
    } else {
      const world = currentCollisionWorld;
      creatureSim = createCreatureSim(
        currentCreatures,
        creatureWorldFromCollision((x, y, z) => {
          const S = GAME_UNITS_PER_LEVEL_UNIT;
          const hit = groundBelow(world, x / S, y / S, z / S);
          return hit ? hit.y * S : null;
        }),
        new RandomStream(randomBytes),
        level,
      );
      // Nothing can be touched until its hit geometry is loaded, so read the
      // model of every type this scene uses. A type whose model is missing is
      // marked "no model" and drops out of the near list, as in the original.
      await loadCreatureModels(new Set(currentCreatures.map((c) => c.type)));
      setCreatureModels(creatureSim, creatureModels);
      // Draw them as themselves rather than as cones, where the install has
      // the model. Anything without one keeps a marker.
      viewer.clearCreatureMeshes();
      creaturePosed = new Map();
      for (const c of creatureSim.creatures) {
        const art = creatureArt.get(c.type);
        if (art) viewer.setCreatureMesh(c.slot, buildMeshData(art.model), sceneTextures);
      }
    }
  }
  // The crates Buzz shoves. Their rails are paths in the scene and their
  // collision is a numbered dynamic group in the terrain file.
  const S = GAME_UNITS_PER_LEVEL_UNIT;
  const table = PUSH_BLOCKS[level];
  pushBlocks = table
    ? createPushBlocks(
      table,
      (tag) => {
        const path = currentLevel!.level.paths.find((p) => p.id === tag);
        return path ? path.points.map((p) => ({ x: p.x * S, y: p.y * S, z: p.z * S })) : null;
      },
      (object) => collisionGroupByObject(currentCollisionWorld!, object),
      level,
    )
    : null;
  drawPushBlocks();

  // The sprite table the HUD and the coins draw from lives in the user's own
  // executable, and its second half is per level (docs/HUD.md).
  spriteTable = exeBytes ? readSpriteTable(exeBytes, level) : [];
  soundTable = exeBytes ? readSoundTable(exeBytes, level) : null;
  // The effect pool: the laser bolt, the robots' shots, sparks, dust and the
  // coins a creature spills (docs/EFFECTS.md). Its templates come from the
  // user's own executable, like the sprite and sound tables.
  effects = exeBytes && creatureSim
    ? (() => {
      const table = readEffectTable(exeBytes!);
      return createEffects(table.kinds, table.modes, creatureSim!.rand);
    })()
    : null;
  viewer.setCardSheet(sceneTextures.get(SPRITE_SHEET) ?? null);
  hud = createHud();
  startHud(hud);
  hudWas = { lives: -1, health: -1, coins: -1, found: -1 };

  // He has been put somewhere rather than having walked there.
  resetZones(zones);
  Object.assign(cut, createCut());
  tasks = createTasks();
  startLevelTasks(tasks, level, progress?.p.powerUps ?? 0);
  startBossFight(level);
  revealedSlots = new Set();
  pickups = createPickups(currentLevel.level, level);
  // Lives and health carry over from the record, as `FUN_004a2cc0` copies
  // them in. Whether a token already held shows up in the level again is
  // not established, so the level's tokens are left as it places them.
  if (progress) { pickups.lives = progress.p.lives; pickups.health = Math.min(PICKUP.healthMax, progress.p.health); }
  for (const slot of tokenSlotsAtStart(level)) revealToken(pickups, slot);
  // Each coin's shadow lies on the floor under it, so the ground is measured
  // once here rather than every frame.
  pickupAngles = pickups.items.map(() => [0, 0, 0]);
  pickupAngleMap.clear();
  pickupFloor = pickups.items.map((item) => {
    const hit = currentCollisionWorld
      ? groundBelow(currentCollisionWorld, item.x, item.y, item.z)
      : null;
    return hit ? hit.y : item.y;
  });
  drawPickups();
  spawnPoint = { x: player.x, y: player.y, z: player.z };
  const slope = (Math.acos(Math.min(1, -ground.normal.y)) * 180) / Math.PI;
  infoEl.textContent =
    `${entry.name} standing on floor ${(ground.y / WORLD_SCALE).toFixed(2)} ` +
    `(${slope.toFixed(0)}\u00b0 slope), ${fromTable ? "the level's own start point" : `${area} cells of floor to walk on`}. Enter to play, escape to stop.`;
}

/** Hand the viewer the pickups that are currently visible. */
function drawPickups(): void {
  if (!viewer || !pickups) return;
  // Coins are the engine's own sprite (`drawCoins`); every other pickup IS
  // one of the level's objects and the level mesh already draws it, so all
  // there is to do is take away the ones that should not be seen: collected
  // ones, hidden tokens, and the five spare token objects.
  const hidden = new Set<number>();
  for (const item of pickups.items) {
    if (item.objectIndex < 0) continue;
    if (!item.enabled || item.collected) hidden.add(item.objectIndex);
  }
  viewer.setHiddenObjects(hidden);
}

/**
 * One tick of the effect pool, then what it raised.
 *
 * The engine runs this after the player and the creatures, which is where it
 * sits here: a bolt fired this tick moves on the next one, and a creature
 * that died this tick spills its coins now.
 */
function stepEffectsNow(): void {
  if (!effects || !player || !camera) return;
  const world = effectWorld();
  effects.spinning = player.spin > 0;
  stepEffects(effects, world);
  touchPlayer(effects, world);

  // Damage the laser landed. The creature port already knows what kind 4 is.
  if (creatureSim) {
    for (const hit of effects.hits) {
      const c = creatureSim.creatures.find((x) => x === hit.target);
      if (c) damageCreature(creatureSim, c, hit.angle, hit.kind);
    }
  }
  for (const raised of effects.sounds) playEvent(raised.event, raised);
  effects.sounds.length = 0;

  if (effects.coins > 0 && pickups) {
    pickups.coins = Math.min(99, pickups.coins + effects.coins);
    showHud(hud, HudElement.Coins, HUD.counterTicks);
    if (pickups.coins >= 50) playEvent(0x4f, player);
  }
  // A shot that reached him hurts him, the same way a creature's touch does.
  if (effects.hurt !== null && player.hitStun <= 0 && !player.dying) {
    player.vx = Math.trunc(sinOf(effects.hurt) / 16);
    player.vz = Math.trunc(cosOf(effects.hurt) / 16);
    hurtPlayer();
  }
}

/**
 * What the creature tick raised, as effects: the shots a handler fired, the
 * sparks a blow struck, and the coins a dying creature spills.
 */
function spawnCreatureEffects(): void {
  if (!effects || !creatureSim || !player || !camera) return;
  const world = effectWorld();
  for (const shot of creatureSim.shots) {
    // The hover bot fires from a gun on each side; the port has one heading
    // per shot, so the bolt leaves along it rather than across it.
    spawnEffect(effects, world, shot.x, shot.y, shot.z,
      sinOf(shot.heading) >> 4, -0x200, cosOf(shot.heading) >> 4,
      0x40, 0, 0x80, EFFECT_KIND.hoverShot);
  }
  creatureSim.shots.length = 0;
  for (const spark of creatureSim.sparks) {
    spawnEffect(effects, world, spark.x, spark.y, spark.z, 0, 0, 0, 0, 0, 0, 0x11);
  }
  creatureSim.sparks.length = 0;
  // The car's skid dust: kind 0x2a from spawn mode 10, then its own spin.
  for (const d of creatureSim.dust) {
    const e = spawnChild(effects, world, d.x, d.y, d.z, 0x2a, 10);
    if (e) e.spin = d.spin;
  }
  creatureSim.dust.length = 0;
  // The coin a creature spills when it dies, thrown up out of the body. Its
  // floor is asked for at once so it lands instead of falling through, which
  // is what the original does at the same spot.
  for (const at of creatureSim.deaths) {
    const coin = spawnEffect(effects, world,
      at.x, at.y - 0x1000, at.z, 0, -0x800, 0, 0x80, 0, 0, EFFECT_KIND.coin);
    if (coin) coin.floor = world.groundAt(coin.x, coin.y, coin.z) ?? coin.y;
    // ...and the burst its type asks for, so a kill reads as a kill rather
    // than the body blinking out.
    if (at.burst > 0) {
      for (let i = 0; i < at.burst; i++) {
        const bit = spawnChild(effects, world, at.x, at.y, at.z, 0x23, 0xe);
        if (bit) bit.spin = effects.rand.byte() - 0x80;
      }
      effects.lights.push({ x: at.x, y: at.y, z: at.z, r: 0xf0, g: 0x80, b: 0, glow: false });
    } else if (at.burst < 0) {
      for (let i = 0; i < -at.burst; i++) {
        const spark = spawnChild(effects, world, at.x, at.y, at.z, 99, (i & 1) * 10 + 4);
        if (spark) {
          spark.vy -= 0x100;
          spark.life = (effects.rand.byte() & 0xff1f) + 0x78;
          const grey = (effects.rand.byte() & 0x7f) + 0x40;
          spark.r = grey; spark.g = grey; spark.b = grey;
          const sign = (effects.rand.byte() & 1) === 0 ? -1 : 1;
          spark.spin = sign * ((effects.rand.byte() & 0xff3f) + 0x40);
        }
        spawnChild(effects, world, at.x, at.y, at.z, 0x11, 4);
      }
    }
    if (at.burst !== 0) playEvent(10, at);
  }
  creatureSim.deaths.length = 0;
}

/** What the effect tick needs to know about the rest of the world. */
function effectWorld(): EffectWorld {
  const S2 = GAME_UNITS_PER_LEVEL_UNIT;
  const look = camera ? cameraTarget(player!, camera) : { x: 0, y: 0, z: 0 };
  return {
    cameraX: look.x, cameraY: look.y, cameraZ: look.z,
    playerX: player!.x, playerY: player!.y, playerZ: player!.z,
    playerYaw: player!.yaw, playerVx: player!.vx, playerVz: player!.vz,
    groundAt: (x, y, z) => {
      if (!currentCollisionWorld) return null;
      const hit = groundBelow(currentCollisionWorld, x / S2, y / S2, z / S2);
      return hit ? hit.y * S2 : null;
    },
    waterY: null,
  };
}

/**
 * Buzz fires (`FUN_004a4960`). The bolt is an effect: kind 0x47 homes on the
 * nearest creature that can be hurt, and kind 0x48 flies straight when
 * nothing is in range. A creature whose `vulnerable` byte is 4 bounces the
 * homing one, which the effect tick handles.
 *
 * The original fires from the wrist bone; this fires from Buzz's centre,
 * which is the same place to within his own width.
 */
function fireLaser(aim: number): void {
  if (!effects || !player || !camera) return;
  const world = effectWorld();
  const x = player.x, y = player.y - 0x1cc0, z = player.z;

  let best: typeof creatureSim extends null ? never : NonNullable<typeof creatureSim>['creatures'][number] | null = null;
  let least = Infinity;
  if (creatureSim) {
    for (const c of creatureSim.creatures) {
      if (c.record.vulnerable === 0 || c.deathTimer < 0) continue;
      // The original wants flags 0x1 and 0x2 together. 0x2 is "in this
      // tick's near list", which is the part that means "the game is
      // running this creature"; 0x1 is the always-awake bit a script or a
      // level rule sets, and requiring it here would leave the homing bolt
      // with almost nothing to aim at. Near and alive is the test used.
      if ((c.flags & CREATURE_FLAGS.near) === 0) continue;
      const dx = (c.x - player.x) >> 5, dy = (c.y - player.y) >> 5, dz = (c.z - player.z) >> 5;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < least) { least = d; best = c; }
    }
  }
  if (best && least < 0x1000000) {
    const bolt = spawnEffect(effects, world, x, y, z, 0, -2, 0, aim << 2, 0, 0, EFFECT_KIND.laserBolt);
    if (bolt) {
      const at = best;
      const tx = at.x + at.offsetX, ty = at.y + at.offsetY, tz = at.z + at.offsetZ;
      // The original passes an aim into `FUN_004a4960` and keeps it as the
      // bolt's pitch. Where that number comes from inside `FUN_00434990` was
      // not read; starting level, the pitch's 20-tick lag leaves the bolt
      // passing over anything much above or below the wrist, so it starts
      // pointed at what it is chasing.
      bolt.pitch = (yawOf(Math.round(Math.hypot(tx - x, tz - z)) >> 5, (ty - y) >> 5) - 0x400) & 0xfff;
      const target = {
        x: tx, y: ty, z: tz,
        alive: true, vulnerable: at.record.vulnerable, creature: at,
        follow: () => {
          target.x = at.x + at.offsetX;
          target.y = at.y + at.offsetY;
          target.z = at.z + at.offsetZ;
          target.vulnerable = at.record.vulnerable;
          target.alive = at.deathTimer >= 0 && at.health > 0;
        },
      };
      bolt.target = target;
    }
  } else {
    const flat = cosOf(aim);
    spawnEffect(effects, world, x, y, z,
      Math.trunc(((sinOf(player.yaw) * flat) >> 14) / 3),
      Math.trunc(-sinOf(aim) / 3),
      Math.trunc(((cosOf(player.yaw) * flat) >> 14) / 3),
      0, 0, 0, EFFECT_KIND.laserStraight);
  }
  playEvent(0x54, player);
}

/** The effects, as cards. Additive ones go in their own batch. */
function drawEffects(): void {
  effectCards.length = 0;
  effectFlat.length = 0;
  if (!viewer || !effects) return;
  const sheet = sceneSheets.get(SPRITE_SHEET);
  if (!sheet) { viewer.setEffectCards(effectCards, effectFlat); return; }
  for (const e of liveEffects(effects)) {
    const header = spriteTable[e.sprite];
    if (!header) continue;
    const f = header.frames[e.frame] ?? header.frames[0];
    if (!f) continue;
    const card: WorldSprite = {
      x: e.x / WORLD_SCALE, y: -e.y / WORLD_SCALE, z: -e.z / WORLD_SCALE,
      u0: f.u / sheet.width, v0: f.v / sheet.height,
      u1: (f.u + header.width) / sheet.width, v1: (f.v + header.height) / sheet.height,
      width: e.width / WORLD_SCALE, height: e.height / WORLD_SCALE,
      alpha: 1,
      r: e.r / 128, g: e.g / 128, b: e.b / 128,
      rotation: toRadians(e.rotation),
    };
    ((e.flags & EFFECT_FLAGS.flat) !== 0 ? effectFlat : effectCards).push(card);
  }
  viewer.setEffectCards(effectCards, effectFlat);
}

/**
 * The coins, as the engine draws them: sprite 16 facing the camera with a
 * ten-frame spin, each one two frames further round than the last so a row
 * of them does not flash in step, and a shadow lying on the floor under it.
 * Anything past the draw distance is left out, and the last few steps of it
 * are a fade rather than a pop. docs/HUD.md.
 */
function drawCoins(): void {
  coinCards.length = 0;
  coinShadows.length = 0;
  if (!viewer || !pickups) return;
  const header = spriteTable[SPRITE.coin];
  const shadow = spriteTable[SPRITE.shadow];
  const sheet = sceneSheets.get(SPRITE_SHEET);
  if (!header || !sheet) return;

  // The engine measures from the camera, in 16-level-unit steps.
  const eye = viewer.camera.position;
  const camX = (eye.x * WORLD_SCALE) / 16;
  const camZ = (-eye.z * WORLD_SCALE) / 16;
  const radius2 = COIN_DRAW.radius * COIN_DRAW.radius;
  const size = COIN_DRAW.size / WORLD_SCALE;
  const shadowSize = COIN_DRAW.shadowSize / WORLD_SCALE;
  const uv = (h: typeof header, frame: number) => {
    const f = h.frames[frame] ?? h.frames[0]!;
    return {
      u0: f.u / sheet.width, v0: f.v / sheet.height,
      u1: (f.u + h.width) / sheet.width, v1: (f.v + h.height) / sheet.height,
    };
  };
  const shadowUv = shadow ? uv(shadow, 0) : null;

  let phase = 0;
  pickupAngleMap.clear();
  for (let i = 0; i < pickups.items.length; i++) {
    const item = pickups.items[i]!;
    if (item.kind !== PickupKind.Coin) {
      // Everything else is one of the level's objects, and it tumbles while
      // it is near enough to draw: three angles, each advancing at its own
      // rate off the record's index, so no two turn together.
      if (!item.enabled || item.collected || item.objectIndex < 0) continue;
      const dx = camX - item.x / 16, dz = camZ - item.z / 16;
      if (dx * dx + dz * dz - COIN_DRAW.fadeBias >= radius2) continue;
      const a = pickupAngles[i]!;
      a[0] = (a[0] + 10) % OBJECT_ANGLE_UNITS;
      a[1] = (a[1] + (((i >> 2) & 3) * 3 + 7) * 2) % OBJECT_ANGLE_UNITS;
      a[2] = (a[2] + ((i & 7) + 4) * 2) % OBJECT_ANGLE_UNITS;
      pickupAngleMap.set(item.objectIndex, a);
      continue;
    }
    // Every coin in the list advances the phase, taken or not, so collecting
    // one does not re-shuffle the rest.
    const frame = ((hud.coinSpin >> 1) + phase) % COIN_DRAW.phaseWrap;
    phase = (phase + COIN_DRAW.phaseStep) % COIN_DRAW.phaseWrap;
    if (!item.enabled || item.collected) continue;

    const dx = camX - item.x / 16;
    const dz = camZ - item.z / 16;
    const d2 = dx * dx + dz * dz - COIN_DRAW.fadeBias;
    if (d2 >= radius2) continue;
    const alpha = Math.min(255, (radius2 - d2) / (1 << COIN_DRAW.fadeShift)) / 255;

    const x = item.x / WORLD_SCALE, y = -item.y / WORLD_SCALE, z = -item.z / WORLD_SCALE;
    coinCards.push({ x, y, z, ...uv(header, frame), width: size, height: size, alpha });
    if (shadowUv) {
      coinShadows.push({
        x, y: -(pickupFloor[i]! - COIN_DRAW.shadowDrop) / WORLD_SCALE, z,
        ...shadowUv, width: shadowSize, height: shadowSize, alpha,
      });
    }
  }
  viewer.setWorldCards(coinCards, coinShadows);
  viewer.setObjectAngles(pickupAngleMap);
}

/**
 * Play one of the engine's sound events. Everything but the player's own
 * moves raises a number rather than a name: the level's table says which
 * effect that is and how loud (src/audio/events.ts). A position makes it
 * positional, attenuated and panned against the camera; without one it plays
 * at the record's own volume, which is what the engine does for a sound that
 * belongs to the screen rather than the world.
 */
function playEvent(event: number, at?: { x: number; y: number; z: number }): void {
  if (!sound || !soundTable) return;
  const name = soundTable.nameOf(event);
  // Kept whether or not anything is audible, so a test can see that the right
  // event was raised without a sound device.
  soundLog.push(`${event.toString(16)}:${name ?? 'silent'}`);
  if (soundLog.length > 32) soundLog.shift();
  if (!name) return;
  const record = soundTable.events[event];
  const sustained = record?.sustained ?? false;
  if (!at || !camera) {
    const volume = record?.volume ?? 0;
    if (volume <= 0) return;
    const dB = MUSIC_VOLUME_CURVE[Math.min(MUSIC_VOLUME_CURVE.length - 1, volume)] ?? 0;
    if (dB > -10000) sound.play(name, 10 ** (dB / 2000), 0, sustained);
    return;
  }
  sound.playAt(
    name,
    { x: at.x - camera.x, y: at.y - camera.y, z: at.z - camera.z },
    { sin: sinOf(camera.yaw) / 0x4000, cos: cosOf(camera.yaw) / 0x4000 },
    sustained,
  );
}

/** What the HUD needs to know this tick, gathered from the sim. */
function hudReadout(level: number): HudReadout {
  const boss = LEVEL_TASKS[level]?.boss;
  let bossBar = -1;
  if (boss && creatureSim) {
    const c = creatureSim.creatures.find((q) => q.slot === boss.creature);
    // Only once the fight is actually on: the boss sets this every tick it
    // is awake, so a boss standing in its idle loop across the level shows
    // nothing. Being hurt counts too, for the bosses with no taunt.
    const fighting = c && c.type !== 0 && c.health > 0
      && (tasks !== null && tasks.boss >= 2 || c.health < c.record.health);
    if (c && fighting) {
      bossBar = Math.max(0, Math.min(0x36, Math.round(((c.health - 9) * 0x36) / 11)));
    }
  }
  // A world boss has its own bar, on for as long as the fight is (the level
  // 6 tick's `(health - 10) * 0x36 / 10`).
  const fight = LEVEL_TASKS[level]?.bossFight;
  if (fight && creatureSim && tasks && tasks.bossPhase >= 2) {
    const c = creatureSim.creatures.find((q) => q.slot === fight.creature);
    if (c) {
      bossBar = Math.max(0, Math.min(0x36,
        Math.round(((c.health - fight.bar.from) * 0x36) / fight.bar.over)));
    }
  }
  // The shared task counter: under 100 the flag counts laps down, at 100 or
  // more it is a countdown in tenths of a minute.
  let clock: number | null = null;
  if (tasks) {
    if (tasks.race === RaceState.Running) clock = tasks.laps;
    else if (tasks.fetch === 2) clock = tasks.fetchClock;
  }
  const challenge = LEVEL_TASKS[level]?.challenge;
  const collected = tasks && challenge && tasks.challenge === 1
    ? Math.min(5, (pickups?.itemsFound ?? 0) - tasks.challengeFrom)
    : -1;
  return {
    lives: pickups?.lives ?? 0,
    health: pickups?.health ?? 0,
    coins: pickups?.coins ?? 0,
    found: LEVEL_TASKS[level]?.findFive?.countedBy === 'pickup'
      ? (pickups?.itemsFound ?? 0)
      : (creatureSim?.foundCount ?? 0),
    collected,
    clock,
    // The controller keeps the same signed counter the HUD wants: positive
    // while the spin charges, negative through the charged spin. Ours runs
    // -240..0 over the whole 300-tick move where the engine's runs -120..0
    // over the dizzy tail, so the bar's recovery sliver only appears over
    // the last 120 ticks of it.
    spinCharge: player?.spinCharge ?? 0,
    laserCharge: player?.laserCharge ?? 0,
    powerTimer: pickups?.powerTimer ?? 0,
    discs: pickups?.discs ?? 0,
    pieces: pickups?.pieces ?? 0,
    boss: bossBar,
  };
}

/**
 * Show the elements whose condition holds this tick, the way the top of
 * `FUN_0049fd40` does, then advance the timers and paint.
 */
function drawHud(level: number): void {
  if (!viewer) return;
  const r = hudReadout(level);
  // A counter that changed puts itself back on screen.
  if (r.lives !== hudWas.lives) showHud(hud, HudElement.Lives, HUD.counterTicks);
  if (r.health !== hudWas.health) showHud(hud, HudElement.Health, HUD.counterTicks);
  if (r.coins !== hudWas.coins) showHud(hud, HudElement.Coins, HUD.counterTicks);
  hudWas = { lives: r.lives, health: r.health, coins: r.coins, found: r.found };

  if (r.spinCharge !== 0) showHud(hud, HudElement.Spin, HUD.spinTicks);
  if (r.laserCharge !== 0 || r.powerTimer !== 0 || r.discs !== 0 || r.pieces !== 0) {
    showHud(hud, HudElement.Laser, HUD.laserTicks);
  }
  if (r.found > 0) showHud(hud, HudElement.FindFive, HUD.liveTicks);
  if (r.clock !== null) showHud(hud, HudElement.TimedRun, HUD.liveTicks);
  if (r.boss >= 0) showHud(hud, HudElement.Boss, HUD.bossTicks);
  // The world boss sets the same timer, which is what puts its theme on.
  if (tasks && tasks.bossPhase === 2) showHud(hud, HudElement.Boss, HUD.bossTicks);
  if (tasks && tasks.potatoPart < 0) showHud(hud, HudElement.PotatoHead, HUD.liveTicks);
  if (tasks && r.coins >= 50 && (tasks.done & 1) === 0) showHud(hud, HudElement.Hamm, HUD.liveTicks);

  stepHud(hud, talk !== null);
  if (offsetOf(hud, HudElement.Coins) < 1) stepCoinSpin(hud);
  // The engine asks for its music every tick, right here: `FUN_0049eac0`
  // reads the HUD's own timers, so the boss theme plays while the boss bar
  // is up and the race theme while the race counter is, and the level's
  // track otherwise (src/audio/music.ts).
  music?.want(musicFor(level));

  // The overlay covers the game's own rectangle inside the canvas, not the
  // whole canvas: the picture is fitted to the engine's 4:3 screen and the
  // HUD is laid out for that screen.
  const view = viewer.view.getBoundingClientRect();
  const host = appEl.getBoundingClientRect();
  const rect = viewer.pictureRect;
  hudEl.style.left = `${view.left - host.left + rect.x}px`;
  hudEl.style.top = `${view.top - host.top + rect.y}px`;
  hudEl.style.width = `${rect.width}px`;
  hudEl.style.height = `${rect.height}px`;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (!hudPainter) hudPainter = new HudPainter(hudEl);
  hudPainter.resize(Math.round(rect.width * dpr), Math.round(rect.height * dpr));
  hudPainter.draw(hud, spriteTable, sceneSheets, r, talkDraw(), menuDraw());
}

/**
 * Colour by what the creature is to Buzz: red for the things that hurt him
 * (health under 100 and a respawn timer, which is how the level data marks an
 * enemy), green for the cast he talks to, grey for the rest.
 */
function creatureColour(c: CreaturePlacement): number {
  if (c.health >= 100) return 0x60d060;
  if (c.respawn > 0) return 0xe04040;
  return 0xa0a0a0;
}

/**
 * Hand the viewer the creatures: where they are now once the sim is running,
 * else where the level puts them. The dead are dropped rather than left lying
 * at the origin.
 */
function drawCreatures(): void {
  if (!viewer) return;
  const S = GAME_UNITS_PER_LEVEL_UNIT;
  if (creatureSim) {
    const markers: { x: number; y: number; z: number; yaw: number; colour: number }[] = [];
    for (const c of creatureSim.creatures) {
      const alive = c.type > 0 && c.health > 0;
      const art = creatureArt.get(c.type);
      if (!art) {
        if (alive) {
          markers.push({
            x: c.x * GAME_TO_RENDER, y: -c.y * GAME_TO_RENDER, z: -c.z * GAME_TO_RENDER,
            yaw: toRadians(c.heading), colour: liveCreatureColour(c),
          });
        }
        continue;
      }
      if (!alive) {
        // Dead or removed: take its model away and stop tracking its pose.
        viewer.setCreatureMesh(c.slot, null);
        creaturePosed.delete(c.slot);
        continue;
      }
      viewer.placeCreatureMesh(
        c.slot,
        c.x * GAME_TO_RENDER, -c.y * GAME_TO_RENDER, -c.z * GAME_TO_RENDER,
        toRadians(c.heading),
      );
      // Pose it only when something changed, and only while the sim is
      // actually updating it — a creature outside the update radius is frozen
      // anyway, so re-posing it would be work for nothing.
      if (!art.anm || (c.flags & CREATURE_FLAGS.near) === 0) continue;
      const animation = art.anm.animations[c.animState];
      if (!animation) continue;
      const frame = (c.frame >>> 16) % Math.max(1, animation.frameCount);
      // A handler's part rotations are part of the pose too, at a sixteenth
      // of a turn's resolution so the cache is not defeated by every tick.
      const spin = c.partSpin ? c.partSpin.map((a) => a >> 4) : null;
      const key = `${c.animState}:${frame}:${spin ? spin.join(',') : ''}`;
      if (creaturePosed.get(c.slot) === key) continue;
      creaturePosed.set(c.slot, key);
      viewer.setCreatureMesh(
        c.slot,
        buildPosedMeshData(
          art.model, art.anm, animation, frame, null,
          spin ? spin.map((a) => (a << 4) * (Math.PI * 2 / 4096)) : null,
        ),
        sceneTextures,
      );
    }
    viewer.setCreatures(markers);
    return;
  }
  viewer.setCreatures(currentCreatures.map((c) => ({
    x: c.x * S * GAME_TO_RENDER, y: -c.y * S * GAME_TO_RENDER, z: -c.z * S * GAME_TO_RENDER,
    yaw: toRadians((c.facing << 4) & 0xfff), colour: creatureColour(c),
  })));
}

/**
 * Buzz's half of a touch (`FUN_004071e0`): bit 1 pushes him away along the
 * contact angle, bit 2 hurts him as well. The original's full reaction — the
 * knock-down animation, the invulnerability window, losing a life — is not
 * ported; this is the push and the hit stun.
 */
function applyCreatureTouch(angle: number, reaction: number): void {
  if (!player || reaction === 0) return;
  if ((reaction & 1) !== 0) {
    player.vx = Math.trunc(sinOf(angle) / 16);
    player.vz = Math.trunc(cosOf(angle) / 16);
  }
  if ((reaction & 2) !== 0 && player.hitStun <= 0 && !player.dying) hurtPlayer();
}

/**
 * Buzz takes a blow (the damage path of `FUN_00407150`). One health, a knock
 * into the air, and the reaction timer that plays the animation and keeps a
 * second hit from landing on top of the first. Out of health and he dies
 * instead: the original flips the same timer negative, puts him in animation
 * state 7 and shows the lives counter.
 */
function hurtPlayer(): void {
  if (!player || player.dying) return;
  player.vy = HURT_LIFT;
  player.hitStun = HURT_TICKS;
  if (!pickups) return;
  pickups.health -= 1;
  if (pickups.health >= 0) {
    playEvent(HURT_EVENT, player);
    return;
  }
  pickups.health = 0;
  player.dying = true;
  player.hitStun = 0;
  deathTimer = DEATH_TICKS;
  if (pickups.lives > 0) pickups.lives -= 1;
  playEvent(DEATH_EVENT, player);
}

/**
 * Open the talk box for a hint sign (`FUN_00402610`): find the sign's record
 * for this level, take its path out of the scene, and run the hint script.
 * The text is read from the user's own toy2.exe, never stored here.
 */
function startHintTalk(objectId: number): boolean {
  if (!currentLevel || !exeBytes) return false;
  const level = levelNumber(levels[levelEl.selectedIndex]?.id ?? '') ?? 0;
  const sign = HINT_SIGNS[level]?.find((h) => h.objectId === objectId);
  if (!sign) return false;
  const path = currentLevel.level.paths.find((p) => p.id === sign.pathTag);
  if (!path || path.points.length < 3) return false;

  const S = GAME_UNITS_PER_LEVEL_UNIT;
  let text: string;
  try {
    text = exeString(exeBytes, sign.text);
  } catch {
    return false;
  }
  talk = startTalk(
    TALK_SCRIPT.hint,
    { points: path.points.map((p) => ({ x: p.x * S, y: p.y * S, z: p.z * S })) },
    text,
  );
  // The sign sets Buzz's own heading; the script's face opcode leaves it.
  if (player) player.yaw = sign.playerYaw & 0xfff;
  return true;
}

/** Is this slot already earned? */
function slotDoneNow(slot: number): boolean {
  return !!tasks && (tasks.done & (1 << slot)) !== 0;
}

/** Open a character's dialogue (`FUN_004027f0`). */
function startDialogue(request: import('./sim/tasks.ts').DialogueRequest): void {
  if (!currentLevel || !exeBytes) return;
  const path = currentLevel.level.paths.find((p) => p.id === request.pathTag);
  if (!path || path.points.length < 3) return;
  let text: string;
  try {
    text = exeString(exeBytes, request.text);
  } catch {
    return;
  }
  const S = GAME_UNITS_PER_LEVEL_UNIT;
  talk = startTalk(
    buildDialogueScript(request.pathTag, request.creature, request.playerYaw, request.creatureYaw),
    { points: path.points.map((p) => ({ x: p.x * S, y: p.y * S, z: p.z * S })) },
    text,
    request.slot,
  );
  talkSlot = request.slot;
}

/** Show whatever the talk box has revealed so far. */
/**
 * The talk box, handed to the sprite layer. The panel and its font are the
 * game's own now (docs/HUD.md), so all this does is gather what the painter
 * needs; the prompt is read from the user's executable like every other
 * line of text.
 */
/** What the menu asked for. Everything it offers is something we have. */
function applyMenu(action: ReturnType<typeof stepMenu>): void {
  if (!action) return;
  if (action.kind === 'resume' || action.kind === 'token') return;
  if (action.kind === 'exit') { void togglePlay(); return; }
  if (action.kind === 'camera') {
    cameraPassive = action.passive;
    infoEl.textContent = action.passive ? 'passive camera' : 'active camera';
    saveProgress();
    return;
  }
  // The sliders are ten steps; the original maps them through two tables and
  // hands the result to its mixer. Ours drive the two volumes we have.
  if (sound) sound.volume = (action.sfx / MENU.volumeSteps) * 0.6;
  if (music) music.volume = Math.round((action.bgm / MENU.volumeSteps) * MUSIC_SLIDER_MAX);
  saveProgress();
}

/**
 * Which track the level wants this tick (`FUN_0049eac0`). The "mini-boss
 * timer" it reads is the boss bar's show timer, which each level's tick sets
 * to 90 while its boss fight is on; the "racing" flag is the race counter's
 * timer, set to 5 while the race state is 1 or 2. The test on the state is
 * the engine's own, so a race that has just finished keeps its theme for
 * the five ticks the counter takes to go.
 */
function musicFor(level: number): number | null {
  if (hud.timer[HudElement.Boss]! > 0) return MUSIC.miniboss;
  if (hud.timer[HudElement.TimedRun]! > 0 && tasks && tasks.race >= RaceState.Running) return MUSIC.minirace;
  return trackForLevel(level);
}

/** The pause menu's rows, with the selected one pulsing. */
function menuDraw(): MenuDraw | null {
  if (!menu.open || !exeBytes) return null;
  const { title, items, ys } = menuRows(menu, (address) => exeString(exeBytes!, address));
  const lit = highlight(menu);
  const token = menu.page === MenuPage.Token;
  return {
    title,
    titleY: token ? MENU.tokenTitleY : MENU.titleY,
    // The pause menu's text is yellow; the token screen's is white.
    titleColour: token
      ? [MENU.steady, MENU.steady, MENU.steady]
      : [MENU.steady, MENU.steady, 0],
    rows: items.map((text, i) => ({
      text,
      y: ys[i] ?? 0,
      colour: (i === menu.item
        ? (token ? [lit, lit, lit] : [lit, lit, 0])
        : (token
          ? [MENU.steady, MENU.steady, MENU.steady]
          : [MENU.steady, MENU.steady, 0])) as readonly [number, number, number],
    })),
    hint: token
      ? { text: exeString(exeBytes, MENU_TEXT.jumpToSelect), y: MENU.tokenHintY }
      : null,
    box: token ? MENU.tokenBox : null,
  };
}

function talkDraw(): TalkDraw | null {
  if (!talk) return null;
  return {
    scale: talk.scale,
    rows: talkVisibleRows(talk),
    waiting: talk.phase === BoxPhase.Waiting || talk.phase === BoxPhase.Done,
    prompt: exeBytes ? exeString(exeBytes, TASK_TEXT.pressJump) : '',
  };
}

/**
 * Show the push blocks. The size comes from the block's own collision group,
 * so the stand-in box is at least the shape of the crate it replaces.
 */
function drawPushBlocks(): void {
  if (!viewer) return;
  if (!pushBlocks || !currentCollisionWorld) { viewer.setPushBlocks([]); return; }
  const world = currentCollisionWorld;
  const S = GAME_UNITS_PER_LEVEL_UNIT;
  viewer.setPushBlocks(pushBlocks.blocks.map((b) => {
    let sx = 1, sy = 1, sz = 1;
    const group = world.groups[b.group];
    if (group) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const index of group.polys) {
        for (const v of world.polys[index]!.vertices) {
          minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
          minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
          minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
        }
      }
      if (Number.isFinite(minX)) {
        sx = Math.max(0.05, (maxX - minX) / WORLD_SCALE);
        sy = Math.max(0.05, (maxY - minY) / WORLD_SCALE);
        sz = Math.max(0.05, (maxZ - minZ) / WORLD_SCALE);
      }
    }
    return {
      x: b.x * GAME_TO_RENDER, y: -b.y * GAME_TO_RENDER - sy / 2, z: -b.z * GAME_TO_RENDER,
      sx, sy, sz,
    };
  }));
}

/** As `creatureColour`, but a creature the sim is actually updating shows brighter. */
function liveCreatureColour(c: Creature): number {
  const base = c.health >= 100 ? 0x60d060 : c.record.respawn > 0 ? 0xe04040 : 0xa0a0a0;
  return (c.flags & CREATURE_FLAGS.near) !== 0 ? base : ((base >> 1) & 0x7f7f7f);
}

/** Show every token, as if all five tasks were done. For the harness and for looking around. */
function revealAllTokens(): void {
  if (!pickups) return;
  for (let slot = 0; slot < 5; slot++) revealToken(pickups, slot);
  drawPickups();
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
/** The effect pool, or null before a level is up. */
let effects: EffectSim | null = null;
/** This frame's effect cards, rebuilt each tick. */
const effectCards: WorldSprite[] = [];
const effectFlat: WorldSprite[] = [];
/**
 * Which room the level scripts think Buzz is in. Stepped right after the
 * camera moves, because the engine reads it from where the camera ended up
 * (docs/LEVELS.md "Zones").
 */
const zones: ZoneState = createZones();
/**
 * The room the render pass records but never walks into, whose rectangles
 * the backdrop is drawn through instead (`FUN_0043f3d0`'s zone 0xf test).
 * Level 7 is the one that holds a room out this way.
 */
const BACKDROP_ZONE: Record<number, number | undefined> = { 7: 0xf };
/** `FUN_00440f70`'s `case 0xe`: level 14's fog band, level units. */
const FOG_BY_LEVEL: Record<number, readonly [number, number] | undefined> = { 14: [24000, 46000] };
/** The clear colour `DAT_00559e84` (0x20 a channel) halved, as the pass builds it. */
const FOG_COLOUR = 0x101010;
/** What the portal walk saw last frame, and the set it produced. */
let walkRects: Map<number, Rect> = new Map();
let walkKey = '';
/**
 * Whether play draws only the rooms the portal walk can see. OFF by default,
 * and not because the walk is wrong: every object's room comes from matching
 * `.ngn` scene instances to `level.dat` objects by position, and on the
 * objects that can be checked against the zone floor beneath them that
 * matching disagrees on 5.7% of level 1's and 28% of level 2's. A room label
 * that is wrong is a piece of scenery that vanishes, measured at up to 2.8%
 * of the frame. `ts2.zoneCulling(true)` turns it on to look; turning it on
 * for good waits on the object-to-room matching (docs/FORMATS.md).
 */
let zoneCulling = false;
/** The camera cut and the scripted camera it drives (docs/CAMERA.md "Cuts"). */
const cut: CutState = createCut();
/** What a level tick may do with the cut; the objects are the live ones. */
const cutHandle = {
  start(look: { x: number; y: number; z: number }, ticks: number, distance: number) {
    if (player) startCut(cut, look, ticks, distance, player);
  },
  get ticks() { return cut.ticks; },
  get eye() { return cut.eye; },
  set eye(v: { x: number; y: number; z: number }) { cut.eye = v; },
  get look() { return cut.look; },
  set look(v: { x: number; y: number; z: number }) { cut.look = v; },
};
/** The pause menu (docs/HUD.md, src/sim/menu.ts). */
const menu: MenuState = createMenu();
/**
 * The detail option (`DAT_00508d74`, default 1) and the row actually drawn
 * this frame, which a level's render pass can raise to 2 (docs/FORMATS.md).
 * Null draws both lists everywhere and turns the forcing off.
 */
let detailOption: number | null = 1;
let detailNow: number | null = 1;
/** Which camera the menu last chose. Passive means the buttons turn it. */
let cameraPassive = false;
/** The save record (docs/FORMATS.md "The save file"), once a directory is open. */
let progress: Progress | null = null;
/** The install, kept for the cutscenes, which are read only when played. */
let gameFiles: GameDir | null = null;
/** A movie is over the page: the game does not tick under it. */
let cutsceneUp = false;
/** The most recent movie's handle, for a test to watch it decode. */
let lastCutscene: ReturnType<typeof playCutscene> | null = null;

/** The install's file for a movie index, or null when the install lacks it. */
function movieFile(index: number): GameFile | null {
  const name = MOVIES[index];
  if (!name || !gameFiles) return null;
  return gameFiles.get(`rtlibs/${name.toLowerCase()}.dll`) ?? null;
}

/** Play a movie over the page and wait for it. Resolves 'missing' without one. */
async function playMovie(index: number, options: { audio?: boolean; decodeFirstFrame?: boolean } = {}): Promise<'ended' | 'skipped' | 'failed' | 'missing'> {
  const file = movieFile(index);
  if (!file) return 'missing';
  cutsceneUp = true;
  music?.disable();
  try {
    const handle = playCutscene(file, document.body, options);
    lastCutscene = handle;
    return await handle.done;
  } finally {
    cutsceneUp = false;
    if (viewer?.playMode) music?.start();
  }
}

/** The boot: tt, dlogo, acti in the game flow's order; a skip ends the chain. */
async function playBoot(): Promise<void> {
  for (const index of BOOT_MOVIES) {
    const how = await playMovie(index);
    if (how === 'skipped') break;
  }
}

/**
 * `FUN_0049eb20(n, mode, force)`: a level's movie by play position, shown
 * once unless forced, and the save remembers. The intro plays the first time
 * a level is entered; the boss movie plays on the boss's fall, forced.
 */
async function playLevelMovie(playPosition: number, force: boolean): Promise<void> {
  if (!progress) return;
  if (progress.p.shown[playPosition] && !force) return;
  progress.p.shown[playPosition] = true;
  saveProgress();
  await playMovie(playPosition + MOVIE_FLAG.base);
}

/** Push the record's option bytes into the menu, the camera and the mixers. */
function applyProgressOptions(): void {
  if (!progress) return;
  const p = progress.p;
  menu.sfx = Math.min(MENU.volumeSteps, p.sfx);
  menu.bgm = Math.min(MENU.volumeSteps, p.bgm);
  cameraPassive = !p.activeCamera;
  if (sound) sound.volume = (menu.sfx / MENU.volumeSteps) * 0.6;
  if (music) music.volume = Math.round((menu.bgm / MENU.volumeSteps) * MUSIC_SLIDER_MAX);
}

/**
 * Copy what play has changed into the record and keep it: lives and health
 * from the pickups, the select cursor from the level. Called on a token, on
 * a menu change and on leaving play, which is often enough for a record the
 * original only writes on the way out of a level.
 */
function saveProgress(): void {
  if (!progress) return;
  const p = progress.p;
  if (pickups) { p.lives = pickups.lives; p.health = pickups.health; }
  const level = levelNumber(levels[levelEl.selectedIndex]?.id ?? '') ?? 0;
  const cursor = selectIndexOf(level);
  if (cursor >= 0) p.level = cursor;
  p.sfx = menu.sfx;
  p.bgm = menu.bgm;
  p.activeCamera = !cameraPassive;
  commitProgress(progress);
}

/**
 * A boss level's own init (level 6's `FUN_0041ffb0`): the boss is turned to
 * face the arena, pushed along x, given a home box big enough to roam, and
 * marked with the flag bit the level sets. Only the levels with a
 * `bossFight` have one.
 */
function startBossFight(level: number): void {
  const fight = LEVEL_TASKS[level]?.bossFight;
  if (!fight || !creatureSim || !tasks) return;
  const boss = creatureSim.creatures.find((c) => c.slot === fight.creature);
  if (!boss) return;
  boss.heading = fight.start.heading;
  boss.wantYaw = fight.start.heading;
  boss.flags |= fight.start.flags;
  boss.x += fight.start.pushX;
  boss.homeX = boss.x;
  boss.record.rangeX = fight.start.range;
  boss.record.rangeZ = fight.start.range;
  tasks.bossHealthWas = boss.health;
  tasks.bossSwing = fight.swing;
  tasks.bossClock = fight.clock;
}

/**
 * Beating a world boss writes bit 7 of that level's token byte, which is the
 * bit the save decode found set on every level of a played file and could
 * not account for (docs/FORMATS.md). The completed byte beside it is written
 * by the level-exit flow, which the port does not have.
 */
function recordBossBeaten(level: number): void {
  if (!progress || level < 1 || level > 15) return;
  if ((progress.p.tokens[level] ?? 0) & 0x80) return;
  progress.p.tokens[level] = (progress.p.tokens[level] ?? 0) | 0x80;
  saveProgress();
}

/** A power-up earned from Mr Potato Head: its bit in the record. */
function recordPowerUp(): void {
  if (!progress || !tasks) return;
  if ((progress.p.powerUps & tasks.powerUps) === tasks.powerUps) return;
  progress.p.powerUps |= tasks.powerUps;
  saveProgress();
}

/** A token taken on this level: its bit in the level's byte, and the fiftieth sets the flag. */
function recordToken(slot: number): void {
  if (!progress || slot < 0) return;
  const level = levelNumber(levels[levelEl.selectedIndex]?.id ?? '') ?? 0;
  if (level < 1 || level > 15) return;
  progress.p.tokens[level] = (progress.p.tokens[level] ?? 0) | (1 << slot);
  if (tokenCount(progress.p) >= 50) progress.p.allTokens = true;
  saveProgress();
}

/** Hand the player a Toy200.sav of their progress, through the browser's download. */
function downloadSave(): void {
  if (!progress) return;
  saveProgress();
  const bytes = exportProgress(progress);
  const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Toy200.sav';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  infoEl.textContent = `Toy200.sav: ${bytes.length} bytes, ${tokenCount(progress.p)}/50 tokens, ${progress.p.lives} lives`;
}
/** Menu buttons seen this frame, cleared as the menu reads them. */
let menuPress: MenuInput = { up: false, down: false, left: false, right: false, select: false, back: false };
/** Effects, read from the install. Silent until play starts. */
let sound: SoundBank | null = null;
let music: MusicPlayer | null = null;
/** The talk box in progress, if any. Buzz is frozen while it is up. */
let talk: TalkState | null = null;
/** The level's push blocks, once the player has spawned. */
let pushBlocks: PushState | null = null;
/** Which token tasks are done, and the talkers' timers. */
let tasks: TaskState | null = null;
/** The slot the talk box will reveal when it closes, or -1. */
let talkSlot = -1;
/** Slots whose token has already been put in the world this level. */
let revealedSlots = new Set<number>();
/** toy2.exe, kept because the hint text lives inside it. */
let exeBytes: Uint8Array | null = null;
/** The level's sprite table, read from the user's own toy2.exe. */
let spriteTable: readonly (SpriteHeader | null)[] = [];
/** What each sound event number plays on this level, also from the exe. */
let soundTable: SoundTable | null = null;
/** The last few events raised, for the headless harness. */
const soundLog: string[] = [];
/** Ticks left of the death animation before Buzz is put back. */
let deathTimer = 0;

/** A blow costs one health and holds Buzz for this long. */
const HURT_TICKS = 0x5a;
/** How hard it throws him upward. +Y is down. */
const HURT_LIFT = -0x200;
/** The death animation runs for the same span before the level puts him back. */
const DEATH_TICKS = 0x5a;
/** The sound a blow makes, and the one dying makes. */
const HURT_EVENT = 0x1a;
const DEATH_EVENT = 0x15;
/** The decoded texture sheets, as canvases the HUD's 2D context can blit. */
let sceneSheets = new Map<number, Sheet>();
let hud: HudState = createHud();
let hudPainter: HudPainter | null = null;
/** Each coin's floor height in level units, for its shadow. */
let pickupFloor: number[] = [];
/** How far each class object has turned, in the engine's 4,096-per-turn angles. */
let pickupAngles: [number, number, number][] = [];
const pickupAngleMap = new Map<number, readonly [number, number, number]>();
/** Rebuilt every tick: the coins and the shadows under them. */
const coinCards: WorldSprite[] = [];
const coinShadows: WorldSprite[] = [];
/** What the counters were when the status line last showed them. */
let hudWas = { lives: -1, health: -1, coins: -1, found: -1 };
let pickups: PickupState | null = null;
/** Last frame's jump and fire, so the box sees presses rather than holds. */
let talkHeld = { jump: false, fire: false };
/** Enter pressed while a box is open: it pages the box instead of leaving play. */
let talkEnter = false;
/** What the status line last showed of the counters, so hits refresh it. */
let lastShown = { health: -1, lives: -1 };
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
    // The engine picks the track from the level every tick; here the level
    // only changes on a load, so asking once when play starts is the same.
    music?.start();
    music?.want(trackForLevel(levelNumber(levels[levelEl.selectedIndex]?.id ?? '') ?? 0));
  } else {
    input.detach();
    sound?.stop();
    music?.disable();
    saveProgress();
    // Give the whole level back to the inspection view.
    walkKey = '';
    walkRects = new Map();
    viewer.setVisibleZones(null);
    // Nothing drives the HUD outside play, so take it off the screen.
    hudPainter?.clear();
    viewer.setWorldCards([], []);
  }
}

/**
 * One frame of play. `override` and `bearing` exist for the headless harness,
 * which cannot press keys: they stand in for the pad and for the camera's
 * bearing that the stick is measured against.
 */
function playTick(override?: Partial<PlayerInput>, bearing?: number): void {
  if (!viewer || !player || !playerRuntime || !currentCollisionWorld) return;

  if (cutsceneUp) return;
  if (player.fellOut) { void respawn(); return; }
  const levelNow = levelNumber(levels[levelEl.selectedIndex]?.id ?? '') ?? 0;
  if (player.dying) {
    // Dying takes control away, not physics: the original sets its "no player
    // control" flag and the rest of the tick carries on, so Buzz falls and
    // slides to a stop while the animation plays.
    deathTimer -= 1;
    if (deathTimer <= 0) { void respawn(); return; }
  }
  // The camera's bearing to the player, taken from the sim camera rather than
  // the rendered one, so the controls do not depend on how the view is drawn.
  const cameraYaw = bearing ?? (camera ? yawOf(player.x - camera.x, player.z - camera.z) : 0);
  let held = override ? { ...input.read(), ...override } : input.read();
  if (player.dying) held = { ...held, moveX: 0, moveY: 0, jump: false, spin: false, fire: false };
  // The script tick feeds a running cut before anything moves, and a cut is
  // the engine's "no player control" bit as much as a talk is.
  stepCutClock(cut);
  if (cut.noControl) held = { ...held, moveX: 0, moveY: 0, jump: false, spin: false, fire: false };

  // A talk freezes Buzz and takes the camera: the engine sets its "no player
  // control" bit and drives the camera from the talk script rather than the
  // follow camera (docs/LEVELS.md). Everything else still ticks.
  if (talk) {
    const pressed = { jump: (held.jump && !talkHeld.jump) || talkEnter, fire: held.fire && !talkHeld.fire };
    talkHeld = { jump: held.jump, fire: held.fire };
    talkEnter = false;
    const request = stepTalk(talk, pressed);
    if (request.moveTo) {
      // The script teleports him to a path node; the engine then drops a
      // ground ray so he stands on the floor rather than at the node's height.
      const S = GAME_UNITS_PER_LEVEL_UNIT;
      player.x = request.moveTo.x;
      player.z = request.moveTo.z;
      const floor = groundBelow(currentCollisionWorld, player.x / S, request.moveTo.y / S, player.z / S);
      player.y = floor ? floor.y * S : request.moveTo.y;
      player.vx = 0; player.vy = 0; player.vz = 0;
      resetZones(zones);
    }
    if (request.faceYaw !== null) player.yaw = request.faceYaw;
    if (request.creature && creatureSim) {
      const c = creatureSim.creatures.find((q) => q.slot === request.creature!.index);
      if (c) {
        if (request.creature.moveTo) {
          c.x = request.creature.moveTo.x;
          c.y = request.creature.moveTo.y;
          c.z = request.creature.moveTo.z;
          c.vx = 0; c.vy = 0; c.vz = 0;
        }
        if (request.creature.faceYaw !== null) {
          c.heading = request.creature.faceYaw;
          c.wantYaw = request.creature.faceYaw;
        }
      }
    }
    for (const effect of talk.sounds) sound?.play(effect);
    talk.sounds.length = 0;
    viewer.setPlayerTransform(
      player.x * GAME_TO_RENDER, -player.y * GAME_TO_RENDER, -player.z * GAME_TO_RENDER,
      Math.PI - toRadians(player.yaw),
    );
    {
      // The follow camera is not stepped under a box here (the engine does,
      // so it has somewhere fresh to blend back to; ours blends back to
      // where it was left, which is close by).
      const followLook = camera ? cameraTarget(player, camera) : talk.look;
      const shown = stepCutCamera(cut, { eye: camera ?? talk.eye, look: followLook }, { eye: talk.eye, look: talk.look });
      viewer.placeCamera(
        shown.eye.x * GAME_TO_RENDER, -shown.eye.y * GAME_TO_RENDER, -shown.eye.z * GAME_TO_RENDER,
        shown.look.x * GAME_TO_RENDER, -shown.look.y * GAME_TO_RENDER, -shown.look.z * GAME_TO_RENDER,
      );
    }
    if (talk.finished) {
      // The box has shut: the camera eases back over 64 ticks.
      releaseToFollow(cut);
      // A dialogue's last argument is the slot it earns: mark it done and
      // put its token in the world (`FUN_004a0db0`).
      if (talkSlot >= 0 && tasks && pickups) {
        markSlotDone(tasks, talkSlot);
        revealedSlots.add(talkSlot);
        revealToken(pickups, talkSlot);
        drawPickups();
        infoEl.textContent = `pizza planet token ${talkSlot + 1} of 5`;
      }
      talkSlot = -1;
      talk = null;
      // Hand the camera back where it is, so it eases rather than snapping.
      if (camera && player) camera = createCamera(player);
    }
    // The world and the HUD keep drawing under the box; the HUD slides out
    // of the way on its own, which is what `talking` does to its phases.
    drawCoins();
    drawHud(levelNow);
    return;
  }

  // The pause menu freezes the game under it, the way the original's does.
  if (menu.open) {
    const action = stepMenu(menu, menuPress);
    menuPress = { up: false, down: false, left: false, right: false, select: false, back: false };
    for (const event of menu.events) playEvent(event);
    if (action) applyMenu(action);
    drawCoins();
    drawEffects();
    drawHud(levelNow);
    return;
  }

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
    stepCamera(camera, player, currentCollisionWorld, held, { passive: cameraPassive });
    // The zones come off the camera's new position, which is the order the
    // engine runs them in: the render pass sets both from the camera, and
    // the level ticks read them afterwards.
    if (currentCollision && currentLevel) {
      stepZones(zones, currentCollision, currentLevel.level.zones, camera, player, {
        level: levelNow, blending: cut.zoneBlend > 0,
      });
    }
    // The far detail row where the level's render pass asks for it.
    if (detailOption !== null) {
      const row = detailRowFor(detailOption, levelNow, zones, player);
      if (row !== detailNow) { detailNow = row; viewer.setDetail(row); }
    }
    // Which rooms are on screen (docs/LEVELS.md "The portal walk"). The
    // engine runs this in the render pass right after the zones, from the
    // camera's zone outward, and only draws what comes back.
    const followLook = cameraTarget(player, camera);
    // A running cut, or the ease back after one, is what the renderer sees.
    const shown = stepCutCamera(cut, { eye: camera, look: followLook }, null);
    const look = shown.look;
    if (currentLevel && zoneCulling && zones.camera < 0 && walkKey !== 'all') {
      // Over no floor at all: the engine has no room to start from, so draw
      // the level whole rather than guess.
      walkKey = 'all';
      walkRects = new Map();
      viewer.setVisibleZones(null);
    } else if (currentLevel && zones.camera >= 0 && zoneCulling) {
      const seen = walkPortals(
        currentLevel.level.zones, zones.camera,
        basisFromCamera(shown.eye, look),
        { backdropZone: BACKDROP_ZONE[levelNow] ?? null, alsoFrom: zones.floor },
      );
      walkRects = seen;
      const key = [...seen.keys()].sort((a, b) => a - b).join(',');
      if (key !== walkKey) {
        walkKey = key;
        viewer.setVisibleZones(new Set(seen.keys()));
      }
    }
    viewer.placeCamera(
      shown.eye.x * GAME_TO_RENDER, -shown.eye.y * GAME_TO_RENDER, -shown.eye.z * GAME_TO_RENDER,
      look.x * GAME_TO_RENDER, -look.y * GAME_TO_RENDER, -look.z * GAME_TO_RENDER,
    );
  }
  for (const effect of player.sounds) sound?.play(effect);
  // Events carry their own volume and sustained flag out of the level's sound
  // table, which is what lets the spin's whine and whirl hold rather than
  // restart every tick.
  for (const event of player.events) playEvent(event, player);

  if (pushBlocks && currentCollisionWorld) {
    const busy = player.spin !== 0 || player.laser !== 0 || player.hitStun > 0
      || player.jumpState !== 0 || !!talk;
    const push = stepPushBlocks(pushBlocks, {
      x: player.x, y: player.y, z: player.z, yaw: player.yaw,
      onGround: player.onGround, busy, contacts: player.contacts,
    }, Math.hypot(held.moveX, held.moveY) > 0);
    for (const move of push.moved) {
      const block = pushBlocks.blocks[move.index];
      if (block && block.group >= 0) {
        moveCollisionGroup(currentCollisionWorld, block.group, move.dx, move.dy, move.dz);
      }
    }
    if (push.playerVelocity) {
      player.vx = push.playerVelocity.x;
      player.vz = push.playerVelocity.z;
    }
    for (const effect of pushBlocks.sounds) sound?.play(effect);
    if (push.moved.length > 0) drawPushBlocks();
  }

  // The level's talkers. Only while nothing else is being said.
  if (creatureSim && tasks && !talk && exeBytes) {
    const level = levelNow;
    const table = LEVEL_TASKS[level];
    if (table) {
      const request = stepTasks(
        tasks, table,
        (index) => creatureSim!.creatures.find((c) => c.slot === index),
        {
          coins: pickups?.coins ?? 0,
          found: LEVEL_TASKS[level]?.findFive?.countedBy === 'pickup'
            ? (pickups?.itemsFound ?? 0)
            : creatureSim.foundCount,
          rand: creatureSim.rand,
          // `DAT_0050a1f8`: a task that has just been accepted waits for the
          // box to close before its clock starts.
          talking: talk !== null,
          x: player.x, y: player.y, z: player.z, level,
          items: pickups?.itemsFound ?? 0,
          tokens: pickups?.tokens ?? 0,
          cameraZone: zones.camera,
          playerZone: zones.player,
          onGround: player.onGround,
          pathPoints: (tag) => currentLevel?.level.paths.find((p) => p.id === tag)?.points ?? null,
          cameraYaw: camera?.yaw ?? 0,
          cut: cutHandle,
          sound: (event: number, at: { x: number; y: number; z: number } | null) =>
            playEvent(event, at ?? undefined),
          // The boss throws dust off its feet; the effect pool does the rest.
          effect: (x: number, y: number, z: number, kind: number, mode: number, spin?: number) => {
            if (!effects || !camera) return;
            const e = spawnChild(effects, effectWorld(), x, y, z, kind, mode);
            if (e && spin !== undefined) e.spin = spin - 0x80;
          },
          groundAt: (x: number, z: number, y: number) => {
            if (!currentCollisionWorld) return null;
            const u = GAME_UNITS_PER_LEVEL_UNIT;
            const hit = groundBelow(currentCollisionWorld, x / u, y / u, z / u);
            return hit ? hit.y * u : null;
          },
          dust: (x, y, z) => {
            if (!effects || !camera) return;
            const off = (effects.rand.byte() - 0x80) * 0x20;
            effects.rand.byte();
            spawnChild(effects, effectWorld(), x + off, y, z + off, 0x35, 4);
          },
        },
      );
      if (request) startDialogue(request);
      // Mr Potato Head hands the power-up back inside that step.
      recordPowerUp();
      if (tasks.bossBeaten) { recordBossBeaten(level); tasks.bossBeaten = false; }
      if (tasks.levelWon) {
        tasks.levelWon = false;
        infoEl.textContent = 'the boss is beaten';
        // Forced: the boss movie plays every time the boss falls.
        void playLevelMovie(selectIndexOf(level) + 1, true);
      }
      // The boss token is awarded by the creature handler partway through
      // its death, so pick that up here too.
      if (creatureSim.bossSlotEarned && !slotDoneNow(4)) markSlotDone(tasks, 4);
      // A slot the race awarded has no dialogue to close, so reveal here.
      for (let slot = 0; slot < 5; slot++) {
        if (pickups && (tasks.done & (1 << slot)) !== 0 && !revealedSlots.has(slot)) {
          revealedSlots.add(slot);
          revealToken(pickups, slot);
          drawPickups();
          infoEl.textContent = `pizza planet token ${slot + 1} of 5`;
        }
      }
    }
  }

  if (creatureSim) {
    creatureSim.raceState = tasks?.race ?? 0;
    stepCreatures(creatureSim, player);
    for (const touch of contactCreatures(creatureSim, player, attackFromPlayer(player))) {
      applyCreatureTouch(touch.angle, touch.reaction);
    }
    for (const raised of creatureSim.sounds) {
      playEvent(raised.event, raised);
    }
    creatureSim.sounds.length = 0;
    spawnCreatureEffects();
    drawCreatures();
  }

  // Buzz's laser, and then the pool that carries it (docs/EFFECTS.md).
  if (player.laserFired !== null) fireLaser(player.yaw);
  stepEffectsNow();

  if (pickups) {
    const taken = stepPickups(pickups, player);
    // PICKUP1 is the engine's own name for a collect; which of PICKUP1 and
    // PICKUP5 belongs to which collectible is in the sound EVENT table, which
    // is not ported (docs/PLAYER.md).
    // The object with no category is Mr Potato Head's missing part: picking
    // it up flips his part state negative, which is how he knows Buzz has it.
    if (tasks && tasks.potatoPart > 0 && taken.some((t) => t.kind === PickupKind.None)) {
      tasks.potatoPart = -tasks.potatoPart;
      infoEl.textContent = "you picked up mr potato head's missing part";
    }
    // Walking into a Pizza Planet token brings up the screen that asks
    // whether to keep playing or leave (docs/HUD.md).
    const token = taken.find((t) => t.kind === PickupKind.Token);
    if (token) {
      const item = pickups.items[token.index];
      openTokenScreen(menu, item?.tokenSlot ?? -1);
      recordToken(item?.tokenSlot ?? -1);
      playEvent(0x33, player);
    }
    // A hint sign is reported but never consumed; touching one opens its box.
    const sign = taken.find((t) => t.kind === PickupKind.HintSign);
    if (sign && !talk) startHintTalk(pickups.items[sign.index]!.id);
    if (taken.some((t) => t.kind !== PickupKind.HintSign)) sound?.play('PICKUP1');
    // Anything consumed stops being drawn by the level mesh.
    if (taken.some((t) => t.kind !== PickupKind.HintSign)) drawPickups();
    // The status line still carries the counters until there is a real
    // pause screen; the HUD shows them too, but only for a few seconds.
    const hurt = pickups.health !== lastShown.health || pickups.lives !== lastShown.lives;
    if (taken.length > 0 || hurt) {
      lastShown = { health: pickups.health, lives: pickups.lives };
      const slots = [0, 1, 2, 3, 4].filter((s) => pickups!.tokens & (1 << s)).length;
      infoEl.textContent = `coins ${pickups.coins}  health ${pickups.health}/14  lives ${pickups.lives}  tokens ${slots}/5`;
    }
  }
  drawCoins();
  drawEffects();
  drawHud(levelNow);
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
  const died = player.dying;
  Object.assign(player, createPlayer(back.x, back.y, back.z, safe.yaw));
  playerRuntime = createRuntime();
  // The engine's own player reset fills the health bar back up.
  if (pickups) pickups.health = PICKUP.healthMax;
  if (camera) camera = createCamera(player);
  infoEl.textContent = died
    ? 'out of health — put back where you last stood'
    : 'fell out of the level — put back where you last stood';
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
  // The level's intro, the first time it is played (docs/FORMATS.md "The
  // cutscenes"): movies go by PLAY position, which the select order gives.
  const position = selectIndexOf(levelNumber(levels[levelEl.selectedIndex]?.id ?? '') ?? 0) + 1;
  if (position > 0) await playLevelMovie(position, false);
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
  // While the pause menu is up it owns the keyboard, and the game under it
  // is frozen. Escape opens it and backs out of it; "exit level" is how you
  // leave play, which is what the original's menu does too.
  if (menu.open) {
    const k = ev.key;
    if (k === 'ArrowUp' || k === 'w') menuPress = { ...menuPress, up: true };
    else if (k === 'ArrowDown' || k === 's') menuPress = { ...menuPress, down: true };
    else if (k === 'ArrowLeft' || k === 'a') menuPress = { ...menuPress, left: true };
    else if (k === 'ArrowRight' || k === 'd') menuPress = { ...menuPress, right: true };
    else if (k === 'Enter' || k === ' ') menuPress = { ...menuPress, select: true };
    else if (k === 'Escape') menuPress = { ...menuPress, back: true };
    else return;
    ev.preventDefault();
    return;
  }
  if (ev.key === 'Escape' && viewer.playMode) {
    openMenu(menu);
    ev.preventDefault();
    return;
  }
  if (ev.key === 'Enter') {
    // Enter belongs to the GAME while play is on: it pages a text box, and
    // otherwise does nothing. It used to fall through to leaving play, which
    // meant that pressing it once more after a box closed dropped you out of
    // a race that was already running. Escape is the way out now.
    if (viewer.playMode) {
      if (talk) talkEnter = true;
      return;
    }
    void togglePlay();
    return;
  }

  if (ev.key === 'm' && sound) {
    sound.volume = sound.volume > 0 ? 0 : 0.6;
    infoEl.textContent = sound.volume > 0 ? 'sound on' : 'sound muted';
    return;
  }
  if (ev.key === 'n' && music) {
    // The options slider is 0..64 and its curve is the engine's own.
    music.volume = music.volume > 0 ? 0 : 40;
    infoEl.textContent = music.volume > 0
      ? `music on${music.currentName ? `: ${music.currentName}` : ''}`
      : 'music muted';
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
