// The world outside the windows at golden hour: sky dome + sun disc + clouds (sky.ts), a
// low-poly city of ~1,100 buildings in a 60–900 m ring with procedural window facades
// (sunlit upper floors glowing, streets in shadow, some windows lit), our own tower around
// the apartment (slab bands, balconies, neighbours' windows — receives/casts real sun
// shadows near the apartment), the street grid ~93 m below with cars, streetlights and
// trees, and distance haze that fades into the horizon colour. Few draw calls: the city is
// three merged meshes with one shader; the tower is four meshes.

import {
  Color3,
  Mesh,
  PBRMaterial,
  RawTexture,
  ShaderMaterial,
  Texture,
  Vector3,
  VertexData,
  type Scene,
} from "@babylonjs/core";
import type { IExterior, ILighting } from "./contracts.ts";
import { Sky, SKY_GLSL, SKY_UNIFORMS, NOISE_GLSL, bindSky, type SkyParams } from "./sky.ts";
import { generateCity, GROUND_Y, type CityLayout } from "./env/cityLayout.ts";
import { buildCityGeometry } from "./env/cityGeometry.ts";
import { buildTowerGeometry } from "./env/towerLayout.ts";
import type { BuiltGeometry, MeshBuffer } from "./env/meshBuffer.ts";
import { Rng } from "../core/rng.ts";

