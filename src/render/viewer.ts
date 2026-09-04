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
import { WORLD_SCALE, type GeometryGroup, type LevelGeometry } from '../formats/dat.ts';
import { isWalkable, type CollisionGroup } from '../formats/collision.ts';

/** The original's frame pacing, in seconds. Game logic steps at this rate. */
// Take every colour literally. three.js otherwise treats a `THREE.Color` as
// sRGB and converts it into a linear working space, then converts back on
// output. Both halves are wrong here: the vertex colours and texture bytes in
// this game are already the values the 1999 engine handed to the frame buffer.
// Left on, the round trip brightened everything — a vertex colour of (0,82,0)
// reached the screen as (0,163,0) — and it still applied to `THREE.Color`
// values such as the background even once the output transform was off.
THREE.ColorManagement.enabled = false;

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
  private collision: THREE.LineSegments | null = null;
  private player: THREE.Mesh | null = null;

  /**
   * Cull override, for diagnosis. `null` means each face group decides.
   *
   * Level faces are single-sided unless their mode carries bit `0x02`: the
   * engine's default is `D3DCULL_CW` and only the no-cull material clears it
   * (docs/FORMATS.md). Which winding is the front was settled from the data —
   * under the pickup markers, 196 of 199 floor faces have their right-hand
   * normal pointing up, and `buildLevelGeometry` maps file space to WebGL
   * space by a proper rotation, which preserves winding. So `FrontSide` is
   * correct and this override exists only to check that claim by eye.
   */
  sideOverride: THREE.Side | null = null;

  /**
   * Diagnostic: draw the whole mesh with ONE material and no draw groups.
   *
   * Level geometry is normally split into a group per texture page, each with
   * its own material. If those ranges are interpreted differently than
   * intended, geometry can be drawn more than once — which looks like
   * duplicated props. Collapsing to a single ungrouped material removes that
   * variable entirely: if duplication survives it is in the geometry, and if
   * it vanishes it is in the group/material path.
   */
  singleMaterial = false;

  private lastLevel: { geometry: LevelGeometry; textures: Map<number, THREE.Texture> } | null = null;

  /**
   * Zones to draw, or null for all of them.
   *
   * The engine never drew a whole level at once: it drew the zone the camera
   * was in and walked outward through the portals it could see. Until there
   * is a player to place the camera, this is set by hand — see
   * `reachableZones` for the graph half of the same idea. Faces whose object
   * had no zone are always drawn, since hiding them would be a guess.
   */
  private zoneFilter: Set<number> | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    // No output transform either: see the ColorManagement note above.
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

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
      // Characters stay double-sided: measured offline, both culling
      // conventions punch holes through 13-15% of Buzz's silhouette, so his
      // parts are not closed shells. Their own material bits are not decoded
      // yet — the `.ngn` creature chunk is the place to look.
      materials.push(new THREE.MeshBasicMaterial({
        map: texture ?? null,
        vertexColors: true,
        side: this.sideOverride ?? THREE.DoubleSide,
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
    this.lastLevel = { geometry, textures };
    if (geometry.triangleCount === 0) return;

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(geometry.positions, 3));
    buffer.setAttribute('color', new THREE.BufferAttribute(geometry.colors, 3));
    buffer.setAttribute('uv', new THREE.BufferAttribute(geometry.uvs, 2));
    buffer.computeVertexNormals();

    if (this.singleMaterial) {
      this.current = new THREE.Mesh(buffer, new THREE.MeshBasicMaterial({
        vertexColors: true, side: this.sideOverride ?? THREE.FrontSide, wireframe: false,
      }));
      this.scene.add(this.current);
      this.frameObject(buffer);
      return;
    }

    const materials: THREE.Material[] = [];
    for (const group of geometry.groups) {
      buffer.addGroup(group.start, group.count, materials.length);
      materials.push(this.materialFor(group, textures.get(group.page ?? -1)));
    }

    this.current = new THREE.Mesh(buffer, materials);
    this.scene.add(this.current);
    this.frameObject(buffer);
    // A rebuild makes fresh materials, so reapply whatever filter was set.
    if (this.zoneFilter) this.setVisibleZones(this.zoneFilter);
  }

  /**
   * Show only these zones, or all of them when passed null.
   *
   * Toggles each draw group's material rather than rebuilding the geometry:
   * three.js skips a group whose material is invisible, so this costs
   * nothing per frame and keeps the buffers intact.
   */
  setVisibleZones(zones: Set<number> | null): string {
    this.zoneFilter = zones;
    const mesh = this.current;
    const geometry = this.lastLevel?.geometry;
    if (!mesh || !geometry || !Array.isArray(mesh.material)) return 'no level loaded';
    let shown = 0, hidden = 0;
    geometry.groups.forEach((group, i) => {
      const material = mesh.material as THREE.Material[];
      const visible = zones === null || group.zone === null || zones.has(group.zone);
      if (material[i]) material[i]!.visible = visible;
      if (visible) shown += group.count / 3; else hidden += group.count / 3;
    });
    return zones === null
      ? `all zones, ${shown} triangles`
      : `zones ${[...zones].sort((a, b) => a - b).join(',')}: ${shown} triangles drawn, ${hidden} hidden`;
  }

  /**
   * Put a character into the level, rather than replacing it.
   *
   * `setModel` swaps the whole scene for one model, which is right for
   * inspecting a character and wrong for standing one on a floor. This keeps
   * the level and adds the character beside it; pass null to take it away.
   * Position is in renderer units, and the model's own origin is between its
   * feet, so the position is where it stands.
   */
  setPlayer(mesh: MeshData | null, textures?: Map<number, THREE.Texture>): void {
    if (this.player) {
      this.scene.remove(this.player);
      this.player.geometry.dispose();
      for (const m of this.player.material as THREE.Material[]) m.dispose();
      this.player = null;
    }
    if (!mesh || mesh.triangleCount === 0) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(mesh.colors, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2));
    const materials: THREE.Material[] = [];
    for (const group of mesh.groups) {
      geometry.addGroup(group.start, group.count, materials.length);
      materials.push(new THREE.MeshBasicMaterial({
        map: (group.page === null ? undefined : textures?.get(group.page)) ?? null,
        vertexColors: true,
        side: THREE.DoubleSide,
        alphaTest: 0.5,
      }));
    }
    this.player = new THREE.Mesh(geometry, materials);
    this.scene.add(this.player);
  }

  /** Move the character. Renderer units. */
  setPlayerPosition(x: number, y: number, z: number): void {
    this.player?.position.set(x, y, z);
  }

  /** Frame the camera on the character, from behind and slightly above. */
  lookAtPlayer(distance = 6): void {
    if (!this.player) return;
    const p = this.player.position;
    this.camera.position.set(p.x + distance * 0.7, p.y + distance * 0.5, p.z + distance * 0.7);
    this.controls.target.set(p.x, p.y + 1, p.z);
    this.controls.update();
  }

  /**
   * Draw the collision hull as wireframe over the level: green where Buzz can
   * stand, red where he cannot.
   *
   * Collision is a separate file from the geometry (`TERRAIN.ALL` beside
   * `level.dat`) with no shared index, so the only check that they describe
   * the same world is to look at them together. They do: the two share a
   * coordinate system and scale, and every pickup marker in every level tested
   * has walkable collision under it.
   */
  setCollision(groups: CollisionGroup[] | null): string {
    if (this.collision) {
      this.scene.remove(this.collision);
      this.collision.geometry.dispose();
      (this.collision.material as THREE.Material).dispose();
      this.collision = null;
    }
    if (!groups) return 'collision hidden';

    const points: number[] = [];
    const colors: number[] = [];
    let polys = 0, walk = 0;
    for (const group of groups) {
      for (const mesh of group.meshes) {
        for (const poly of mesh.polys) {
          polys++;
          const ok = isWalkable(poly);
          if (ok) walk++;
          // PSX axes are +Y down and +Z into the screen, the same convention
          // buildLevelGeometry undoes, so apply the same mapping here or the
          // hull lands mirrored through the floor.
          const vs = poly.vertices.map((v) => [
            (v.x + group.position.x) / WORLD_SCALE,
            -(v.y + group.position.y) / WORLD_SCALE,
            -(v.z + group.position.z) / WORLD_SCALE,
          ]);
          for (let i = 0; i < vs.length; i++) {
            const a = vs[i]!, b = vs[(i + 1) % vs.length]!;
            points.push(a[0]!, a[1]!, a[2]!, b[0]!, b[1]!, b[2]!);
            for (let k = 0; k < 2; k++) {
              if (ok) colors.push(0.2, 0.9, 0.3); else colors.push(0.9, 0.25, 0.2);
            }
          }
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    this.collision = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.6, depthTest: true,
    }));
    this.scene.add(this.collision);
    return `collision: ${polys} polys, ${walk} walkable (${(100 * walk / (polys || 1)).toFixed(0)}%)`;
  }

  /** Whether the collision overlay is currently in the scene. */
  get collisionShown(): boolean { return this.collision !== null; }

  /** How many meshes are actually in the scene. Should be exactly one. */
  describeScene(): string {
    let meshes = 0, tris = 0;
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshes++;
      const pos = mesh.geometry.getAttribute('position');
      if (pos) tris += pos.count / 3;
    });
    return `${meshes} mesh(es) in scene, ${tris} triangles total, ` +
      `${this.scene.children.length} top-level children`;
  }

  /** Toggle the single-material diagnostic and redraw. Returns the new state. */
  toggleSingleMaterial(): string {
    this.singleMaterial = !this.singleMaterial;
    if (this.lastLevel) this.setLevel(this.lastLevel.geometry, this.lastLevel.textures);
    return this.singleMaterial ? 'single material, no draw groups' : 'one material per texture page';
  }

  /**
   * Cycle the cull override: per-face (the real rule) -> front -> back -> both.
   * Rebuilds rather than patching materials, since the per-face state differs
   * from group to group.
   */
  cycleSide(): string {
    this.sideOverride = this.sideOverride === null ? THREE.FrontSide
      : this.sideOverride === THREE.FrontSide ? THREE.BackSide
        : this.sideOverride === THREE.BackSide ? THREE.DoubleSide : null;
    if (this.lastLevel) this.setLevel(this.lastLevel.geometry, this.lastLevel.textures);
    return this.sideOverride === null ? 'per face (front, or both where mode bit 0x02 is set)'
      : this.sideOverride === THREE.FrontSide ? 'forced front-face'
        : this.sideOverride === THREE.BackSide ? 'forced back-face' : 'forced double-sided';
  }

  private materialFor(group: GeometryGroup, texture?: THREE.Texture): THREE.Material {
    const common = {
      map: texture ?? null,
      vertexColors: true,
      side: this.sideOverride ?? (group.doubleSided ? THREE.DoubleSide : THREE.FrontSide),
    };
    if (group.blend === 'opaque') {
      return new THREE.MeshBasicMaterial({ ...common, alphaTest: 0.5 });
    }
    const blended = {
      ...common,
      transparent: true,
      opacity: group.alpha,
      depthWrite: false,
    };
    if (group.blend === 'additive') {
      return new THREE.MeshBasicMaterial({ ...blended, blending: THREE.AdditiveBlending });
    }
    if (group.blend === 'subtractive') {
      // ZERO / INVSRCCOLOR: the frame buffer is darkened by the face colour.
      return new THREE.MeshBasicMaterial({
        ...blended,
        blending: THREE.CustomBlending,
        blendSrc: THREE.ZeroFactor,
        blendDst: THREE.OneMinusSrcColorFactor,
      });
    }
    return new THREE.MeshBasicMaterial({ ...blended, blending: THREE.NormalBlending });
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
