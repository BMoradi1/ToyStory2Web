import type { SaveProgress } from '../formats/save-file.ts';

export interface MovieChoice { index: number; title: string; available: boolean }

/** FUN_0043a600: table at 004f6e8c, filtered by shown[flag], with trailer always on. */
export function movieChoices(exe: Uint8Array, progress: SaveProgress, names: readonly string[], present: (index: number) => boolean): MovieChoice[] {
  const result: MovieChoice[] = [];
  for (let i = 0; i < 20; i++) {
    const flag = exe[0xf6e8c + i];
    if (flag === undefined || flag === 255) break;
    if (flag > 18) continue;
    const unlocked = flag === 0 || (flag === 17 ? progress.allTokens : flag === 18 ? progress.gameBeaten : progress.shown[flag]);
    if (!unlocked) continue;
    const title = flag === 0 ? 'Trailer' : flag === 17 ? 'Secret ending' : flag === 18 ? 'Ending'
      : `${names[flag === 16 ? 12 : flag] ?? `Level ${flag}`} — ${flag !== 16 && flag % 3 === 0 ? 'boss' : 'intro'}`;
    result.push({ index: flag + 10, title, available: present(flag + 10) });
  }
  return result;
}
