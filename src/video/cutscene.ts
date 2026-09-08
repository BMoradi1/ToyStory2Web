/**
 * Play one of the game's cutscenes in the browser, from the user's own
 * install. The movies are MPEG-1 program streams under `rtlibs/`
 * (src/video/ps-to-ts.ts explains); they are remuxed in memory and handed
 * to jsmpeg, which decodes MPEG-1 video and layer II audio in the page.
 * Nothing is uploaded and nothing is written.
 *
 * Which movie plays when is the executable's rule (`FUN_0049a930` for the
 * names, `FUN_0049eb20` and the game flow for the moments), in `MOVIES`.
 */
import JSMpeg from '@cycjimmy/jsmpeg-player';
import type { GameFile } from '../loader/gamedir.ts';
import { programToTransport } from './ps-to-ts.ts';

/**
 * The packaged decoder's `findStartCode` accepts only the very NEXT start
 * code and gives up otherwise, where the original jsmpeg scans forward until
 * it finds the one asked for. These movies are I-P-B streams, and the first
 * B picture — which the decoder skips — leaves a slice start code next in
 * line, so playback stopped at the fifth frame. Restore the scan.
 *
 * B pictures themselves are still skipped by the decoder, so a 30-frame
 * second shows its ten I and P frames each held for three; the timing is
 * right and the sound is whole.
 */
JSMpeg.BitBuffer.prototype.findStartCode = function findStartCode(this: { findNextStartCode: () => number }, code: number): number {
  for (;;) {
    const current = this.findNextStartCode();
    if (current === code || current === -1) return current;
  }
};

/**
 * `FUN_0049a930(index)`: the movie an index names. 0..2 are the logos the
 * boot plays in the order tt, dlogo, acti; 10 the trailer; 11 up are one
 * per level in PLAY order (the third, sixth, ninth, twelfth and fifteenth
 * being the boss movies), then level 12's second, the secret ending for
 * all fifty tokens, and the ending.
 */
export const MOVIES: Readonly<Record<number, string>> = {
  0: 'dlogo', 1: 'acti', 2: 'tt', 10: '1st trailer',
  11: 'l 01 in', 12: 'l 02 in', 13: 'l 03 bo', 14: 'l 04 in', 15: 'l 05 in', 16: 'l 06 bo',
  17: 'l 07 in', 18: 'l 08 in', 19: 'l 09 bo', 20: 'l 10 in', 21: 'l 11 in', 22: 'l 12 bo',
  23: 'l 13 in', 24: 'l 14 in', 25: 'l 15 bo 1', 26: 'l 12 in', 27: 'l 15 bo 2', 28: 'end 01',
};

/** The boot's three logos, in the order the game flow tries them. */
export const BOOT_MOVIES = [2, 0, 1] as const;

/**
 * `FUN_0049eb20(n, ...)`: movie `n + 10`, and the save's byte at
 * `+0x158 + n` records that it has been shown. `n` is a level's play
 * position (1..15), 0x11 the secret ending, 0x12 the ending.
 */
export const MOVIE_FLAG = { base: 10, secretEnding: 0x11, ending: 0x12 } as const;

/**
 * A source that hands the demuxer a transport stream already in memory, in
 * 188,000-byte pieces. The library's own loader writes a whole file in one
 * go, and its demuxer's buffer is far smaller than a movie: overflowing it
 * turns the parse into a byte-by-byte resync that took ninety seconds for
 * a two-megabyte movie. In pieces the same stream demuxes in milliseconds.
 * The interface is the one the player reads off its Ajax source.
 */
class BufferSource {
  destination: { write: (chunk: Uint8Array) => void } | null = null;
  streaming = false;
  completed = false;
  established = false;
  progress = 0;
  constructor(private readonly bytes: Uint8Array) {}
  connect(destination: { write: (chunk: Uint8Array) => void }): void { this.destination = destination; }
  start(): void {
    const piece = 188 * 1000;
    for (let at = 0; at < this.bytes.length; at += piece) {
      this.destination?.write(this.bytes.subarray(at, Math.min(this.bytes.length, at + piece)));
      this.progress = at / this.bytes.length;
    }
    this.established = true;
    this.completed = true;
    this.progress = 1;
  }
  resume(): void { /* everything is already there */ }
  destroy(): void { this.destination = null; }
}

