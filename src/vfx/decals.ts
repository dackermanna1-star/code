// Persistent decals: impact marks, scorch, crack marks, water puddles and settled-dust patches.
//
// All decals are quads in ONE dynamic mesh (one draw call) with a procedural atlas and a small
// custom shader using premultiplied blending: result = dst·(1 − a) + rgb. Marks blend toward a
// dark colour (lighting-independent darkening), dust patches toward a light-level-scaled grey,
// puddles darken the floor and add a fresnel reflection + specular glints from the strongest
// nearby lights (with animated ripples while water keeps landing on them).
//
// Render order: the material reports needAlphaTesting (not blending), so Babylon draws it in
// the alpha-test queue — after all opaque world geometry (the surfaces decals lie on) but
// BEFORE particles and transparent glass, so dust/drops in front of a puddle are not cut out.
// Blending is switched on/off around the draw via onBind/onUnBind. Depth: no writes, polygon
// offset + a 2 mm lift along the normal.
//
// Decals are world-static quads, but they do not outlive their support: `revalidate()` (called
// by Vfx a few times after fractures, splits and grabbed/thrown/dropped objects) re-probes the
// surface under nearby horizontal decals and fades out those whose support dropped away or
// moved, and removes wall decals inside a broken-out region.
//
// Slot policy: one shared pool with sub-caps — puddles (merge when they touch) and settled dust
// patches (merge and thicken when they overlap) each have their own cap, and marks (impact,
// scorch, crack) are recycled only by other marks while dust/puddles are around to recycle.

import { Constants, Effect, Mesh, ShaderMaterial, Vector3, VertexBuffer, type RawTexture, type Scene, type Light } from "@babylonjs/core";
import { atlasCanvas, dilateTransparent, rawAtlasTexture, shadeCell } from "./atlas.ts";

export type DecalKind = "impact" | "scorch" | "puddle" | "crack" | "dust";

interface KindLook {
  cells: number[];
  color: [number, number, number];
  /** Coverage alpha scale (how strongly the decal replaces what is under it). */
  darken: number;
  wet: number;
  /** Scale the colour by the local light level (light-coloured decals). */
  lit: boolean;
  fadeIn: number;
}

const LOOK: Record<DecalKind, KindLook> = {
  impact: { cells: [0, 1], color: [0.16, 0.15, 0.14], darken: 0.7, wet: 0, lit: false, fadeIn: 0 },
  scorch: { cells: [2, 3], color: [0.035, 0.03, 0.028], darken: 0.92, wet: 0, lit: false, fadeIn: 0.3 },
  crack: { cells: [4, 5], color: [0.07, 0.06, 0.055], darken: 0.85, wet: 0, lit: false, fadeIn: 0 },
  puddle: { cells: [6, 7], color: [0.01, 0.012, 0.014], darken: 0.45, wet: 1, lit: false, fadeIn: 0.4 },
  dust: { cells: [8, 9], color: [0.72, 0.71, 0.68], darken: 0.45, wet: 0, lit: true, fadeIn: 5 },
};

const ATLAS = 512;
const GRID = 4;
/** Surface lift along the normal (m). */
const LIFT = 0.002;
/** Water film thickness used to turn litres into puddle area (m). */
export const FILM_THICKNESS = 0.0025;
/** Smallest puddle (a drop-sized wet spot, m radius). */
export const MIN_PUDDLE_R = 0.03;
/** Water needed before a wet spot shows (litres). */
export const MIN_PUDDLE_LITRES = Math.PI * MIN_PUDDLE_R * MIN_PUDDLE_R * FILM_THICKNESS * 1e3;
/** Settled dust patches never grow beyond this radius by merging (m). */
const MAX_DUST_R = 1.1;
/** Initial coverage density of a dust patch; overlapping patches thicken it up to 1. */
const DUST_DENSITY0 = 0.7;
/** Ground heights below this mean "nothing below". */
const NO_SUPPORT = -1e8;

interface Decal {
  alive: boolean;
  kind: DecalKind;
  stamp: number;
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  tx: number;
  ty: number;
  tz: number;
  bx: number;
  by: number;
  bz: number;
  /** Half extents along t and b (m). */
  ra: number;
  rb: number;
  cell: number;
  r: number;
  g: number;
  b: number;
  opacity: number;
  fadeRate: number;
  light: number;
  ripple: number;
  /** Puddles: water area (m²) and the radius cap. */
  area: number;
  maxR: number;
  aniso: number;
  /** Coverage multiplier (dust patches thicken when they merge). */
  density: number;
  /** Fading out (support gone); freed when the opacity reaches 0. */
  dying: boolean;
}

/** Water landed somewhere without a puddle yet (gathers until a wet spot can show). */
interface WetSpot {
  x: number;
  y: number;
  z: number;
  litres: number;
  t: number;
}

