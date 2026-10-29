// Reflection environment (IBL) for the world/glass materials.
//
// 1. A procedural interior environment cube (warm walls, wood floor, light ceiling, bright
//    golden-hour sky through south windows) is available immediately at startup, with
//    spherical harmonics computed on the CPU for diffuse irradiance. HDR (half float) when the
//    GPU can render/filter half floats, otherwise LDR RGBA8.
// 2. captureEnvironment() renders the real apartment ONCE into a linear-HDR ReflectionProbe
//    cube at the living-room centre, box-projects it onto the apartment bounds (parallax
//    corrected local reflections), computes its SH from a read-back and swaps it in as
//    scene.environmentTexture. Runtime cost after the capture is zero (RENDER_ONCE).
//    Captures are double-buffered: while capturing, the previous environment (procedural or
//    the older capture) stays active, so materials never sample the cube being rendered (no
//    feedback loop) and a re-capture (power cut) swaps in without a visible pop.

import {
  RawCubeTexture,
  ReflectionProbe,
  RenderTargetTexture,
  CubeMapToSphericalPolynomialTools,
  Constants,
  Texture,
  Vector3,
  ToHalfFloat,
  type BaseTexture,
  type Scene,
  type AbstractMesh,
  type Observer,
} from "@babylonjs/core";

import { interiorEnvironmentFaces } from "./proctex/envcube.ts";
export { interiorRadiance, interiorEnvironmentFaces, CUBE_FACES } from "./proctex/envcube.ts";

/** Can this engine render to and filter half-float textures (HDR env + GPU mipmaps)? */
function halfFloatOK(scene: Scene): boolean {
  const caps = scene.getEngine().getCaps();
  return !!caps.textureHalfFloatRender && !!caps.textureHalfFloatLinearFiltering;
}

