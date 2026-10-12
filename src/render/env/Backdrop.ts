// Backdrop layer: sky dome, iceberg and far sea seen by a near-horizontal
// camera, rendered into a render target that the main scene uses as its
// background and that the ice shader samples (mirrored) for the iceberg
// reflection.
//
// Cost control: after one full render the target is refreshed in horizontal
// strips (one strip per update call, scissored), so slow cloud drift costs a
// small, constant fraction of a backdrop render per frame. Only the top part of
// the frame (where the backdrop can be seen above the floe) is refreshed.
//
// First person: the same berg (real 3D content, 1.5 km behind the floe) plus a
// ring of smaller distant bergs, a first-person sky and a hazy sea are rendered
// into a cube map around the eye (FirstPersonBackdrop). The cube is the scene
// background and the ice/sea reflection source in first person. The classic
// and first-person objects live in two groups of the backdrop scene and only
// one group is visible per pass, so the classic render is unchanged.
import * as THREE from 'three';
import {
  type BackdropFrame,
  type DistantBergSpec,
  buildDistantBergsGeometry,
  buildIcebergGeometry,
  createIcebergMaterial,
} from './Iceberg';
import { createFirstPersonSeaMaterial, createFirstPersonSkyMaterial, createSeaMaterial, createSkyMaterial } from './Sky';

export const BACKDROP_FRAME: BackdropFrame = {
  T: 0.3,
  aspect: 4 / 3,
  vh: 0.385,
  camH: 8,
  dist: 1500,
};

/** Direction towards the light in the backdrop (upper left, slightly in front). */
export const BACKDROP_LIGHT = new THREE.Vector3(-0.8, 0.5, 0.33).normalize();

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
  /** Classic backdrop objects (hidden while the first-person cube renders). */
  private readonly classic = new THREE.Group();
  private readonly bergGeometry: THREE.BufferGeometry;
  private fp: FirstPersonBackdrop | null = null;

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
    this.classic.add(this.sky);

    const sea = new THREE.Mesh(new THREE.PlaneGeometry(120000, 120000), createSeaMaterial());
    sea.rotation.x = -Math.PI / 2;
    sea.frustumCulled = false;
    this.classic.add(sea);

    this.bergGeometry = buildIcebergGeometry(f);
    const berg = new THREE.Mesh(this.bergGeometry, createIcebergMaterial(BACKDROP_LIGHT));
    berg.frustumCulled = false;
    this.classic.add(berg);
    this.scene.add(this.classic);
    this.scene.matrixWorldAutoUpdate = true;
  }

  /**
   * The first-person backdrop cube (created on first use). `eyeHeight` is the
   * eye's height above the sea, `size` the cube face resolution.
   */
  firstPerson(renderer: THREE.WebGLRenderer, size: number, eyeHeight: number): FirstPersonBackdrop {
    if (!this.fp) {
      this.fp = new FirstPersonBackdrop(this.scene, this.classic, this.bergGeometry, size, eyeHeight);
      this.fp.renderAll(renderer, 0);
    }
    return this.fp;
  }

  get texture(): THREE.Texture {
    return this.target.texture;
  }

  setSize(w: number, h: number): void {
    // Cap the target (high-DPR screens): the backdrop is soft photo-like content.
    const s = Math.min(this.opts.scale, 1600 / Math.max(1, h));
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
    this.fp?.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
  }
}

/**
 * Smaller bergs around the first-person horizon (backdrop frame: sea at y = 0,
 * the eye near the origin, the main berg 1.5 km away at -z). Kept low and far
 * so they read as distant scenery and never compete with the main berg.
 */
const DISTANT_BERGS: DistantBergSpec[] = [
  { x: -1500, z: -1750, w: 360, d: 200, h: 46, rot: 0.5, seed: 11, tabular: true },
  { x: -2300, z: -250, w: 300, d: 220, h: 62, rot: 1.2, seed: 23 },
  { x: -1700, z: 1500, w: 460, d: 240, h: 38, rot: -0.7, seed: 37, tabular: true },
  { x: 250, z: 2600, w: 340, d: 260, h: 74, rot: 0.3, seed: 41 },
  { x: 1900, z: 1300, w: 260, d: 180, h: 44, rot: 2.1, seed: 53 },
  { x: 2500, z: -500, w: 520, d: 260, h: 52, rot: -0.2, seed: 67, tabular: true },
  { x: 1250, z: -2100, w: 240, d: 170, h: 58, rot: 0.9, seed: 79 },
];

