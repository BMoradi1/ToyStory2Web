/**
 * Music, played from the user's own install.
 *
 * The tracks are plain WAVs in `audio/` at the top of the install — not under
 * `data/` like everything else — about 8 MB each. `toy2.exe` names them in a
 * table of 22 strings at 0x4eccd8, and `FUN_00413150` builds `audio\<name>.wav`
 * and hands it to a DirectShow thread. The first fifteen entries are the
 * fifteen levels in order, so a level's track is simply the table entry at its
 * own index minus one.
 *
 * Which track should be playing is decided every tick by `FUN_0049eac0`: the
 * mini-boss theme while that timer runs, else the race theme while a race is
 * running, else the level's own. Each branch only restarts the music when what
 * is playing differs, which is what `want` reproduces — it is safe to call
 * every frame.
 *
 * An 8 MB WAV decoded to PCM is about 90 MB in memory, so this streams through
 * an `<audio>` element off a blob URL instead of `decodeAudioData`. Nothing is
 * bundled: like every other asset the audio stays on the user's disc and is
 * read through the same `GameDir` handle.
 *
 * See NEXT_SESSION.txt's MUSIC block and docs/LEVELS.md for where all of this
 * was read out of the executable.
 */
import type { GameDir } from '../loader/gamedir.ts';
import { selectIndexOf } from '../formats/save-file.ts';

/**
 * The 22 track names, in the order of the table at 0x4eccd8. Indices 0..14 are
 * levels 1..15; the rest are the front end and the one-shots.
 */
export const MUSIC_TRACKS = [
  'house', 'neighbou', 'buzvred', 'constr', 'alley',
  'slime', 'als_toyb', 'spacelnd', 'buzvbuz', 'elev',
  'als_pent', 'buzvzurg', 'convey', 'tarmac', 'buzvpros',
  'miniboss', 'minirace', 'over', 'complete', 'ygafim',
  'titlescr', 'levcomp',
] as const;

/** The tracks that are not a level's, by the name the engine uses them under. */
export const MUSIC = {
  miniboss: 15,
  minirace: 16,
  /** Game over. Played once. */
  gameOver: 17,
  /** The game-complete screen. Looped. */
  complete: 18,
  /** The front-end menus. Looped. */
  menu: 19,
  /** The title screen. Played once. */
  title: 20,
  /** The level-complete screen. Played once. */
  levelComplete: 21,
} as const;

/**
 * Which track a level plays. Levels are 1..15; anything else has none.
 *
 * The engine indexes the table by `DAT_0052ad8a`, which is the LEVEL-SELECT
 * index rather than the internal level number (decoded 2026-09-07 with the
 * save file, docs/FORMATS.md). The two only differ for the first two
 * worlds' bosses, whose internal numbers are swapped in the select order:
 * internal level 6 is the third level offered and plays `buzvred`, and
 * internal level 3 is the sixth and plays `slime`.
 */
export function trackForLevel(level: number): number | null {
  const index = selectIndexOf(level);
  return index >= 0 ? index : null;
}

/**
 * The options slider's volume curve: 151 entries of hundredths of a decibel,
 * from the table at 0x4fd668. `FUN_0049ae40` indexes it with
 * `slider * 150 / 64` and hands the result to DirectShow, which takes
 * attenuation in the same units. Silent at the bottom, unattenuated from about
 * three quarters up.
 */
export const MUSIC_VOLUME_CURVE: readonly number[] = [
  -10000, -9800, -9600, -9300, -9000, -8700, -8300, -8000, -7250, -6500,
  -5750, -5500, -5250, -5000, -4500, -4000, -3900, -3800, -3700, -3600,
  -3500, -3400, -3300, -3200, -3100, -3000, -2920, -2840, -2770, -2700,
  -2630, -2560, -2490, -2420, -2350, -2280, -2210, -2140, -2070, -2000,
  -1960, -1912, -1864, -1830, -1790, -1750, -1710, -1670, -1630, -1590,
  -1550, -1510, -1470, -1430, -1390, -1340, -1290, -1250, -1210, -1168,
  -1126, -1084, -1042, -1000, -985, -970, -955, -940, -925, -910,
  -895, -880, -865, -850, -835, -820, -805, -790, -775, -759,
  -743, -727, -711, -695, -679, -663, -647, -631, -615, -599,
  -583, -567, -551, -535, -519, -503, -487, -471, -455, -439,
  -423, -407, -391, -375, -359, -343, -327, -311, -295, -279,
  -263, -247, -231, -215, -199, -183, -167, -151, -135, -119,
  -103, -87, -71, -55, -39, -23, -7, -6, -5, -4,
  -3, -2, -1, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0,
];