export interface CutsceneHandle {
  /** Resolves when the movie ends or is skipped. */
  done: Promise<'ended' | 'skipped' | 'failed'>;
  skip: () => void;
  /** Frames decoded so far, the decoder's clock and its buffer, for a test to watch. */
  progress: () => {
    frames: number; time: number; held: number; at: number; seq: boolean | null; size: string | null; demuxTime: number | null;
    timing: { readMs: number; remuxMs: number; playerMs: number; firstFrameMs: number };
  };
}

/**
 * Play a movie over the page. `host` gets a full-cover black layer with the
 * picture letterboxed inside; Escape, Enter, Space or a click skips.
 */
export function playCutscene(
  file: GameFile, host: HTMLElement,
  options: { audio?: boolean; decodeFirstFrame?: boolean } = {},
): CutsceneHandle {
  const layer = document.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;background:#000;z-index:50;display:flex;align-items:center;justify-content:center;cursor:pointer';
  const canvas = document.createElement('canvas');
  // The decoder sizes the canvas to the movie (320 x 208 for the levels,
  // 320 x 192 for the logos); this only fits it to the window.
  canvas.style.cssText = 'width:100vw;height:100vh;object-fit:contain;image-rendering:auto';
  layer.appendChild(canvas);
  host.appendChild(layer);

  let player: { destroy: () => void; currentTime: number } | null = null;
  let frames = 0;
  const timing = { readMs: 0, remuxMs: 0, playerMs: 0, firstFrameMs: 0 };
  const t0 = performance.now();
  let finished = false;
  let resolve!: (r: 'ended' | 'skipped' | 'failed') => void;
  const done = new Promise<'ended' | 'skipped' | 'failed'>((r) => { resolve = r; });

  const end = (how: 'ended' | 'skipped' | 'failed') => {
    if (finished) return;
    finished = true;
    window.removeEventListener('keydown', onKey, true);
    try { player?.destroy(); } catch { /* already gone */ }
    layer.remove();
    resolve(how);
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape' || ev.key === 'Enter' || ev.key === ' ') { ev.stopPropagation(); ev.preventDefault(); end('skipped'); }
  };
  window.addEventListener('keydown', onKey, true);
  layer.addEventListener('click', () => end('skipped'));

  void (async () => {
    try {
      const bytes = await file.read();
      timing.readMs = performance.now() - t0;
      const ts = programToTransport(bytes);
      timing.remuxMs = performance.now() - t0 - timing.readMs;
      // The player is built for a URL; ours is a name only, the bytes ride
      // in through the source.
      const source = function source(this: unknown) { return new BufferSource(ts); } as unknown as new (url: string, options: unknown) => BufferSource;
      // The library's WebAssembly decoders fault on these streams (an
      // out-of-bounds access a second or so in); its JavaScript ones play
      // them cleanly, and at 320 x 208 that costs nothing worth having.
      player = new JSMpeg.Player(`cutscene:${file.name}`, {
        source,
        canvas, audio: options.audio ?? true, autoplay: true, loop: false, pauseWhenHidden: false,
        // Decoding a frame inside the first write, before play begins, hung
        // the page on every second movie of a session; with it off the
        // first frame is on screen a frame later and nothing else changes.
        disableWebAssembly: true, decodeFirstFrame: options.decodeFirstFrame ?? false,
        videoBufferSize: 4 * 1024 * 1024, audioBufferSize: 1024 * 1024,
        onVideoDecode: () => { if (frames++ === 0) timing.firstFrameMs = performance.now() - t0; },
        onEnded: () => end('ended'),
      });
      timing.playerMs = performance.now() - t0;
    } catch (err) {
      console.warn('cutscene failed:', (err as Error).message);
      end('failed');
    }
  })();

  return {
    done,
    skip: () => end('skipped'),
    progress: () => {
      // Reaching into the decoder for a test: how much of the stream it holds.
      const v = (player as unknown as { video?: { bits?: { byteLength: number; index: number }; hasSequenceHeader?: boolean; width?: number; height?: number; frameRate?: number } } | null)?.video;
      const d = (player as unknown as { demuxer?: { currentTime: number } } | null)?.demuxer;
      return {
        frames, time: player?.currentTime ?? 0,
        held: v?.bits?.byteLength ?? -1, at: (v?.bits?.index ?? 0) >> 3,
        seq: v?.hasSequenceHeader ?? null, size: v ? `${v.width}x${v.height}@${v.frameRate}` : null,
        demuxTime: d?.currentTime ?? null,
        timing,
      };
    },
  };
}
