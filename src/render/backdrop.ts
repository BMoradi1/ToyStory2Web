import * as THREE from 'three';

/** Camera-scrolling background strip; never affected by camera translation. */
export class Backdrop {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private texture: THREE.Texture | null = null;
  private direction = new THREE.Vector3();

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: null }, offset: { value: new THREE.Vector2() },
        aspect: { value: 1 }, gain: { value: 1 },
      },
      vertexShader: `varying vec2 screen;
        void main(){screen=position.xy;gl_Position=vec4(position.xy,0.999999,1.0);}`,
      fragmentShader: `uniform sampler2D map; uniform vec2 offset;
        uniform float aspect; uniform float gain; varying vec2 screen;
        void main(){
          vec2 uv=vec2(screen.x*0.5*aspect+0.5,0.5-screen.y*0.5)+offset;
          // A strip repeats horizontally, with solid edge colours outside its height.
          vec3 rgb;
          if(uv.y<0.0) rgb=texture2D(map,vec2(0.5/192.0,0.5/128.0)).rgb;
          else if(uv.y>1.0) rgb=texture2D(map,vec2(1.0-0.5/192.0,1.0-0.5/128.0)).rgb;
          else rgb=texture2D(map,vec2(uv.x,clamp(uv.y,0.5/128.0,1.0-0.5/128.0))).rgb;
          gl_FragColor=vec4(min(rgb*gain,vec3(1.0)),1.0);
        }`,
      depthWrite: false, depthTest: false, fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10000;
    this.mesh.visible = false;
  }

  set(texture: THREE.Texture | null): void {
    this.texture?.dispose();
    // Own the sampler so world textures and HUD sprites retain their filtering.
    this.texture = texture?.clone() ?? null;
    if (this.texture) {
      this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
      this.texture.wrapS = THREE.RepeatWrapping;
      this.texture.wrapT = THREE.ClampToEdgeWrapping;
      this.texture.generateMipmaps = false;
      this.texture.needsUpdate = true;
    }
    this.material.uniforms.map!.value = this.texture;
    this.mesh.visible = texture !== null;
  }

  update(camera: THREE.PerspectiveCamera, gamma: number): void {
    camera.getWorldDirection(this.direction);
    const yaw = Math.atan2(this.direction.x, -this.direction.z);
    const pitch = Math.asin(THREE.MathUtils.clamp(this.direction.y, -1, 1));
    // Retail 0048f230/0048f410 scroll and repeat a flat quad, not a spherical
    // panorama. One image per native 4:3 viewport avoids magnifying a small
    // fraction of the 192x128 source. Exact retail scroll scale remains to audit.
    this.material.uniforms.offset!.value.set(yaw * 2 / Math.PI, -pitch / THREE.MathUtils.degToRad(camera.fov));
    this.material.uniforms.aspect!.value = camera.aspect / (4 / 3);
    this.material.uniforms.gain!.value = gamma / 2;
  }
}
