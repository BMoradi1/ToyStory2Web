/**
 * The 3D view.
 *
 * Right now this is an empty stage: a grid, a light, and orbit controls. It
 * exists so that model and world parsers have somewhere to render the moment
 * they land — see docs/FORMATS.md for what is still being decoded.
 *
 * Two engine facts from the original are baked in deliberately:
 *   - a 4:3 native projection, which the 1999 build assumed and which the
 *     widescreen patch works around rather than replaces
 *   - a ~59 FPS update rate (16949us), the engine's real frame pacing
 * Rendering is uncapped; the fixed timestep below is for game logic, so that
 * physics and animation tick at the rate the original was tuned for.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** The original's frame pacing, in seconds. Game logic steps at this rate. */
export const TICK_SECONDS = 16949 / 1_000_000;
export const NATIVE_ASPECT = 4 / 3;

export class Viewer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private accumulator = 0;
  private lastTime = 0;
  private running = false;

  /** Called once per fixed logic tick. Wire gameplay in here, not the render loop. */
  onTick: ((dt: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    this.scene.background = new THREE.Color(0x14161a);
    this.camera = new THREE.PerspectiveCamera(60, NATIVE_ASPECT, 0.1, 10_000);
    this.camera.position.set(6, 5, 8);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;

    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x30271c, 2.2));
    const grid = new THREE.GridHelper(20, 20, 0x2c313b, 0x21252d);
    this.scene.add(grid);

    // ResizeObserver rather than a window listener: the canvas shares the page
    // with a texture strip whose height changes independently of the window.
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  private resize(): void {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.renderer.setAnimationLoop((now) => this.frame(now));
  }

  stop(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  private frame(now: number): void {
    // Clamp so a backgrounded tab doesn't return and run hundreds of ticks.
    const elapsed = Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;

    this.accumulator += elapsed;
    while (this.accumulator >= TICK_SECONDS) {
      this.onTick?.(TICK_SECONDS);
      this.accumulator -= TICK_SECONDS;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
