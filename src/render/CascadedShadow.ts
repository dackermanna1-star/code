// Cascaded shadow maps for the sun, built on three r186's native SunLight path.
//
// Why not examples/jsm/csm/CSM.js: CSM.js adds one DirectionalLight per cascade and requires every material
// to be patched with csm.setupMaterial(); any material that is NOT registered is lit N times (once per cascade
// light) and gets wrong shadows. With many modules creating materials concurrently that is fragile.
// three r186 ships `SunLight` (examples/jsm/lights/SunLight.js) whose cascades are handled by the renderer's
// built-in shader chunks for EVERY lit material, but it is hardwired to 2 cascades. This class is a drop-in
// replacement for SunLightShadow with 1–4 cascades in a 2x2 atlas; the shader's cascade count define is patched
// to 4 (unused cascades get an empty depth range and are never sampled). No per-material setup is needed.
import * as THREE from 'three';

export const MAX_CASCADES = 4;

let chunkPatched = false;
/** Patch the sun-shadow cascade count in the shared shader chunk (must run before any material compiles). */
export function patchSunShadowChunk(): void {
  if (chunkPatched) return;
  const src = THREE.ShaderChunk.shadowmap_pars_fragment;
  const patched = src.replace(/#define SUN_LIGHT_CASCADES \d+/, `#define SUN_LIGHT_CASCADES ${MAX_CASCADES}`);
  if (patched === src) console.warn('[render] could not patch SUN_LIGHT_CASCADES (three version changed?)');
  THREE.ShaderChunk.shadowmap_pars_fragment = patched;
  chunkPatched = true;
}

const _lightOrientation = new THREE.Matrix4();
const _viewToLight = new THREE.Matrix4();
const _lightDir = new THREE.Vector3();
const _up = new THREE.Vector3();
const _center = new THREE.Vector3();
const _near = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _far = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _corners = Array.from({ length: 8 }, () => new THREE.Vector3());
const FADE = 0.12;

interface ShadowInternals {
  _viewportCount: number;
  _frameExtents: THREE.Vector2;
  _viewports: THREE.Vector4[];
  _updateMatrix(cam: THREE.Camera, m: THREE.Matrix4, f: THREE.Frustum, vp?: THREE.Vector4): void;
}

export class CascadedSunShadow extends THREE.LightShadow<THREE.OrthographicCamera> {
  readonly isSunLightShadow = true;
  /** Number of cascades actually used (1..4). */
  activeCascades = 4;
  /** Max shadow distance from the camera (m). */
  maxDistance = 250;
  /** Split distribution exponent (higher = more resolution near the camera). */
  splitPower = 2.2;
  readonly cascadeSplits: number[] = [0, 0, 0, 0, 0];
  private cameras: THREE.OrthographicCamera[] = [];
  private matrices: THREE.Matrix4[] = [];
  private frustums: THREE.Frustum[] = [];
  /** Per cascade (begin, end, fade start, 0) view depths — read by WebGLLights. */
  readonly _cascadeData: THREE.Vector4[] = [];
  private emptyFrustum = new THREE.Frustum();

  constructor() {
    super(new THREE.OrthographicCamera(-5, 5, 5, -5, 0.5, 500));
    const self = this as unknown as ShadowInternals;
    this.mapSize.set(2048, 2048);
    self._viewportCount = MAX_CASCADES;
    self._frameExtents.set(2, 2);
    while (self._viewports.length < MAX_CASCADES) self._viewports.push(new THREE.Vector4());
    for (let i = 0; i < MAX_CASCADES; i++) {
      this.cameras.push(new THREE.OrthographicCamera());
      this.matrices.push(new THREE.Matrix4());
      this.frustums.push(new THREE.Frustum());
      this._cascadeData.push(new THREE.Vector4(1e9, 1e9, 1e9, 0));
    }
    for (const p of this.emptyFrustum.planes) p.set(new THREE.Vector3(0, 0, 0), -1e9);
  }

  override getCamera(i = 0): THREE.OrthographicCamera {
    return this.cameras[i];
  }

  getMatrix(i = 0): THREE.Matrix4 {
    return this.matrices[i];
  }

  override getFrustum(i = 0): THREE.Frustum {
    return i < this.activeCascades ? this.frustums[i] : this.emptyFrustum;
  }

  override updateMatrices(light: THREE.Light, viewCamera?: THREE.Camera): void {
    if (!viewCamera || !(viewCamera as THREE.PerspectiveCamera).isPerspectiveCamera) return;
    const cam = viewCamera as THREE.PerspectiveCamera;
    const self = this as unknown as ShadowInternals;
    const k = Math.max(1, Math.min(MAX_CASCADES, this.activeCascades));
    const insetX = Math.min(0.25, (Math.ceil(this.radius) + 1) / this.mapSize.x);
    const insetY = Math.min(0.25, (Math.ceil(this.radius) + 1) / this.mapSize.y);
    for (let i = 0; i < MAX_CASCADES; i++) self._viewports[i].set((i % 2) + insetX, Math.floor(i / 2) + insetY, 1 - 2 * insetX, 1 - 2 * insetY);
    const resX = this.mapSize.x * (1 - 2 * insetX), resY = this.mapSize.y * (1 - 2 * insetY);
    const res = Math.min(resX, resY);

    const near = cam.near;
    const far = Math.max(near + 1, Math.min(this.maxDistance, cam.far));
    const splits = this.cascadeSplits;
    splits[0] = near;
    for (let i = 1; i < k; i++) splits[i] = Math.max(near + 0.5, far * Math.pow(i / k, this.splitPower));
    splits[k] = far;

    _lightDir.setFromMatrixPosition(light.matrixWorld).negate().normalize();
    _up.set(0, 1, 0);
    if (Math.abs(_up.dot(_lightDir)) > 0.99) _up.set(0, 0, 1);
    _lightOrientation.lookAt(_center.set(0, 0, 0), _lightDir, _up);
    _viewToLight.copy(_lightOrientation).transpose().multiply(cam.matrixWorld);

    const inv = cam.projectionMatrixInverse;
    let globalMaxZ = -Infinity;
    for (let i = 0; i < 4; i++) {
      const x = i === 0 || i === 1 ? 1 : -1;
      const y = i === 0 || i === 3 ? 1 : -1;
      const n = _near[i].set(x, y, -1).applyMatrix4(inv);
      _far[i].copy(n).multiplyScalar(far / near);
      n.applyMatrix4(_viewToLight);
      _far[i].applyMatrix4(_viewToLight);
      globalMaxZ = Math.max(globalMaxZ, n.z, _far[i].z);
    }
    // casters up to one shadow range toward the light still cast into view
    globalMaxZ += far;
    const shadowNear = this.camera.near;

    for (let i = 0; i < MAX_CASCADES; i++) {
      const cc = this.cameras[i];
      if (i >= k) {
        this._cascadeData[i].set(1e9, 1e9, 1e9, 0);
        this.matrices[i].identity();
        continue;
      }
      const cNear = i === 0 ? splits[0] : this._cascadeData[i - 1].z;
      const cFar = splits[i + 1];
      const fadeStart = cFar - FADE * (cFar - splits[i]);
      this._cascadeData[i].set(i === 0 ? -1e10 : cNear, i === k - 1 ? cFar : cFar, i === k - 1 ? cFar - FADE * 0.5 * (cFar - splits[i]) : fadeStart, 0);
      const a0 = (cNear - near) / (far - near), a1 = (cFar - near) / (far - near);
      _center.set(0, 0, 0);
      for (let j = 0; j < 4; j++) {
        _corners[j * 2].lerpVectors(_near[j], _far[j], a0);
        _corners[j * 2 + 1].lerpVectors(_near[j], _far[j], a1);
        _center.add(_corners[j * 2]).add(_corners[j * 2 + 1]);
      }
      _center.multiplyScalar(1 / 8);
      let r2 = 0, minZ = Infinity;
      for (let j = 0; j < 8; j++) {
        r2 = Math.max(r2, _corners[j].distanceToSquared(_center));
        minZ = Math.min(minZ, _corners[j].z);
      }
      let radius = Math.sqrt(r2);
      if (res > 1) {
        radius /= 1 - 1 / res;
        const tx = (2 * radius) / resX, ty = (2 * radius) / resY;
        _center.x = Math.round(_center.x / tx) * tx;
        _center.y = Math.round(_center.y / ty) * ty;
      }
      _center.z = globalMaxZ + shadowNear;
      _center.applyMatrix4(_lightOrientation);
      cc.position.copy(_center);
      cc.quaternion.setFromRotationMatrix(_lightOrientation);
      cc.left = -radius;
      cc.right = radius;
      cc.top = radius;
      cc.bottom = -radius;
      cc.near = shadowNear;
      cc.far = globalMaxZ - minZ + 2 * shadowNear;
      cc.updateProjectionMatrix();
      cc.updateMatrixWorld();
      self._updateMatrix(cc, this.matrices[i], this.frustums[i], self._viewports[i]);
    }
  }

  /** World-space size of one shadow texel in cascade i (for bias tuning / debug). */
  texelSize(i: number): number {
    const c = this.cameras[i];
    return (c.right - c.left) / this.mapSize.x;
  }
}
