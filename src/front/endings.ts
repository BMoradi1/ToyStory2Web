/** Game over (00437b20) and credits (0043a380), in engine ticks. */
import { FADE, setFade, stepFade, type Fade, type PadWord, type StepResult, type FrontItem } from './screens.ts';
import { layoutBigText } from './text.ts';

const pressed = (pad: PadWord): boolean => !!(pad.now & 0xf000) && !(pad.was & 0xf000);
export function createGameOver() {
  return { remaining: 1200, fade: { level: 0, target: FADE.full, speed: FADE.quick } as Fade };
}
export function stepGameOver(s: ReturnType<typeof createGameOver>, pad: PadWord, musicEnded = false): StepResult<'exit'> {
  stepFade(s.fade);
  s.remaining = Math.max(0, s.remaining - 1);
  if (musicEnded && s.remaining > 23) s.remaining = 23;
  if (s.remaining <= 23 && s.fade.target !== 0) setFade(s.fade, 0, FADE.quick);
  if (s.remaining < 1140 && s.remaining > 23 && pressed(pad)) s.remaining = 24;
  return { frame: { picture: 1, items: [], fade: s.fade.level }, sounds: [], done: s.remaining === 0 ? 'exit' : null };
}

export const CREDIT_SLOTS = Array.from({ length: 10 }, (_, i) => 48 + i);
export const CREDIT_TEXT = 0x4f5f54;
export function createCredits(text: string) {
  return { text, at: 0, rows: Array<string>(40).fill(''), scroll: 0, readRows: 0,
    remaining: 4000, backdropTicks: 600, backdrop: 0, cycled: false,
    fade: { level: 0, target: FADE.full, speed: FADE.slow } as Fade };
}
export function stepCredits(s: ReturnType<typeof createCredits>, pad: PadWord): StepResult<'exit'> {
  stepFade(s.fade);
  if (s.remaining > 0 && s.remaining < 1000) s.remaining--;
  const rows = Math.trunc(s.scroll / 128);
  while (s.readRows < rows) {
    let end = s.text.indexOf('~', s.at);
    if (end < 0) end = s.text.length;
    s.rows[(s.readRows + 2) % 40] = s.text.slice(s.at, end);
    s.at = Math.min(s.text.length, end + 1);
    s.readRows++;
  }
  const offset = Math.trunc(s.scroll / 16) % 320;
  const items: FrontItem[] = s.rows.map((row, i) => ({ kind: 'big', space: 320,
    colour: [255, 255, 255], glyphs: layoutBigText(row, 160, (320 + i * 8 - offset) % 320 - 33) }));
  if (s.backdropTicks > 0) s.backdropTicks--;
  else { s.backdropTicks = 600; s.backdrop = (s.backdrop + 1) % 10; s.cycled = true; }
  const edge = Math.min(s.backdropTicks, 600 - s.backdropTicks);
  const pictureAlpha = edge < 25 ? edge * 10 / 255 : 1;
  s.scroll += 8;
  if ((pressed(pad) || s.at >= s.text.length) && s.remaining > 53 && s.fade.level === FADE.full) {
    setFade(s.fade, 0, FADE.slow);
    s.remaining = 53;
  }
  return { frame: { picture: s.cycled ? null : 0,
    pictureSlot: s.cycled ? 48 + s.backdrop : undefined, pictureAlpha, items, fade: s.fade.level },
    sounds: [], done: s.remaining === 0 ? 'exit' : null };
}
