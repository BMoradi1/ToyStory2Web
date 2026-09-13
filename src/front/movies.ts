import type { SaveProgress } from '../formats/save-file.ts';
import { FADE, PAD, setFade, stepFade, type FrontItem, type PadWord, type StepResult } from './screens.ts';
import { layoutBigText } from './text.ts';

export interface MovieChoice { index: number; title: string; available: boolean; sprite: number; frame: number }

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
    result.push({ index: flag + 10, title, available: present(flag + 10), sprite: exe[0xf6e3c + flag * 4]!, frame: exe[0xf6e3d + flag * 4]! });
  }
  return result;
}

export function createMovieScreen(choices: MovieChoice[], selected = 10, message = '') {
  const cursor = Math.max(0, choices.findIndex(c => c.index === selected));
  return { choices, cursor, message, scroll: cursor * 4096, velocity: 0, ticks: 0, remaining: 4000,
    result: 'cancel', fade: { level: 0, target: 128, speed: 6 } };
}
export function stepMovieScreen(s: ReturnType<typeof createMovieScreen>, pad: PadWord, prompt: string): StepResult<string> {
  stepFade(s.fade); s.ticks++;
  const items: FrontItem[] = [], sounds: number[] = [];
  const sprite = (index: number, frame: number, x: number, y: number, clipX?: readonly [number, number]) =>
    items.push({ kind: 'sprite', index, frame, x, y, space: 320, colour: 128, alpha: 1, scaleX: 4096, scaleY: 4096, clipX });
  if ((s.ticks & 63) < 48) {
    if (s.cursor > 0) sprite(57, 0, 16, 112);
    if (s.cursor + 1 < s.choices.length) sprite(57, 1, 272, 112);
  }
  sprite(60, 0, 0, 0); sprite(60, 1, 128, 0); sprite(61, 0, 256, 0);
  const shift = -((s.scroll >> 5) & 127);
  sprite(64, 0, 268 + shift, 80, [208, 264]); sprite(64, 0, 114 + shift, 80, [56, 112]);
  const card = s.choices[(s.scroll + 2048) >> 12];
  if (card) {
    const x = -(((s.scroll - 2048) >> 5) & 127);
    sprite(card.sprite, card.frame, 268 + x, 80, [208, 264]);
    sprite(card.sprite, card.frame, 114 + x, 80, [56, 112]);
  }
  const film = -(s.scroll >> 6) % 320;
  for (const x of [film, film + 320]) {
    sprite(62, 0, x, 0); sprite(62, 1, x + 128, 0); sprite(63, 0, x + 256, 0);
  }
  items.unshift({kind:'big',glyphs:layoutBigText(s.message || (card && !card.available ? 'movie file missing' : prompt),160,212),space:320,colour:[255,255,255]});
  const edge = (bit: number) => !!(pad.now & bit) && !(pad.was & bit);
  if (s.remaining === 4000) {
    if (Math.abs(s.scroll - s.cursor * 4096) < 2048) {
      if (edge(PAD.left) && s.cursor > 0) { s.cursor--; sounds.push(2); }
      if (edge(PAD.right) && s.cursor + 1 < s.choices.length) { s.cursor++; sounds.push(2); }
    }
    s.velocity += s.velocity > 0 ? -Math.min(8, s.velocity) : Math.min(8, -s.velocity);
    if (s.scroll < s.cursor * 4096 - 1024) s.velocity += 16;
    if (s.scroll > s.cursor * 4096 + 1024) s.velocity -= 16;
    s.velocity = Math.max(-128, Math.min(128, s.velocity)); s.scroll += s.velocity;
    if (s.fade.level === FADE.full && (edge(PAD.cancel) || (edge(PAD.jump) && card?.available))) {
      s.result = edge(PAD.cancel) ? 'cancel' : String(card!.index);
      s.remaining = 53; setFade(s.fade, 0, 6); sounds.push(edge(PAD.cancel) ? 3 : 1);
    }
  } else s.remaining = Math.max(0, s.remaining - 1);
  return { frame: { picture: 0, items, fade: s.fade.level }, sounds, done: s.remaining === 0 ? s.result : null };
}
