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
import type { MeshData } from '../formats/all.ts';
import type { LevelGeometry } from '../formats/dat.ts';

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

  private current: THREE.Mesh | null = null;

  /**
   * Face culling mode.
   *
   * Rendering everything double-sided draws interior faces through walls and
   * lets them overdraw what should be visible — "extra polygons in some places
   * and missing ones in others". Offline rasterisation confirms that culling
   * one winding gives solid geometry; which of three.js's two names
   * corresponds to that winding can't be settled offline, because the
   * rasteriser works in y-down screen space and WebGL in y-up NDC, so the sign
   * of the signed area flips between them. Hence a toggle.
   *
   * Default is double-sided because CHARACTERS need it: measured offline, both
   * culling conventions punch holes through 13-15% of Buzz's silhouette, so
   * his parts are not closed shells. Level geometry does benefit from culling,
   * which is why this is switchable rather than fixed — the real answer is
   * almost certainly per-face, via the material bits that are still undecoded.
   */
  side: THREE.Side = THREE.DoubleSide;

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

  /**
   * Replace the displayed model and frame it.
   *
   * Rendered with vertex colours rather than textures: the `.all` format
   * stores UVs and what looks like a texture-page byte, but how those map onto
   * the texture set is still unknown (see docs/FORMATS.md). The baked
   * near-greyscale vertex colours read as lighting, so the shape is legible.
   */
  /**
   * Display a single character model.
   *
   * Characters ship no textures of their own; their art lives in the level
   * `.ngn` files at slots 16-24, so the caller passes whichever scene's
   * textures are loaded. Every model uses exactly one page.
   */
  setModel(mesh: MeshData, textures?: Map<number, THREE.Texture>): void {
    this.clearModel();
    if (mesh.triangleCount === 0) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(mesh.colors, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2));
    geometry.computeVertexNormals();

    const materials: THREE.Material[] = [];
    for (const group of mesh.groups) {
      const texture = group.page === null ? undefined : textures?.get(group.page);
      geometry.addGroup(group.start, group.count, materials.length);
      // Double-sided: the bits that would mark single-sided faces aren't
      // decoded, and culling by unknown winding drops visible geometry.
      // Cutout, not blended. `alphaTest` discards colour-keyed texels while
      // the material stays in the OPAQUE queue, so depth testing works per
      // pixel. Marking these `transparent` instead moves them to the blended
      // queue, which sorts per draw group rather than per pixel — with one
      // group per texture page, surfaces then draw over each other in the
      // wrong order and the level looks scrambled.
      materials.push(new THREE.MeshBasicMaterial({
        map: texture ?? null,
        vertexColors: true,
        side: this.side,
        alphaTest: 0.5,
      }));
    }

    this.current = new THREE.Mesh(geometry, materials);
    this.scene.add(this.current);
    this.frameObject(geometry);
  }

  /**
   * Display a level, binding one texture per page.
   *
   * Geometry arrives bucketed by texture page, so each bucket becomes a draw
   * group with its own material. Faces whose page is null — untextured, or
   * carrying a mode we don't yet trust — fall back to vertex colours.
   *
   * Textures are filtered nearest on magnification: these are 256x256 source
   * images built for a 1999 console, and smoothing them looks wrong rather
   * than better.
   */
  setLevel(geometry: LevelGeometry, textures: Map<number, THREE.Texture>): void {
    this.clearModel();
    if (geometry.triangleCount === 0) return;

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(geometry.positions, 3));
    buffer.setAttribute('color', new THREE.BufferAttribute(geometry.colors, 3));
    buffer.setAttribute('uv', new THREE.BufferAttribute(geometry.uvs, 2));
    buffer.computeVertexNormals();

    const materials: THREE.Material[] = [];
    for (const group of geometry.groups) {
      const texture = group.page === null ? undefined : textures.get(group.page);
      buffer.addGroup(group.start, group.count, materials.length);
      // Cutout, not blended. `alphaTest` discards colour-keyed texels while
      // the material stays in the OPAQUE queue, so depth testing works per
      // pixel. Marking these `transparent` instead moves them to the blended
      // queue, which sorts per draw group rather than per pixel — with one
      // group per texture page, surfaces then draw over each other in the
      // wrong order and the level looks scrambled.
      materials.push(new THREE.MeshBasicMaterial({
        map: texture ?? null,
        vertexColors: true,
        side: this.side,
        alphaTest: 0.5,
      }));
    }

    this.current = new THREE.Mesh(buffer, materials);
    this.scene.add(this.current);
    this.frameObject(buffer);
  }

  /** Cycle back-face -> front-face -> double-sided, returning the new name. */
  cycleSide(): string {
    this.side = this.side === THREE.BackSide ? THREE.FrontSide
      : this.side === THREE.FrontSide ? THREE.DoubleSide : THREE.BackSide;
    const mesh = this.current;
    if (mesh) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of materials) { (m as THREE.MeshBasicMaterial).side = this.side; m.needsUpdate = true; }
    }
    return this.side === THREE.BackSide ? 'back-face culled'
      : this.side === THREE.FrontSide ? 'front-face culled' : 'double-sided';
  }

  private clearModel(): void {
    if (!this.current) return;
    this.scene.remove(this.current);
    this.current.geometry.dispose();
    const material = this.current.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material.dispose();
    this.current = null;
  }

  private frameObject(geometry: THREE.BufferGeometry): void {
    geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere;
    if (!sphere) return;
    const d = Math.max(sphere.radius * 2.2, 1);
    this.camera.position.set(sphere.center.x + d * 0.6, sphere.center.y + d * 0.5, sphere.center.z + d * 0.8);
    this.controls.target.copy(sphere.center);
    this.controls.update();
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
