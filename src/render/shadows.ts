/**
 * Cascaded shadow maps (4 cascades in a 2x2 depth atlas), stabilised (rotation-invariant
 * bounding spheres + texel snapping), with staggered updates for far cascades.
 */
import * as THREE from 'three';

export interface ShadowCaster {
  scene: THREE.Scene;
  material: THREE.Material | null; // override (null = use object materials, e.g. entities with depth materials)
}

const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

export class CascadedShadows {
  readonly target: THREE.WebGLRenderTarget;
  readonly cascades = 4;
  readonly lightCams: THREE.OrthographicCamera[] = [];
  /** light view-projection at last render of each cascade (absolute world) */
  private lightVP: THREE.Matrix4[] = [];
  /** camera-relative matrices for the shader */
  readonly shaderMats: THREE.Matrix4[] = [];
  readonly rects: THREE.Vector4[] = [];
  readonly radius = new THREE.Vector4();
  splits: number[] = [];
  private frame = 0;
  enabled = true;

  constructor(public res: number, public distance: number) {
    const size = res * 2;
    this.target = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true, stencilBuffer: false, type: THREE.UnsignedByteType });
    const dt = new THREE.DepthTexture(size, size, THREE.FloatType);
    dt.format = THREE.DepthFormat;
    dt.minFilter = dt.magFilter = THREE.NearestFilter;
    this.target.depthTexture = dt;
    for (let i = 0; i < 4; i++) {
      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
      cam.matrixAutoUpdate = true;
      this.lightCams.push(cam);
      this.lightVP.push(new THREE.Matrix4());
      this.shaderMats.push(new THREE.Matrix4());
      this.rects.push(new THREE.Vector4((i & 1) * 0.5, (i >> 1) * 0.5, 0.5, 0.5));
    }
    this.setDistance(distance);
  }

  setDistance(d: number) {
    this.distance = d;
    // practical split scheme
    const n = 0.1, f = d, lambda = 0.8;
    this.splits = [];
    for (let i = 1; i <= 4; i++) {
      const p = i / 4;
      const log = n * Math.pow(f / n, p), uni = n + (f - n) * p;
      this.splits.push(lambda * log + (1 - lambda) * uni);
    }
    this.splits[0] = Math.max(this.splits[0], 8);
  }

  dispose() {
    this.target.depthTexture?.dispose();
    this.target.dispose();
  }

  get texture(): THREE.Texture {
    return this.target.depthTexture!;
  }

  private tmpV = new THREE.Vector3();
  private tmpM = new THREE.Matrix4();

  /** Compute cascade cameras for the camera and light direction (unit, toward light). */
  update(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, lightDir: THREE.Vector3, casters: ShadowCaster[]) {
    this.frame++;
    const camPos = camera.position;
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const tanX = tanY * camera.aspect;
    const res = this.res;
    // stable up vector for the light
    const up = Math.abs(lightDir.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.target);
    const size = res * 2;
    renderer.setScissorTest(true);
    let near = 0.1;
    for (let i = 0; i < 4; i++) {
      const far = this.splits[i];
      // minimal bounding sphere of the frustum slice [near, far] (rotation invariant)
      const t2 = tanX * tanX + tanY * tanY;
      const zc = Math.min(far, ((far + near) * (1 + t2)) / 2);
      let radius = Math.sqrt((far - zc) * (far - zc) + far * far * t2);
      radius = Math.ceil(radius * 4) / 4;
      const c = this.tmpV.copy(fwd).multiplyScalar(zc).add(camPos);
      // texel snap in light space
      const cam = this.lightCams[i];
      const texel = (2 * radius) / res;
      const lightView = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), lightDir.clone().negate(), up);
      const inv = lightView.clone().invert();
      const lc = c.clone().applyMatrix4(inv);
      lc.x = Math.floor(lc.x / texel) * texel;
      lc.y = Math.floor(lc.y / texel) * texel;
      const snapped = lc.applyMatrix4(lightView);
      const back = radius + 160;
      cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius;
      cam.near = 0.5; cam.far = back + radius + 32;
      cam.position.copy(snapped).addScaledVector(lightDir, back);
      cam.up.copy(up);
      cam.lookAt(snapped);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);
      this.radius.setComponent(i, radius);
      // staggered updates: 0,1 every frame; 2 every 2nd; 3 every 4th (but always on first frames)
      const doRender = this.frame < 4 || i < 2 || (i === 2 && this.frame % 2 === 0) || (i === 3 && this.frame % 4 === 1);
      if (doRender && this.enabled) {
        this.lightVP[i].multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        const x = (i & 1) * res, y = (i >> 1) * res;
        renderer.setViewport(x, y, res, res);
        renderer.setScissor(x, y, res, res);
        renderer.clear(false, true, false);
        for (const cst of casters) {
          const prev = cst.scene.overrideMaterial;
          cst.scene.overrideMaterial = cst.material;
          renderer.render(cst.scene, cam);
          cst.scene.overrideMaterial = prev;
        }
      }
      // shader matrix: BIAS * lightVP * T(camPos)  (camera-relative positions)
      this.tmpM.makeTranslation(camPos.x, camPos.y, camPos.z);
      this.shaderMats[i].multiplyMatrices(BIAS, this.lightVP[i]).multiply(this.tmpM);
      near = far;
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size, size);
    renderer.autoClear = prevAutoClear;
  }
}
