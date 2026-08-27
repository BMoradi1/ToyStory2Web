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
  if (dir.size === 0) return 'No files found in that folder.';
  if (!dir.has('data/creatures.cfg')) {
    return "That doesn't look like a Toy Story 2 install — no data/creatures.cfg.";
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
}

export function findLevels(dir: GameDir): LevelScene[] {
  const scenes = new Map<string, LevelScene>();
  const want = (id: string): LevelScene => {
    let scene = scenes.get(id);
    if (!scene) { scene = { id, ngn: null, dat: null }; scenes.set(id, scene); }
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

  return [...scenes.values()]
    .filter((s) => s.dat !== null || s.ngn !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Character models: every `.all` under the `chars*` directories, by name. */
export function findModels(dir: GameDir): { name: string; file: GameFile }[] {
  const models: { name: string; file: GameFile }[] = [];
  for (const [path, file] of dir) {
    const m = /^data\/chars\d*\/([^/]+)\.all$/.exec(path);
    if (m) models.push({ name: m[1]!, file });
  }
  return models.sort((a, b) => a.name.localeCompare(b.name));
}
