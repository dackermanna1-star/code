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
//    While capturing, the procedural cube is the active environment (no feedback loop).

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

// Cube face orientation (GL convention, row 0 = top), identical to Babylon's
// CubeMapToSphericalPolynomialTools file faces so SH and sampling agree:
//   dir = normal + u * fileX + v * fileY, u,v in [-1, 1]
const FACES: Array<{ n: [number, number, number]; x: [number, number, number]; y: [number, number, number] }> = [
  { n: [1, 0, 0], x: [0, 0, -1], y: [0, -1, 0] }, // +X right (east)
  { n: [-1, 0, 0], x: [0, 0, 1], y: [0, -1, 0] }, // -X left (west)
  { n: [0, 1, 0], x: [1, 0, 0], y: [0, 0, 1] }, // +Y up
  { n: [0, -1, 0], x: [1, 0, 0], y: [0, 0, -1] }, // -Y down
  { n: [0, 0, 1], x: [1, 0, 0], y: [0, -1, 0] }, // +Z front (north)
  { n: [0, 0, -1], x: [-1, 0, 0], y: [0, -1, 0] }, // -Z back (south)
];

const sm = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Linear HDR radiance seen from the middle of the apartment at golden hour, for a unit
 * direction (x east, y up, z north). Low-frequency by design: it only has to give glossy
 * surfaces and metals a believable interior to reflect until the real capture exists.
 */
export function interiorRadiance(x: number, y: number, z: number, out: number[] = [0, 0, 0]): number[] {
  const horiz = Math.sqrt(x * x + z * z) || 1;
  const hx = x / horiz,
    hz = z / horiz;
  // walls: warm off-white, north/east walls catch sun patches
  let r = 0.4,
    g = 0.355,
    b = 0.3;
  const sunPatch = sm(0.2, 0.9, hz * 0.8 + hx * 0.4) * sm(-0.05, 0.1, y) * sm(0.55, 0.25, y);
  r += sunPatch * 0.45;
  g += sunPatch * 0.3;
  b += sunPatch * 0.14;
  // ceiling
  const ceil = sm(0.25, 0.75, y);
  r += (0.52 - r) * ceil;
  g += (0.49 - g) * ceil;
  b += (0.45 - b) * ceil;
  // floor: laminate with warm sun patches towards the south windows
  const flo = sm(-0.1, -0.45, y);
  const floorSun = sm(0.3, 0.8, -hz) * sm(-0.15, -0.35, y) * sm(-0.85, -0.55, y);
  const fr = 0.17 + floorSun * 0.55,
    fg = 0.105 + floorSun * 0.36,
    fb = 0.06 + floorSun * 0.18;
  r += (fr - r) * flo;
  g += (fg - g) * flo;
  b += (fb - b) * flo;
  // south windows (living room sliding door + window): bright warm sky, mullions
  const south = sm(0.62, 0.8, -hz) * sm(-0.1, 0.02, y) * sm(0.62, 0.48, y);
  if (south > 0) {
    const az = Math.atan2(hx, -hz); // 0 = due south, + towards east
    const mull = 0.75 + 0.25 * sm(0.0, 0.08, Math.abs(Math.sin(az * 9)));
    const k = south * mull;
    const sky = sm(0.0, 0.45, y);
    const wr = 2.6 + (1.25 - 2.6) * sky,
      wg = 1.85 + (1.35 - 1.85) * sky,
      wb = 1.15 + (1.6 - 1.15) * sky;
    r += (wr - r) * k;
    g += (wg - g) * k;
    b += (wb - b) * k;
  }
  // east window (bedroom 2 / kitchen side): cooler sky, smaller
  const east = sm(0.82, 0.93, hx) * sm(0.0, 0.08, y) * sm(0.5, 0.38, y);
  if (east > 0) {
    r += (1.05 - r) * east;
    g += (1.15 - g) * east;
    b += (1.4 - b) * east;
  }
  out[0] = r;
  out[1] = g;
  out[2] = b;
  return out;
}

/** Six float RGBA faces (+X,-X,+Y,-Y,+Z,-Z) of the procedural interior environment. */
export function interiorEnvironmentFaces(size: number): Float32Array[] {
  const faces: Float32Array[] = [];
  const c = [0, 0, 0];
  for (const f of FACES) {
    const data = new Float32Array(size * size * 4);
    for (let py = 0; py < size; py++) {
      const v = ((py + 0.5) / size) * 2 - 1;
      for (let px = 0; px < size; px++) {
        const u = ((px + 0.5) / size) * 2 - 1;
        let dx = f.n[0] + u * f.x[0] + v * f.y[0];
        let dy = f.n[1] + u * f.x[1] + v * f.y[1];
        let dz = f.n[2] + u * f.x[2] + v * f.y[2];
        const inv = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
        dx *= inv;
        dy *= inv;
        dz *= inv;
        interiorRadiance(dx, dy, dz, c);
        const o = (py * size + px) * 4;
        data[o] = c[0];
        data[o + 1] = c[1];
        data[o + 2] = c[2];
        data[o + 3] = 1;
      }
    }
    faces.push(data);
  }
  return faces;
}

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

/** Captures the scene into a cube once and installs it as scene.environmentTexture. */
export class EnvironmentCapture {
  readonly scene: Scene;
  readonly fallback: BaseTexture;
  private probe: ReflectionProbe | null = null;
  private probeSize = 0;
  private pending: Observer<number> | null = null;
  private generation = 0;
  /** True once a captured environment is active. */
  captured = false;

  constructor(scene: Scene, fallback: BaseTexture) {
    this.scene = scene;
    this.fallback = fallback;
    scene.environmentTexture = fallback;
  }

  /**
   * Render the probe on the next frame(s); resolves once the captured cube (with SH) is the
   * active environment, or false if superseded / failed (the fallback then stays active).
   */
  capture(o: CaptureOptions): Promise<boolean> {
    const scene = this.scene;
    const size = o.size ?? 128;
    const gen = ++this.generation;
    // no feedback: never sample the cube we are about to render into
    scene.environmentTexture = this.fallback;
    this.captured = false;
    if (!this.probe || this.probeSize !== size) {
      this.probe?.dispose();
      this.probe = new ReflectionProbe("envProbe", size, scene, true, halfFloatOK(scene), true);
      this.probeSize = size;
    }
    const probe = this.probe;
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
    if (this.pending) cube.onAfterRenderObservable.remove(this.pending);
    return new Promise<boolean>((resolve) => {
      let faces = 0;
      this.pending = cube.onAfterRenderObservable.add(() => {
        if (++faces < 6) return;
        if (this.pending) cube.onAfterRenderObservable.remove(this.pending);
        this.pending = null;
        const sh = CubeMapToSphericalPolynomialTools.ConvertCubeMapTextureToSphericalPolynomial(cube);
        if (!sh) {
          resolve(false);
          return;
        }
        sh.then((sp) => {
          if (gen !== this.generation || !sp) {
            resolve(false);
            return;
          }
          cube.sphericalPolynomial = sp;
          scene.environmentTexture = cube;
          this.captured = true;
          resolve(true);
        }).catch(() => resolve(false));
      });
    });
  }

  dispose(): void {
    if (this.scene.environmentTexture === this.probe?.cubeTexture) this.scene.environmentTexture = this.fallback;
    this.probe?.dispose();
    this.probe = null;
  }
}