// ------------------------------------------------------------------ shaders
const VERT = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 color;
attribute vec4 decal;
uniform mat4 viewProjection;
varying vec2 vUV;
varying vec4 vColor;
varying vec4 vDecal;
varying vec3 vPos;
void main(void) {
  vUV = uv;
  vColor = color;
  vDecal = decal;
  vPos = position;
  gl_Position = viewProjection * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D atlas;
uniform vec3 cameraPosition;
uniform vec3 envColor;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform vec3 lightPos[4];
uniform vec3 lightCol[4];
uniform float time;
uniform float gammaOut;
varying vec2 vUV;
varying vec4 vColor;
varying vec4 vDecal;
varying vec3 vPos;
void main(void) {
  vec4 t = texture2D(atlas, vUV);
  float cov = t.a * vColor.a;
  if (cov < 0.004) discard;
  float alpha = cov * vDecal.y;
  // un-premultiplied target colour (linear) and additive light (reflections, glints)
  vec3 base = vColor.rgb * t.rgb;
  vec3 add = vec3(0.0);
  float wet = vDecal.x;
  if (wet > 0.0) {
    // ripples (only while water keeps landing): perturb the up normal
    float rip = vDecal.w;
    vec3 N = normalize(vec3(
      rip * 0.05 * (sin(vPos.x * 37.0 + time * 5.1) + sin((vPos.x + vPos.z) * 23.0 - time * 3.7)),
      1.0,
      rip * 0.05 * (sin(vPos.z * 33.0 - time * 4.3) + sin((vPos.x - vPos.z) * 29.0 + time * 2.9))));
    vec3 V = normalize(cameraPosition - vPos);
    float NdV = max(dot(N, V), 0.0);
    float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
    vec3 R = reflect(-V, N);
    float L = vDecal.z;
    vec3 refl = envColor * L * (0.6 + 0.4 * clamp(R.y, 0.0, 1.0)) * F * 0.6;
    vec3 spec = sunColor * pow(max(dot(R, -sunDir), 0.0), 400.0);
    for (int i = 0; i < 4; i++) {
      vec3 d = lightPos[i] - vPos;
      float dist2 = max(dot(d, d), 0.25);
      vec3 Ld = d * inversesqrt(dist2);
      spec += lightCol[i] * pow(max(dot(R, Ld), 0.0), 350.0) / dist2;
    }
    add = (refl + min(spec, vec3(1.5)) * F * 4.0) * wet;
  }
  if (gammaOut < 1.0) {
    // framebuffer holds gamma-encoded colour (materials apply image processing themselves):
    // encode the blend target exactly, and the small additive term with the local slope of the
    // curve (pow() on small additive values would turn soft edges into bright rims)
    base = pow(max(base, vec3(0.0)), vec3(gammaOut));
    add *= 0.75;
  }
  gl_FragColor = vec4(base * alpha + add * cov, alpha);
}
`;

// ------------------------------------------------------------------ atlas
function hash2(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed),
    b = hash2(ix + 1, iy, seed),
    c = hash2(ix, iy + 1, seed),
    d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(x: number, y: number, seed: number, oct: number): number {
  let s = 0,
    a = 0.5,
    f = 1,
    n = 0;
  for (let o = 0; o < oct; o++) {
    s += noise(x * f, y * f, seed + o * 31) * a;
    n += a;
    a *= 0.5;
    f *= 2.1;
  }
  return s / n;
}
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Decal atlas (row 0 = top of the image = v 0): marks, scorch, cracks, puddles, dust. */
function createDecalAtlas(scene: Scene): RawTexture {
  const C = ATLAS / GRID;
  const ctx = atlasCanvas(ATLAS);
  ctx.clearRect(0, 0, ATLAS, ATLAS);
  // cracks: jagged branching lines (canvas strokes), cells 4 and 5
  for (const [cell, seed] of [
    [4, 5],
    [5, 9],
  ]) {
    let s = seed * 7919;
    const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    const ox = (cell % GRID) * C + C / 2,
      oy = Math.floor(cell / GRID) * C + C / 2;
    ctx.strokeStyle = "rgba(128,128,128,1)";
    ctx.lineCap = "round";
    const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
      let px = x,
        py = y;
      const steps = 5;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(px, py);
      for (let k = 0; k < steps; k++) {
        a += (rnd() - 0.5) * 0.7;
        px += (Math.cos(a) * len) / steps;
        py += (Math.sin(a) * len) / steps;
        ctx.lineTo(px, py);
        if (depth < 2 && rnd() < 0.3) {
          ctx.stroke();
          branch(px, py, a + (rnd() - 0.5) * 1.8, len * 0.5, w * 0.6, depth + 1);
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(px, py);
        }
      }
      ctx.stroke();
    };
    const arms = 4 + Math.floor(rnd() * 3);
    for (let k = 0; k < arms; k++) branch(ox, oy, (k / arms) * Math.PI * 2 + rnd() * 0.6, C * (0.3 + rnd() * 0.15), 2.2, 0);
  }
  const d = ctx.getImageData(0, 0, ATLAS, ATLAS).data;
  dilateTransparent(d, ATLAS);
  const edge = (u: number, v: number) => sstep(0, 0.12, 1 - Math.max(Math.abs(u), Math.abs(v)));
  // impact scuffs: gritty core + radial streaks
  for (const [cell, seed] of [
    [0, 11],
    [1, 23],
  ]) {
    shadeCell(d, ATLAS, cell, C, (u, v) => {
      const r = Math.hypot(u, v);
      const ang = Math.atan2(v, u);
      const streak = Math.pow(Math.max(0, Math.sin(ang * 7 + seed) * Math.sin(ang * 3.3 + seed * 0.7)), 2);
      const n = fbm(u * 6, v * 6, seed, 4);
      const core = sstep(0.75, 0.05, r + (n - 0.5) * 0.35);
      const rays = streak * sstep(0.95, 0.2, r) * 0.6;
      const speck = noise(u * 40, v * 40, seed) > 0.78 ? 0.5 * sstep(0.95, 0.3, r) : 0;
      return [0.55 + 0.45 * n, Math.min(1, core * (0.55 + 0.45 * n) + rays + speck) * edge(u, v)];
    }, GRID);
  }
  // scorch: soot with a darker centre and ragged edge
  for (const [cell, seed] of [
    [2, 37],
    [3, 41],
  ]) {
    shadeCell(d, ATLAS, cell, C, (u, v) => {
      const n = fbm(u * 3.2, v * 3.2, seed, 5);
      const r = Math.hypot(u, v) + (n - 0.5) * 0.5;
      return [0.5 + 0.5 * n, sstep(0.95, 0.1, r) * edge(u, v)];
    }, GRID);
  }
  // puddles: irregular blob masks with soft rims
  for (const [cell, seed] of [
    [6, 53],
    [7, 61],
  ]) {
    shadeCell(d, ATLAS, cell, C, (u, v) => {
      const ang = Math.atan2(v, u);
      const wob = fbm(Math.cos(ang) * 1.6 + 5, Math.sin(ang) * 1.6 + 5, seed, 4);
      const r = Math.hypot(u, v) / (0.62 + 0.36 * wob);
      return [1, sstep(1, 0.86, r) * edge(u, v)];
    }, GRID);
  }
  // settled dust: grainy soft patch
  for (const [cell, seed] of [
    [8, 71],
    [9, 83],
  ]) {
    shadeCell(d, ATLAS, cell, C, (u, v) => {
      const n = fbm(u * 2.5, v * 2.5, seed, 5);
      const grain = noise(u * 64, v * 64, seed + 1);
      const r = Math.hypot(u, v) + (n - 0.5) * 0.7;
      return [0.85 + 0.15 * grain, sstep(0.95, 0.15, r) * (0.65 + 0.35 * grain) * edge(u, v)];
    }, GRID);
  }
  return rawAtlasTexture(scene, "vfxDecalAtlas", d, ATLAS);
}

// ------------------------------------------------------------------ system
export class Decals {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  readonly capacity: number;
  readonly maxPuddles: number;
  readonly maxDust: number;
  private readonly scene: Scene;
  private readonly wet: WetSpot[] = [];
  private readonly atlas: RawTexture;
  private readonly list: Decal[] = [];
  private stamp = 0;
  private pos: Float32Array;
  private uv: Float32Array;
  private col: Float32Array;
  private dec: Float32Array;
  private dirty = false;
  private geomDirty = false;
  private uploadTimer = 0;
  private time = 0;
  // Uniform storage (ShaderMaterial keeps references, so we mutate these in place).
  private lightPos: number[] = new Array(12).fill(0);
  private lightCol: number[] = new Array(12).fill(0);
  private envColor = new Vector3(0.5, 0.52, 0.55);
  private sunDir = new Vector3(0, -1, 0);
  private sunColor = new Vector3(0, 0, 0);
  private light: (x: number, y: number, z: number) => number;

  constructor(scene: Scene, opts: { capacity?: number; maxPuddles?: number; maxDust?: number; light: (x: number, y: number, z: number) => number }) {
    this.scene = scene;
    this.capacity = Math.max(8, opts.capacity ?? 320);
    this.maxPuddles = Math.max(1, opts.maxPuddles ?? 24);
    this.maxDust = Math.max(1, opts.maxDust ?? 64);
    this.light = opts.light;
    const n = this.capacity;
    for (let i = 0; i < n; i++)
      this.list.push({
        alive: false, kind: "impact", stamp: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, tx: 1, ty: 0, tz: 0, bx: 0, by: 0, bz: 1,
        ra: 0, rb: 0, cell: 0, r: 0, g: 0, b: 0, opacity: 0, fadeRate: 0, light: 1, ripple: 0, area: 0, maxR: 0, aniso: 1,
        density: 1, dying: false,
      });
    this.pos = new Float32Array(n * 12);
    this.uv = new Float32Array(n * 8);
    this.col = new Float32Array(n * 16);
    this.dec = new Float32Array(n * 16);
    const idx = new Uint32Array(n * 6);
    for (let q = 0; q < n; q++) {
      const v = q * 4,
        o = q * 6;
      idx[o] = v;
      idx[o + 1] = v + 1;
      idx[o + 2] = v + 2;
      idx[o + 3] = v;
      idx[o + 4] = v + 2;
      idx[o + 5] = v + 3;
    }
    if (!Effect.ShadersStore["vfxDecalVertexShader"]) {
      Effect.ShadersStore["vfxDecalVertexShader"] = VERT;
      Effect.ShadersStore["vfxDecalFragmentShader"] = FRAG;
    }
    this.atlas = createDecalAtlas(scene);
    const mat = new ShaderMaterial(
      "vfxDecalMat",
      scene,
      { vertex: "vfxDecal", fragment: "vfxDecal" },
      {
        attributes: ["position", "uv", "color", "decal"],
        uniforms: ["viewProjection", "cameraPosition", "envColor", "sunDir", "sunColor", "lightPos", "lightCol", "time", "gammaOut"],
        samplers: ["atlas"],
        needAlphaBlending: false,
        needAlphaTesting: true,
      },
    );
    mat.setTexture("atlas", this.atlas);
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    mat.zOffset = -1;
    mat.zOffsetUnits = -4;
    const engine = scene.getEngine();
    // Blend only around our own draw (we live in the alpha-test queue, see header).
    mat.onBindObservable.add(() => engine.setAlphaMode(Constants.ALPHA_PREMULTIPLIED_PORTERDUFF));
    mat.onUnBindObservable.add(() => engine.setAlphaMode(Constants.ALPHA_DISABLE));
    this.material = mat;
    mat.setFloat("time", 0);
    mat.setFloat("gammaOut", 1);
    mat.setVector3("envColor", this.envColor);
    mat.setVector3("sunDir", this.sunDir);
    mat.setVector3("sunColor", this.sunColor);
    mat.setArray3("lightPos", this.lightPos);
    mat.setArray3("lightCol", this.lightCol);

    const mesh = new Mesh("vfxDecals", scene);
    mesh.setVerticesData(VertexBuffer.PositionKind, this.pos, true, 3);
    mesh.setVerticesData(VertexBuffer.UVKind, this.uv, true, 2);
    mesh.setVerticesData(VertexBuffer.ColorKind, this.col, true, 4);
    mesh.setVerticesData("decal", this.dec, true, 4);
    mesh.setIndices(idx);
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.doNotSyncBoundingInfo = true;
    mesh.isVisible = false;
    this.mesh = mesh;
  }

  /** Live decals (all kinds). */
  get count(): number {
    let n = 0;
    for (const d of this.list) if (d.alive) n++;
    return n;
  }

  get puddleCount(): number {
    let n = 0;
    for (const d of this.list) if (d.alive && d.kind === "puddle") n++;
    return n;
  }

  /** Total puddle area (m², tests). */
  get puddleArea(): number {
    let a = 0;
    for (const d of this.list) if (d.alive && d.kind === "puddle") a += Math.PI * d.ra * d.rb;
    return a;
  }

  /** Number of decals of a kind (tests/stats). */
  countOf(kind: DecalKind): number {
    let n = 0;
    for (const d of this.list) if (d.alive && d.kind === kind) n++;
    return n;
  }

  /** Monotonic id of the newest decal (revalidation only touches decals at or below a stamp). */
  get currentStamp(): number {
    return this.stamp;
  }

  private allocate(kind: DecalKind): Decal | null {
    let free: Decal | null = null;
    let oldestMark: Decal | null = null;
    let puddles = 0,
      dusts = 0;
    let oldestPuddle: Decal | null = null;
    let oldestDust: Decal | null = null;
    for (const d of this.list) {
      if (!d.alive) {
        if (!free) free = d;
        continue;
      }
      if (d.kind === "puddle") {
        puddles++;
        if (!oldestPuddle || d.stamp < oldestPuddle.stamp) oldestPuddle = d;
      } else if (d.kind === "dust") {
        dusts++;
        if (!oldestDust || d.stamp < oldestDust.stamp) oldestDust = d;
      } else if (!oldestMark || d.stamp < oldestMark.stamp) oldestMark = d;
    }
    if (kind === "puddle" && puddles >= this.maxPuddles) return oldestPuddle;
    if (kind === "dust" && dusts >= this.maxDust) return oldestDust;
    if (free) return free;
    // pool full: dust recycles dust, marks recycle marks; fall back across classes
    if (kind === "dust") return oldestDust ?? oldestMark ?? oldestPuddle;
    if (kind === "puddle") return oldestPuddle ?? oldestDust ?? oldestMark;
    return oldestMark ?? oldestDust ?? oldestPuddle;
  }

  /**
   * Add a decal. `size` is the diameter (m). Returns false if the input was invalid.
   * Puddles placed near an existing puddle enlarge it instead of stacking.
   */
  add(kind: DecalKind, x: number, y: number, z: number, nx: number, ny: number, nz: number, size: number, opts?: { tint?: number; rotation?: number }): boolean {
    const look = LOOK[kind];
    if (!look || !Number.isFinite(x + y + z + size) || !(size > 0)) return false;
    let nl = Math.hypot(nx, ny, nz);
    if (!(nl > 1e-6) || !Number.isFinite(nl)) {
      nx = 0;
      ny = 1;
      nz = 0;
      nl = 1;
    }
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const r = Math.min(4, size / 2);
    if (kind === "puddle") {
      const p = this.findPuddle(x, y, z, r);
      if (p) {
        const area = Math.PI * r * r;
        if (area > p.area) this.setPuddleArea(p, area);
        return true;
      }
    } else if (kind === "dust" && this.mergeDust(x, y + ny * LIFT, z, r)) return true;
    const d = this.allocate(kind);
    if (!d) return false;
    d.alive = true;
    d.kind = kind;
    d.stamp = ++this.stamp;
    d.dying = false;
    d.density = kind === "dust" ? DUST_DENSITY0 : 1;
    d.x = x + nx * LIFT;
    d.y = y + ny * LIFT;
    d.z = z + nz * LIFT;
    d.nx = nx;
    d.ny = ny;
    d.nz = nz;
    // tangent basis rotated by a random (or given) angle
    let hx = 0,
      hy = 1,
      hz = 0;
    if (Math.abs(ny) > 0.95) {
      hx = 1;
      hy = 0;
    }
    let tx = hy * nz - hz * ny,
      ty = hz * nx - hx * nz,
      tz = hx * ny - hy * nx;
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    const bx = ny * tz - nz * ty,
      by = nz * tx - nx * tz,
      bz = nx * ty - ny * tx;
    const a = opts?.rotation ?? Math.random() * Math.PI * 2;
    const c = Math.cos(a),
      s = Math.sin(a);
    d.tx = tx * c + bx * s;
    d.ty = ty * c + by * s;
    d.tz = tz * c + bz * s;
    d.bx = bx * c - tx * s;
    d.by = by * c - ty * s;
    d.bz = bz * c - tz * s;
    d.aniso = kind === "puddle" ? 0.75 + Math.random() * 0.25 : 0.85 + Math.random() * 0.3;
    d.ra = r;
    d.rb = r * d.aniso;
    d.cell = look.cells[Math.floor(Math.random() * look.cells.length)];
    let cr = look.color[0],
      cg = look.color[1],
      cb = look.color[2];
    if (opts?.tint !== undefined && Number.isFinite(opts.tint)) {
      const t = opts.tint | 0;
      cr = ((t >> 16) & 255) / 255;
      cg = ((t >> 8) & 255) / 255;
      cb = (t & 255) / 255;
    }
    d.light = this.light(x, y + 0.3 * ny, z);
    const k = look.lit ? d.light : 1;
    d.r = cr * k;
    d.g = cg * k;
    d.b = cb * k;
    d.opacity = look.fadeIn > 0 ? 0 : 1;
    d.fadeRate = look.fadeIn > 0 ? 1 / look.fadeIn : 0;
    d.ripple = 0;
    d.area = Math.PI * r * r;
    d.maxR = kind === "puddle" ? Math.max(r, 1.4) : r;
    this.writeQuad(this.list.indexOf(d));
    this.dirty = true;
    this.mesh.isVisible = true;
    return true;
  }

  /** Overlapping settled dust thickens and spreads the existing patch instead of stacking. */
  private mergeDust(x: number, y: number, z: number, r: number): boolean {
    let best: Decal | null = null;
    let bestD = Infinity;
    for (const d of this.list) {
      if (!d.alive || d.dying || d.kind !== "dust" || d.ny < 0.7 || Math.abs(d.y - y) > 0.05) continue;
      const dist = Math.hypot(d.x - x, d.z - z);
      if (dist < 0.5 * Math.max(r, d.ra) && dist < bestD) {
        best = d;
        bestD = dist;
      }
    }
    if (!best) return false;
    const d = best;
    const ra = Math.max(d.ra, Math.min(MAX_DUST_R, Math.max(r, Math.sqrt(d.ra * d.ra + 0.35 * r * r))));
    d.ra = ra;
    d.rb = ra * d.aniso;
    d.density = Math.min(1, d.density + 0.12);
    d.stamp = ++this.stamp; // freshly disturbed: recycled last
    this.writeQuad(this.list.indexOf(d));
    this.dirty = true;
    return true;
  }

  private findPuddle(x: number, y: number, z: number, r: number): Decal | null {
    let best: Decal | null = null;
    let bestD = Infinity;
    for (const d of this.list) {
      if (!d.alive || d.dying || d.kind !== "puddle" || Math.abs(d.y - y) > 0.08) continue;
      const dist = Math.hypot(d.x - x, d.z - z);
      if (dist < Math.max(d.ra, d.rb) + r * 0.5 + 0.2 && dist < bestD) {
        best = d;
        bestD = dist;
      }
    }
    return best;
  }

  private setPuddleArea(d: Decal, area: number): void {
    d.area = area;
    const r = Math.min(d.maxR, Math.sqrt(area / Math.PI));
    d.ra = r;
    d.rb = r * d.aniso;
    this.geomDirty = true;
    this.writeQuad(this.list.indexOf(d));
  }

  /**
   * Feed water into the puddle at (x, y, z): `litres` of water spread as a ~2.5 mm film.
   * Creates a puddle if none is near. `ripple` (0..1) animates the surface.
   */
  water(x: number, y: number, z: number, litres: number, ripple = 1): void {
    if (!Number.isFinite(x + y + z + litres) || !(litres > 0)) return;
    const dA = (litres * 1e-3) / FILM_THICKNESS;
    const p = this.findPuddle(x, y, z, 0.1);
    if (p) {
      if (Math.max(p.ra, p.rb) < p.maxR) this.setPuddleArea(p, p.area + dA);
      p.ripple = Math.max(p.ripple, Math.min(1, ripple));
      return;
    }
    // No puddle here yet: water gathers at the spot until there is enough for a wet spot
    // (a slow drip takes ~10 s to show; a spray shows at once).
    let w: WetSpot | null = null;
    for (const s of this.wet) {
      if (Math.abs(s.y - y) < 0.08 && (s.x - x) ** 2 + (s.z - z) ** 2 < 0.01) {
        w = s;
        break;
      }
    }
    if (!w) {
      if (this.wet.length >= 16) {
        // forget the spot that has been dry the longest
        let k = 0;
        for (let j = 1; j < this.wet.length; j++) if (this.wet[j].t < this.wet[k].t) k = j;
        this.wet.splice(k, 1);
      }
      w = { x, y, z, litres: 0, t: this.time };
      this.wet.push(w);
    }
    w.litres += litres;
    w.t = this.time;
    if (w.litres < MIN_PUDDLE_LITRES) return;
    this.wet.splice(this.wet.indexOf(w), 1);
    const r0 = Math.max(MIN_PUDDLE_R, Math.sqrt((w.litres * 1e-3) / FILM_THICKNESS / Math.PI));
    if (this.add("puddle", w.x, w.y, w.z, 0, 1, 0, r0 * 2)) {
      const q = this.findPuddle(w.x, w.y, w.z, 0.1);
      if (q) q.ripple = Math.min(1, ripple);
    }
  }

  /** Water waiting at spots without a puddle yet (litres, tests). */
  get pendingWater(): number {
    let l = 0;
    for (const s of this.wet) l += s.litres;
    return l;
  }

  /**
   * Re-check decals around (x, y, z) whose support may have broken or moved (decals created at
   * or before `stamp`):
   *  - horizontal decals (floors, table tops) whose centre lies within `radius` horizontally
   *    (plus their own size) are re-probed with `groundAt`; if the surface under them is gone or
   *    dropped by more than 3 cm they fade out;
   *  - wall/door decals within `surfaceRadius` (3D, plus half their size) of the point are
   *    removed (the surface they sat on broke away).
   * Returns the number of decals removed.
   */
  revalidate(x: number, y: number, z: number, radius: number, surfaceRadius: number, groundAt: (x: number, y: number, z: number) => number, stamp = Infinity): number {
    if (!Number.isFinite(x + y + z)) return 0;
    const R = Number.isFinite(radius) ? Math.max(0, radius) : 0;
    const SR = Number.isFinite(surfaceRadius) ? Math.max(0, surfaceRadius) : 0;
    let n = 0;
    for (let i = 0; i < this.list.length; i++) {
      const d = this.list[i];
      if (!d.alive || d.dying || d.stamp > stamp) continue;
      if (d.ny > 0.7) {
        if (R <= 0 || Math.abs(d.y - y) > R + 3) continue;
        const reach = R + Math.max(d.ra, d.rb);
        if ((d.x - x) ** 2 + (d.z - z) ** 2 > reach * reach) continue;
        let g: number;
        try {
          g = groundAt(d.x, d.y + 0.05, d.z);
        } catch {
          continue;
        }
        if (!Number.isFinite(g)) continue;
        if (g <= NO_SUPPORT || g < d.y - LIFT - 0.03) {
          this.kill(i);
          n++;
        }
      } else if (SR > 0) {
        const reach = SR + 0.5 * Math.max(d.ra, d.rb);
        if ((d.x - x) ** 2 + (d.y - y) ** 2 + (d.z - z) ** 2 <= reach * reach) {
          this.kill(i);
          n++;
        }
      }
    }
    return n;
  }

  /** Fade a decal out (0.25 s) and free its slot. */
  private kill(i: number): void {
    const d = this.list[i];
    if (!d.alive || d.dying) return;
    d.dying = true;
    d.ripple = 0;
  }

  private writeQuad(i: number): void {
    const d = this.list[i];
    const p = this.pos,
      o = i * 12;
    if (!d.alive) {
      p.fill(0, o, o + 12);
      this.col.fill(0, i * 16, i * 16 + 16);
      return;
    }
    const ax = d.tx * d.ra,
      ay = d.ty * d.ra,
      az = d.tz * d.ra;
    const bx = d.bx * d.rb,
      by = d.by * d.rb,
      bz = d.bz * d.rb;
    // corners: (-a-b), (+a-b), (+a+b), (-a+b)
    p[o] = d.x - ax - bx;
    p[o + 1] = d.y - ay - by;
    p[o + 2] = d.z - az - bz;
    p[o + 3] = d.x + ax - bx;
    p[o + 4] = d.y + ay - by;
    p[o + 5] = d.z + az - bz;
    p[o + 6] = d.x + ax + bx;
    p[o + 7] = d.y + ay + by;
    p[o + 8] = d.z + az + bz;
    p[o + 9] = d.x - ax + bx;
    p[o + 10] = d.y - ay + by;
    p[o + 11] = d.z - az + bz;
    // atlas cell (raw upload: image row 0 is v = 0)
    const col = d.cell % GRID,
      row = Math.floor(d.cell / GRID);
    const inset = 1.5 / ATLAS;
    const u0 = col / GRID + inset,
      u1 = (col + 1) / GRID - inset;
    const v0 = (row + 1) / GRID - inset,
      v1 = row / GRID + inset;
    const u = this.uv,
      uo = i * 8;
    u[uo] = u0;
    u[uo + 1] = v0;
    u[uo + 2] = u1;
    u[uo + 3] = v0;
    u[uo + 4] = u1;
    u[uo + 5] = v1;
    u[uo + 6] = u0;
    u[uo + 7] = v1;
    const look = LOOK[d.kind];
    const c = this.col,
      dc = this.dec;
    for (let k = 0; k < 4; k++) {
      const co = i * 16 + k * 4;
      c[co] = d.r;
      c[co + 1] = d.g;
      c[co + 2] = d.b;
      c[co + 3] = d.opacity * d.density;
      dc[co] = look.wet;
      dc[co + 1] = look.darken;
      dc[co + 2] = d.light;
      dc[co + 3] = d.ripple;
    }
  }

  /** Per-frame: fades, ripples, uniforms, throttled uploads. */
  update(dt: number): void {
    if (!(dt >= 0)) dt = 0;
    this.time += dt;
    let anyPuddle = false;
    for (let i = 0; i < this.list.length; i++) {
      const d = this.list[i];
      if (!d.alive) continue;
      let changed = false;
      if (d.dying) {
        d.opacity -= dt * 4;
        if (d.opacity <= 0) {
          d.alive = false;
          d.dying = false;
          this.writeQuad(i);
          this.dirty = true;
          continue;
        }
        this.writeQuad(i);
        this.geomDirty = true;
        continue;
      }
      if (d.opacity < 1 && d.fadeRate > 0) {
        d.opacity = Math.min(1, d.opacity + d.fadeRate * dt);
        changed = true;
      }
      if (d.kind === "puddle") {
        anyPuddle = true;
        if (d.ripple > 0) {
          d.ripple = Math.max(0, d.ripple - dt * 0.7);
          changed = true;
        }
      }
      if (changed) {
        this.writeQuad(i);
        this.geomDirty = true;
      }
    }
    this.uploadTimer -= dt;
    if (this.dirty || (this.geomDirty && this.uploadTimer <= 0)) this.upload();
    if (anyPuddle) this.updateUniforms();
    else this.material.setFloat("time", this.time);
  }

  private upload(): void {
    this.mesh.updateVerticesData(VertexBuffer.PositionKind, this.pos, false, false);
    this.mesh.updateVerticesData(VertexBuffer.UVKind, this.uv, false, false);
    this.mesh.updateVerticesData(VertexBuffer.ColorKind, this.col, false, false);
    this.mesh.updateVerticesData("decal", this.dec, false, false);
    this.dirty = false;
    this.geomDirty = false;
    this.uploadTimer = 0.1;
  }

  // scratch for the 4 strongest lights (no per-frame allocation)
  private readonly bestS = new Float32Array(4);
  private readonly bestL: Array<Light | null> = [null, null, null, null];

  private consider(l: Light, cx: number, cy: number, cz: number): void {
    if (!l.isEnabled() || !(l.intensity > 0)) return;
    const cls = l.getClassName();
    if (cls === "DirectionalLight") {
      if (!this.sun || l.intensity > this.sun.intensity) this.sun = l;
      return;
    }
    if (cls !== "PointLight" && cls !== "SpotLight") return;
    const p = (l as unknown as { getAbsolutePosition(): { x: number; y: number; z: number } }).getAbsolutePosition();
    const s = l.intensity / (1 + (p.x - cx) ** 2 + (p.y - cy) ** 2 + (p.z - cz) ** 2);
    // insertion into the top-4 list
    for (let k = 0; k < 4; k++) {
      if (this.bestL[k] === null || s > this.bestS[k]) {
        for (let j = 3; j > k; j--) {
          this.bestS[j] = this.bestS[j - 1];
          this.bestL[j] = this.bestL[j - 1];
        }
        this.bestS[k] = s;
        this.bestL[k] = l;
        return;
      }
    }
  }
  private sun: Light | null = null;

  /** Reflection/specular inputs for puddles: sun + the 4 strongest point/spot lights near the camera. */
  private updateUniforms(): void {
    const mat = this.material;
    mat.setFloat("time", this.time);
    const ip = this.scene.imageProcessingConfiguration;
    mat.setFloat("gammaOut", ip && ip.isEnabled && !ip.applyByPostProcess ? 1 / 2.2 : 1);
    const cam = this.scene.activeCamera;
    const cx = cam?.globalPosition.x ?? 0,
      cy = cam?.globalPosition.y ?? 1.6,
      cz = cam?.globalPosition.z ?? 0;
    this.sun = null;
    for (let k = 0; k < 4; k++) {
      this.bestL[k] = null;
      this.bestS[k] = 0;
    }
    for (const l of this.scene.lights) {
      const kids = (l as unknown as { lights?: Light[] }).lights;
      if (Array.isArray(kids)) for (const c of kids) this.consider(c, cx, cy, cz);
      else this.consider(l, cx, cy, cz);
    }
    for (let k = 0; k < 4; k++) {
      const l = this.bestL[k];
      if (!l) {
        for (let j = 0; j < 3; j++) this.lightPos[k * 3 + j] = this.lightCol[k * 3 + j] = 0;
        continue;
      }
      const p = (l as unknown as { getAbsolutePosition(): { x: number; y: number; z: number } }).getAbsolutePosition();
      const I = Math.min(4, l.intensity);
      this.lightPos[k * 3] = p.x;
      this.lightPos[k * 3 + 1] = p.y;
      this.lightPos[k * 3 + 2] = p.z;
      this.lightCol[k * 3] = l.diffuse.r * I;
      this.lightCol[k * 3 + 1] = l.diffuse.g * I;
      this.lightCol[k * 3 + 2] = l.diffuse.b * I;
    }
    const s = this.sun as Light | null; // set by consider() (TS cannot see through the call)
    if (s) {
      const d = (s as unknown as { direction: { x: number; y: number; z: number } }).direction;
      const l = Math.hypot(d.x, d.y, d.z) || 1;
      this.sunDir.set(d.x / l, d.y / l, d.z / l);
      const I = Math.min(2, s.intensity) * 0.15; // mostly occluded indoors
      this.sunColor.set(s.diffuse.r * I, s.diffuse.g * I, s.diffuse.b * I);
    } else this.sunColor.set(0, 0, 0);
    // ambient reflection: scene clear colour as a stand-in for the room/sky
    const cc = this.scene.clearColor;
    this.envColor.set(0.35 + cc.r * 0.4, 0.36 + cc.g * 0.4, 0.38 + cc.b * 0.4);
  }

  clear(): void {
    for (let i = 0; i < this.list.length; i++) {
      this.list[i].alive = false;
      this.list[i].dying = false;
      this.writeQuad(i);
    }
    this.wet.length = 0;
    this.dirty = true;
    this.mesh.isVisible = false;
  }

  dispose(): void {
    this.mesh.dispose();
    this.material.dispose();
    this.atlas.dispose();
  }
}
