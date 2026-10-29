// PS2-style fake volumetric light: an additive shaft volume for every sunlit exterior
// opening (window / sliding door in plan.ts), extruded from the opening's effective
// aperture along the sun direction and clipped to the room (env/shaftGeom.ts), plus dust
// motes drifting in the sunlit volumes.
//
// Each shaft is rendered with an analytic in-scattering shader: the fragment of the
// volume's front faces intersects the view ray with the parallelepiped ∩ room box, so the
// glow is proportional to the path length through the beam (soft at the edges, strongest
// when looking along the beam), fades with distance from the window, uses a forward-
// scattering phase (brighter when looking towards the sun) and drifting dust noise.
// When the camera stands inside a beam the volume is drawn from its back faces instead.
//
// Occlusion: the volumes are static, but every integration sample is also tested against
// the sun's (PCF depth) shadow map, so blinds, curtains, furniture against the glass and the
// tower outside cut the beam exactly where they cut the sunlit floor patch. The visibility
// taps are jittered per pixel along the ray (interleaved gradient noise) so slatted blinds
// read as soft striations instead of view-dependent bands; the film grain hides the dither.
// Cost: ~5 small meshes (6 beam + 6 shadow taps per covered pixel) + one ~250-particle
// CPU system.

import {
  Color4,
  CustomParticleEmitter,
  Mesh,
  ParticleSystem,
  RawTexture,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3,
  Vector4,
  VertexData,
  Constants,
  type Scene,
} from "@babylonjs/core";
import type { IAtmosphere, ILighting } from "./contracts.ts";
import { computeShafts, insideShaft, type ShaftVolume } from "./env/shaftGeom.ts";
import { Rng } from "../core/rng.ts";

