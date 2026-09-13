/**
 * Sound effects, played from the user's own install.
 *
 * The engine names its effects in a table of 61 strings in `toy2.exe`
 * (`BUZJMP1`, `BUZSKID`, `SPLAT` and so on) and loads each from
 * `data/sfx/<name>.wav`, which is exactly what is on disc. The sim emits those
 * names, so this only has to find the file, decode it once and play it.
 *
 * The player's own moves name their effects directly, because the controller
 * does. Everything else in the game raises an EVENT number instead, and
 * src/audio/events.ts turns one into a name and a position; `playAt` is what
 * plays it, with the engine's own per-ear attenuation and pan.
 *
 * Nothing is bundled. Audio is game data and stays on the user's disc like
 * every other asset; this reads it through the same `GameDir` handle as the
 * models and levels.
 */
import type { GameDir } from '../loader/gamedir.ts';
import { MUSIC_VOLUME_CURVE } from './music.ts';
import { earLevels } from './events.ts';

/** A decoded effect, or `null` once we know the install has no such file. */
type Slot = AudioBuffer | null;

export class SoundBank {
  private context: AudioContext | null = null;
  private readonly buffers = new Map<string, Slot>();
  private readonly pending = new Map<string, Promise<Slot>>();
  private gain: GainNode | null = null;
  /**
   * Effects playing under the engine's second, sustained path. It reuses one
   * voice per sound rather than starting another, so a hum that is raised
   * again every twenty ticks is one continuous hum; here that is a set of
   * what is still running, and a repeat is dropped until it ends.
   */
  private readonly sustaining = new Set<string>();

  /** Off until the user asks for it; browsers refuse audio before a gesture anyway. */
  enabled = false;

  private level = 0.6;
  /** Master volume, 0 to 1. Setting it takes effect immediately. */
  get volume(): number { return this.level; }
  set volume(v: number) {
    this.level = v;
    if (this.gain) this.gain.gain.value = v;
  }

  constructor(private readonly dir: GameDir) {}

  /**
   * Start (or resume) the audio device. Must be called from a user gesture —
   * a key press or a click — or the browser leaves the context suspended.
   */
  async start(): Promise<void> {
    if (!this.context) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.context = new Ctor();
      this.gain = this.context.createGain();
      this.gain.gain.value = this.level;
      this.gain.connect(this.context.destination);
    }
    this.enabled = true;
    // Deliberately not awaited. A browser that has not seen a real user
    // gesture leaves `resume()` pending indefinitely rather than rejecting, so
    // waiting on it here would leave sound switched off for the whole session
    // — which is exactly what happened under the headless harness, where a
    // synthetic key press is not a trusted gesture.
    if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
  }

  stop(): void {
    this.enabled = false;
    this.sustaining.clear();
  }

  /** How many effects are decoded and ready, for the status line. */
  get ready(): number {
    let n = 0;
    for (const b of this.buffers.values()) if (b) n++;
    return n;
  }

  private load(name: string): Promise<Slot> {
    const key = name.toLowerCase();
    const already = this.pending.get(key);
    if (already) return already;

    const file = this.dir.get(`data/sfx/${key}.wav`);
    const job: Promise<Slot> = (async () => {
      if (!file || !this.context) return null;
      try {
        const bytes = await file.read();
        // decodeAudioData detaches the buffer it is given, and `read` may hand
        // back a view onto a larger one, so pass a copy.
        const copy = bytes.slice().buffer as ArrayBuffer;
        return await this.context.decodeAudioData(copy);
      } catch {
        return null;
      }
    })().then((buffer) => { this.buffers.set(key, buffer); return buffer; });

    this.pending.set(key, job);
    return job;
  }

  /**
   * Play one effect by its engine name. Safe to call every tick: unknown names
   * and missing files are remembered as absent and cost nothing after the
   * first look.
   */
  play(name: string, gain = 1, pan = 0, sustained = false): void {
    if (!this.enabled || !this.context || !this.gain) return;
    if (this.context.state !== 'running') {
      // Still waiting on a gesture. Nudge it and drop this one rather than
      // queueing a burst that all fires at once the moment audio starts.
      void this.context.resume().catch(() => {});
      return;
    }
    const key = name.toLowerCase();
    if (sustained && this.sustaining.has(key)) return;
    const buffer = this.buffers.get(key);
    if (buffer === undefined) { void this.load(key); return; }
    if (buffer === null) return;

    const source = this.context.createBufferSource();
    if (sustained) {
      this.sustaining.add(key);
      source.onended = () => this.sustaining.delete(key);
    }
    source.buffer = buffer;
    let tail: AudioNode = this.gain;
    if (pan !== 0) {
      const panner = this.context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      panner.connect(tail);
      tail = panner;
    }
    if (gain !== 1) {
      const trim = this.context.createGain();
      trim.gain.value = gain;
      trim.connect(tail);
      tail = trim;
    }
    source.connect(tail);
    source.start();
  }

  /**
   * Play a sound where it happens. `offset` is from the camera to the sound
   * in game units, and `yaw` is the camera's facing as a sine and cosine.
   *
   * The engine works out a level for each ear and hands DirectSound a pan
   * from their difference over 128 and a volume of
   * `curve[(slider * max(L, R)) >> 8]`, the same hundredth-of-a-decibel curve
   * the music slider uses.
   *
   * Two things differ. The volume: the engine's slider is a byte in its
   * options screen and ours is this bank's own master gain, so the curve is
   * indexed by the ear level itself — silent at nothing, unattenuated when a
   * sound is at an ear — and the master multiplies what comes out. And the
   * pan's sign, which is negative-is-left here because that is what Web Audio
   * means by it; see `earLevels` for why the engine's own sign could not be
   * established.
   */
  playAt(
    name: string,
    offset: { x: number; y: number; z: number },
    yaw: { sin: number; cos: number },
    sustained = false,
    volume?: number,
  ): void {
    const ears = earLevels(offset, yaw);
    const left = volume === undefined ? ears.left : Math.min(128, ears.left * volume / 128);
    const right = volume === undefined ? ears.right : Math.min(128, ears.right * volume / 128);
    const loudest = Math.max(left, right);
    if (loudest <= 0) return;
    const dB = MUSIC_VOLUME_CURVE[Math.min(MUSIC_VOLUME_CURVE.length - 1, Math.round(loudest))] ?? 0;
    if (dB <= -10000) return;
    this.play(name, 10 ** (dB / 2000), (right - left) / 128, sustained);
  }

  /** Warm the cache so the first jump is not silent while its file loads. */
  preload(names: readonly string[]): void {
    if (!this.context) return;
    for (const name of names) if (!this.buffers.has(name.toLowerCase())) void this.load(name);
  }
}

/**
 * The effects the controller and the animation state machine can ask for.
 * Preloading these means the first of each is audible rather than swallowed.
 */
export const PLAYER_EFFECTS = [
  'BUZJMP1', 'BUZJMP3', 'BUZSKID', 'BUZSPIN', 'BUZTSPIN', 'BUZDIZZY',
  'BUZLASER', 'BUZYLASR', 'BUZFALL1', 'SPLAT',
] as const;
