/**
 * The front end's picture screens, from the user's own install.
 *
 * The front end is 2D. `data/level00`'s four `.ngn` files are TEXTURE
 * BUNDLES and nothing else — their chunk chain is one 0x104 textures chunk
 * and one 0x106 creatures chunk, then the file ends, with no gobjs and no
 * instances — so there is no front-end scene to render (docs/FRONTEND.md).
 * What the screens are is full-screen 800 x 600 pictures the engine shows as
 * the backdrop.
 *
 * `FUN_0048f1b0(n)` picks one: it adds one to `n` and takes that entry of
 * the table at `0x500a58`, falling back to `0x500a7c` when the first slot is
 * not loaded, then raises the backdrop flag `DAT_005d2a90`. `FUN_00438520(n)`
 * shows one for 600 ticks, or 0x18 more once jump is pressed.
 */
import type { GameDir } from '../loader/gamedir.ts';
import { decodeBmp, parseNgn } from '../formats/ngn.ts';

/** `0x500a58`, and `0x500a7c` when a slot is missing. Indexed by `n + 1`. */
export const PICTURE_SLOTS = [36, 40, 41, 42, 43, 44, 45, 46, 47] as const;
export const PICTURE_SLOTS_ALT = [32, 88, 89, 90, 91, 92, 93, 94, 95] as const;

/**
 * What each picture in `level00/level.ngn` turns out to be, by the argument
 * `FUN_00438520` is called with. The boot shows 2 then 3, and the list menu
 * sits on 4.
 */
export const PICTURE = {
  /** The Disney/Pixar Toy Story 2 card. */
  logo: 0,
  /** The ESRB rating card. */
  rating: 1,
  /** The trademark notices. */
  trademarks: 2,
  /** A second notices card. */
  notices: 3,
  /** "Buzz Lightyear to the Rescue": the title, and the menu's background. */
  title: 4,
} as const;

/** How long a card stays up, and the tail once jump is pressed. */
export const PICTURE_TICKS = 600;

/** One decoded picture, ready for a 2D context. */
export interface Picture { width: number; height: number; canvas: HTMLCanvasElement }

export type TitleCards = Map<number, Picture>;

/**
 * Decode the front end's pictures. Only the slots the tables name are
 * decoded, so the other bundles' art costs nothing. Returns an empty map if
 * the install has no `level00`.
 */
export async function loadTitleCards(dir: GameDir): Promise<TitleCards> {
  const out: TitleCards = new Map();
  const file = dir.get('data/level00/level.ngn');
  if (!file) return out;
  const wanted = new Set<number>([...PICTURE_SLOTS, ...PICTURE_SLOTS_ALT]);
  let textures;
  try {
    textures = parseNgn(await file.read());
  } catch (err) {
    console.warn('the front end pictures did not decode:', (err as Error).message);
    return out;
  }
  for (const texture of textures) {
    if (texture.slot === null || !wanted.has(texture.slot)) continue;
    // The browser's own decoder refuses these — they are 8-bit palettised
    // BMPs written in 1999 — so they go through the project's reader, the
    // same one the level textures use.
    const image = decodeBmp(texture.bmp);
    if (!image) continue;
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height), 0, 0);
    out.set(texture.slot, { width: image.width, height: image.height, canvas });
  }
  return out;
}

/** The picture for a `FUN_00438520` argument, or null when neither slot loaded. */
export function pictureFor(cards: TitleCards, n: number): Picture | null {
  const at = n + 1;
  if (at < 0 || at >= PICTURE_SLOTS.length) return null;
  return cards.get(PICTURE_SLOTS[at]!) ?? cards.get(PICTURE_SLOTS_ALT[at]!) ?? null;
}

export interface CardHandle {
  /** Resolves when the card's time is up or a key ends it. */
  done: Promise<'ended' | 'skipped'>;
  /** Take it off the screen now. */
  close: () => void;
  /** The element, so a caller can draw over it. */
  layer: HTMLElement;
}

/**
 * Put one picture over the page, letterboxed on black, for `ticks` at the
 * engine's 59 frames a second. Escape, Enter, Space or a click ends it.
 * `hold` keeps it up until the caller closes it, which is what the menu
 * needs from its background.
 */
export function showCard(
  picture: Picture, host: HTMLElement,
  options: { ticks?: number; hold?: boolean } = {},
): CardHandle {
  const layer = document.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;background:#000;z-index:40;display:flex;align-items:center;justify-content:center;cursor:pointer';
  const canvas = picture.canvas;
  canvas.style.cssText = 'width:100vw;height:100vh;object-fit:contain';
  layer.appendChild(canvas);
  host.appendChild(layer);

  let finished = false;
  let resolve!: (how: 'ended' | 'skipped') => void;
  const done = new Promise<'ended' | 'skipped'>((r) => { resolve = r; });
  const end = (how: 'ended' | 'skipped') => {
    if (finished) return;
    finished = true;
    window.removeEventListener('keydown', onKey, true);
    clearTimeout(timer);
    layer.remove();
    resolve(how);
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape' && ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.stopPropagation();
    ev.preventDefault();
    end('skipped');
  };
  window.addEventListener('keydown', onKey, true);
  layer.addEventListener('click', () => end('skipped'));
  // 59 frames a second is the engine's own pacing (CLAUDE.md).
  const timer = options.hold
    ? (undefined as unknown as ReturnType<typeof setTimeout>)
    : setTimeout(() => end('ended'), ((options.ticks ?? PICTURE_TICKS) * 1000) / 59);

  return { done, close: () => end('skipped'), layer };
}
