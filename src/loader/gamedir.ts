/**
 * Local access to the user's own game install.
 *
 * Everything here is deliberately client-side. The user's copy of the game is
 * read through browser file APIs and never leaves their machine — that is the
 * commitment that lets this project exist publicly (see CLAUDE.md). There is no
 * upload path, and there must never be one.
 *
 * Two ways in, because the good API isn't universal:
 *   - `showDirectoryPicker()` where available (Chromium), which gives us a
 *     real directory tree we can walk lazily.
 *   - Drag-and-drop of a folder everywhere else, via `webkitGetAsEntry()`.
 * Both are normalised into the same `GameFile` map, keyed by lowercase path
 * relative to the install root (e.g. `data/level01/level.ngn`).
 */

export interface GameFile {
  /** Lowercase path relative to the install root, forward-slashed. */
  path: string;
  name: string;
  size: number;
  read(): Promise<Uint8Array>;
}

export type GameDir = Map<string, GameFile>;

/** Directories we care about. Skipping the rest keeps the scan quick — the
 *  cutscene folder alone is 214 MB and we don't need it to enumerate levels. */
const WANTED = /^(data|audio|scripts)(\/|$)/;

function fileEntry(path: string, file: File): GameFile {
  return {
    path,
    name: file.name,
    size: file.size,
    read: async () => new Uint8Array(await file.arrayBuffer()),
  };
}

async function walkHandle(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: GameDir,
): Promise<void> {
  // @ts-expect-error - `values()` is not yet in the DOM lib types.
  for await (const entry of dir.values()) {
    const path = prefix ? `${prefix}/${entry.name.toLowerCase()}` : entry.name.toLowerCase();
    if (entry.kind === 'directory') {
      if (prefix === '' && !WANTED.test(path)) continue;
      await walkHandle(entry as FileSystemDirectoryHandle, path, out);
    } else {
      const file = await (entry as FileSystemFileHandle).getFile();
      out.set(path, fileEntry(path, file));
    }
  }
}

async function walkEntry(entry: FileSystemEntry, prefix: string, out: GameDir): Promise<void> {
  const path = prefix ? `${prefix}/${entry.name.toLowerCase()}` : entry.name.toLowerCase();

  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    out.set(path, fileEntry(path, file));
    return;
  }

  if (prefix === '' && !WANTED.test(path)) return;

  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries() returns at most ~100 entries per call, so drain it.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) break;
    for (const child of batch) await walkEntry(child, path, out);
  }
}

/**
 * Build a GameDir from an `<input webkitdirectory>` selection.
 *
 * This is the most reliable path by a wide margin: it works in every current
 * browser, needs no recursive async directory walking, and hands over every
 * file's relative path up front via `webkitRelativePath`. Drag-and-drop and the
 * directory picker are conveniences layered on top of it.
 */
export function gameDirFromFileList(files: ArrayLike<File>): GameDir {
  const out: GameDir = new Map();
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const relative: string =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    // Paths arrive prefixed with the selected folder's own name; drop it so
    // keys are relative to the install root.
    const parts = relative.split('/');
    const path = (parts.length > 1 ? parts.slice(1) : parts).join('/').toLowerCase();
    if (!path) continue;
    // Skip the cutscene folder: 214 MB of video we don't need enumerated.
    if (path.startsWith('rtlibs/')) continue;
    out.set(path, fileEntry(path, file));
  }
  return out;
}

export function supportsDirectoryPicker(): boolean {
  return 'showDirectoryPicker' in window;
}

/** Prompt for the install root. Resolves null if the user cancels. */
export async function pickGameDir(): Promise<GameDir | null> {
  // @ts-expect-error - not in the DOM lib types yet.
  const handle: FileSystemDirectoryHandle = await window.showDirectoryPicker({ mode: 'read' });
  const out: GameDir = new Map();
  await walkHandle(handle, '', out);
  return out;
}

/** Read an install root out of a drop event. */
export async function gameDirFromDrop(ev: DragEvent): Promise<GameDir> {
  const out: GameDir = new Map();
  const items = Array.from(ev.dataTransfer?.items ?? []);
  const roots = items
    .map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => e !== null);

  for (const root of roots) {
    // Dropping the install folder itself gives us its children under its name;
    // start from its contents so paths are relative to the install root.
    if (root.isDirectory) {
      const reader = (root as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject),
        );
        if (batch.length === 0) break;
        for (const child of batch) await walkEntry(child, '', out);
      }
    }
  }
  return out;
}