const CUBE_FACES = 6;

/** First-person backdrop: sky, bergs and horizon haze in a cube map around the eye. */
export class FirstPersonBackdrop {
  readonly target: THREE.WebGLCubeRenderTarget;
  private readonly cubeCamera: THREE.CubeCamera;
  private readonly group = new THREE.Group();
  private readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly bergs: THREE.Mesh;
  private face = 0;
  private cycleTime = 0;

  constructor(
    private scene: THREE.Scene,
    private classic: THREE.Group,
    bergGeometry: THREE.BufferGeometry,
    size: number,
    eyeHeight: number,
  ) {
    this.target = new THREE.WebGLCubeRenderTarget(size, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
    });
    this.target.texture.name = 'FirstPersonBackdropCube';
    this.cubeCamera = new THREE.CubeCamera(1, 60000, this.target);
    this.cubeCamera.position.set(0, eyeHeight, 0);
    this.cubeCamera.updateMatrixWorld(true);

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(40000, 48, 24), createFirstPersonSkyMaterial());
    this.sky.position.copy(this.cubeCamera.position);
    this.sky.renderOrder = 10;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);

    const sea = new THREE.Mesh(new THREE.PlaneGeometry(120000, 120000), createFirstPersonSeaMaterial());
    sea.rotation.x = -Math.PI / 2;
    sea.frustumCulled = false;
    this.group.add(sea);

    const bergMat = createIcebergMaterial(BACKDROP_LIGHT, { firstPerson: true });
    const berg = new THREE.Mesh(bergGeometry, bergMat);
    berg.frustumCulled = false;
    this.group.add(berg);
    this.bergs = new THREE.Mesh(buildDistantBergsGeometry(DISTANT_BERGS), bergMat);
    this.bergs.frustumCulled = false;
    this.group.add(this.bergs);

    this.group.visible = false;
    scene.add(this.group);
  }

  get texture(): THREE.CubeTexture {
    return this.target.texture;
  }

  /** Render all six faces now. */
  renderAll(renderer: THREE.WebGLRenderer, time: number): void {
    this.cycleTime = time;
    this.withScene(renderer, () => this.cubeCamera.update(renderer, this.scene));
    this.face = 0;
  }

  /**
   * Refresh one face (slow cloud drift). All faces of a cycle use the same
   * time so neighbouring faces always match; mipmaps update with the last.
   */
  refreshFace(renderer: THREE.WebGLRenderer, time: number): void {
    if (this.face === 0) this.cycleTime = time;
    const f = this.face;
    const cam = this.cubeCamera.children[f] as THREE.PerspectiveCamera;
    const tex = this.target.texture;
    const mips = tex.generateMipmaps;
    tex.generateMipmaps = f === CUBE_FACES - 1;
    this.withScene(renderer, () => {
      const prev = renderer.getRenderTarget();
      const prevFace = renderer.getActiveCubeFace();
      const prevLevel = renderer.getActiveMipmapLevel();
      renderer.setRenderTarget(this.target, f);
      renderer.render(this.scene, cam);
      renderer.setRenderTarget(prev, prevFace, prevLevel);
    });
    tex.generateMipmaps = mips;
    this.face = (f + 1) % CUBE_FACES;
  }

  private withScene(renderer: THREE.WebGLRenderer, draw: () => void): void {
    this.sky.material.uniforms.uTime.value = this.cycleTime;
    const prevShadow = renderer.shadowMap.autoUpdate;
    const prevAutoClear = renderer.autoClear;
    renderer.shadowMap.autoUpdate = false;
    renderer.autoClear = true;
    this.classic.visible = false;
    this.group.visible = true;
    draw();
    this.group.visible = false;
    this.classic.visible = true;
    renderer.autoClear = prevAutoClear;
    renderer.shadowMap.autoUpdate = prevShadow;
  }

  dispose(): void {
    this.target.dispose();
    this.scene.remove(this.group);
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.bergs.geometry.dispose();
    (this.bergs.material as THREE.Material).dispose();
  }
}
