/**
 * The game flow's front end, `FUN_0049d910` from the title on: title ->
 * list menu -> level select -> a level -> the select again, the way the
 * executable's own loop goes (docs/FRONTEND.md "The flow"). The screens
 * themselves are src/front/screens.ts; this runs them at the engine's tick
 * over a page overlay and hands the level off to the host.
 *
 * What the host is asked for is deliberately narrow — the pad's word, a
 * sound, a music track, a level played to its end, the boot chain again —
 * so the flow reads next to the decompiled routine.
 */
import type { SpriteHeader } from '../formats/sprite-table.ts';
import { HudPainter, type Sheet } from '../render/hud-draw.ts';
import {
  createListMenu, createSelect, createTitle, LIST_MENU, SELECT, TITLE,
  stepListMenu, stepSelect, stepTitle,
  type FrontFrame, type FrontStrings, type PadWord,
} from './screens.ts';
import type { FrontArt, Picture, TitleCards } from './title.ts';
import { pictureFor } from './title.ts';
import { createSummary, stepSummary, SUMMARY, type LevelSummary, type SummaryState } from './summary.ts';
import {
  createDiorama, dioramaScene, hiddenObjects, stepDiorama,
  type DioramaFrame, type DioramaLists, type DioramaScene, type DioramaState, type Placing,
} from './diorama.ts';

/** The engine's tick, 16949 microseconds (CLAUDE.md). */
const TICK_SECONDS = 16949 / 1e6;
/** A background tab returns with a long gap; do not replay it all. */
const MAX_CATCH_UP = 5;

export interface FrontHost {
  strings: FrontStrings;
  /** The front end's sprite table (level 0's) and the level select's (level 16's). */
  menuTable: readonly (SpriteHeader | null)[];
  selectTable: readonly (SpriteHeader | null)[];
  /** Texture slot to sheet, from `level00/level.ngn`. */
  sheets: ReadonlyMap<number, Sheet>;
  cards: TitleCards;
  /** The pad this tick as the engine's 16-bit word (screens.ts `PAD`). */
  pad(): number;
  playSound(effect: number): void;
  music(track: number | null): void;
  /** The save's token bytes by internal level, the select cursor, and the last level's entry byte. */
  tokens(): readonly number[];
  cursor(): number;
  setCursor(cursor: number): void;
  enteredWith(): number;
  /**
   * Play the level at a play position (1..15) — its intro included — and
   * resolve when it is over: left through the pause menu, or won.
   */
  playLevel(position: number): Promise<'exit' | 'won'>;
  /** The attract loop's boot again: logos and cards. */
  attract(): Promise<void>;
  /** Results captured before the played level is discarded; bosses skip the tally. */
  summary(): LevelSummary | null;
  loadSummaryArt(): Promise<FrontArt | null>;
  /** "exit" on the list menu. */
  quit(): void;
  /**
   * The level select's diorama (src/front/diorama.ts): load its scene and
   * give back its paths and a vehicle's placing, or null when the install
   * has none; the executable's show/hide lists; the camera node the last
   * visit left (`DAT_0055a0e4`); a byte of the random table; and, each
   * tick, the camera and the objects to apply. `sceneRect` is where the
   * scene's picture sits on the page, for the sprite layer to lie over.
   */
  loadDiorama(): Promise<{ paths: { id: number; points: { x: number; y: number; z: number }[] }[]; placedOf: (id: number) => Placing | null } | null>;
  unloadDiorama(): void;
  dioramaLists(): DioramaLists[];
  camNode(): number;
  setCamNode(node: number): void;
  rand(): number;
  applyDiorama(frame: DioramaFrame, hidden: ReadonlySet<number>): void;
  /** The diorama bundle's sheets while it is loaded: the select's sprites live there. */
  selectSheets(): ReadonlyMap<number, Sheet> | null;
  sceneRect(): { x: number; y: number; width: number; height: number } | null;
}

type Screen =
  | { kind: 'title'; state: ReturnType<typeof createTitle> }
  | { kind: 'menu'; state: ReturnType<typeof createListMenu> }
  | { kind: 'select'; state: ReturnType<typeof createSelect> }
  | { kind: 'summary'; state: SummaryState };

