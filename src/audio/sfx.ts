/**
 * Sound effects, played from the user's own install.
 *
 * The engine names its effects in a table of 61 strings in `toy2.exe`
 * (`BUZJMP1`, `BUZSKID`, `SPLAT` and so on) and loads each from
 * `data/sfx/<name>.wav`, which is exactly what is on disc. The sim emits those
 * names, so this only has to find the file, decode it once and play it.
 *
 * What is deliberately NOT here: the engine's *event* table, 200 entries at
 * 0x502950 mapping an event number to an effect plus a pitch, a volume and a
 * falloff. The sim names effects directly instead. The event table is real and
 * worth porting — it is where per-sound pitch and 3D falloff live — but the
 * effect index it stores is off by one in a way I have not pinned down, and
 * playing a confidently-wrong sound is worse than playing a plain one. See
 * docs/PLAYER.md.
 *
 * Nothing is bundled. Audio is game data and stays on the user's disc like
 * every other asset; this reads it through the same `GameDir` handle as the
 * models and levels.
 */
import type { GameDir } from '../loader/gamedir.ts';

/** A decoded effect, or `null` once we know the install has no such file. */
type Slot = AudioBuffer | null;

export class SoundBank {
  private context: AudioContext | null = null;
  private readonly buffers = new Map<string, Slot>();
  private readonly pending = new Map<string, Promise<Slot>>();
  private gain: GainNode | null = null;

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
  play(name: string, gain = 1): void {
    if (!this.enabled || !this.context || !this.gain) return;
    if (this.context.state !== 'running') {
      // Still waiting on a gesture. Nudge it and drop this one rather than
      // queueing a burst that all fires at once the moment audio starts.
      void this.context.resume().catch(() => {});
      return;
    }
    const key = name.toLowerCase();
    const buffer = this.buffers.get(key);
    if (buffer === undefined) { void this.load(key); return; }
    if (buffer === null) return;

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    if (gain === 1) {
      source.connect(this.gain);
    } else {
      const trim = this.context.createGain();
      trim.gain.value = gain;
      trim.connect(this.gain);
      source.connect(trim);
    }
    source.start();
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
