/**
 * Camera-facing and floor-flat cards, which is how the engine draws coins,
 * their shadows, the signposts and every particle effect
 * (`FUN_004b8e60` and `FUN_004b8a30`, docs/HUD.md).
 *
 * Each card is four vertices built on the CPU from a centre, a size and a
 * pair of axes: the camera's right and up for a card that faces you, world
 * X and Z for one lying on the floor. There are only a hundred or so of them
 * in a level, so rebuilding the buffer every frame costs nothing and keeps
 * the billboarding in plain arithmetic rather than a shader nobody can read.
 *
 * The fragment is the engine's modulate, `texel * colour`, with the sheet's
 * colour key already decoded to alpha 0. Two blends are supported: the
 * ordinary one a coin uses, and the **subtractive** one the shadow does.
 * The shadow sprite is a light disc fading to a black rim, which only makes
 * sense subtracted — the bright middle takes the most light out of the floor
 * and the rim takes none. The engine has a second path that draws it as a
 * flat black disc instead, chosen by a render flag; this is the better
 * looking of the two and the one the art is drawn for.
 */
import * as THREE from 'three';
import { WORLD_SCALE } from '../formats/dat.ts';
import { GAME_UNITS_PER_LEVEL_UNIT } from '../sim/player-constants.ts';

/** Effect centres use game units; their card sizes use level units. */
export function effectCardPlacement(effect: {
  x: number; y: number; z: number; width: number; height: number;
}): Pick<WorldSprite, 'x' | 'y' | 'z' | 'width' | 'height'> {
  const scale = GAME_UNITS_PER_LEVEL_UNIT * WORLD_SCALE;
  return {
    x: effect.x / scale, y: -effect.y / scale, z: -effect.z / scale,
    width: effect.width / WORLD_SCALE, height: effect.height / WORLD_SCALE,
  };
}

export interface WorldSprite {
  /** Centre, renderer units. */
  x: number; y: number; z: number;
  /** The frame's texture rectangle, 0..1. */
  u0: number; v0: number; u1: number; v1: number;
  /** Size, renderer units. */
  width: number; height: number;
  /** 0..1, the distance fade. */
  alpha: number;
  /** Modulate, 0..1 each; 1 leaves the texel alone. */
  r?: number; g?: number; b?: number;
  /** Spin about the view axis, radians. Effects use it; coins do not. */
  rotation?: number;
  /** A beam's longitudinal direction; its width stays camera-facing. */
  axis?: { x: number; y: number; z: number };
}

const VERTEX = /* glsl */`
  attribute vec4 acolour;
  varying vec2 vUv;
  varying vec4 vColour;
  void main() {
    vUv = uv;
    vColour = acolour;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */`
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec4 vColour;
  void main() {
    vec4 texel = texture2D(map, vUv);
    #ifdef SUBTRACT
      // What is subtracted from the floor. A keyed texel has alpha 0 and
      // must take nothing, so the coverage multiplies into the colour.
      gl_FragColor = vec4(texel.rgb * vColour.rgb * texel.a * vColour.a, 1.0);
    #else
      if (texel.a < 0.5) discard;
      gl_FragColor = vec4(texel.rgb * vColour.rgb, texel.a * vColour.a);
    #endif
  }