export class FrontEnd {
  private layer: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private painter: HudPainter | null = null;
  private screen: Screen | null = null;
  private pad: PadWord = { now: 0, was: 0 };
  private raf = 0;
  private last = 0;
  private carry = 0;
  private resolveScreen: ((done: string) => void) | null = null;
  /** `DAT_00830d58`: the level select has been reached, so "continue game". */
  private inGame = false;
  /** The last frame drawn, for the harness. */
  lastFrame: FrontFrame | null = null;
  running = false;
  /** The diorama while the select is up, or null without its scene. */
  private diorama: { scene: DioramaScene; state: DioramaState; hidden: Set<number> } | null = null;
  lastDiorama: DioramaFrame | null = null;
  private summaryArt: FrontArt | null = null;

  constructor(private readonly host: FrontHost, private readonly parent: HTMLElement) {}

  /** The screen up now, for the harness. */
  get current(): Screen | null { return this.screen; }

  /** Run the flow until "exit". */
  async run(): Promise<void> {
    this.running = true;
    this.show();
    try {
      let next: 'title' | 'menu' | 'select' = 'title';
      for (;;) {
        if (next === 'title') {
          this.host.music(TITLE.music);
          const done = await this.play({ kind: 'title', state: createTitle() });
          if (done === 'menu') { next = 'menu'; continue; }
          // The attract demo is not ported: the engine plays a recorded
          // level and boots again; here only the boot again.
          this.hide();
          await this.host.attract();
          this.show();
          continue;
        }
        if (next === 'menu') {
          this.host.music(LIST_MENU.music);
          const done = await this.play({ kind: 'menu', state: createListMenu() });
          if (done === 'start') { next = 'select'; continue; }
          if (done === 'exit') return;
          // options, load game and the movie viewer come back to the menu
          // when they close; they are not ported, so they close at once.
          continue;
        }
        this.inGame = true;
        this.host.music(SELECT.music);
        const select = createSelect(this.host.tokens(), this.host.strings, this.host.cursor(), this.host.enteredWith());
        // `FUN_00453cf0` loads the scene before the routine runs; the
        // cursor past the open levels also puts the camera back at node 0.
        if (this.host.cursor() + 1 > select.open) this.host.setCamNode(0);
        await this.openDiorama(select);
        const done = await this.play({ kind: 'select', state: select });
        this.closeDiorama();
        if (done === 'cancel') { next = 'menu'; continue; }
        this.host.setCursor(select.pos - 1);
        this.host.setCamNode(select.pos);
        this.hide();
        this.host.music(null);
        await this.host.playLevel(select.pos);
        const result = this.host.summary();
        if (result) {
          this.summaryArt = await this.host.loadSummaryArt();
          if (this.summaryArt) {
            this.host.music(SUMMARY.music);
            this.show();
            await this.play({ kind: 'summary', state: createSummary(result) });
            this.hide();
          }
          this.summaryArt = null;
        }
        this.show();
      }
    } finally {
      this.running = false;
      this.hide();
      this.host.quit();
    }
  }

  private async openDiorama(select: ReturnType<typeof createSelect>): Promise<void> {
    this.hide();
    const loaded = await this.host.loadDiorama();
    const scene = loaded ? dioramaScene(loaded.paths) : null;
    if (loaded && scene) {
      this.diorama = {
        scene,
        state: createDiorama(scene, this.host.camNode(), select.pos, loaded.placedOf),
        hidden: hiddenObjects(this.host.dioramaLists(), select.open),
      };
    } else {
      this.diorama = null;
    }
    this.show();
  }

  private closeDiorama(): void {
    if (this.diorama) this.host.unloadDiorama();
    this.diorama = null;
    this.lastDiorama = null;
  }

  private play(screen: Screen): Promise<string> {
    this.screen = screen;
    this.pad = { now: this.host.pad(), was: this.host.pad() };
    return new Promise((resolve) => { this.resolveScreen = resolve; });
  }

