import * as THREE from 'three';

/** Shared big-triangle geometry covering the viewport (clip-space positions). */
let sharedTriangle: THREE.BufferGeometry | null = null;
function triangle(): THREE.BufferGeometry {
  if (!sharedTriangle) {
    sharedTriangle = new THREE.BufferGeometry();
    sharedTriangle.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  }
  return sharedTriangle;
}

/** Vertex shader for fullscreen passes: passes vUv in [0,1]. `z` is configurable (1 = far plane). */
export const FULLSCREEN_VERT = /* glsl */ `
in vec3 position;
out vec2 vUv;
uniform float fs_z;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, fs_z, 1.0);
}
`;

export const GLSL_PRECISION = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler3D;
`;

export function makePassMaterial(
  fragmentShader: string,
  uniforms: Record<string, THREE.IUniform>,
  defines: Record<string, string | number> = {},
): THREE.RawShaderMaterial {
  const mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: FULLSCREEN_VERT,
    fragmentShader,
    uniforms: { fs_z: { value: 0 }, ...uniforms },
    defines,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
  return mat;
}

/** One fullscreen draw with its own scene so `renderer.render` has nothing else to traverse. */
export class FullscreenPass {
  readonly mesh: THREE.Mesh;
  private readonly scene = new THREE.Scene();
  private static readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(public material: THREE.RawShaderMaterial) {
    this.mesh = new THREE.Mesh(triangle(), material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  setMaterial(m: THREE.RawShaderMaterial) {
    this.material = m;
    this.mesh.material = m;
  }

  /** Renders into `target` (layer for 3D/array targets). Does not clear. */
  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null, layer = 0) {
    renderer.setRenderTarget(target, layer);
    renderer.render(this.scene, FullscreenPass.camera);
  }

  dispose() {
    this.material.dispose();
  }
}

/** Saves/restores the renderer state that sky passes touch. */
export class RendererStateGuard {
  private target: THREE.WebGLRenderTarget | null = null;
  private activeCubeFace = 0;
  private activeMip = 0;
  private autoClear = true;
  private infoAutoReset = true;
  constructor(private renderer: THREE.WebGLRenderer) {}
  save() {
    const r = this.renderer;
    this.target = r.getRenderTarget();
    this.activeCubeFace = r.getActiveCubeFace();
    this.activeMip = r.getActiveMipmapLevel();
    this.autoClear = r.autoClear;
    r.autoClear = false;
    // our internal render() calls must not reset the engine's per-frame draw statistics
    this.infoAutoReset = r.info.autoReset;
    r.info.autoReset = false;
  }
  restore() {
    const r = this.renderer;
    r.setRenderTarget(this.target, this.activeCubeFace, this.activeMip);
    r.autoClear = this.autoClear;
    r.info.autoReset = this.infoAutoReset;
  }
}