const CITY_VERTEX = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
attribute vec4 color;
attribute vec4 data;
uniform mat4 world;
uniform mat4 viewProjection;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUV;
varying vec4 vColor;
varying vec4 vData;
void main(void) {
  vec4 w = world * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = mat3(world) * normal;
  vUV = uv;
  vColor = color;
  vData = data;
  gl_Position = viewProjection * w;
}
`;

const CITY_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUV;
varying vec4 vColor;
varying vec4 vData;
uniform vec3 cameraPosition;
uniform vec3 uSunLight;
uniform vec3 uSkyUp;
uniform vec3 uSkyDown;
uniform float uGroundY;
uniform float uHazeDensity;
${SKY_GLSL}
${NOISE_GLSL}

// Box-filtered coverage of [a, b] around f with filter width w (antialiased stripes).
float cover(float f, float a, float b, float w) {
  w = max(w, 1e-4);
  return clamp((min(f + 0.5 * w, b) - max(f - 0.5 * w, a)) / w, 0.0, 1.0);
}

vec3 lightAt(vec3 N, float sunVis) {
  float ndl = max(dot(N, uSunDir), 0.0);
  return uSunLight * ndl * sunVis + mix(uSkyDown, uSkyUp, 0.5 + 0.5 * N.y);
}

vec3 haze(vec3 col, float strength) {
  vec3 v = vWorld - cameraPosition;
  float dist = length(v);
  vec3 d = v / max(dist, 1e-3);
  float hAbove = max(vWorld.y - uGroundY, 0.0);
  float dens = uHazeDensity * mix(1.3, 0.45, clamp(hAbove / 220.0, 0.0, 1.0));
  float f = (1.0 - exp(-dist * dens)) * strength;
  return mix(col, hazeColor(d), f);
}

void main(void) {
  int kind = int(vData.x + 0.5);
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vWorld - cameraPosition);
  float hAbove = vWorld.y - uGroundY;
  float seed = vData.y;
  // The low sun only reaches facades above the surrounding roofline.
  float shadowLine = 16.0 + fract(seed * 7.13) * 52.0;
  float sunVis = smoothstep(shadowLine - 8.0, shadowLine + 10.0, hAbove);
  float canyon = mix(0.55, 1.0, smoothstep(0.0, 45.0, hAbove));
  vec3 albedo = vColor.rgb;
  vec3 col;
  float hazeK = 1.0;
  if (kind == 0) {
    // ---------------- facade with procedural windows
    float style = vData.z;
    vec2 cell;
    vec4 win;
    if (style < 0.5) { cell = vec2(1.5, 3.7); win = vec4(0.07, 0.14, 0.93, 0.93); }
    else if (style < 1.5) { cell = vec2(2.7, 3.25); win = vec4(0.22, 0.27, 0.78, 0.85); }
    else if (style < 2.5) { cell = vec2(2.3, 3.1); win = vec4(0.25, 0.3, 0.75, 0.82); }
    else { cell = vec2(3.6, 3.4); win = vec4(0.0, 0.3, 1.0, 0.78); }
    vec2 g = vUV / cell;
    vec2 id = floor(g);
    vec2 f = fract(g);
    vec2 fw = fwidth(g);
    float lod = smoothstep(0.3, 0.85, max(fw.x, fw.y));
    float isWin = cover(f.x, win.x, win.z, fw.x) * cover(f.y, win.y, win.w, fw.y);
    float avgWin = (win.z - win.x) * (win.w - win.y);
    isWin = mix(isWin, avgWin, lod);
    float r = hash12(id + seed * 113.0);
    // Golden hour: only a few rooms have their lights on yet.
    float litFrac = vData.w * 0.45;
    float lit = mix(step(r, litFrac), litFrac * 0.85, lod);
    vec3 R = reflect(V, N);
    R.y = abs(R.y) * 0.85 + 0.03;
    float fres = 0.07 + 0.93 * pow(1.0 - clamp(dot(-V, N), 0.0, 1.0), 5.0);
    vec3 refl = skyRadiance(normalize(R));
    vec3 interior = mix(vec3(0.018, 0.02, 0.024), vec3(0.05, 0.042, 0.034), hash12(id + 7.0));
    float warm = step(hash12(id + 3.0), 0.78);
    vec3 litCol = mix(vec3(0.7, 0.82, 1.0), vec3(1.0, 0.7, 0.4), warm) * (0.6 + 1.0 * hash12(id + 5.0));
    float reflK = style < 0.5 ? 1.0 : 0.65;
    vec3 glass = interior * (1.0 - fres) + refl * fres * reflK + litCol * lit * (1.0 - 0.6 * fres);
    // Sunlit glass glints gold (specular of the low sun).
    float spec = pow(max(dot(normalize(uSunDir - V), N), 0.0), 220.0) * sunVis;
    glass += uSunLight * spec * 0.35 * reflK;
    float panel = 0.86 + 0.28 * hash12(floor(vUV / vec2(cell.x * 3.0, cell.y)) + seed * 7.0);
    vec3 wall = albedo * panel * lightAt(N, sunVis) * canyon;
    col = mix(wall, glass, isWin);
    // Shopfronts at street level.
    if (hAbove < 4.5) col = mix(col, glass * 1.4 + litCol * 0.15, smoothstep(4.5, 3.5, hAbove) * 0.7);
  } else if (kind == 1) {
    float n = 0.8 + 0.35 * vnoise(vWorld.xz * 0.35 + seed * 31.0);
    col = albedo * n * lightAt(N, max(sunVis, 0.85));
  } else if (kind == 2 || kind == 12 || kind == 10) {
    // ---------------- asphalt (+ lane markings / zebra / parking bays)
    float n = 0.85 + 0.3 * vnoise(vWorld.xz * 0.6);
    col = albedo * n;
    vec3 paint = vec3(0.55, 0.55, 0.52);
    float paintMask = 0.0;
    float fade = 1.0 - smoothstep(0.25, 0.7, length(fwidth(vUV)));
    if (kind == 2 && vData.z > 0.0) {
      float halfW = vData.z;
      float lanes = max(vData.w, 1.0);
      float v = vUV.y;
      float av = abs(v);
      float fv = fwidth(v);
      float yellow = cover(av, 0.08, 0.2, fv);
      float laneW = halfW / lanes;
      float lv = av / laneW;
      float k = floor(lv + 0.5);
      float nearLine = (k >= 1.0 && k < lanes) ? cover(abs(lv - k) * laneW, 0.0, 0.075, fv) : 0.0;
      float dash = step(fract(vUV.x / 9.0), 0.42);
      float edge = cover(av, halfW - 0.45, halfW - 0.32, fv);
      col = mix(col, vec3(0.5, 0.36, 0.05), yellow * fade);
      paintMask = nearLine * dash + edge;
    } else if (kind == 12) {
      paintMask = cover(fract(vUV.y / 1.2), 0.0, 0.55, fwidth(vUV.y / 1.2));
    } else if (kind == 10) {
      paintMask = cover(fract(vWorld.x / 2.6), 0.0, 0.05, fwidth(vWorld.x / 2.6)) * step(0.5, fract(vWorld.z / 12.0));
    }
    col = mix(col, paint, clamp(paintMask, 0.0, 1.0) * fade);
    col *= lightAt(N, sunVis * 0.6) * canyon;
  } else if (kind == 3) {
    vec2 tile = floor(vWorld.xz / 1.2);
    float n = 0.82 + 0.3 * hash12(tile) + 0.12 * vnoise(vWorld.xz * 2.0);
    col = albedo * n * lightAt(N, sunVis * 0.6) * canyon;
  } else if (kind == 4) {
    float n = 0.7 + 0.6 * fbm4(vWorld.xz * 0.08);
    col = albedo * n * lightAt(N, sunVis * 0.7) * canyon;
  } else if (kind == 5 || kind == 9) {
    vec3 R = reflect(V, N);
    R.y = abs(R.y) * 0.8 + 0.05;
    float fres = 0.05 + 0.95 * pow(1.0 - clamp(dot(-V, N), 0.0, 1.0), 5.0);
    vec3 base = albedo * lightAt(N, sunVis * 0.5) * canyon;
    col = base * (1.0 - fres) + skyRadiance(normalize(R)) * fres * (kind == 9 ? 0.8 : 0.45);
  } else if (kind == 6) {
    col = albedo * seed;
    hazeK = 0.6;
  } else if (kind == 7) {
    float n = 0.7 + 0.6 * vnoise(vWorld.xz * 0.9 + vWorld.y * 0.7);
    col = albedo * n * lightAt(N, sunVis * 0.8) * canyon;
  } else {
    col = albedo * lightAt(N, sunVis) * canyon;
  }
  gl_FragColor = vec4(haze(col, hazeK), 1.0);
}
`;

