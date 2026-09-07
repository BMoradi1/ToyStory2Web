/**
 * The HUD, drawn as a 2D overlay over the canvas.
 *
 * The original draws it as textured quads in its sprite layer, but every one
 * of them is axis-aligned, unrotated and screen-space, so a 2D context draws
 * the same picture from the same numbers. Everything here comes out of
 * docs/HUD.md: the sprite table in the user's toy2.exe says which texels of
 * which sheet a sprite is, and `FUN_0049fd40` says where each element goes.
 *
 * **Two virtual spaces.** The engine divides x by 512 for some draws and by
 * 320 for others, and y by 256 for all of them, then stretches both to the
 * screen. So the 320-space draws come out 1.6x wider — that is the 4:3
 * correction, and it is why the icons are chunkier than the digits.
 *
 * **Colour is a modulate**, `texel * colour / 0x80`, so 0x80 leaves a sprite
 * alone and 0xff nearly doubles it. Icons only ever get a grey, which is a
 * brightness filter; the bars are the single solid texel of sprite 6 scaled
 * to size, which is a filled rectangle of the modulated colour.
 *
 * **Later calls draw BEHIND earlier ones.** `FUN_004b8cc0` fills its buffer
 * from the end downward and the renderer walks it forward, so the order a
 * frame is submitted in is the reverse of the order it lands in. It has to
 * work that way: every bar is drawn before the frame around it, and the
 * frames are opaque black in the middle, so drawing them in call order would
 * paint over the bar. The calls here are written in the engine's order and
 * the queue is flushed backward, which keeps this file readable next to the
 * decompiled function.
 */
import { HUD, HudElement, blinkOn, offsetOf, pulse, stackShift, type HudState } from '../sim/hud.ts';
import { FONT_DIGIT_BASE, LEVEL_SPRITE_BASE, SPRITE, type SpriteHeader } from '../formats/sprite-table.ts';

/**
 * The talk box, from `FUN_00401c30` and `FUN_00401b60`. The box is five
 * quads of sprite 6 in the 512 space — four black edges and a
 * half-transparent fill — scaling open about its centre at (257, 44) to a
 * full 474 x 32. The text is the small font at half scale in the 320 space,
 * thirty-six columns eight apart from x = 16, two rows at y = 32 and 40,
 * with the continue prompt centred below at y = 48.
 */
export const TALK_DRAW = {
  centreX: 0x101, centreY: 0x2c,
  /** Full size, as a 12-bit scale of one texel. */
  width: 0x1da, height: 0x20,
  /** The box never shrinks below this, so it opens from a slot not a point. */
  minWidth: 4, minHeight: 2,
  /** Fill colour, and the inset of the fill inside the black edge. */
  fill: { r: 0x80, g: 0, b: 0 }, insetX: 2, insetY: 1,
  /** The solid texel sprite 6 draws bars and boxes from, and its frame here. */
  frame: 1,
  textX: 0x10, textStep: 8, textRow: [0x20, 0x28], textEnd: 0x12f,
  promptY: 0x30, columns: 36,
  /** The scale at which the box is fully open and the text runs. */
  full: 0x1000,
} as const;

/**
 * The glyph a character draws, from `FUN_0049b630`. Lower case runs a..z
 * over frames 0..25 and the digits follow; the rest is this table. A space
 * draws nothing, and `~` and `@` are the two frames of icon sprite 38
 * rather than a letter.
 */
export function glyphOf(ch: string): { frame: number; icon?: number } | null {
  const c = ch.charCodeAt(0);
  if (c === 0x20) return null;
  if (c === 0x7e) return { frame: 0, icon: 38 };
  if (c === 0x40) return { frame: 1, icon: 38 };
  switch (c) {
    case 0x21: return { frame: 0x29 };
    case 0x27: return { frame: 0x30 };
    case 0x2a: return { frame: 0x32 };
    case 0x2c: return { frame: 0x25 };
    case 0x2d: return { frame: 0x31 };
    case 0x2e: return { frame: 0x24 };
    case 0x3e: return { frame: 0x2d };
    case 0x3f: return { frame: 0x28 };
    default:
      // Digits sit just past the letters; lower case wraps to 0..25.
      return { frame: c < 0x3a ? c - 0x16 : (c + 0x9f) & 0xff };
  }
}

/** What the painter needs to draw a talk box. */
/**
 * The pause menu, as rows of text to centre (docs/HUD.md, src/sim/menu.ts).
 * Each row carries its own colour so the selected one can pulse.
 */
/** Where the menu's title sits, in the 320 space (`MENU.titleY`). */
const MENU_TITLE_Y = 0x54;

