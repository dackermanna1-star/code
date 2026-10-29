// Reflection environment (IBL) for the world/glass materials.
//
// 1. A procedural interior environment cube (warm walls, wood floor, light ceiling, bright
//    golden-hour sky through south windows) is available immediately at startup, with
//    spherical harmonics computed on the CPU for diffuse irradiance. HDR (half float) when the
//    GPU can render/filter half floats, otherwise LDR RGBA8.
// 2. captureEnvironment() renders the real apartment ONCE into a linear-HDR ReflectionProbe
//    cube at the centre of a room box (the living room), box-projects it onto that box
//    (parallax corrected local reflections), computes its SH from a read-back and swaps it in as
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
  /**
   * Probe position (world). Ignored when `box` is given: Babylon's local-cubemap parallax
   * correction assumes the cube was rendered from `boundingBoxPosition`, so a box-projected
   * capture is always rendered from the box centre.
   */
  position: Vector3;
  /** Face resolution. */
  size?: number;
  /** Box for parallax-corrected (local) reflections; omit for infinitely distant. */
  box?: { center: Vector3; size: Vector3 };
  /** Meshes to render (default: all enabled, visible meshes). */
  meshes?: AbstractMesh[];
}

/** Always-ready predicate installed on an active probe: it must never be re-rendered. */
const ALWAYS_READY = (): boolean => true;

interface PendingCapture {
  cube: RenderTargetTexture;
  observers: Array<() => void>;
  resolve: (ok: boolean) => void;
}

/**
 * Captures the scene into a cube once and installs it as scene.environmentTexture.
 * Double-buffered: a re-capture (e.g. after a power cut changed the interior lighting) renders
 * into the probe that is NOT the active environment, so materials keep sampling the previous
 * capture meanwhile (no GL feedback loop, no visible pop back to the procedural fallback).
 *
 * Completeness: the probe is only armed once every listed mesh is ready for its render passes
 * (shaders may compile asynchronously for several frames), and a pass in which any mesh was
 * skipped as not ready is discarded and re-rendered; only a complete six-face pass is installed.
 * Once installed, the cube's readiness predicate always succeeds, so nothing can reset its
 * RENDER_ONCE counter and redraw it while materials sample it.
 */
export class EnvironmentCapture {
  readonly scene: Scene;
  readonly fallback: BaseTexture;
  private probes: Array<ReflectionProbe | null> = [null, null];
  /** Index of the probe that is the active environment (-1 = fallback active). */
  private active = -1;
  private pending: PendingCapture | null = null;
  private generation = 0;
  private lastOptions: CaptureOptions | null = null;
  /** True once a captured environment is active. */
  captured = false;
  /** Frames a capture waits for meshes to become ready before rendering anyway (misses are still retried). */
  readyTimeoutFrames = 600;

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
   * Render the probe once all its meshes are ready; resolves true once the captured cube (with
   * SH) is the active environment, or false if superseded / disposed / failed (the previous
   * environment then stays).
   */
  capture(o: CaptureOptions): Promise<boolean> {
    const scene = this.scene;
    const size = Math.max(16, Math.round(o.size ?? 128));
    const gen = ++this.generation;
    this.lastOptions = o;
    this.cancelPending();
    // render into the slot that is not being sampled; the active probe stays installed even
    // across a resolution change until the new capture is ready
    const slot = this.active === 0 ? 1 : 0;
    let probe = this.probes[slot];
    if (probe && probe.cubeTexture.getSize().width !== size) {
      probe.dispose();
      probe = null;
    }
    if (!probe) {
      probe = new ReflectionProbe(`envProbe${slot}`, size, scene, true, halfFloatOK(scene), true);
      this.probes[slot] = probe;
    }
    const cube = probe.cubeTexture;
    probe.position.copyFrom(o.box ? o.box.center : o.position);
    const list = probe.renderList as AbstractMesh[];
    list.length = 0;
    const meshes = o.meshes ?? scene.meshes.filter((m) => m.isEnabled() && m.isVisible && m.getTotalVertices() > 0 && !m.infiniteDistance);
    for (const m of meshes) if (!m.isDisposed()) list.push(m);
    if (o.box) {
      cube.boundingBoxSize = o.box.size.clone();
      cube.boundingBoxPosition = o.box.center.clone();
    }
    // a mesh skipped as not ready during the real render (not the pre-warm check) spoils the pass
    let missed = false;
    cube.customIsReadyFunction = (mesh: AbstractMesh, refreshRate: number, preWarm?: boolean): boolean => {
      const ok = mesh.isReady(refreshRate === 0);
      if (!ok && !preWarm) missed = true;
      return ok;
    };
    cube.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;

    return new Promise<boolean>((resolve) => {
      const p: PendingCapture = { cube, observers: [], resolve };
      this.pending = p;
      let armed = false;
      let waited = 0;
      const arm = (): void => {
        armed = true;
        cube.resetRefreshCounter();
        // Babylon 9 only renders RTTs that are bound to materials, listed as custom render
        // targets or used as the environment; the probe is none of these while capturing, so
        // list it until a complete pass is done
        if (!scene.customRenderTargets.includes(cube)) scene.customRenderTargets.push(cube);
      };
      const waitObs = scene.onBeforeRenderObservable.add(() => {
        if (armed) return;
        if (cube.isReadyForRendering() || ++waited >= this.readyTimeoutFrames) arm();
      });
      p.observers.push(() => scene.onBeforeRenderObservable.remove(waitObs));
      const bindObs = cube.onBeforeBindObservable.add(() => {
        missed = false;
      });
      p.observers.push(() => cube.onBeforeBindObservable.remove(bindObs));
      const afterObs = cube.onAfterRenderObservable.add((faceIndex: number) => {
        if (!armed || faceIndex !== 5) return;
        // incomplete pass: Babylon already reset the refresh counter, so it renders again
        if (missed) return;
        if (this.pending === p) this.pending = null;
        this.releasePending(p);
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
          // never redraw while sampled (a not-ready mesh would otherwise reset RENDER_ONCE)
          cube.customIsReadyFunction = ALWAYS_READY;
          scene.environmentTexture = cube;
          this.active = slot;
          this.captured = true;
          // the previous probe is now idle; drop it if it no longer matches the resolution
          const other = this.probes[1 - slot];
          if (other && other.cubeTexture.getSize().width !== size) {
            other.dispose();
            this.probes[1 - slot] = null;
          }
          resolve(true);
        }).catch(() => resolve(false));
      });
      p.observers.push(() => cube.onAfterRenderObservable.remove(afterObs));
    });
  }

  /** Detach a capture's observers and unlist its render target. */
  private releasePending(p: PendingCapture): void {
    for (const off of p.observers) off();
    p.observers.length = 0;
    const i = this.scene.customRenderTargets.indexOf(p.cube);
    if (i >= 0) this.scene.customRenderTargets.splice(i, 1);
  }

  /** Abort the in-flight capture (its promise resolves false). */
  private cancelPending(): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    this.releasePending(p);
    p.resolve(false);
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
