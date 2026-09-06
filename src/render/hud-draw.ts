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

/** `texel * colour / 0x80`, the engine's modulate, for the bars' solid texel. */
function barColour(r: number, g: number, b: number): string {
  const c = (v: number) => Math.min(255, Math.round((SOLID_TEXEL * v) / NEUTRAL));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

export class HudPainter {
  private readonly ctx: CanvasRenderingContext2D;
  /** This frame's draw calls, flushed in reverse. See the note above. */
  private readonly queue: (() => void)[] = [];

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
      grey: number, sx: number, scaleX = 0x1000, scaleY = 0x1000,
    ) => {
      const h = table[index];
      if (!h) return;
      const sheet = sheets.get(h.texture);
      if (!sheet) return;
      const f = h.frames[frame] ?? h.frames[0];
      if (!f) return;
      const w = (h.width * scaleX) >> 12;
      const ht = (h.height * scaleY) >> 12;
      if (w <= 0 || ht <= 0) return;
      this.queue.push(() => {
        ctx.filter = grey === NEUTRAL ? 'none' : `brightness(${grey / NEUTRAL})`;
        ctx.drawImage(sheet, f.u, f.v, h.width, h.height, x * sx, y * py, w * sx, ht * py);
        ctx.filter = 'none';
      });
    };
    /** A bar: sprite 6's solid texel stretched to `w` x `ht` virtual pixels. */
    const bar = (x: number, y: number, w: number, ht: number, cr: number, cg: number, cb: number, sx: number) => {
      if (w <= 0 || ht <= 0) return;
      this.queue.push(() => {
        ctx.fillStyle = barColour(cr, cg, cb);
        ctx.fillRect(x * sx, y * py, w * sx, ht * py);
      });
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

    // The buffer fills backward, so the frame lands in the reverse of the
    // order it was submitted in.
    for (let i = this.queue.length - 1; i >= 0; i--) this.queue[i]!();
    this.queue.length = 0;
  }
}

/** The sprite indices the level supplies rather than the executable. */
export const LEVEL_ICONS = { find: LEVEL_SPRITE_BASE, collect: LEVEL_SPRITE_BASE + 1 } as const;