export interface MenuDraw {
  title: string;
  rows: { text: string; y: number; colour: readonly [number, number, number] }[];
}

export interface TalkDraw {
  /** 0 to 0x1000 as it opens and shuts. */
  scale: number;
  /** The two visible rows, with the highlight flag per character. */
  rows: readonly { text: string; marks: readonly boolean[] }[];
  /** Whether a page is waiting, which is when the prompt blinks. */
  waiting: boolean;
  /** "press jump to continue", read from the user's own executable. */
  prompt: string;
}

/** One decoded texture sheet, ready to blit from. */
export type Sheet = CanvasImageSource & { width: number; height: number };

/** What the HUD needs to know about the game this tick. */
export interface HudReadout {
  lives: number;
  health: number;
  coins: number;
  /** The level's find-five count, 0..5. */
  found: number;
  /** The collect-five count beside a timed run, or -1 for none. */
  collected: number;
  /**
   * The shared task counter (`DAT_0052ad64`): under 100 it is a lap count
   * and the flag shows `3 - laps`; 100 or more it is the countdown and the
   * flag shows `clock - 100` as two digits. Null when no run is going.
   */
  clock: number | null;
  /** Spin charge, the engine's signed counter: positive charging, negative recovering. */
  spinCharge: number;
  /** Laser charge, 0..0x40. */
  laserCharge: number;
  /** The power-up timer, counting down from 0x4b0. */
  powerTimer: number;
  /** Disc and piece ammo, the two pickup categories that carry a count. */
  discs: number;
  pieces: number;
  /** The boss bar, 0..0x36, or -1 when no boss is up. */
  boss: number;
}

const SOLID_TEXEL = 190;
const NEUTRAL = 0x80;

/** A colour for the modulate: one grey, or a red/green/blue triple. */
export type Modulate = number | readonly [number, number, number];

function rgbOf(c: Modulate): readonly [number, number, number] {
  return typeof c === 'number' ? [c, c, c] : c;
}

/** `texel * colour / 0x80`, the engine's modulate, for the bars' solid texel. */
function barColour(r: number, g: number, b: number): string {
  const c = (v: number) => Math.min(255, Math.round((SOLID_TEXEL * v) / NEUTRAL));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

/**
 * The engine multiplies every texel by the draw's colour and halves it,
 * `texel * colour / 0x80`, so 0x80 leaves a sprite alone, 0xff nearly
 * doubles it and 0 kills a channel outright — which is how one yellow font
 * draws green highlights. A canvas cannot do that per channel while
 * blitting, so each sheet is multiplied once per colour it is asked for and
 * the result kept; there are only a handful of colours in a frame.
 */
function tintSheet(sheet: Sheet, r: number, g: number, b: number): Sheet {
  const out = document.createElement('canvas');
  out.width = sheet.width;
  out.height = sheet.height;
  const ctx = out.getContext('2d');
  if (!ctx) return sheet;
  ctx.drawImage(sheet, 0, 0);
  const image = ctx.getImageData(0, 0, out.width, out.height);
  const px = image.data;
  const mul = [r, g, b];
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    for (let k = 0; k < 3; k++) px[i + k] = Math.min(255, (px[i + k]! * mul[k]!) / NEUTRAL);
  }
  ctx.putImageData(image, 0, 0);
  return out;
}

export class HudPainter {
  private readonly ctx: CanvasRenderingContext2D;
  /** This frame's draw calls, flushed in reverse. See the note above. */
  private readonly queue: (() => void)[] = [];
  /** Modulated copies of each sheet, made once and kept. */
  private readonly tints = new Map<Sheet, Map<number, Sheet>>();

