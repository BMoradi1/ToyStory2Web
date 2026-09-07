/**
 * The pause menu, ported from `FUN_0049f4b0` (the input) and the tail of
 * `FUN_0049fd40` (the drawing). Four pages, read out of the executable:
 *
 *     pause menu       continue / camera mode / volume control / exit level
 *     camera mode      passive camera / active camera
 *     volume control   sfx ********** / bgm **********
 *     are you sure?    no / yes
 *
 * The strings live in the user's own `toy2.exe` at the addresses below and
 * are read at run time like every other piece of the game's text; the two
 * volume rows are built here because the original edits its own copy of the
 * string in place, writing one asterisk per step and spaces for the rest.
 *
 * Rows are centred on x 160 of the 320-wide text space at 8 pixels a glyph,
 * with the title at y 84 and the items 8 apart from y 96. A two-item page
 * puts its rows at 100 and 108 instead. The selected row is the one that
 * MOVES: everything is drawn at a steady 0x80 and the selection's red and
 * green pulse between 0x40 and 0x7e off the frame counter, which is what
 * reads as the highlight.
 */

/** Which page is showing (`DAT_0052adb0`). */
export enum MenuPage {
  Root = 0,
  Camera = 1,
  Volume = 2,
  Confirm = 3,
}

/** Addresses of the menu's text in `toy2.exe`, for `exeString`. */
export const MENU_TEXT = {
  title: 0x5026d8,
  continue: 0x5026e4,
  cameraMode: 0x502714,
  volumeControl: 0x502740,
  exitLevel: 0x5026f0,
  passiveCamera: 0x502720,
  activeCamera: 0x502730,
  areYouSure: 0x5026fc,
  no: 0x50270c,
  yes: 0x502710,
  /** Drawn at y 200 when the pad has gone away. Not used here. */
  insertController: 0x5027c0,
} as const;

export const MENU = {
  /** `DAT_005039bc`: how many items each page has. */
  items: [4, 2, 2, 2] as const,
  /** Rows, in the 320-wide text space. */
  titleY: 0x54,
  /** Item rows on the four-item page, and on a two-item page. */
  rowsFour: [0x60, 0x68, 0x70, 0x78] as const,
  rowsTwo: [100, 0x6c] as const,
  /** Everything is this bright except the selection. */
  steady: 0x80,
  /** ...which pulses between these, as a triangle wave off the frame counter. */
  pulseLow: 0x40,
  pulseHigh: 0x7e,
  /** The volume rows are ten steps of asterisk. */
  volumeSteps: 10,
  /** Sound events: moving, going in, coming back out. */
  moveEvent: 0x3f,
  enterEvent: 0x3d,
  backEvent: 0x3e,
} as const;

/** What a press asked the game to do. */
export type MenuAction =
  | { kind: 'resume' }
  | { kind: 'exit' }
  | { kind: 'camera'; passive: boolean }
  | { kind: 'volume'; sfx: number; bgm: number };

export interface MenuState {
  open: boolean;
  page: MenuPage;
  /** `DAT_0052b7e4`. */
  item: number;
  /** The two sliders, 0..10. */
  sfx: number;
  bgm: number;
  /** Counts up while the menu is open; the highlight's triangle wave. */
  phase: number;
  /** Sound events raised this tick, for the caller. */
  events: number[];
}

export function createMenu(sfx = 7, bgm = 6): MenuState {
  return { open: false, page: MenuPage.Root, item: 0, sfx, bgm, phase: 0, events: [] };
}

export function openMenu(menu: MenuState): void {
  menu.open = true;
  menu.page = MenuPage.Root;
  menu.item = 0;
}

/** The buttons the menu reads, each as a PRESS rather than a hold. */
export interface MenuInput {
  up: boolean; down: boolean; left: boolean; right: boolean;
  select: boolean; back: boolean;
}

/** How bright the selected row is this tick. */
export function highlight(menu: MenuState): number {
  const t = menu.phase & 0x3f;
  const fold = t < 0x20 ? t : 0x3f - t;
  return fold * 2 + MENU.pulseLow;
}