  /** One engine tick of the screen up; returns what ended it, if anything. */
  tick(): string | null {
    const screen = this.screen;
    if (!screen) return null;
    this.pad = { now: this.host.pad(), was: this.pad.now };
    let result;
    if (screen.kind === 'title') result = stepTitle(screen.state, this.pad, this.host.strings);
    else if (screen.kind === 'menu') result = stepListMenu(screen.state, this.pad, this.host.strings, this.inGame);
    else if (screen.kind === 'summary') {
      result = stepSummary(screen.state, this.pad, this.host.strings.pressJumpToExit, this.host.rand);
    } else {
      result = stepSelect(screen.state, this.pad, this.host.strings);
      if (this.diorama) {
        const frame = stepDiorama(this.diorama.state, this.diorama.scene, screen.state.pos, screen.state.ticks, this.host.rand);
        this.lastDiorama = frame;
        this.host.applyDiorama(frame, this.diorama.hidden);
      } else {
        // No scene to draw over: the select's layer stays on black.
        result.frame.transparent = false;
      }
    }
    for (const effect of result.sounds) this.host.playSound(effect);
    this.lastFrame = result.frame;
    this.paint(result.frame, screen.kind === 'select' ? this.host.selectTable : this.host.menuTable);
    if (result.done !== null) {
      const resolve = this.resolveScreen;
      this.resolveScreen = null;
      resolve?.(result.done);
      return result.done;
    }
    return null;
  }

  /** Step `n` ticks with a pad word, for the harness. */
  drive(word: number, n = 1): string | null {
    let done: string | null = null;
    const pad = this.host.pad;
    (this.host as { pad(): number }).pad = () => word;
    try {
      for (let i = 0; i < n && done === null; i++) done = this.tick();
    } finally {
      (this.host as { pad(): number }).pad = pad;
    }
    return done;
  }

  private paint(frame: FrontFrame, table: readonly (SpriteHeader | null)[]): void {
    if (!this.painter || !this.canvas) return;
    const summary = this.screen?.kind === 'summary' ? this.summaryArt : null;
    const card: Picture | null = frame.picture === null ? null : pictureFor(summary?.cards ?? this.host.cards, frame.picture);
    const sheets = summary?.sheets ?? (this.diorama ? this.host.selectSheets() : null) ?? this.host.sheets;
    this.painter.paintFront(frame, table, sheets, card?.canvas ?? null);
  }

  private show(): void {
    if (this.layer) { this.layer.hidden = false; this.loop(); return; }
    const layer = document.createElement('div');
    layer.id = 'front';
    layer.style.cssText = 'position:fixed;inset:0;background:#000;z-index:40;display:flex;align-items:center;justify-content:center';
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'image-rendering:pixelated';
    layer.appendChild(canvas);
    this.parent.appendChild(layer);
    this.layer = layer;
    this.canvas = canvas;
    this.painter = new HudPainter(canvas);
    this.loop();
  }

  private hide(): void {
    if (this.layer) this.layer.hidden = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.screen = null;
  }

  /**
   * Fit the engine's 4:3 screen inside the window, as the viewer does — or,
   * with the diorama up, lie exactly over the scene's picture and let it
   * show through.
   */
  private fit(): void {
    if (!this.canvas || !this.painter || !this.layer) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const over = this.diorama ? this.host.sceneRect() : null;
    if (over) {
      this.layer.style.background = 'transparent';
      this.layer.style.pointerEvents = 'none';
      this.canvas.style.position = 'fixed';
      this.canvas.style.left = `${over.x}px`;
      this.canvas.style.top = `${over.y}px`;
      this.canvas.style.width = `${Math.round(over.width)}px`;
      this.canvas.style.height = `${Math.round(over.height)}px`;
      this.painter.resize(Math.round(over.width * dpr), Math.round(over.height * dpr));
      return;
    }
    this.layer.style.background = '#000';
    this.layer.style.pointerEvents = '';
    this.canvas.style.position = '';
    this.canvas.style.left = '';
    this.canvas.style.top = '';
    const W = window.innerWidth;
    const H = window.innerHeight;
    let width = W;
    let height = (W * 3) / 4;
    if (height > H) { height = H; width = (H * 4) / 3; }
    this.canvas.style.width = `${Math.round(width)}px`;
    this.canvas.style.height = `${Math.round(height)}px`;
    this.painter.resize(Math.round(width * dpr), Math.round(height * dpr));
  }

  private loop(): void {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    this.carry = 0;
    const frame = (now: number) => {
      if (!this.layer || this.layer.hidden) return;
      this.fit();
      this.carry += (now - this.last) / 1000;
      this.last = now;
      let ticks = Math.floor(this.carry / TICK_SECONDS);
      if (ticks > MAX_CATCH_UP) { ticks = MAX_CATCH_UP; this.carry = 0; } else this.carry -= ticks * TICK_SECONDS;
      for (let i = 0; i < ticks; i++) if (this.tick() !== null) break;
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }
}
