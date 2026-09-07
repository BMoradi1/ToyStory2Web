/**
 * The player's progress, in the browser.
 *
 * The game directory is never written (CLAUDE.md), so the save lives in
 * `localStorage` as the same 0x188-byte block the original keeps in memory,
 * seeded the first time from the install's own `Toy200.sav` when there is
 * one. "Export" hands the player a real `Toy200.sav` to put back in their
 * install themselves. Format: src/formats/save-file.ts, docs/FORMATS.md.
 *
 * Only the release layout is taken from the install; the 1999 file under
 * `data/` is an older build's and is left alone, as the engine misreads it.
 */
import {
  SAVE, encodeSaveFile, freshBlock, parseSaveFile, writeProgress, type SaveProgress,
} from '../formats/save-file.ts';
import type { GameDir } from './gamedir.ts';

const KEY = 'ts2.save.0';
/** What the shipped files call themselves. */
export const SAVE_NAME = 'default.cfg';

export interface Progress {
  /** The block, kept in step with `p` by `commit`. */
  block: Uint8Array;
  p: SaveProgress;
  /** Where the block came from, for the info line. */
  origin: 'browser' | 'install' | 'fresh';
}

function fromStorage(): Uint8Array | null {
  try {
    const hex = localStorage.getItem(KEY);
    if (!hex || hex.length !== SAVE.blockSize * 2) return null;
    const block = new Uint8Array(SAVE.blockSize);
    for (let i = 0; i < block.length; i++) block[i] = parseInt(hex.substr(i * 2, 2), 16);
    return block;
  } catch {
    return null;
  }
}

function toStorage(block: Uint8Array): void {
  try {
    let hex = '';
    for (const b of block) hex += b.toString(16).padStart(2, '0');
    localStorage.setItem(KEY, hex);
  } catch {
    // A private window or blocked storage: progress lasts the session only.
  }
}

/** The stored progress, else the install's, else a fresh record. */
export async function loadProgress(dir: GameDir): Promise<Progress> {
  let block = fromStorage();
  let origin: Progress['origin'] = 'browser';
  if (!block) {
    const file = dir.get('toy200.sav');
    if (file) {
      try {
        const save = parseSaveFile(await file.read(), 0);
        if (save.release && save.progress) { block = new Uint8Array(save.block); origin = 'install'; }
      } catch (err) {
        console.warn('Toy200.sav unreadable, starting fresh:', (err as Error).message);
      }
    }
  }
  if (!block) { block = freshBlock(); origin = 'fresh'; }
  const p = parseSaveFile(encodeSaveFile('', block), 0).progress!;
  return { block, p, origin };
}

/** Write the fields back into the block and keep it. */
export function commitProgress(progress: Progress): void {
  writeProgress(progress.block, progress.p);
  toStorage(progress.block);
}

/** The bytes of a `Toy200.sav` holding this progress. */
export function exportProgress(progress: Progress): Uint8Array {
  writeProgress(progress.block, progress.p);
  return encodeSaveFile(SAVE_NAME, progress.block);
}

/** Forget the browser's copy; the next load reads the install again. */
export function forgetProgress(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to forget */ }
}
