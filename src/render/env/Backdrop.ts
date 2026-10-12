// Backdrop layer: sky dome, iceberg and far sea seen by a near-horizontal
// camera, rendered into a render target that the main scene uses as its
// background and that the ice shader samples (mirrored) for the iceberg
// reflection.
//
// Cost control: after one full render the target is refreshed in horizontal
// strips (one strip per update call, scissored), so slow cloud drift costs a
// small, constant fraction of a backdrop render per frame. Only the top part of
// the frame (where the backdrop can be seen above the floe) is refreshed.
import * as THREE from 'three';
import { type BackdropFrame, buildIcebergGeometry, createIcebergMaterial } from './Iceberg';
import { createSeaMaterial, createSkyMaterial } from './Sky';

export const BACKDROP_FRAME: BackdropFrame = {
  T: 0.3,
  aspect: 4 / 3,
  vh: 0.385,
  camH: 8,
  dist: 1500,
};

/** Direction towards the light in the backdrop (upper left, slightly in front). */
export const BACKDROP_LIGHT = new THREE.Vector3(-0.62, 0.62, 0.48).normalize();

export interface BackdropOptions {
  /** Render-target resolution relative to the drawing buffer. */
  scale: number;
  /** Number of strips per refresh cycle (0 = never refresh after the first render). */
  strips: number;
}

export class Backdrop {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera();
  readonly target: THREE.WebGLRenderTarget;
  readonly frame = BACKDROP_FRAME;
  /** Top fraction of the frame that is kept up to date. */
  refreshFraction = 0.5;
  private sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private stripIndex = 0;
  private dirty = true;

  constructor(private opts: BackdropOptions) {
    const f = this.frame;
    this.target = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.target.texture.name = 'BackdropRT';

    // Camera: horizontal view, frustum shifted so the horizon sits at frame v = vh.
    const near = 5;
    const far = 60000;
    const halfW = near * f.T * f.aspect * 0.5;
    this.camera.position.set(0, f.camH, 0);
    this.camera.lookAt(0, f.camH, -1);
    this.camera.updateMatrixWorld();
    this.camera.projectionMatrix.makePerspective(-halfW, halfW, near * f.vh * f.T, -near * (1 - f.vh) * f.T, near, far);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(40000, 48, 24), createSkyMaterial(false));
    this.sky.position.copy(this.camera.position);
    this.sky.renderOrder = 10; // after the opaque berg/sea so hidden sky pixels are depth-rejected
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    const sea = new THREE.Mesh(new THREE.PlaneGeometry(120000, 120000), createSeaMaterial());
    sea.rotation.x = -Math.PI / 2;
    sea.frustumCulled = false;
    this.scene.add(sea);

    const berg = new THREE.Mesh(buildIcebergGeometry(f), createIcebergMaterial(BACKDROP_LIGHT));
    berg.frustumCulled = false;
    this.scene.add(berg);
    this.scene.matrixWorldAutoUpdate = true;
  }

  get texture(): THREE.Texture {
    return this.target.texture;
  }

  setSize(w: number, h: number): void {
    const s = this.opts.scale;
    const tw = Math.max(4, Math.round(w * s));
    const th = Math.max(4, Math.round(h * s));
    if (tw !== this.target.width || th !== this.target.height) {
      this.target.setSize(tw, th);
      this.dirty = true;
    }
  }

  /** Render the whole backdrop now. */
  renderAll(renderer: THREE.WebGLRenderer, time: number): void {
    this.target.scissorTest = false;
    this.target.viewport.set(0, 0, this.target.width, this.target.height);
    this.draw(renderer, time);
    this.dirty = false;
  }

  /** Per-frame: full render when dirty, otherwise refresh one strip. */
  update(renderer: THREE.WebGLRenderer, time: number): void {
    if (this.dirty) {
      this.renderAll(renderer, time);
      return;
    }
    const n = this.opts.strips;
    if (n <= 0) return;
    const H = this.target.height;
    const y0 = Math.floor(H * (1 - this.refreshFraction));
    const span = H - y0;
    const k = this.stripIndex++ % n;
    const a = y0 + Math.floor((span * k) / n);
    const b = y0 + Math.floor((span * (k + 1)) / n);
    this.target.viewport.set(0, 0, this.target.width, H);
    this.target.scissor.set(0, a, this.target.width, b - a);
    this.target.scissorTest = true;
    this.draw(renderer, time);
    this.target.scissorTest = false;
  }

  private draw(renderer: THREE.WebGLRenderer, time: number): void {
    this.sky.material.uniforms.uTime.value = time;
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.autoClear = true;
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;
    renderer.shadowMap.autoUpdate = prevShadow;
  }

  dispose(): void {
    this.target.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
  }
}