/** Create the procedural interior environment cube (with SH) — usable immediately. */
export function createInteriorEnvironment(scene: Scene, size = 64): BaseTexture {
  const faces = interiorEnvironmentFaces(size);
  const hdr = halfFloatOK(scene);
  let data: ArrayBufferView[];
  if (hdr) {
    data = faces.map((f) => {
      const h = new Uint16Array(f.length);
      for (let i = 0; i < f.length; i++) h[i] = ToHalfFloat(f[i]);
      return h;
    });
  } else {
    data = faces.map((f) => {
      const u = new Uint8Array(f.length);
      for (let i = 0; i < f.length; i++) u[i] = Math.max(0, Math.min(255, Math.round(Math.min(1, f[i]) * 255)));
      return u;
    });
  }
  const tex = new RawCubeTexture(
    scene,
    data,
    size,
    Constants.TEXTUREFORMAT_RGBA,
    hdr ? Constants.TEXTURETYPE_HALF_FLOAT : Constants.TEXTURETYPE_UNSIGNED_BYTE,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  tex.name = "interiorEnvironment";
  tex.gammaSpace = false;
  // diffuse irradiance from the float data (keeps HDR windows even for the LDR fallback)
  const sp = CubeMapToSphericalPolynomialTools.ConvertCubeMapToSphericalPolynomial({
    size,
    right: faces[0],
    left: faces[1],
    up: faces[2],
    down: faces[3],
    front: faces[4],
    back: faces[5],
    format: Constants.TEXTUREFORMAT_RGBA,
    type: Constants.TEXTURETYPE_FLOAT,
    gammaSpace: false,
  });
  if (sp) tex.sphericalPolynomial = sp;
  return tex;
}

export interface CaptureOptions {
  /** Probe position (world). */
  position: Vector3;
  /** Face resolution. */
  size?: number;
  /** Box for parallax-corrected (local) reflections; omit for infinitely distant. */
  box?: { center: Vector3; size: Vector3 };
  /** Meshes to render (default: all enabled, visible meshes). */
  meshes?: AbstractMesh[];
}

/**
 * Captures the scene into a cube once and installs it as scene.environmentTexture.
 * Double-buffered: a re-capture (e.g. after a power cut changed the interior lighting) renders
 * into the probe that is NOT the active environment, so materials keep sampling the previous
 * capture meanwhile (no GL feedback loop, no visible pop back to the procedural fallback).
 */
export class EnvironmentCapture {
  readonly scene: Scene;
  readonly fallback: BaseTexture;
  private probes: Array<ReflectionProbe | null> = [null, null];
  private probeSize = 0;
  /** Index of the probe that is the active environment (-1 = fallback active). */
  private active = -1;
  private pending: { cube: RenderTargetTexture; obs: Observer<number> } | null = null;
  private generation = 0;
  private lastOptions: CaptureOptions | null = null;
  /** True once a captured environment is active. */
  captured = false;

  constructor(scene: Scene, fallback: BaseTexture) {
    this.scene = scene;
    this.fallback = fallback;
    scene.environmentTexture = fallback;
  }

  /** Options of the last capture() call (null before the first). */
  get lastCapture(): CaptureOptions | null {
    return this.lastOptions;
  }

  /**
   * Render the probe on the next frame; resolves once the captured cube (with SH) is the
   * active environment, or false if superseded / failed (the previous environment then stays).
   */
  capture(o: CaptureOptions): Promise<boolean> {
    const scene = this.scene;
    const size = o.size ?? 128;
    const gen = ++this.generation;
    this.lastOptions = o;
    if (this.probeSize !== size) {
      // resolution change: drop both probes (the active one too; fall back meanwhile)
      for (let i = 0; i < 2; i++) {
        this.probes[i]?.dispose();
        this.probes[i] = null;
      }
      this.probeSize = size;
      this.active = -1;
      this.captured = false;
      scene.environmentTexture = this.fallback;
    }
    // render into the slot that is not being sampled
    const slot = this.active === 0 ? 1 : 0;
    let probe = this.probes[slot];
    if (!probe) {
      probe = new ReflectionProbe(`envProbe${slot}`, size, scene, true, halfFloatOK(scene), true);
      this.probes[slot] = probe;
    }
    probe.position.copyFrom(o.position);
    probe.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    const list = probe.renderList as AbstractMesh[];
    list.length = 0;
    const meshes = o.meshes ?? scene.meshes.filter((m) => m.isEnabled() && m.isVisible && m.getTotalVertices() > 0 && !m.infiniteDistance);
    for (const m of meshes) list.push(m);
    const cube = probe.cubeTexture;
    cube.resetRefreshCounter();
    if (o.box) {
      cube.boundingBoxSize = o.box.size.clone();
      cube.boundingBoxPosition = o.box.center.clone();
    }
    this.cancelPending();
    // Babylon 9 only renders RTTs that are bound to materials, listed as custom render targets
    // or used as the environment; the probe is none of these while capturing, so list it
    // until its six faces are done
    if (!scene.customRenderTargets.includes(cube)) scene.customRenderTargets.push(cube);
    return new Promise<boolean>((resolve) => {
      let faces = 0;
      const obs = cube.onAfterRenderObservable.add(() => {
        if (++faces < 6) return;
        this.cancelPending();
        const sh = CubeMapToSphericalPolynomialTools.ConvertCubeMapTextureToSphericalPolynomial(cube);
        if (!sh) {
          resolve(false);
          return;
        }
        sh.then((sp) => {
          if (gen !== this.generation || !sp || this.probes[slot]?.cubeTexture !== cube) {
            resolve(false);
            return;
          }
          cube.sphericalPolynomial = sp;
          scene.environmentTexture = cube;
          this.active = slot;
          this.captured = true;
          resolve(true);
        }).catch(() => resolve(false));
      });
      this.pending = { cube, obs };
    });
  }

  /** Stop listening to an in-flight capture and unlist its render target. */
  private cancelPending(): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    p.cube.onAfterRenderObservable.remove(p.obs);
    const i = this.scene.customRenderTargets.indexOf(p.cube);
    if (i >= 0) this.scene.customRenderTargets.splice(i, 1);
  }

  dispose(): void {
    this.generation++;
    this.cancelPending();
    const env = this.scene.environmentTexture;
    for (let i = 0; i < 2; i++) {
      const pr = this.probes[i];
      if (!pr) continue;
      if (env === pr.cubeTexture) this.scene.environmentTexture = this.fallback;
      pr.dispose();
      this.probes[i] = null;
    }
    this.active = -1;
    this.captured = false;
  }
}