/** The rows a page shows: its title, then its items. */
export function menuRows(
  menu: MenuState,
  text: (address: number) => string,
): { title: string; items: string[]; ys: readonly number[] } {
  const bar = (label: string, value: number) =>
    `${label} ${'*'.repeat(value)}${' '.repeat(MENU.volumeSteps - value)}`;
  switch (menu.page) {
    case MenuPage.Camera:
      return {
        title: text(MENU_TEXT.cameraMode),
        items: [text(MENU_TEXT.passiveCamera), text(MENU_TEXT.activeCamera)],
        ys: MENU.rowsTwo,
      };
    case MenuPage.Volume:
      return {
        title: text(MENU_TEXT.volumeControl),
        items: [bar('sfx', menu.sfx), bar('bgm', menu.bgm)],
        ys: MENU.rowsTwo,
      };
    case MenuPage.Confirm:
      return {
        title: text(MENU_TEXT.areYouSure),
        items: [text(MENU_TEXT.no), text(MENU_TEXT.yes)],
        ys: MENU.rowsTwo,
      };
    default:
      return {
        title: text(MENU_TEXT.title),
        items: [
          text(MENU_TEXT.continue), text(MENU_TEXT.cameraMode),
          text(MENU_TEXT.volumeControl), text(MENU_TEXT.exitLevel),
        ],
        ys: MENU.rowsFour,
      };
  }
}

/**
 * One tick of the menu. Returns what the press asked for, if anything.
 *
 * Up and down move within the page's item count; left and right work the
 * sliders on the volume page only. Select goes in, back comes out — and on
 * the root page back is the same as picking "continue", which is why the
 * original treats its two buttons together.
 */
export function stepMenu(menu: MenuState, input: MenuInput): MenuAction | null {
  menu.events.length = 0;
  if (!menu.open) return null;
  menu.phase += 1;

  const count = MENU.items[menu.page] ?? 1;
  if (input.down && menu.item < count - 1) {
    menu.item += 1;
    menu.events.push(MENU.moveEvent);
  }
  if (input.up && menu.item > 0) {
    menu.item -= 1;
    menu.events.push(MENU.moveEvent);
  }

  // The sliders. Row 0 is the effects, row 1 the music.
  if (menu.page === MenuPage.Volume && (input.left || input.right)) {
    const key = menu.item === 0 ? 'sfx' : 'bgm';
    const was = menu[key];
    if (input.right && was < MENU.volumeSteps) menu[key] = was + 1;
    if (input.left && was > 0) menu[key] = was - 1;
    if (menu[key] !== was) {
      menu.events.push(MENU.enterEvent);
      return { kind: 'volume', sfx: menu.sfx, bgm: menu.bgm };
    }
  }

  if (!input.select && !input.back) return null;

  // Back always climbs one page, and on the root page it resumes.
  if (input.back) {
    menu.events.push(MENU.backEvent);
    if (menu.page === MenuPage.Root) { menu.open = false; return { kind: 'resume' }; }
    menu.page = MenuPage.Root;
    menu.item = 0;
    return null;
  }

  switch (menu.page) {
    case MenuPage.Root:
      if (menu.item === 0) {
        menu.events.push(MENU.backEvent);
        menu.open = false;
        return { kind: 'resume' };
      }
      menu.events.push(MENU.enterEvent);
      menu.page = menu.item === 1 ? MenuPage.Camera
        : menu.item === 2 ? MenuPage.Volume : MenuPage.Confirm;
      menu.item = 0;
      return null;
    case MenuPage.Camera: {
      const passive = menu.item === 0;
      menu.events.push(MENU.backEvent);
      menu.page = MenuPage.Root;
      menu.item = 0;
      return { kind: 'camera', passive };
    }
    case MenuPage.Volume:
      menu.events.push(MENU.backEvent);
      menu.page = MenuPage.Root;
      menu.item = 0;
      return null;
    case MenuPage.Confirm:
      if (menu.item === 1) {
        menu.events.push(MENU.enterEvent);
        menu.open = false;
        return { kind: 'exit' };
      }
      menu.events.push(MENU.backEvent);
      menu.page = MenuPage.Root;
      menu.item = 0;
      return null;
    default:
      return null;
  }
}