  /** A sheet multiplied by a colour, from the cache. */
  private tinted(sheet: Sheet, colour: Modulate): Sheet {
    const [r, g, b] = rgbOf(colour);
    if (r === NEUTRAL && g === NEUTRAL && b === NEUTRAL) return sheet;
    let bySheet = this.tints.get(sheet);
    if (!bySheet) { bySheet = new Map(); this.tints.set(sheet, bySheet); }
    const key = (r << 16) | (g << 8) | b;
    let out = bySheet.get(key);
    if (!out) { out = tintSheet(sheet, r, g, b); bySheet.set(key, out); }
    return out;
  }

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context for the HUD');
    this.ctx = ctx;
  }

  /** Match the drawing surface to the canvas's size on screen. */
  resize(width: number, height: number): void {
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Paint one frame. `table` is the level's sprite table and `sheets` maps a
   * texture slot to its decoded image; a sprite whose sheet is missing is
   * skipped rather than drawn wrong.
   */
  draw(
    hud: HudState,
    table: readonly (SpriteHeader | null)[],
    sheets: ReadonlyMap<number, Sheet>,
    r: HudReadout,
    talk?: TalkDraw | null,
    menu?: MenuDraw | null,
  ): void {
    this.clear();
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;

    const W = this.canvas.width;
    const H = this.canvas.height;
    const px512 = W / 512;
    const px320 = W / 320;
    const py = H / 256;

    /** Blit a frame of a sprite. `sx` is the space's pixels per virtual unit. */
    const blit = (
      index: number, frame: number, x: number, y: number,
      colour: Modulate, sx: number, scaleX = 0x1000, scaleY = 0x1000,
    ) => {
      const h = table[index];
      if (!h) return;
      const raw = sheets.get(h.texture);
      if (!raw) return;
      const f = h.frames[frame] ?? h.frames[0];
      if (!f) return;
      const w = (h.width * scaleX) >> 12;
      const ht = (h.height * scaleY) >> 12;
      if (w <= 0 || ht <= 0) return;
      const sheet = this.tinted(raw, colour);
      this.queue.push(() => {
        ctx.drawImage(sheet, f.u, f.v, h.width, h.height, x * sx, y * py, w * sx, ht * py);
      });
    };
    /** A bar: sprite 6's solid texel stretched to `w` x `ht` virtual pixels. */
    const bar = (
      x: number, y: number, w: number, ht: number,
      cr: number, cg: number, cb: number, sx: number, alpha = 1,
    ) => {
      if (w <= 0 || ht <= 0) return;
      this.queue.push(() => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = barColour(cr, cg, cb);
        ctx.fillRect(x * sx, y * py, w * sx, ht * py);
        ctx.globalAlpha = 1;
      });
    };
    /**
     * One character of the small font, in the 320 space at half scale. The
     * colour is a modulate, and only the red channel ever varies, so a grey
     * of 0 turns the yellow font green — that is the highlight.
     */
    const glyph = (ch: string, x: number, y: number, colour: Modulate) => {
      const g = glyphOf(ch);
      if (!g) return;
      // `~` and `@` are an icon rather than a letter, and sit two pixels up.
      if (g.icon !== undefined) { blit(g.icon, g.frame, x, y - 2, NEUTRAL, px320); return; }
      blit(SPRITE.font, g.frame, x, y, colour, px320, 0x800, 0x800);
    };
    /** A digit of the small font. */
    const digit = (value: number, x: number, y: number, sx: number, scale = 0x1000) => {
      blit(SPRITE.font, FONT_DIGIT_BASE + value, x, y, 0xff, sx, scale, scale);
    };
    /** A digit of the big brown font, which has no colour of its own. */
    const bigDigit = (value: number, x: number, y: number) => {
      blit(SPRITE.bigDigits, value, x, y, NEUTRAL, px512);
    };

    // --- 0: lives, top left -------------------------------------------------
    const lives = offsetOf(hud, HudElement.Lives);
    if (lives < 1) {
      blit(SPRITE.lives, 0, 0x10, lives + 0x10, NEUTRAL, px320, 0x800, 0x800);
      digit(Math.min(9, r.lives), 0x3c, lives + 0x20, px512);
    }

    // --- 6: the timed run, along the top ------------------------------------
    const run = offsetOf(hud, HudElement.TimedRun);
    if (run < 1 && r.clock !== null) {
      let flagX = 0;
      let flagGrey = NEUTRAL;
      if (r.clock < 100) {
        // A lap race: one big digit counting the laps down.
        const left = 3 - r.clock;
        bigDigit(Math.max(0, Math.min(11, left)), 0xfa, run + 0x18);
        if (r.clock === 2) flagGrey = pulse(hud);
      } else {
        let digitsX = 0;
        if (r.collected >= 0) {
          flagX = -0x14;
          digitsX = -0x20;
          const grey = r.collected === 5 ? pulse(hud) : NEUTRAL;
          if (r.collected !== 5 || hud.div32 < 0x10) bigDigit(r.collected, 0x12e, run + 0x20);
          blit(SPRITE.levelCollectIcon, 0, 0xa0, run + 0x10, grey, px320);
        }
        const left = r.clock - 100;
        bigDigit(Math.floor(left / 10) % 10, digitsX + 0xf3, run + 0x18);
        bigDigit(left % 10, digitsX + 0x101, run + 0x18);
      }
      blit(SPRITE.flag, 0, flagX + 0x8c, run + 0x10, flagGrey, px320);
    }

    // --- 1: health, top right ----------------------------------------------
    const health = offsetOf(hud, HudElement.Health);
    if (health < 1) {
      blit(SPRITE.battery, 0, 0x110, health + 0x10, NEUTRAL, px320, 0x800, 0x800);
      let fill = r.health * 2 + 2;
      if (fill < 5 && blinkOn(hud)) fill = 0;
      bar(0x1dc, health - fill + 0x2f, 5, fill, NEUTRAL, fill * 6, 0, px512);
      blit(SPRITE.batteryGlass, 0, 0x128, health + 0x10, NEUTRAL, px320);
    }

    // --- 5, 8, 9: the icons stacking leftward from the health -------------
    const find = offsetOf(hud, HudElement.FindFive);
    let shift = stackShift(health);
    if (find < 1) {
      const grey = r.found === 5 ? pulse(hud) : NEUTRAL;
      if (r.found !== 5 || hud.div32 < 0x10) {
        digit(r.found, 0x1da - (shift * 512) / 320, find + 0x20, px512);
      }
      blit(SPRITE.levelFindIcon, 0, 0x110 - shift, find + 0x10, grey, px320);
    }
    const potato = offsetOf(hud, HudElement.PotatoHead);
    shift += stackShift(find);
    if (potato < 1) {
      blit(SPRITE.potatoHead, 0, 0x110 - shift, potato + 0x10, pulse(hud, 8), px320);
    }
    const hamm = offsetOf(hud, HudElement.Hamm);
    if (hamm < 1) {
      blit(SPRITE.hamm, 0, 0x110 - (shift + stackShift(potato)), hamm + 0x10, pulse(hud, -8), px320);
    }

    // --- 2: coins, bottom left ---------------------------------------------
    const coins = offsetOf(hud, HudElement.Coins);
    if (coins < 1) {
      const y = 0xe0 - coins;
      blit(SPRITE.coin, hud.coinSpin >> 1, 0x1a, y, NEUTRAL, px512, 0xccd, 0x800);
      digit(Math.floor(r.coins / 10) % 10, 0x33, y, px512);
      digit(r.coins % 10, 0x3f, y, px512);
    }

    // --- 3: the spin charge, bottom right -----------------------------------
    const spin = offsetOf(hud, HudElement.Spin);
    if (spin < 1) {
      const up = -spin;
      blit(SPRITE.wings, 0, 0x110, up + 0xde, NEUTRAL, px320, 0x800, 0x800);
      let width = r.spinCharge > 0 ? Math.floor(r.spinCharge / 2) : 0;
      if (r.spinCharge < -0x77) width = Math.floor((r.spinCharge + 0x78) / -3);
      // Full, or recovering: the bar goes black on the blink's off half.
      const dark = hud.div8 < 4 && (r.spinCharge > 0x3b || r.spinCharge < -0x77);
      bar(0x1b6, up + 0xda, (width * 0x1838) >> 12, 3, dark ? 0 : NEUTRAL, dark ? 0 : NEUTRAL, 0, px512);
      blit(SPRITE.barFrame, 0, 0x110, up + 0xd8, NEUTRAL, px320);
    }

    // --- 4: the laser bar or the ammo count, left of the spin --------------
    const laser = offsetOf(hud, HudElement.Laser);
    if (laser < 1) {
      const up = -laser;
      const side = stackShift(spin);
      blit(SPRITE.laserArm, 0, 0x110 - side, up + 0xe0, NEUTRAL, px320, 0x800, 0x800);
      const ammo = r.pieces !== 0 ? r.pieces : r.discs;
      const isDisc = r.pieces === 0 && r.discs !== 0;
      if (ammo !== 0) {
        const dy = isDisc ? 0 : -7;
        digit(Math.floor(ammo / 10) % 10, 0x122 - side, up + dy + 0xd8, px320, 0x800);
        digit(ammo % 10, 0x129 - side, up + dy + 0xd8, px320, 0x800);
        if (isDisc) {
          blit(SPRITE.disc, 0, 0x1b6 - (side * 512) / 320, up + dy + 0xd6, NEUTRAL, px512, 0xc00, 0x800);
        } else {
          blit(SPRITE.ammoPiece, 0, 0x112 - side, up + dy + 0xce, NEUTRAL, px320);
        }
      }
      if (!isDisc) {
        // No disc ammo: the same slot carries the laser charge, or the
        // green power-up timer while one is running.
        let width = 0;
        let cr = 0, cg = 0;
        if (r.powerTimer !== 0) {
          width = (r.powerTimer * 0x98) >> 12;
          cr = 0; cg = (r.powerTimer >> 4) + 0x40;
        } else {
          const dark = r.laserCharge === 0x40 && hud.div8 < 4;
          width = ((r.laserCharge * 0x1644) / 2) >> 12;
          cr = dark ? 0 : NEUTRAL;
          cg = dark ? 0 : r.laserCharge * 2;
        }
        bar(0x1b6 - (side * 512) / 320, up + 0xda, width, 3, cr, cg, 0, px512);
        blit(SPRITE.barFrame, 0, 0x110 - side, up + 0xd8, NEUTRAL, px320);
      }
    }

    // --- 7: the boss bar, top centre ---------------------------------------
    const boss = offsetOf(hud, HudElement.Boss);
    if (boss < 1 && r.boss >= 0) {
      const value = Math.min(0x36, r.boss);
      if (value >= 0xb || blinkOn(hud)) {
        bar(0xe4, boss + 0x14, value, 4, NEUTRAL, value * 2, 0, px512);
      }
      blit(SPRITE.barFrame, 0, 0xe0, boss + 0x10, NEUTRAL, px512, 0x2000, 0x2000);
    }

    // --- the talk box, submitted after the HUD so it lands behind it ------
    if (talk && talk.scale !== 0) {
      const t = Math.abs(talk.scale);
      const w = Math.max(TALK_DRAW.minWidth << 12, t * TALK_DRAW.width);
      const h = Math.max(TALK_DRAW.minHeight << 12, t * TALK_DRAW.height);
      const bx = TALK_DRAW.centreX - (w >> 13);
      const by = TALK_DRAW.centreY - (h >> 13);
      const solid = (x: number, y: number, sx: number, sy: number, cr: number, cg: number, cb: number, alpha: number) => {
        const header = table[SPRITE.pixel];
        if (!header) return;
        bar(x, y, (header.width * sx) >> 12, (header.height * sy) >> 12, cr, cg, cb, px512, alpha);
      };
      // Four black edges and the fill inside them, exactly as the box helper
      // lays them out.
      solid(bx, by, 0x2000, h, 0, 0, 0, 1);
      solid((w >> 12) - 2 + bx, by, 0x2000, h, 0, 0, 0, 1);
      solid(bx, by, w, 0x1000, 0, 0, 0, 1);
      solid(bx, (h >> 12) - 1 + by, w, 0x1000, 0, 0, 0, 1);
      solid(
        bx + TALK_DRAW.insetX, by + TALK_DRAW.insetY, w - 0x4000, h - 0x2000,
        TALK_DRAW.fill.r, TALK_DRAW.fill.g, TALK_DRAW.fill.b, 0x80 / 0xff,
      );

      if (talk.scale === TALK_DRAW.full) {
        // Only once it is fully open does the text run.
        if (talk.waiting && hud.div32 < 0x10) {
          let x = (0x28 - talk.prompt.length) * 4;
          for (const ch of talk.prompt) {
            glyph(ch, x, TALK_DRAW.promptY, 0xff);
            x += TALK_DRAW.textStep;
          }
        }
        for (let row = 0; row < TALK_DRAW.textRow.length; row++) {
          const line = talk.rows[row];
          if (!line) continue;
          const y = TALK_DRAW.textRow[row]!;
          for (let i = 0; i < line.text.length && i < TALK_DRAW.columns; i++) {
            // Highlighted words drop the red channel, which turns the
            // yellow font green.
            glyph(line.text[i]!, TALK_DRAW.textX + i * TALK_DRAW.textStep, y,
              [line.marks[i] ? 0 : NEUTRAL, NEUTRAL, 0]);
          }
        }
      }
    }

    // --- the pause menu, over everything -----------------------------------
    // Rows are centred on x 160 of the 320 space at 8 pixels a glyph, which
    // is what `FUN_00401fb0` does with `0xa0 - 4 * length`.
    if (menu) {
      const centred = (s: string, y: number, colour: Modulate) => {
        let x = 0xa0 - s.length * 4;
        for (const ch of s) { glyph(ch, x, y, colour); x += 8; }
      };
      centred(menu.title, MENU_TITLE_Y, [NEUTRAL, NEUTRAL, 0]);
      for (const row of menu.rows) centred(row.text, row.y, row.colour);
    }

    // The buffer fills backward, so the frame lands in the reverse of the
    // order it was submitted in.
    for (let i = this.queue.length - 1; i >= 0; i--) this.queue[i]!();
    this.queue.length = 0;
  }
}

/** The sprite indices the level supplies rather than the executable. */
export const LEVEL_ICONS = { find: LEVEL_SPRITE_BASE, collect: LEVEL_SPRITE_BASE + 1 } as const;