`;

export type SpriteBlend = 'normal' | 'subtract' | 'add';

/** One draw call's worth of cards, all on the same sheet. */
export class SpriteBatch {
  readonly mesh: THREE.Mesh;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private positions = new Float32Array(0);
  private uvs = new Float32Array(0);
  private colours = new Float32Array(0);
  private capacity = 0;
  private count = 0;

  constructor(private readonly flat: boolean, blend: SpriteBlend) {
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: null } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      defines: blend === 'subtract' ? { SUBTRACT: '' } : {},
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: blend === 'normal',
      ...(blend === 'subtract'
        ? {
          blending: THREE.CustomBlending,
          blendEquation: THREE.ReverseSubtractEquation,
          blendSrc: THREE.OneFactor,
          blendDst: THREE.OneFactor,
        }
        : blend === 'add'
          ? { blending: THREE.AdditiveBlending }
          : {}),
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = blend === 'subtract' ? 1 : blend === 'add' ? 3 : 2;
    this.mesh.visible = false;
  }

  /** The sheet these cards come from. Null hides the batch. */
  setSheet(texture: THREE.Texture | null): void {
    this.material.uniforms.map!.value = texture;
    this.material.needsUpdate = true;
  }

  /** Rebuild the cards. Call once a frame with the live camera. */
  update(sprites: readonly WorldSprite[], camera: THREE.Camera): void {
    const n = sprites.length;
    this.count = n;
    this.mesh.visible = n > 0 && this.material.uniforms.map!.value !== null;
    if (n === 0) return;
    if (n > this.capacity) this.grow(n);

    // The axes a card is built on. A flat one lies in the world's XZ plane;
    // an upright one uses the camera's own right and up, which is what makes
    // it face you however the view turns.
    let rx = 1, ry = 0, rz = 0;
    let ux = 0, uy = 0, uz = 1;
    if (!this.flat) {
      const m = camera.matrixWorld.elements;
      rx = m[0]!; ry = m[1]!; rz = m[2]!;
      ux = m[4]!; uy = m[5]!; uz = m[6]!;
    }

    const p = this.positions;
    const uv = this.uvs;
    const c = this.colours;
    for (let i = 0; i < n; i++) {
      const s = sprites[i]!;
      const hw = s.width / 2;
      const hh = s.height / 2;
      // A card that spins turns its two in-plane axes rather than the quad,
      // which keeps it facing the camera while it rolls.
      let arx = rx, ary = ry, arz = rz, aux = ux, auy = uy, auz = uz;
      if (s.axis) {
        const n = Math.hypot(s.axis.x, s.axis.y, s.axis.z) || 1;
        aux = s.axis.x / n; auy = s.axis.y / n; auz = s.axis.z / n;
        const m = camera.matrixWorld.elements;
        const cx = m[12]! - s.x, cy = m[13]! - s.y, cz = m[14]! - s.z;
        const x = cy * auz - cz * auy, y = cz * aux - cx * auz, z = cx * auy - cy * aux;
        const cross = Math.hypot(x, y, z);
        if (cross > 1e-9) { arx = x / cross; ary = y / cross; arz = z / cross; }
      }
      if (s.rotation) {
        const c = Math.cos(s.rotation), n = Math.sin(s.rotation);
        arx = rx * c + ux * n; ary = ry * c + uy * n; arz = rz * c + uz * n;
        aux = ux * c - rx * n; auy = uy * c - ry * n; auz = uz * c - rz * n;
      }
      const ax = arx * hw, ay = ary * hw, az = arz * hw;
      const bx = aux * hh, by = auy * hh, bz = auz * hh;
      let o = i * 12;
      // top-left, top-right, bottom-right, bottom-left
      p[o] = s.x - ax + bx; p[o + 1] = s.y - ay + by; p[o + 2] = s.z - az + bz;
      p[o + 3] = s.x + ax + bx; p[o + 4] = s.y + ay + by; p[o + 5] = s.z + az + bz;
      p[o + 6] = s.x + ax - bx; p[o + 7] = s.y + ay - by; p[o + 8] = s.z + az - bz;
      p[o + 9] = s.x - ax - bx; p[o + 10] = s.y - ay - by; p[o + 11] = s.z - az - bz;

      o = i * 8;
      uv[o] = s.u0; uv[o + 1] = s.v0;
      uv[o + 2] = s.u1; uv[o + 3] = s.v0;
      uv[o + 4] = s.u1; uv[o + 5] = s.v1;
      uv[o + 6] = s.u0; uv[o + 7] = s.v1;

      const cr = s.r ?? 1, cg = s.g ?? 1, cb = s.b ?? 1;
      o = i * 16;
      for (let v = 0; v < 4; v++) {
        c[o + v * 4] = cr; c[o + v * 4 + 1] = cg; c[o + v * 4 + 2] = cb; c[o + v * 4 + 3] = s.alpha;
      }
    }

    this.geometry.setDrawRange(0, n * 6);
    for (const name of ['position', 'uv', 'acolour']) {
      (this.geometry.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }

  private grow(n: number): void {
    const capacity = Math.max(16, n * 2);
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 12);
    this.uvs = new Float32Array(capacity * 8);
    this.colours = new Float32Array(capacity * 16);
    const index = new Uint32Array(capacity * 6);
    for (let i = 0; i < capacity; i++) {
      const v = i * 4;
      index.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
    this.geometry.setAttribute('acolour', new THREE.BufferAttribute(this.colours, 4));
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1));
  }
}
