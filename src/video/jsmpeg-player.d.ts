/** The parts of jsmpeg's wrapper this project uses; the library ships no types. */
declare module '@cycjimmy/jsmpeg-player' {
  interface PlayerOptions {
    /** A source class; the player constructs it with the URL and its options. */
    source?: new (url: string, options: unknown) => unknown;
    canvas?: HTMLCanvasElement;
    audio?: boolean;
    autoplay?: boolean;
    loop?: boolean;
    pauseWhenHidden?: boolean;
    disableWebAssembly?: boolean;
    decodeFirstFrame?: boolean;
    videoBufferSize?: number;
    audioBufferSize?: number;
    onEnded?: () => void;
    onVideoDecode?: () => void;
    onSourceCompleted?: () => void;
  }
  class Player {
    constructor(url: string, options?: PlayerOptions);
    play(): void;
    pause(): void;
    destroy(): void;
    readonly currentTime: number;
  }
  class BitBuffer {
    findNextStartCode(): number;
    findStartCode(code: number): number;
  }
  const JSMpeg: { Player: typeof Player; BitBuffer: typeof BitBuffer };
  export default JSMpeg;
}
