import * as THREE from 'three';

// One oversized triangle covering the viewport; cheaper than a quad and seam-free.
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

export const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export class FullscreenPass {
  constructor(material) {
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
  }

  get material() {
    return this.mesh.material;
  }

  set material(m) {
    this.mesh.material = m;
  }

  render(renderer, target) {
    renderer.setRenderTarget(target);
    renderer.render(this.mesh, camera);
  }

  /** Render into a sub-rectangle of a render target (x, y, w, h in pixels). */
  renderRect(renderer, target, x, y, w, h) {
    target.viewport.set(x, y, w, h);
    target.scissor.set(x, y, w, h);
    target.scissorTest = true;
    renderer.setRenderTarget(target);
    renderer.render(this.mesh, camera);
    target.viewport.set(0, 0, target.width, target.height);
    target.scissor.set(0, 0, target.width, target.height);
    target.scissorTest = false;
  }
}

export function makeFullscreenMaterial(fragmentShader, uniforms, defines = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader,
    uniforms,
    defines,
    depthTest: false,
    depthWrite: false,
  });
}