const SHAFT_VERTEX = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
varying vec3 vWorld;
void main(void) {
  vec4 w = world * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = viewProjection * w;
}
`;

const SHAFT_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vWorld;
uniform vec3 cameraPosition;
uniform vec4 uRow0;
uniform vec4 uRow1;
uniform vec4 uRow2;
uniform vec3 uClipMin;
uniform vec3 uClipMax;
uniform vec3 uLens;
uniform vec3 uColor;
uniform vec3 uLightDir;
uniform vec2 uPanes;
uniform float uDensity;
uniform float uTime;
#ifdef SUN_SHADOW
uniform highp sampler2DShadow sunShadowMap;
uniform mat4 uSunMatrix;
uniform float uOccluderDepth;
// Sun visibility (0 = occluded) of a world point: hardware 2x2 PCF compare against the sun
// shadow map; points outside the map's frustum count as lit.
float sunVis(vec3 p) {
  vec4 c = uSunMatrix * vec4(p, 1.0);
  vec3 n = c.xyz / c.w;
#ifdef NDC_HALF_Z
  vec3 q = vec3(0.5 * n.xy + 0.5, n.z);
#else
  vec3 q = 0.5 * n + 0.5;
#endif
  if (q.x <= 0.0 || q.x >= 1.0 || q.y <= 0.0 || q.y >= 1.0 || q.z <= 0.0 || q.z >= 1.0) return 1.0;
  return texture(sunShadowMap, q);
}
#endif

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
vec3 safeInv(vec3 d) {
  return vec3(abs(d.x) > 1e-7 ? 1.0 / d.x : 1e7, abs(d.y) > 1e-7 ? 1.0 / d.y : 1e7, abs(d.z) > 1e-7 ? 1.0 / d.z : 1e7);
}

// Light carried by the beam at shaft coordinates s (u across the opening, v up, w along the
// light): soft aperture edges, the shadows of the mullions between panes, fading with the
// distance from the window, and dust streaks drifting along the beam.
float beam(vec3 s) {
  vec2 e = min(s.xy, 1.0 - s.xy) * uLens.xy;
  float m = smoothstep(0.0, 0.12, e.x) * smoothstep(0.0, 0.12, e.y);
  if (uPanes.x > 1.5) {
    float k = s.x * uPanes.x;
    float bar = abs(k - floor(k + 0.5)) * uLens.x / uPanes.x; // metres to the nearest pane joint
    float inner = step(0.5, k) * step(k, uPanes.x - 0.5);
    m *= 1.0 - inner * (1.0 - smoothstep(uPanes.y * 0.5, uPanes.y * 0.5 + 0.05, bar));
  }
  float w = s.z * uLens.z;
  m *= exp(-w * 0.28) * smoothstep(0.0, 0.25, w);
  vec2 q = s.xy * uLens.xy * 2.6;
  return m * (0.72 + 0.4 * vnoise(q + vec2(uTime * 0.06, -uTime * 0.035)) + 0.18 * vnoise(q * 3.1 - vec2(uTime * 0.11, 0.0)));
}

void main(void) {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorld - ro);
  // Ray in shaft space (affine map, so t stays in world metres).
  vec3 o = vec3(dot(uRow0.xyz, ro) + uRow0.w, dot(uRow1.xyz, ro) + uRow1.w, dot(uRow2.xyz, ro) + uRow2.w);
  vec3 d = vec3(dot(uRow0.xyz, rd), dot(uRow1.xyz, rd), dot(uRow2.xyz, rd));
  vec3 inv = safeInv(d);
  vec3 a = (vec3(0.0) - o) * inv;
  vec3 b = (vec3(1.0) - o) * inv;
  vec3 lo = min(a, b);
  vec3 hi = max(a, b);
  float tn = max(max(lo.x, lo.y), lo.z);
  float tf = min(min(hi.x, hi.y), hi.z);
  // Room clip box.
  vec3 invW = safeInv(rd);
  vec3 c0 = (uClipMin - ro) * invW;
  vec3 c1 = (uClipMax - ro) * invW;
  vec3 clo = min(c0, c1);
  vec3 chi = max(c0, c1);
  tn = max(tn, max(max(clo.x, clo.y), clo.z));
  tf = min(tf, min(min(chi.x, chi.y), chi.z));
  tn = max(tn, 0.0);
  float thick = tf - tn;
  if (thick <= 1e-4) discard;
  // Integrate the beam along the ray segment (6 midpoint samples), each attenuated by the
  // sun's visibility at a per-pixel jittered point of its sub-segment.
  float acc = 0.0;
#ifdef SUN_SHADOW
  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
#endif
  for (int i = 0; i < 6; i++) {
    float t = tn + thick * (float(i) + 0.5) / 6.0;
    float bm = beam(o + d * t);
#ifdef SUN_SHADOW
    if (bm > 0.0) {
      // Points in the first uOccluderDepth metres behind the aperture are tested at that
      // depth along their light line: the thin lit sliver between the glass and a drawn
      // curtain / blind is hidden behind it from inside the room, so a line blocked right at
      // the window is dark over its whole length.
      float tj = tn + thick * (float(i) + jit) / 6.0;
      float wj = (o.z + d.z * tj) * uLens.z;
      bm *= sunVis(ro + rd * tj + uLightDir * max(uOccluderDepth - wj, 0.0));
    }
#endif
    acc += bm;
  }
  acc /= 6.0;
  // Henyey-Greenstein (g = 0.45) normalised to 1 looking straight into the light, with an
  // isotropic floor so beams stay readable from the side.
  float ct = dot(uLightDir, -rd);
  const float g = 0.45;
  float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * ct, 1.5) * ((1.0 - g) * (1.0 - g) * (1.0 - g)) / (1.0 - g * g);
  float phase = 0.3 + 0.7 * hg;
  // Optical-depth saturation: long looks down a beam glow but never blow out.
  float od = uDensity * thick * acc * phase;
  vec3 col = uColor * (0.5 * (1.0 - exp(-od / 0.5)));
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface AtmosphereTuning {
  /** Scattering density (1/m) of the shafts. */
  density: number;
  /** Base number of dust motes at particle quality 1. */
  motes: number;
  /** Clear apertures wider than this (m) get a central mullion shadow in their beam. */
  mullionMinWidth: number;
  /** Width (m) of that mullion / meeting stile. */
  mullionWidth: number;
  /**
   * Distance (m, along the wall normal) in front of the opening within which an occluder
   * (blind, curtain, furniture against the glass) darkens its whole light line, including
   * the sliver between it and the glass.
   */
  occluderDepth: number;
}

export const DEFAULT_ATMOSPHERE: AtmosphereTuning = { density: 0.45, motes: 260, mullionMinWidth: 1.3, mullionWidth: 0.06, occluderDepth: 0.3 };

interface ShaftRender {
  vol: ShaftVolume;
  mesh: Mesh;
  mat: ShaderMaterial;
  inside: boolean;
}

export class Atmosphere implements IAtmosphere {
  readonly tuning: AtmosphereTuning;
  shafts: ShaftVolume[] = [];
  private readonly scene: Scene;
  private readonly lighting: ILighting;
  private readonly renders: ShaftRender[] = [];
  private motes: ParticleSystem | null = null;
  private moteTexture: RawTexture | null = null;
  private enabled = true;
  private time = 0;
  private built = false;

  constructor(scene: Scene, lighting: ILighting, tuning: Partial<AtmosphereTuning> = {}) {
    this.scene = scene;
    this.lighting = lighting;
    this.tuning = { ...DEFAULT_ATMOSPHERE, ...tuning };
  }

  build(): void {
    if (this.built) return;
    this.built = true;
    const sun = this.lighting.sun;
    const L = sun.direction.clone().normalize();
    this.shafts = computeShafts({ x: L.x, y: L.y, z: L.z });
    const color = new Vector3(sun.diffuse.r * sun.intensity, sun.diffuse.g * sun.intensity, sun.diffuse.b * sun.intensity);
    for (const vol of this.shafts) {
      const mesh = new Mesh(`shaft_${vol.id}`, this.scene);
      const vd = new VertexData();
      vd.positions = vol.positions;
      vd.indices = vol.indices;
      vd.applyToMesh(mesh, false);
      mesh.isPickable = false;
      mesh.freezeWorldMatrix();
      const mat = this.makeMaterial(vol, color, L);
      mesh.material = mat;
      this.renders.push({ vol, mesh, mat, inside: false });
    }
    this.buildMotes(color);
    const q = (this.lighting as ILighting & { quality?: { lightShafts: boolean } }).quality;
    this.setEnabled(q ? q.lightShafts : true);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    for (const r of this.renders) r.mesh.setEnabled(on);
    if (this.motes) {
      if (on) {
        if (!this.motes.isStarted()) this.motes.start();
      } else {
        this.motes.stop();
        this.motes.reset();
      }
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  update(dt: number): void {
    if (!this.enabled || this.renders.length === 0) return;
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
    this.time = (this.time + step) % 10000;
    const cam = this.scene.activeCamera;
    const cp = cam ? cam.globalPosition : null;
    for (const r of this.renders) {
      r.mat.setFloat("uTime", this.time);
      const inside = cp ? insideShaft(r.vol, cp, (cam?.minZ ?? 0.03) + 0.02) : false;
      if (inside !== r.inside) {
        // Culling is render state only (no shader variant): inside the beam draw the far faces.
        r.inside = inside;
        r.mat.cullBackFaces = !inside;
      }
    }
  }

  dispose(): void {
    for (const r of this.renders) {
      r.mesh.dispose();
      r.mat.dispose();
    }
    this.renders.length = 0;
    this.motes?.dispose();
    this.moteTexture?.dispose();
    this.motes = null;
  }

  // ------------------------------------------------------------------ internals

  /**
   * The sun shadow map can be sampled when it is a PCF depth texture (comparison sampler) on
   * WebGL2; otherwise the shafts fall back to their unoccluded analytic volume.
   */
  private sunShadowUsable(): boolean {
    const engine = this.scene.getEngine();
    const gen = this.lighting.sunShadows;
    const map = gen?.getShadowMapForRendering();
    return engine.version >= 2 && engine.name !== "WebGPU" && !!gen && gen.usePercentageCloserFiltering && !!map?.depthStencilTexture;
  }

  private makeMaterial(vol: ShaftVolume, color: Vector3, L: Vector3): ShaderMaterial {
    const occlude = this.sunShadowUsable();
    const defines: string[] = [];
    if (occlude) defines.push("#define SUN_SHADOW");
    if (occlude && this.scene.getEngine().isNDCHalfZRange) defines.push("#define NDC_HALF_Z");
    const m = new ShaderMaterial(
      `shaftMat_${vol.id}`,
      this.scene,
      { vertexSource: SHAFT_VERTEX, fragmentSource: SHAFT_FRAGMENT },
      {
        attributes: ["position"],
        uniforms: ["world", "viewProjection", "cameraPosition", "uRow0", "uRow1", "uRow2", "uClipMin", "uClipMax", "uLens", "uColor", "uLightDir", "uPanes", "uDensity", "uTime", "uSunMatrix", "uOccluderDepth"],
        samplers: occlude ? ["sunShadowMap"] : [],
        defines,
        needAlphaBlending: true,
      },
    );
    if (occlude) {
      // The generator is looked up per bind: Lighting recreates it when the map size changes.
      m.onBindObservable.add(() => {
        const effect = m.getEffect();
        const gen = this.lighting.sunShadows;
        const map = gen?.getShadowMapForRendering();
        if (!effect || !gen || !map?.depthStencilTexture) return;
        effect.setMatrix("uSunMatrix", gen.getTransformMatrix());
        effect.setDepthStencilTexture("sunShadowMap", map);
      });
    }
    m.alphaMode = Constants.ALPHA_ADD;
    m.disableDepthWrite = true;
    m.backFaceCulling = true;
    m.cullBackFaces = true;
    const [r0, r1, r2] = vol.invRows;
    m.setVector4("uRow0", new Vector4(r0[0], r0[1], r0[2], r0[3]));
    m.setVector4("uRow1", new Vector4(r1[0], r1[1], r1[2], r1[3]));
    m.setVector4("uRow2", new Vector4(r2[0], r2[1], r2[2], r2[3]));
    m.setVector3("uClipMin", new Vector3(vol.clipMin.x, vol.clipMin.y, vol.clipMin.z));
    m.setVector3("uClipMax", new Vector3(vol.clipMax.x, vol.clipMax.y, vol.clipMax.z));
    const len = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);
    m.setVector3("uLens", new Vector3(len(vol.U), len(vol.V), len(vol.D)));
    m.setVector3("uColor", color);
    m.setVector3("uLightDir", L);
    // Wide openings are glazed in two panes (sliding door meeting stiles, window mullion):
    // their frame members split the beam.
    const width = len(vol.U);
    m.setVector2("uPanes", new Vector2(width > this.tuning.mullionMinWidth ? 2 : 1, this.tuning.mullionWidth));
    m.setFloat("uDensity", this.tuning.density);
    // Normal distance → distance along the light (grazing sun: much longer), capped.
    const n = Vector3.Cross(new Vector3(vol.U.x, vol.U.y, vol.U.z), new Vector3(vol.V.x, vol.V.y, vol.V.z)).normalize();
    const cosI = Math.max(0.25, Math.abs(Vector3.Dot(n, L)));
    m.setFloat("uOccluderDepth", Math.min(1.2, this.tuning.occluderDepth / cosI));
    m.setFloat("uTime", 0);
    return m;
  }

  private buildMotes(color: Vector3): void {
    if (this.shafts.length === 0) return;
    const q = (this.lighting as ILighting & { quality?: { particles: number } }).quality;
    const count = Math.max(40, Math.round(this.tuning.motes * (q?.particles ?? 1)));
    // Soft round sprite.
    const N = 32;
    const px = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const dx = (x + 0.5) / N - 0.5;
        const dy = (y + 0.5) / N - 0.5;
        const r = Math.sqrt(dx * dx + dy * dy) * 2;
        const a = Math.max(0, 1 - r);
        const v = Math.round(255 * a * a * (3 - 2 * a));
        const i = (y * N + x) * 4;
        px[i] = px[i + 1] = px[i + 2] = 255;
        px[i + 3] = v;
      }
    }
    this.moteTexture = RawTexture.CreateRGBATexture(px, N, N, this.scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
    const ps = new ParticleSystem("dustMotes", count, this.scene);
    ps.particleTexture = this.moteTexture;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.emitter = Vector3.Zero();
    const rng = new Rng(0xd057);
    const shafts = this.shafts;
    const total = shafts.reduce((s, v) => s + v.volume, 0) || 1;
    const emitter = new CustomParticleEmitter();
    const tmp = { x: 0, y: 0, z: 0 };
    emitter.particlePositionGenerator = (_i, _p, out) => {
      // Pick a shaft by volume, then rejection-sample the clipped parallelepiped.
      let pick = rng.next() * total;
      let vol = shafts[0];
      for (const v of shafts) {
        pick -= v.volume;
        if (pick <= 0) {
          vol = v;
          break;
        }
      }
      for (let k = 0; k < 24; k++) {
        const u = rng.range(0.06, 0.94);
        const w = rng.range(0.05, 0.95);
        const t = rng.next();
        tmp.x = vol.origin.x + vol.U.x * u + vol.V.x * w + vol.D.x * t;
        tmp.y = vol.origin.y + vol.U.y * u + vol.V.y * w + vol.D.y * t;
        tmp.z = vol.origin.z + vol.U.z * u + vol.V.z * w + vol.D.z * t;
        if (tmp.x >= vol.clipMin.x && tmp.x <= vol.clipMax.x && tmp.y >= vol.clipMin.y && tmp.y <= vol.clipMax.y && tmp.z >= vol.clipMin.z && tmp.z <= vol.clipMax.z) break;
      }
      out.set(tmp.x, tmp.y, tmp.z);
    };
    emitter.particleDirectionGenerator = (_i, _p, out) => {
      out.set(rng.range(-1, 1), rng.range(-0.4, 0.6), rng.range(-1, 1));
    };
    ps.particleEmitterType = emitter;
    ps.minSize = 0.0035;
    ps.maxSize = 0.009;
    ps.minLifeTime = 5;
    ps.maxLifeTime = 11;
    ps.emitRate = count / 8;
    ps.minEmitPower = 0.004;
    ps.maxEmitPower = 0.02;
    ps.gravity = new Vector3(0, -0.0015, 0);
    ps.minAngularSpeed = -0.5;
    ps.maxAngularSpeed = 0.5;
    const k = 0.55;
    const c = new Color4(color.x * k, color.y * k, color.z * k, 1);
    ps.addColorGradient(0, new Color4(c.r, c.g, c.b, 0));
    ps.addColorGradient(0.2, c);
    ps.addColorGradient(0.8, c);
    ps.addColorGradient(1, new Color4(c.r, c.g, c.b, 0));
    ps.updateSpeed = 1 / 60;
    ps.preWarmCycles = 300;
    ps.preWarmStepOffset = 4;
    ps.isLocal = false;
    this.motes = ps;
    ps.start();
  }
}