const GLASS_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUV;
varying vec4 vColor;
varying vec4 vData;
uniform vec3 cameraPosition;
uniform vec3 uSunLight;
uniform float uGroundY;
uniform float uHazeDensity;
${SKY_GLSL}
${NOISE_GLSL}
void main(void) {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vWorld - cameraPosition);
  if (dot(N, V) > 0.0) N = -N;
  float fres = 0.06 + 0.94 * pow(1.0 - clamp(dot(-V, N), 0.0, 1.0), 5.0);
  vec3 R = reflect(V, N);
  R.y = abs(R.y) * 0.85 + 0.03;
  vec3 refl = skyRadiance(normalize(R));
  float spec = pow(max(dot(normalize(uSunDir - V), N), 0.0), 400.0);
  vec4 outc;
  if (vData.x < 1.5) {
    // Neighbours' windows: curtains, lit rooms or dark interiors behind reflective glass.
    float s = vData.y;
    float y = vUV.y;
    vec3 inside;
    if (s < 0.2) inside = vec3(1.0, 0.68, 0.4) * (0.55 + 0.5 * smoothstep(0.0, 2.0, y));
    else if (s < 0.55) {
      vec3 cur = mix(vec3(0.55, 0.5, 0.42), vec3(0.32, 0.38, 0.46), step(0.38, s));
      float folds = 0.8 + 0.2 * sin(vUV.x * 26.0 + s * 40.0);
      inside = cur * folds * (0.12 + 0.25 * max(dot(-N, -uSunDir), 0.0));
    } else inside = vec3(0.015, 0.016, 0.02) + vec3(0.02, 0.016, 0.012) * smoothstep(0.0, 2.0, y);
    vec3 col = inside * (1.0 - fres) + refl * fres * 0.9 + uSunLight * spec * 0.4;
    outc = vec4(col, 1.0);
  } else {
    // Balcony railing glass: mostly see-through with fresnel reflections.
    vec3 col = refl * fres + vec3(0.02, 0.035, 0.03);
    outc = vec4(col + uSunLight * spec * 0.3, clamp(0.12 + 0.75 * fres, 0.0, 0.9));
  }
  vec3 v = vWorld - cameraPosition;
  float dist = length(v);
  float f = 1.0 - exp(-dist * uHazeDensity * 0.8);
  outc.rgb = mix(outc.rgb, hazeColor(v / max(dist, 1e-3)), f);
  gl_FragColor = outc;
}
`;

const CORRIDOR_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUV;
varying vec4 vColor;
varying vec4 vData;
uniform float uLevel;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(void) {
  float n = 0.92 + 0.08 * hash12(floor(vUV * 9.0));
  gl_FragColor = vec4(vColor.rgb * n * uLevel, 1.0);
}
`;

