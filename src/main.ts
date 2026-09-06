import { GroupType, buildMeshData, parseAll, readHitShapes, type AllFile } from './formats/all.ts';
import {
  DEFAULT_ANIMATION_FPS, buildPosedMeshData, parseAnm,
  type AnmFile, type Animation,
} from './formats/anm.ts';
import * as THREE from 'three';
import { WORLD_SCALE, buildLevelGeometry, objectFaceCount, parseDat, reachableZones, type DatLevel } from './formats/dat.ts';
import { decodeBmp, parseNgn, type NgnTexture } from './formats/ngn.ts';
import { assignZones, parseNgnScene } from './formats/ngnscene.ts';
import {
  buildCollisionWorld, collisionGroupByObject, groundBelow, moveCollisionGroup, parseCollision,
  type CollisionGroup, type CollisionWorld,
} from './formats/collision.ts';
import {
  findLevels, findModels, gameDirFromDrop, gameDirFromFileList, pickGameDir,
  supportsDirectoryPicker, validateGameDir, type GameDir,
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
import { SoundBank, PLAYER_EFFECTS } from './audio/sfx.ts';
import { MUSIC_TRACKS, MusicPlayer, trackForLevel } from './audio/music.ts';
import { createPickups, PickupKind, revealToken, stepPickups, type PickupState } from './sim/pickups.ts';
import {
  exeString, HINT_SIGNS, levelNumber, PUSH_BLOCKS, SPAWN_TABLE, TALK_SCRIPTS, tokenSlotsAtStart,
} from './sim/level-data.ts';
import { createPushBlocks, stepPushBlocks, type PushState } from './sim/push-blocks.ts';
import {
  BoxPhase, TALK_SCRIPT, buildDialogueScript, startTalk, stepTalk, talkVisibleRows,
  type TalkState,
} from './sim/talk.ts';
import { LEVEL_TASKS } from './sim/level-data.ts';
import { createTasks, markSlotDone, startLevelTasks, stepTasks, type TaskState } from './sim/tasks.ts';
import { unpackRaw } from './formats/rnc.ts';
import {
  CREATURE_LIST_TYPE, parseCreatureList, parseCreatureModels, parseCreatureNames,
  type CreaturePlacement,
} from './formats/creatures.ts';
import { AI_SCRIPTS } from './sim/creature-data.ts';
import {
  RandomStream, attackFromPlayer, contactCreatures, createCreatureSim,
  creatureWorldFromCollision, setCreatureModels, stepCreatures,
  CREATURE_FLAGS, type Creature, type CreatureModel, type CreatureSim,
} from './sim/creatures.ts';
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
const talkEl = $<HTMLDivElement>('talk');
const talkTextEl = $<HTMLParagraphElement>('talktext');
const talkHintEl = $<HTMLSpanElement>('talkhint');
const texturesEl = $<HTMLDivElement>('textures');

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
  creatureSim = null;
  pushBlocks = null;
  tasks = null;
  talk = null;
  talkEl.hidden = true;
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
          zones = assignZones(
            parsed.objects.map((o) => ({ ...o, faceCount: objectFaceCount(parsed, o) })),
            parseNgnScene(sceneBytes),
          );
        } catch { /* no zones: the level still draws, just all at once */ }
      }
      currentLevel = { level: parsed, zones };
      const geometry = buildLevelGeometry(parsed, { zones });

      setStatus(`${level.id}: uploading ${geometry.triangleCount} triangles\u2026`);
      await yieldToBrowser();
      // tex14 is the environment map the reflection pass uses; every level's
      // .ngn carries one under that name (docs/FORMATS.md).
      const reflectionSlot = textureList.find((t) => t.tag === 'tex14')?.slot ?? null;
      viewer.setLevel(geometry, gpuTextures, reflectionSlot === null ? undefined : gpuTextures.get(reflectionSlot));

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
            pc: c.pc, wait: c.wait, animState: c.animState, frame: c.frame >>> 16,
            homeX: c.homeX, homeZ: c.homeZ,
            targetX: c.targetX, targetZ: c.targetZ,
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
        const want = trackForLevel(level);
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
        return { id: item.id, of: signs.length, x: player.x, y: player.y, z: player.z };
      },
      /** Move the player straight to a spot, for tests that need a route. */
      setPlayerPos(x: number, z: number, y?: number) {
        if (!player) return null;
        player.x = x; player.z = z;
        if (y !== undefined) player.y = y;
        player.vx = 0; player.vz = 0;
        return { x: player.x, y: player.y, z: player.z };
      },
      get tasks() {
        return tasks ? {
          done: tasks.done, hintIndex: tasks.hintIndex,
          boss: tasks.boss, potatoPart: tasks.potatoPart, powerUps: tasks.powerUps,
          race: tasks.race, laps: tasks.laps, quadrant: tasks.raceQuadrant,
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
        return { slot, x: player.x, y: player.y, z: player.z };
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

  tasks = createTasks();
  startLevelTasks(tasks, level);
  revealedSlots = new Set();
  pickups = createPickups(currentLevel.level, level);
  for (const slot of tokenSlotsAtStart(level)) revealToken(pickups, slot);
  drawPickups();
  spawnPoint = { x: player.x, y: player.y, z: player.z };
  const slope = (Math.acos(Math.min(1, -ground.normal.y)) * 180) / Math.PI;
  infoEl.textContent =
    `${entry.name} standing on floor ${(ground.y / WORLD_SCALE).toFixed(2)} ` +
    `(${slope.toFixed(0)}\u00b0 slope), ${fromTable ? "the level's own start point" : `${area} cells of floor to walk on`}. Enter to play.`;
}

/** Hand the viewer the pickups that are currently visible. */
function drawPickups(): void {
  if (!viewer || !pickups) return;
  const S = GAME_UNITS_PER_LEVEL_UNIT;
  viewer.setPickups(pickups.items.filter((i) => i.enabled).map((i) => ({
    x: i.x * S * GAME_TO_RENDER, y: -i.y * S * GAME_TO_RENDER, z: -i.z * S * GAME_TO_RENDER,
    colour: PICKUP_COLOURS[i.kind] ?? 0x9a9a9a,
  })));
  pickupDrawIndex = pickups.items.map((i) => (i.enabled ? 0 : -1));
  for (let i = 0, n = 0; i < pickupDrawIndex.length; i++) if (pickupDrawIndex[i] === 0) pickupDrawIndex[i] = n++;
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
      const key = `${c.animState}:${frame}`;
      if (creaturePosed.get(c.slot) === key) continue;
      creaturePosed.set(c.slot, key);
      viewer.setCreatureMesh(
        c.slot,
        buildPosedMeshData(art.model, art.anm, animation, frame),
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
  if ((reaction & 2) !== 0 && player.hitStun <= 0) {
    player.hitStun = 90;
    player.vy = -0x200;
    if (pickups && pickups.health > 0) pickups.health -= 1;
  }
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
function drawTalk(): void {
  if (!talk) { talkEl.hidden = true; return; }
  talkEl.hidden = false;
  talkEl.style.setProperty('--talk-scale', String(Math.max(0.04, talk.scale / 0x1000)));
  talkTextEl.replaceChildren();
  for (const row of talkVisibleRows(talk)) {
    const line = document.createElement('span');
    // A `^...^` pair in the string is the game's own highlight.
    let run = '';
    let marked = row.marks[0] ?? false;
    const flush = () => {
      if (!run) return;
      const part = document.createElement('span');
      if (marked) part.className = 'mark';
      part.textContent = run;
      line.append(part);
      run = '';
    };
    for (let i = 0; i < row.text.length; i++) {
      const m = row.marks[i] ?? false;
      if (m !== marked) { flush(); marked = m; }
      run += row.text[i];
    }
    flush();
    line.append('\n');
    talkTextEl.append(line);
  }
  talkHintEl.textContent = talk.phase === BoxPhase.Waiting || talk.phase === BoxPhase.Done
    ? 'press jump to continue'
    : '';
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
let pickups: PickupState | null = null;
/** Drawn instance for each pickup, or -1 for one that is not drawn (hidden tokens, spares). */
let pickupDrawIndex: number[] = [];
let pickupSpin = 0;
/** Last frame's jump and fire, so the box sees presses rather than holds. */
let talkHeld = { jump: false, fire: false };
/** Stand-in colours: coins gold, tokens red, health green, lives blue, the rest grey. */
const PICKUP_COLOURS: Partial<Record<PickupKind, number>> = {
  [PickupKind.Coin]: 0xffd24a,
  [PickupKind.Token]: 0xe0312d,
  [PickupKind.Health]: 0x4fd65a,
  [PickupKind.Life]: 0x4a8cff,
  [PickupKind.HintSign]: 0x303030,
  [PickupKind.RocketBoots]: 0xff8c1a,
  [PickupKind.HoverBoots]: 0xc86bff,
};
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
  }
}

/**
 * One frame of play. `override` and `bearing` exist for the headless harness,
 * which cannot press keys: they stand in for the pad and for the camera's
 * bearing that the stick is measured against.
 */
function playTick(override?: Partial<PlayerInput>, bearing?: number): void {
  if (!viewer || !player || !playerRuntime || !currentCollisionWorld) return;

  if (player.fellOut) { void respawn(); return; }
  // The camera's bearing to the player, taken from the sim camera rather than
  // the rendered one, so the controls do not depend on how the view is drawn.
  const cameraYaw = bearing ?? (camera ? yawOf(player.x - camera.x, player.z - camera.z) : 0);
  const held = override ? { ...input.read(), ...override } : input.read();

  // A talk freezes Buzz and takes the camera: the engine sets its "no player
  // control" bit and drives the camera from the talk script rather than the
  // follow camera (docs/LEVELS.md). Everything else still ticks.
  if (talk) {
    const pressed = { jump: held.jump && !talkHeld.jump, fire: held.fire && !talkHeld.fire };
    talkHeld = { jump: held.jump, fire: held.fire };
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
    viewer.placeCamera(
      talk.eye.x * GAME_TO_RENDER, -talk.eye.y * GAME_TO_RENDER, -talk.eye.z * GAME_TO_RENDER,
      talk.look.x * GAME_TO_RENDER, -talk.look.y * GAME_TO_RENDER, -talk.look.z * GAME_TO_RENDER,
    );
    drawTalk();
    if (talk.finished) {
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
      drawTalk();
      // Hand the camera back where it is, so it eases rather than snapping.
      if (camera && player) camera = createCamera(player);
    }
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
    stepCamera(camera, player, currentCollisionWorld, held);
    const look = cameraTarget(player);
    viewer.placeCamera(
      camera.x * GAME_TO_RENDER, -camera.y * GAME_TO_RENDER, -camera.z * GAME_TO_RENDER,
      look.x * GAME_TO_RENDER, -look.y * GAME_TO_RENDER, -look.z * GAME_TO_RENDER,
    );
  }
  for (const effect of player.sounds) sound?.play(effect);

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
    const level = levelNumber(levels[levelEl.selectedIndex]?.id ?? '') ?? 0;
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
          talking: false,
          x: player.x, y: player.y, z: player.z, level,
          items: pickups?.itemsFound ?? 0,
        },
      );
      if (request) startDialogue(request);
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
    stepCreatures(creatureSim, player);
    for (const touch of contactCreatures(creatureSim, player, attackFromPlayer(player))) {
      applyCreatureTouch(touch.angle, touch.reaction);
    }
    // The sounds a script raises are event numbers, which need the event
    // table in docs/LEVELS.md that is not ported; they are dropped for now.
    creatureSim.sounds.length = 0;
    drawCreatures();
  }

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
    // A hint sign is reported but never consumed; touching one opens its box.
    const sign = taken.find((t) => t.kind === PickupKind.HintSign);
    if (sign && !talk) startHintTalk(pickups.items[sign.index]!.id);
    if (taken.some((t) => t.kind !== PickupKind.HintSign)) sound?.play('PICKUP1');
    pickupSpin = (pickupSpin + 0.06) % (Math.PI * 2);
    const gone = new Set<number>();
    for (let i = 0; i < pickups.items.length; i++) {
      if (pickups.items[i]!.collected && pickupDrawIndex[i]! >= 0) gone.add(pickupDrawIndex[i]!);
    }
    viewer.updatePickups(gone, pickupSpin);
    if (taken.length > 0) {
      const slots = [0, 1, 2, 3, 4].filter((s) => pickups!.tokens & (1 << s)).length;
      infoEl.textContent = `coins ${pickups.coins}  health ${pickups.health}/14  lives ${pickups.lives}  tokens ${slots}/5`;
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
