import * as THREE from 'three';

const TRI = new THREE.BufferGeometry();
TRI.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
TRI.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);

export const FULLSCREEN_VERT = /* glsl */ `
in vec3 position;
out vec2 v_uv;
void main() {
  v_uv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** A fullscreen triangle pass with its own material. */
export class FullscreenPass {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly mesh: THREE.Mesh;
  constructor(public material: THREE.Material) {
    this.mesh = new THREE.Mesh(TRI, material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null, clear = false) {
    renderer.setRenderTarget(target);
    if (clear) renderer.clear(true, false, false);
    renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.material.dispose();
  }
}

export function shaderPass(fragmentShader: string, uniforms: Record<string, THREE.IUniform>, opts: Partial<THREE.ShaderMaterialParameters> = {}): FullscreenPass {
  const mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: FULLSCREEN_VERT,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
    ...opts,
  });
  return new FullscreenPass(mat);
}

export function makeRT(w: number, h: number, opts: { type?: THREE.TextureDataType; format?: THREE.PixelFormat; filter?: THREE.MagnificationTextureFilter; depth?: boolean; mipmaps?: boolean } = {}): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: opts.type ?? THREE.HalfFloatType,
    format: opts.format ?? THREE.RGBAFormat,
    minFilter: opts.mipmaps ? THREE.LinearMipmapLinearFilter : (opts.filter ?? THREE.LinearFilter),
    magFilter: opts.filter ?? THREE.LinearFilter,
    depthBuffer: opts.depth ?? false,
    stencilBuffer: false,
    generateMipmaps: opts.mipmaps ?? false,
  });
  rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping;
  return rt;
}
