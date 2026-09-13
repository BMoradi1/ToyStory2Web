/** Post-level tally, FUN_004398b0. See docs/FRONTEND.md for the timing. */
import { FADE, PAD, setFade, stepFade, type Fade, type FrontItem, type Grey,
  type PadWord, type StepResult } from './screens.ts';
import { layoutBigText } from './text.ts';

export interface LevelSummary {
  /** Play position 1..15, not the internal level number. */
  position: number;
  enteredWith: number;
  tokens: number;
  coins: number;
  powerUps: number;
}
interface Spark { x: number; y: number; vx: number; vy: number; life: number }
export interface SummaryState {
  result: LevelSummary;
  ticks: number;
  remaining: number;
  shownTokens: number;
  shownCoins: number;
  tokenTicks: number;
  nextToken: number;
  coinTicks: number;
  nextCoin: number;
  blink: number;
  sparks: Spark[];
  fade: Fade;
}

export const SUMMARY = {
  music: 0x15, picture: 0, duration: 0x168,
  /** Icon order differs from the bit order: grapple precedes hover boots. */
  powerBits: [1, 2, 4, 16, 8],
  sheets: [0, 1, 2, 3, 17, 18, 19, 31],
} as const;

export function createSummary(result: LevelSummary): SummaryState {
  const saved = { ...result, coins: Math.max(0, Math.min(99, result.coins)), tokens: result.tokens & 31 };
  let added = saved.tokens & ~saved.enteredWith, count = 0;
  for (; added; added >>>= 1) count += added & 1;
  const tokenTicks = count ? count * 60 + 60 : 0;
  const coinTicks = saved.coins * 3 + 16;
  return { result: saved, ticks: 0, remaining: SUMMARY.duration,
    shownTokens: saved.enteredWith & saved.tokens, shownCoins: 0,
    tokenTicks, nextToken: tokenTicks - 30, coinTicks, nextCoin: coinTicks,
    blink: 0, sparks: [], fade: { level: 0, target: FADE.full, speed: FADE.slow } };
}

/** One original-engine tick. The clock waits at 180 until jump is pressed. */
export function stepSummary(s: SummaryState, pad: PadWord, prompt: string, rand: () => number): StepResult<'exit'> {
  const sounds: number[] = [];
  const items: FrontItem[] = [];
  const sprite = (index: number, frame: number, x: number, y: number, colour: Grey = 0x80, scale = 0x1000): void => {
    items.push({ kind: 'sprite', index, frame, x, y, colour,
      space: 320, scaleX: scale, scaleY: scale, alpha: 1 });
  };
  stepFade(s.fade);
  for (const p of s.sparks) {
    p.x += p.vx; p.y += p.vy;
    sprite(0x50, p.life >> 3, p.x >> 8, p.y >> 8, [0x40, 0x40, 0x20]);
    p.vy += 24; p.life--;
  }
  s.sparks = s.sparks.filter(p => p.life > 0);
  // The five summary header pieces, at the original half scale.
  sprite(0x52, 15, 0x2c, 0x3c, 0xff, 0x800);
  sprite(0x52, s.result.position - 1, 0x60, 0x3c, 0xff, 0x800);
  sprite(0x52, 16, 0x94, 0x3c, 0xff, 0x800);
  sprite(0x52, 17, 0xc8, 0x3c, 0xff, 0x800);
  sprite(0x53, s.result.position - 1, 0xfc, 0x3c, 0xff, 0x800);
  for (let i = 0; i < 5; i++) {
    sprite(0x4c, ((s.ticks >> 1) + i * 4) & 31, 0x24 + 0x34 * i, 0x20, s.shownTokens & (1 << i) ? 0x80 : 0);
    sprite(0x51, i, 0x44 + 0x28 * i, 0xad, s.result.powerUps & SUMMARY.powerBits[i]! ? 0xff : 0, 0x800);
  }
  sprite(0x4e, (s.ticks + 10) & 15, 0x5c, 0x76);
  sprite(0x4f, 10, 0x98, 0x7a);
  sprite(0x4f, Math.trunc(s.shownCoins / 10), 0xbe, 0x7a);
  sprite(0x4f, s.shownCoins % 10, 0xd0, 0x7a);

  if (s.remaining < 300) {
    if (s.tokenTicks > 0) {
      if (s.nextToken - s.tokenTicks >= 30) {
        s.nextToken -= 30;
        for (let i = 0; i < 5; i++) {
          const bit = 1 << i;
          if (!(s.result.tokens & bit) || s.shownTokens & bit) continue;
          s.shownTokens |= bit;
          sounds.push(2); // FUN_004a37e0(1) -> effect 2.
          for (let n = 0; n < 15; n++) {
            const dx = (rand() - 128) * 16, dy = rand() * 8 - 1024, r = rand();
            rand();
            if (s.sparks.length < 64) s.sparks.push({
              x: ((13 * i + 13) << 10) + dx, y: 0x2800 + dy,
              vx: Math.trunc(dx / 7) + (r >> 4) - 16,
              vy: Math.trunc(dy / 7) + (r >> 1) - 384, life: 31,
            });
          }
          break;
        }
      }
      s.tokenTicks--;
    } else if (s.coinTicks > 0) {
      if (s.nextCoin - s.coinTicks > 3) {
        if (s.shownCoins < s.result.coins) sounds.push(2);
        while (s.nextCoin - s.coinTicks > 3) {
          s.nextCoin -= 3;
          s.shownCoins = Math.min(s.result.coins, s.shownCoins + 1);
        }
      }
      s.coinTicks--;
    } else s.shownCoins = Math.min(s.result.coins, s.shownCoins + 1);
  }
  if (s.remaining > 120 && s.remaining < 240) {
    s.blink = (s.blink + 1) & 63;
    if (s.blink < 48) items.push({ kind: 'big', glyphs: layoutBigText(prompt, 0xa0, 0xdc),
      space: 320, colour: [255, 255, 255] });
  }
  if (s.remaining > 180 || s.remaining <= 120) s.remaining = Math.max(0, s.remaining - 1);
  if (s.remaining <= 23 && s.fade.target !== 0) setFade(s.fade, 0, FADE.quick);
  s.ticks++;
  if (s.remaining > 120 && s.remaining < 240 && (pad.now & PAD.jump) && !(pad.was & PAD.jump)) {
    sounds.push(1);
    if (s.tokenTicks === 0 && s.coinTicks === 0) s.remaining = 24;
    else {
      s.remaining = 120;
      s.shownTokens = s.result.tokens;
      s.shownCoins = s.result.coins;
    }
  }
  return { frame: { picture: SUMMARY.picture, items, fade: s.fade.level }, sounds, done: s.remaining === 0 ? 'exit' : null };
}
