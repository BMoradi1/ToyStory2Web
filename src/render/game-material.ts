import * as THREE from 'three';

/** D3DFOG_LINEAR (004b2da4), using view depth rather than Three's smoothstep. */
export class GameMaterial extends THREE.MeshBasicMaterial {
  override onBeforeCompile(shader: Parameters<THREE.Material['onBeforeCompile']>[0]): void {
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>',
      THREE.ShaderChunk.fog_fragment.replace(
        'smoothstep( fogNear, fogFar, vFogDepth )',
        'clamp( ( vFogDepth - fogNear ) / ( fogFar - fogNear ), 0.0, 1.0 )',
      ));
  }
  override customProgramCacheKey(): string { return 'toy2-linear-fog-v1'; }
}