export interface ExteriorTuning {
  /** Haze extinction (1/m) at street level. */
  hazeDensity: number;
  seed: number;
}

export const DEFAULT_EXTERIOR: ExteriorTuning = { hazeDensity: 1 / 1150, seed: 0x5eed1e55 };

function meshFrom(name: string, g: BuiltGeometry, scene: Scene): Mesh {
  const m = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = g.positions;
  vd.normals = g.normals;
  vd.uvs = g.uvs;
  vd.colors = g.colors;
  vd.indices = g.indices;
  vd.applyToMesh(m, false);
  m.setVerticesData("data", g.data, false, 4);
  m.hasVertexAlpha = false;
  m.isPickable = false;
  m.freezeWorldMatrix();
  m.doNotSyncBoundingInfo = true;
  return m;
}

/** Procedural concrete albedo (sRGB bytes), tiles seamlessly. */
function concreteTexture(scene: Scene): RawTexture {
  const N = 128;
  const data = new Uint8Array(N * N * 4);
  const rng = new Rng(0xc0ffee);
  const grid = 16;
  const lattice = new Float32Array(grid * grid);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next();
  const val = (x: number, y: number) => {
    const fx = (x / N) * grid;
    const fy = (y / N) * grid;
    const x0 = Math.floor(fx) % grid;
    const y0 = Math.floor(fy) % grid;
    const x1 = (x0 + 1) % grid;
    const y1 = (y0 + 1) % grid;
    const tx = fx - Math.floor(fx);
    const ty = fy - Math.floor(fy);
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = lattice[y0 * grid + x0] * (1 - sx) + lattice[y0 * grid + x1] * sx;
    const b = lattice[y1 * grid + x0] * (1 - sx) + lattice[y1 * grid + x1] * sx;
    return a * (1 - sy) + b * sy;
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const v = 0.82 + 0.12 * val(x, y) + 0.06 * (rng.next() - 0.5);
      const c = Math.max(0, Math.min(255, Math.round(v * 235)));
      const i = (y * N + x) * 4;
      data[i] = c;
      data[i + 1] = c;
      data[i + 2] = Math.max(0, c - 4);
      data[i + 3] = 255;
    }
  }
  const tex = RawTexture.CreateRGBATexture(data, N, N, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 4;
  tex.uScale = 0.5;
  tex.vScale = 0.5;
  return tex;
}

export class Exterior implements IExterior {
  readonly sky: Sky;
  readonly tuning: ExteriorTuning;
  layout: CityLayout | null = null;
  readonly meshes: Mesh[] = [];
  cityMaterial: ShaderMaterial | null = null;
  glassMaterial: ShaderMaterial | null = null;
  railMaterial: ShaderMaterial | null = null;
  towerMaterial: PBRMaterial | null = null;
  /** Tower facade near the apartment (casts sun shadows into it). */
  towerNear: Mesh | null = null;

  private readonly scene: Scene;
  private readonly lighting: ILighting;
  private built = false;

  constructor(scene: Scene, lighting: ILighting, sky?: Partial<SkyParams>, tuning: Partial<ExteriorTuning> = {}) {
    this.scene = scene;
    this.lighting = lighting;
    this.tuning = { ...DEFAULT_EXTERIOR, ...tuning };
    this.sky = new Sky(scene, sky, this.toSun());
  }

