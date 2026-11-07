// Planar mirror for the lavatories. Based on three/addons Reflector, but
//   * supports the reversed-depth projection used by the pipeline (oblique near
//     plane derived for the [1..0] reversed clip range),
//   * renders in linear HDR (HalfFloat) like the rest of the cabin,
//   * can be switched on/off (only one lav mirror is live at a time; the
//     others fall back to an env-mapped material),
//   * limits the reflection camera's far plane (the lav is tiny),
//   * slight tint + subtle edge darkening/smudges in the shader.
import * as THREE from 'three';

const _plane = new THREE.Plane();
const _normal = new THREE.Vector3();
const _rwp = new THREE.Vector3();
const _cwp = new THREE.Vector3();
const _rot = new THREE.Matrix4();
const _look = new THREE.Vector3();
const _clip = new THREE.Vector4();
const _view = new THREE.Vector3();
const _target = new THREE.Vector3();
const _q = new THREE.Vector4();
const _clearColor = new THREE.Color();
const _inv = new THREE.Matrix4();

export class Mirror extends THREE.Mesh {
  constructor(geometry, { size = 512, reversedDepth = false, far = 8, tint = new THREE.Color(0.86, 0.88, 0.88) } = {}) {
    const rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, samples: 0 });
    rt.texture.generateMipmaps = false;
    const textureMatrix = new THREE.Matrix4();
    const material = new THREE.ShaderMaterial({
      name: 'galley-mirror',
      uniforms: { tDiffuse: { value: rt.texture }, textureMatrix: { value: textureMatrix }, uTint: { value: tint } },
      vertexShader: /* glsl */`
        uniform mat4 textureMatrix;
        varying vec4 vUvR; varying vec2 vUv;
        void main() {
          vUv = uv;
          vUvR = textureMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform vec3 uTint;
        varying vec4 vUvR; varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec3 base = texture2D(tDiffuse, vUvR.xy / vUvR.w).rgb;
          // silvering ages at the edges; a few faint smudges
          vec2 e = min(vUv, 1.0 - vUv);
          float edge = smoothstep(0.0, 0.035, min(e.x, e.y));
          float sm = smoothstep(0.55, 1.0, hash(floor(vUv * vec2(9.0, 11.0)))) * 0.05;
          gl_FragColor = vec4(base * uTint * (0.82 + 0.18 * edge) * (1.0 - sm), 1.0);
        }`,
    });
    super(geometry, material);
    this.name = 'galley-mirror';
    this.renderTarget = rt;
    this.textureMatrix = textureMatrix;
    this.reversedDepth = reversedDepth;
    this.far = far;
    this.active = true;
    this.camera = new THREE.PerspectiveCamera();
    this.camera.matrixAutoUpdate = true;
    this.onBeforeRender = (renderer, scene, camera) => this._render(renderer, scene, camera);
  }

  setSize(size) { this.renderTarget.setSize(size, size); }

  _render(renderer, scene, camera) {
    if (!this.active || camera === this.camera) return;
    const rc = this.camera;
    _rwp.setFromMatrixPosition(this.matrixWorld);
    _cwp.setFromMatrixPosition(camera.matrixWorld);
    _rot.extractRotation(this.matrixWorld);
    _normal.set(0, 0, 1).applyMatrix4(_rot);
    _view.subVectors(_rwp, _cwp);
    if (_view.dot(_normal) > 0) return;     // behind the mirror
    _view.reflect(_normal).negate().add(_rwp);
    _rot.extractRotation(camera.matrixWorld);
    _look.set(0, 0, -1).applyMatrix4(_rot).add(_cwp);
    _target.subVectors(_rwp, _look).reflect(_normal).negate().add(_rwp);
    rc.position.copy(_view);
    rc.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_normal);
    rc.lookAt(_target);
    rc.near = camera.near; rc.far = this.far;
    rc._reversedDepth = !!camera.reversedDepth;          // keep the renderer from rebuilding the projection
    rc.updateMatrixWorld();
    // projection: same frustum as the main camera, mirrored horizontally
    rc.projectionMatrix.copy(camera.projectionMatrix);
    rc.projectionMatrix.elements[8] *= -1;
    rc.projectionMatrix.elements[12] *= -1;
    const tm = this.textureMatrix;
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse).multiply(this.matrixWorld);
    // oblique near plane = mirror plane (Lengyel), for standard and reversed depth
    _plane.setFromNormalAndCoplanarPoint(_normal, _rwp).applyMatrix4(rc.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const pm = rc.projectionMatrix, e = pm.elements;
    if (this.reversedDepth) {
      // clip z in [0, w], near -> w. Replace row 2 by row3 - a*C so that z == w on the mirror plane,
      // with a chosen so the far corner of the frustum keeps z = 0.
      _inv.copy(pm).invert();
      _q.set(Math.sign(_clip.x), Math.sign(_clip.y), 0, 1).applyMatrix4(_inv);
      const r3 = [e[3], e[7], e[11], e[15]];
      const r3q = r3[0] * _q.x + r3[1] * _q.y + r3[2] * _q.z + r3[3] * _q.w;
      const cq = _clip.x * _q.x + _clip.y * _q.y + _clip.z * _q.z + _clip.w * _q.w;
      const a = Math.abs(cq) > 1e-9 ? r3q / cq : 1;
      e[2] = r3[0] - a * _clip.x; e[6] = r3[1] - a * _clip.y; e[10] = r3[2] - a * _clip.z; e[14] = r3[3] - a * _clip.w;
    } else {
      _q.x = (Math.sign(_clip.x) + e[8]) / e[0];
      _q.y = (Math.sign(_clip.y) + e[9]) / e[5];
      _q.z = -1.0;
      _q.w = (1.0 + e[10]) / e[14];
      _clip.multiplyScalar(2.0 / _clip.dot(_q));
      e[2] = _clip.x; e[6] = _clip.y; e[10] = _clip.z + 1.0; e[14] = _clip.w;
    }
    rc.projectionMatrixInverse.copy(pm).invert();

    this.visible = false;
    const prevRT = renderer.getRenderTarget();
    const prevXr = renderer.xr.enabled, prevShadow = renderer.shadowMap.autoUpdate;
    const prevAlpha = renderer.getClearAlpha();
    renderer.getClearColor(_clearColor);
    renderer.xr.enabled = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.renderTarget);
    renderer.state.buffers.depth.setMask(true);
    renderer.setClearColor(0x101214, 1);
    renderer.clear(true, true, false);
    renderer.render(scene, rc);
    renderer.setClearColor(_clearColor, prevAlpha);
    renderer.xr.enabled = prevXr;
    renderer.shadowMap.autoUpdate = prevShadow;
    renderer.setRenderTarget(prevRT);
    this.visible = true;
  }

  dispose() { this.renderTarget.dispose(); this.material.dispose(); }
}