/** The slider's full range, as the options screen uses it. */
export const MUSIC_SLIDER_MAX = 64;

/**
 * The linear gain for a slider position, 0 to `MUSIC_SLIDER_MAX`. The curve is
 * attenuation in hundredths of a decibel, so this is `10^(dB/2000)` — the
 * halved exponent is because DirectShow's units are amplitude decibels.
 */
export function musicGain(slider: number): number {
  const clamped = Math.max(0, Math.min(MUSIC_SLIDER_MAX, Math.round(slider)));
  const dB = MUSIC_VOLUME_CURVE[Math.floor((clamped * 150) / MUSIC_SLIDER_MAX)] ?? 0;
  return dB <= -10000 ? 0 : 10 ** (dB / 2000);
}

/**
 * Plays one track at a time, the way the engine's DirectShow thread does.
 *
 * `want` is the call the level ticks make: it starts the track if something
 * else (or nothing) is playing and does nothing otherwise. `play` always
 * restarts. Starting anything stops what was playing first.
 */
export class MusicPlayer {
  private element: HTMLAudioElement | null = null;
  private url: string | null = null;
  /** Which track is playing, or null. */
  private track: number | null = null;
  /** Tracks the install turned out not to have, so they are asked for once. */
  private readonly missing = new Set<number>();
  private loading: number | null = null;
  private slider = 40;

  /** Off until the user asks for it; browsers refuse audio before a gesture. */
  enabled = false;

  constructor(private readonly dir: GameDir) {}

  /** What is playing, by table index. */
  get current(): number | null { return this.track; }

  /** The name of what is playing, for a status line. */
  get currentName(): string | null {
    return this.track === null ? null : MUSIC_TRACKS[this.track] ?? null;
  }

  /** The options slider, 0 to 64. */
  get volume(): number { return this.slider; }
  set volume(v: number) {
    this.slider = Math.max(0, Math.min(MUSIC_SLIDER_MAX, v));
    if (this.element) this.element.volume = musicGain(this.slider);
  }

  /** Start it playing this track unless it already is. Safe every frame. */
  want(track: number | null, loop = true): void {
    if (track === null || track === this.track || track === this.loading) return;
    this.play(track, loop);
  }

  /** Start this track from the beginning, stopping whatever was playing. */
  play(track: number, loop = true): void {
    if (!this.enabled || this.missing.has(track)) return;
    const name = MUSIC_TRACKS[track];
    if (!name) return;

    this.stop();
    this.loading = track;
    void (async () => {
      const file = this.dir.get(`audio/${name}.wav`);
      if (!file) { this.missing.add(track); this.loading = null; return; }
      let bytes: Uint8Array;
      try {
        bytes = await file.read();
      } catch {
        this.missing.add(track);
        this.loading = null;
        return;
      }
      // Another track was asked for while this one was reading: drop it.
      if (this.loading !== track || !this.enabled) { this.loading = null; return; }

      const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'audio/wav' }));
      const element = new Audio(url);
      element.loop = loop;
      element.volume = musicGain(this.slider);
      this.element = element;
      this.url = url;
      this.track = track;
      this.loading = null;
      // A browser that has not seen a real gesture rejects this; the track
      // then simply is not playing, which is the same as being muted.
      void element.play().catch(() => {});
    })();
  }

  /** Stop and release whatever is playing. */
  stop(): void {
    this.loading = null;
    if (this.element) {
      this.element.pause();
      this.element.src = '';
    }
    if (this.url) URL.revokeObjectURL(this.url);
    this.element = null;
    this.url = null;
    this.track = null;
  }

  /** Let the music play. Call from a user gesture. */
  start(): void { this.enabled = true; }

  /** Silence it until `start` is called again. */
  disable(): void {
    this.enabled = false;
    this.stop();
  }
}