  build(): void {
    if (this.built) return;
    this.built = true;
    const scene = this.scene;
    this.sky.build();

    // ---------------- city
    this.layout = generateCity({ seed: this.tuning.seed });
    const geo = buildCityGeometry(this.layout);
    const cityMat = this.makeShader("cityMat", CITY_FRAGMENT, false);
    this.cityMaterial = cityMat;
    for (const [name, mb] of [
      ["cityBuildings", geo.buildings],
      ["cityGround", geo.ground],
      ["cityProps", geo.props],
    ] as Array<[string, MeshBuffer]>) {
      if (mb.vertexCount === 0) continue;
      const m = meshFrom(name, mb.build(), scene);
      m.material = cityMat;
      this.meshes.push(m);
    }

    // ---------------- our tower
    const tower = buildTowerGeometry();
    const tm = new PBRMaterial("towerConcrete", scene);
    tm.albedoColor = Color3.White();
    tm.albedoTexture = concreteTexture(scene);
    tm.roughness = 0.9;
    tm.metallic = 0;
    tm.environmentIntensity = 0.6;
    this.towerMaterial = tm;
    const near = meshFrom("towerNear", tower.near.build(), scene);
    near.material = tm;
    // Receivers get sun shadows (and the clustered-light material setup); only the facade
    // near the apartment casts into it.
    this.lighting.registerReceiver(near);
    this.lighting.setShadowCaster(near, true, true);
    this.towerNear = near;
    const far = meshFrom("towerFar", tower.far.build(), scene);
    far.material = tm;
    this.lighting.registerReceiver(far);
    this.meshes.push(near, far);

    const glassMat = this.makeShader("towerGlassMat", GLASS_FRAGMENT, false);
    this.glassMaterial = glassMat;
    const glass = meshFrom("towerGlass", tower.glass.build(), scene);
    glass.material = glassMat;
    this.meshes.push(glass);

    const railMat = this.makeShader("towerRailMat", GLASS_FRAGMENT, true);
    railMat.backFaceCulling = false;
    this.railMaterial = railMat;
    const rails = meshFrom("towerRails", tower.rails.build(), scene);
    rails.material = railMat;
    this.meshes.push(rails);

    const corrMat = new ShaderMaterial(
      "corridorMat",
      scene,
      { vertexSource: CITY_VERTEX, fragmentSource: CORRIDOR_FRAGMENT },
      { attributes: ["position", "normal", "uv", "color", "data"], uniforms: ["world", "viewProjection", "uLevel"] },
    );
    corrMat.setFloat("uLevel", 1.0);
    const corridor = meshFrom("towerCorridor", tower.corridor.build(), scene);
    corridor.material = corrMat;
    this.meshes.push(corridor);
  }

  update(dt: number): void {
    this.sky.update(dt);
  }

  dispose(): void {
    for (const m of this.meshes) m.dispose(false, true);
    this.meshes.length = 0;
    this.sky.dispose();
  }

  // ------------------------------------------------------------------ internals

  private toSun(): Vector3 {
    const l = this.lighting as ILighting & { toSun?: Vector3 };
    if (l.toSun) return l.toSun.clone();
    return this.lighting.sun.direction.scale(-1).normalize();
  }

  private makeShader(name: string, fragment: string, blend: boolean): ShaderMaterial {
    const mat = new ShaderMaterial(
      name,
      this.scene,
      { vertexSource: CITY_VERTEX, fragmentSource: fragment },
      {
        attributes: ["position", "normal", "uv", "color", "data"],
        uniforms: ["world", "viewProjection", "cameraPosition", "uSunLight", "uSkyUp", "uSkyDown", "uGroundY", "uHazeDensity", ...SKY_UNIFORMS],
        needAlphaBlending: blend,
      },
    );
    if (blend) mat.disableDepthWrite = true;
    bindSky(mat, this.sky.params, this.toSun());
    const sun = this.lighting.sun;
    mat.setVector3("uSunLight", new Vector3(sun.diffuse.r * sun.intensity, sun.diffuse.g * sun.intensity, sun.diffuse.b * sun.intensity));
    // Outdoor sky light: brighter than the interior fill (open sky dome).
    mat.setVector3("uSkyUp", new Vector3(0.62, 0.68, 0.84));
    mat.setVector3("uSkyDown", new Vector3(0.42, 0.34, 0.28));
    mat.setFloat("uGroundY", GROUND_Y);
    mat.setFloat("uHazeDensity", this.tuning.hazeDensity);
    return mat;
  }
}