/**
 * Sanity-check that this really is a Toy Story 2 install.
 * `creatures.cfg` is a good marker: small, plaintext, and distinctive.
 */
export function validateGameDir(dir: GameDir): string | null {
  if (dir.size === 0) return 'No files were read from that folder.';
  if (!dir.has('data/creatures.cfg')) {
    const sample = [...dir.keys()].slice(0, 3).join(', ');
    return `Read ${dir.size} files but found no data/creatures.cfg — ` +
      `choose the folder that CONTAINS "data" (saw: ${sample || 'nothing'}).`;
  }
  return null;
}

/**
 * Playable scenes, in order.
 *
 * A level directory holds two independent complete scenes — `level.*` and
 * `level1.*` — which are sub-areas rather than variants of each other, so both
 * are listed. Each pairs a `.ngn` (textures) with a `.dat` (world geometry).
 */
export interface LevelScene {
  id: string;
  ngn: GameFile | null;
  dat: GameFile | null;
  /** `TERRAIN.ALL` for `level`, `TERR1.ALL` for `level1`: the scene's collision. */
  terrain: GameFile | null;
  /** `level.raw` / `level1.raw`: the RNC packet with the creature list (src/formats/creatures.ts). */
  raw: GameFile | null;
}

export function findLevels(dir: GameDir): LevelScene[] {
  const scenes = new Map<string, LevelScene>();
  const want = (id: string): LevelScene => {
    let scene = scenes.get(id);
    if (!scene) { scene = { id, ngn: null, dat: null, terrain: null, raw: null }; scenes.set(id, scene); }
    return scene;
  };

  for (const [path, file] of dir) {
    const m = /^data\/(level\d+)\/([^/]+)\.(ngn|dat)$/.exec(path);
    if (!m) continue;
    const [, levelDir, base, ext] = m;
    const scene = want(`${levelDir}/${base}`);
    if (ext === 'ngn') scene.ngn = file;
    else scene.dat = file;
  }

  // Collision sits in its own file per scene: TERRAIN.ALL beside level.dat and
  // TERR1.ALL beside level1.dat. Paths are lowercased by the loader.
  for (const [path, file] of dir) {
    const m = /^data\/(level\d+)\/(terrain|terr1)\.all$/.exec(path);
    if (!m) continue;
    const scene = scenes.get(`${m[1]}/${m[2] === 'terrain' ? 'level' : 'level1'}`);
    if (scene) scene.terrain = file;
  }
  // The packet file beside each scene: creatures, and the PSX-side art.
  for (const [path, file] of dir) {
    const m = /^data\/(level\d+)\/(level1?)\.raw$/.exec(path);
    if (!m) continue;
    const scene = scenes.get(`${m[1]}/${m[2]}`);
    if (scene) scene.raw = file;
  }

  // A scene needs geometry to be a scene. `level00` holds four .ngn texture
  // bundles and no .dat at all (the developers' mkdat.btm ran their converter
  // there four times for menu and loading art), and level11-19 are empty
  // directories. Offering those produced a default scene that could never
  // render. Textures are optional by contrast: a few levels have more .dat
  // files than .ngn, and those simply draw untextured.
  return [...scenes.values()]
    .filter((s) => s.dat !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Character models: every `.all` under the `chars*` directories, paired with
 * the `.anm` beside it. Bone `i` of the animation drives mesh group `i` of the
 * model, so the two files are only meaningful together.
 */
export function findModels(
  dir: GameDir,
): { name: string; dir: string; file: GameFile; anm: GameFile | null }[] {
  const models: { name: string; dir: string; file: GameFile; anm: GameFile | null }[] = [];
  for (const [path, file] of dir) {
    const m = /^data\/(chars\d*)\/([^/]+)\.all$/.exec(path);
    if (!m) continue;
    models.push({
      name: m[2]!, dir: m[1]!, file, anm: dir.get(`data/${m[1]}/${m[2]}.anm`) ?? null,
    });
  }
  // The same character can appear in more than one `chars` directory, and the
  // copies are not equivalent: `chars5/buzz.all` ships with no `.anm` beside
  // it while `chars/buzz.all` has all 35 animations. Left as two entries both
  // called "buzz" the picker silently lands on whichever sorts first, which is
  // how the player ended up unanimated. Qualify a name as soon as it repeats.
  const seen = new Map<string, number>();
  for (const m of models) seen.set(m.name, (seen.get(m.name) ?? 0) + 1);
  for (const m of models) if ((seen.get(m.name) ?? 0) > 1) m.name = `${m.dir}/${m.name}`;
  return models.sort((a, b) => a.name.localeCompare(b.name));
}
