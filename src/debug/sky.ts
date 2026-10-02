/**
 * Sky / atmosphere / cloud debug scene.
 *
 * URL params:
 *   time=<0..24000 ticks> (0 sunrise, 6000 noon, 12000 sunset, 18000 midnight)
 *   yaw=<deg, 0 = north (-Z), 90 = east (+X)> (default: toward the sun / moon)   pitch=<deg> (default 8)
 *   rain=0..1  thunder=0..1  phase=0..7 (moon)  frames=N (render N frames then __shotReady)
 *   quality=low|medium|high|ultra  dim=overworld|nether|end  fov=70  rd=<render distance>
 *   x,y,z=<camera position>  ev=<exposure bias stops>  tm=agx|aces|agxp  sep=1 (separate depth/target path)
 *   view=weather|skyview|transmittance|multiscat|cloudenv|shadow|clouds|shape (texture inspection)
 *   clouds=<fair-weather coverage override>  animate=1 (advance time when interactive)
 */
import * as THREE from 'three';
import { Atmosphere, celestialFromTicks, evalAmbientSH, type SkyParams, type SkyQuality } from '../render/sky';
import { FbmNoise } from '../core/noise';

const qs = new URLSearchParams(location.search);
const num = (k: string, d: number) => {
  const v = qs.get(k);
  return v !== null && v !== '' && !Number.isNaN(+v) ? +v : d;
};
let ticks = num('time', 6000);
const rain = num('rain', 0);
const thunder = num('thunder', 0);
const framesParam = qs.get('frames');
const frames = framesParam !== null ? Math.max(1, num('frames', 16)) : Infinity;
const quality = (qs.get('quality') ?? 'high') as SkyQuality;
const dimension = (qs.get('dim') ?? 'overworld') as SkyParams['dimension'];
const fov = num('fov', 70);
const renderDistance = num('rd', 192);
const view = qs.get('view');
const sep = qs.get('sep') !== '0';
const tm = qs.get('tm') ?? 'aces';
const evBias = num('ev', 0);
const animate = qs.get('animate') === '1';
const spin = num('spin', 0); // yaw degrees per frame (temporal reprojection test)

// ---------------------------------------------------------------------------------------------
// renderer
// ---------------------------------------------------------------------------------------------
const canvas = document.getElementById('view') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight, false);
const W = canvas.width, H = canvas.height;

const atmosphere = new Atmosphere(renderer, quality);
if (qs.has('clouds')) atmosphere.cloudCoverage = num('clouds', atmosphere.cloudCoverage);
// cloud look overrides: ?cl.viewSigma=60&cl.ambient=0.5 ...
for (const k of Object.keys(atmosphere.cloudLook) as (keyof typeof atmosphere.cloudLook)[]) {
  if (qs.has('cl.' + k)) atmosphere.cloudLook[k] = num('cl.' + k, atmosphere.cloudLook[k]);
}

// ---------------------------------------------------------------------------------------------
// terrain
// ---------------------------------------------------------------------------------------------
const hills = new FbmNoise(1234, 5, 1 / 160);
const ridges = new FbmNoise(77, 5, 1 / 420);
const detail = new FbmNoise(5, 3, 1 / 23);
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};
function terrainHeight(x: number, z: number): number {
  const d = Math.hypot(x, z);
  let h = 68 + hills.get2(x, z) * 9 + detail.get2(x, z) * 1.2;
  const m = ridges.ridged2(x + 900, z - 300);
  h += Math.pow(m, 2.3) * 150 * smooth(70, 230, d);
  // lake to the north-east
  const lx = x - 70, lz = z + 55;
  h -= 14 * Math.exp(-(lx * lx + lz * lz) / (2 * 34 * 34));
  return h;
}

const SEA = 63;
function buildTerrain(): THREE.BufferGeometry {
  const S = Math.ceil(renderDistance);
  const step = 2;
  const n = Math.floor((2 * S) / step) + 1;
  const pos = new Float32Array(n * n * 3);
  const nor = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  const e = 1.0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -S + i * step, z = -S + j * step;
      const y = terrainHeight(x, z);
      const k = (j * n + i) * 3;
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      const nx = terrainHeight(x - e, z) - terrainHeight(x + e, z);
      const nz = terrainHeight(x, z - e) - terrainHeight(x, z + e);
      const len = Math.hypot(nx, 2 * e, nz);
      nor[k] = nx / len; nor[k + 1] = (2 * e) / len; nor[k + 2] = nz / len;
      const slope = 1 - nor[k + 1];
      let c: [number, number, number];
      if (y < SEA + 1.2) c = [0.42, 0.38, 0.27];
      else if (y > 165 + detail.get2(x * 3, z * 3) * 10) c = [0.8, 0.82, 0.86];
      else if (slope > 0.28 || y > 135) c = [0.28, 0.27, 0.25];
      else c = [0.13, 0.23, 0.055];
      const v = 0.85 + 0.3 * (detail.get2(x * 2.1, z * 2.1) * 0.5 + 0.5);
      col[k] = c[0] * v; col[k + 1] = c[1] * v; col[k + 2] = c[2] * v;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function buildBoxes(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (x: number, z: number, w: number, h: number, d: number, grey: number) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    const y0 = terrainHeight(x, z) - 1;
    g.translate(x, y0 + h / 2, z);
    const c = new Float32Array(g.attributes.position.count * 3).fill(grey);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.deleteAttribute('uv');
    parts.push(g);
  };
  // a little "village" of grey blocks + pillars around the spawn
  add(9, -6, 5, 5, 5, 0.42);
  add(16, 3, 3, 8, 3, 0.5);
  add(-12, -9, 4, 3, 7, 0.38);
  add(-6, 14, 2, 12, 2, 0.55);
  add(24, -18, 6, 4, 4, 0.45);
  add(-25, 6, 3, 6, 3, 0.4);
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39996, r = 30 + i * 9;
    add(Math.cos(a) * r, Math.sin(a) * r, 2, 4 + (i % 4) * 3, 2, 0.35 + (i % 3) * 0.08);
  }
  const merged = mergeGeometries(parts);
  return merged;
}

function mergeGeometries(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  for (const g of gs) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
  let o = 0;
  for (const g of gs) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    col.set(g.attributes.color.array as Float32Array, o * 3);
    o += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return m;
}

// ---------------------------------------------------------------------------------------------
// materials
// ---------------------------------------------------------------------------------------------
const shadowSize = 2048;
const shadowRT = new THREE.WebGLRenderTarget(shadowSize, shadowSize, {
  depthTexture: new THREE.DepthTexture(shadowSize, shadowSize, THREE.UnsignedIntType),
  depthBuffer: true,
});
const shadowCam = new THREE.OrthographicCamera(-130, 130, 130, -130, 1, 900);
const shadowMatrix = new THREE.Matrix4();

const sceneVert = /* glsl */ `
in vec3 position;
in vec3 normal;
in vec3 color;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 uShadowMatrix;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vColor;
out vec4 vShadow;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normal;
  vColor = color;
  vShadow = uShadowMatrix * wp;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const commonFrag = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
${atmosphere.glsl}
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uSH[9];
uniform highp sampler2D uShadowMap;
uniform vec3 uCamPos;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vColor;
in vec4 vShadow;
layout(location = 0) out vec4 outColor;
vec3 evalSH(vec3 n) {
  vec3 r = uSH[0] * 0.282095 + uSH[1] * (0.488603 * n.y) + uSH[2] * (0.488603 * n.z) + uSH[3] * (0.488603 * n.x)
    + uSH[4] * (1.092548 * n.x * n.y) + uSH[5] * (1.092548 * n.y * n.z) + uSH[6] * (0.315392 * (3.0 * n.z * n.z - 1.0))
    + uSH[7] * (1.092548 * n.x * n.z) + uSH[8] * (0.546274 * (n.x * n.x - n.y * n.y));
  return max(r, vec3(0.0));
}
float shadowPCF(vec4 sc, float ndl) {
  vec3 p = sc.xyz / sc.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float bias = 0.0006 + 0.002 * (1.0 - ndl);
  float s = 0.0;
  vec2 texel = vec2(1.0 / ${shadowSize}.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    float d = texture(uShadowMap, p.xy + vec2(float(i), float(j)) * texel * 1.5).r;
    s += p.z - bias <= d ? 1.0 : 0.0;
  }
  return s / 9.0;
}
`;

const litFrag = /* glsl */ `${commonFrag}
void main() {
  vec3 n = normalize(vNormal);
  float ndl = max(dot(n, uLightDir), 0.0);
  float sh = ndl > 0.0 ? shadowPCF(vShadow, ndl) : 0.0;
  float cs = atmo_cloudShadow(vWorld);
  vec3 E = uLightColor * ndl * sh * cs + evalSH(n);
  vec3 col = vColor / 3.14159265 * E;
  vec3 V = vWorld - uCamPos;
  float dist = length(V);
  outColor = vec4(atmo_applyFog(col, V / dist, dist), 1.0);
}
`;

const waterFrag = /* glsl */ `${commonFrag}
void main() {
  vec3 V = vWorld - uCamPos;
  float dist = length(V);
  vec3 v = V / dist;
  vec2 w = vWorld.xz;
  vec3 n = normalize(vec3(0.012 * sin(w.x * 0.9 + w.y * 0.3) + 0.008 * sin(w.y * 1.7 - w.x * 0.6), 1.0, 0.012 * cos(w.y * 0.8 - w.x * 0.4)));
  vec3 r = reflect(v, n);
  r.y = abs(r.y);
  float f = 0.02 + 0.98 * pow(1.0 - max(dot(-v, n), 0.0), 5.0);
  float cs = atmo_cloudShadow(vWorld);
  vec3 refl = atmo_skyRadianceWithClouds(r);
  float spec = pow(max(dot(r, uLightDir), 0.0), 900.0) * 120.0;
  vec3 deep = vec3(0.01, 0.035, 0.05) * (evalSH(vec3(0.0, 1.0, 0.0)) + uLightColor * max(uLightDir.y, 0.0) * cs) / 3.14159;
  vec3 col = mix(deep, refl, f) + uLightColor * spec * cs * f;
  outColor = vec4(atmo_applyFog(col, v, dist), 1.0);
}
`;

const depthOnly = new THREE.RawShaderMaterial({
  glslVersion: THREE.GLSL3,
  vertexShader: /* glsl */ `in vec3 position; uniform mat4 modelMatrix, viewMatrix, projectionMatrix;
    void main() { gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `precision highp float; layout(location = 0) out vec4 o; void main() { o = vec4(1.0); }`,
});

const sceneUniforms = {
  ...atmosphere.uniforms,
  uLightDir: { value: atmosphere.lightDir },
  uLightColor: { value: new THREE.Vector3() },
  uSH: { value: atmosphere.ambientSH },
  uShadowMap: { value: shadowRT.depthTexture },
  uShadowMatrix: { value: shadowMatrix },
  uCamPos: { value: new THREE.Vector3() },
};
const litMat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: sceneVert, fragmentShader: litFrag, uniforms: sceneUniforms });
const waterMat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: sceneVert, fragmentShader: waterFrag, uniforms: sceneUniforms });

const scene = new THREE.Scene();
const casters = new THREE.Scene();
if (dimension === 'overworld') {
  const terrainGeo = buildTerrain();
  const boxGeo = buildBoxes();
  scene.add(new THREE.Mesh(terrainGeo, litMat));
  scene.add(new THREE.Mesh(boxGeo, litMat));
  casters.add(new THREE.Mesh(terrainGeo, depthOnly));
  casters.add(new THREE.Mesh(boxGeo, depthOnly));
  const S = renderDistance;
  const wg = new THREE.PlaneGeometry(2 * S, 2 * S, 1, 1).rotateX(-Math.PI / 2).translate(0, SEA - 0.1, 0);
  wg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(wg.attributes.position.count * 3), 3));
  scene.add(new THREE.Mesh(wg, waterMat));
} else {
  // nether/end: a few grey pillars and a floor
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 40; i++) {
    const a = i * 2.39996, r = 8 + i * 4;
    const g = new THREE.BoxGeometry(4, 10 + (i % 5) * 9, 4).toNonIndexed();
    g.translate(Math.cos(a) * r, 60 + (5 + (i % 5) * 4.5), Math.sin(a) * r);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(dimension === 'nether' ? 0.3 : 0.7), 3));
    g.deleteAttribute('uv');
    parts.push(g);
  }
  const floor = new THREE.BoxGeometry(600, 2, 600).toNonIndexed().translate(0, 59, 0);
  floor.setAttribute('color', new THREE.BufferAttribute(new Float32Array(floor.attributes.position.count * 3).fill(dimension === 'nether' ? 0.25 : 0.75), 3));
  floor.deleteAttribute('uv');
  parts.push(floor);
  const geo = mergeGeometries(parts);
  scene.add(new THREE.Mesh(geo, litMat));
}
for (const o of [...scene.children, ...casters.children]) o.frustumCulled = false;

// ---------------------------------------------------------------------------------------------
// camera
// ---------------------------------------------------------------------------------------------
const camera = new THREE.PerspectiveCamera(fov, W / H, 0.1, 2000);
const cel = celestialFromTicks(ticks);
const moonPhase = num('phase', 0);
const lightForYaw = cel.sunDir.y > -0.05 ? cel.sunDir : cel.moonDir;
const defYaw = (Math.atan2(lightForYaw.x, -lightForYaw.z) * 180) / Math.PI;
let yaw = num('yaw', defYaw);
let pitch = num('pitch', 8);
const camPos = new THREE.Vector3(num('x', 0), 0, num('z', 0));
camPos.y = num('y', dimension === 'overworld' ? Math.max(terrainHeight(camPos.x, camPos.z), SEA) + 1.7 : 62);
camera.position.copy(camPos);
function orientCamera() {
  const yr = (yaw * Math.PI) / 180, pr = (pitch * Math.PI) / 180;
  const fwd = new THREE.Vector3(Math.sin(yr) * Math.cos(pr), Math.sin(pr), -Math.cos(yr) * Math.cos(pr));
  camera.up.set(0, 1, 0);
  camera.lookAt(camera.position.clone().add(fwd));
  camera.updateMatrixWorld();
}
orientCamera();

// ---------------------------------------------------------------------------------------------
// targets & post
// ---------------------------------------------------------------------------------------------
const sceneRT = new THREE.WebGLRenderTarget(W, H, {
  type: THREE.HalfFloatType,
  depthTexture: new THREE.DepthTexture(W, H, THREE.UnsignedIntType),
  depthBuffer: true,
});
// "sep" mode: lit colour copied into a separate HDR target without that depth attachment
const hdrRT = sep ? new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false }) : null;

const fsGeo = new THREE.BufferGeometry();
fsGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
const fsVert = /* glsl */ `in vec3 position; out vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
function fsPass(frag: string, uniforms: Record<string, THREE.IUniform>) {
  const mat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: fsVert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(fsGeo, mat);
  mesh.frustumCulled = false;
  const sc = new THREE.Scene();
  sc.add(mesh);
  return { mat, scene: sc };
}
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const copyPass = fsPass(/* glsl */ `precision highp float; uniform highp sampler2D tSrc; in vec2 vUv; layout(location=0) out vec4 o;
  void main() { o = texture(tSrc, vUv); }`, { tSrc: { value: sceneRT.texture } });

const tonemapPass = fsPass(/* glsl */ `precision highp float;
uniform highp sampler2D tHdr;
uniform float uExposure;
uniform int uMode;
in vec2 vUv;
layout(location = 0) out vec4 o;
vec3 aces(vec3 color) {
  const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  vec3 v = inM * color;
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(outM * (a / b), 0.0, 1.0);
}
vec3 agxContrast(vec3 x) {
  vec3 x2 = x * x; vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 agx(vec3 color, bool punchy) {
  const mat3 toRec2020 = mat3(vec3(0.6274, 0.0691, 0.0164), vec3(0.3293, 0.9195, 0.0880), vec3(0.0433, 0.0113, 0.8956));
  const mat3 fromRec2020 = mat3(vec3(1.6605, -0.1246, -0.0182), vec3(-0.5876, 1.1329, -0.1006), vec3(-0.0728, -0.0083, 1.1187));
  const mat3 inset = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995), vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903), vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
  const mat3 outset = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826), vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294), vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
  const float minEv = -12.47393, maxEv = 4.026069;
  color = inset * (toRec2020 * color);
  color = clamp((log2(max(color, 1e-10)) - minEv) / (maxEv - minEv), 0.0, 1.0);
  color = agxContrast(color);
  if (punchy) {
    float l = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = pow(max(color, 0.0), vec3(1.25));
    color = l + 1.35 * (color - l);
  }
  color = outset * color;
  color = pow(max(vec3(0.0), color), vec3(2.2));
  return clamp(fromRec2020 * color, 0.0, 1.0);
}
vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec3 c = texture(tHdr, vUv).rgb * uExposure;
  if (any(isnan(c)) || any(isinf(c))) { o = vec4(1.0, 0.0, 1.0, 1.0); return; }
  vec3 m = uMode == 0 ? agx(c, false) : uMode == 1 ? aces(c) : agx(c, true);
  o = vec4(srgb(m), 1.0); // both curves return linear sRGB
}`, { tHdr: { value: sceneRT.texture }, uExposure: { value: 1 }, uMode: { value: tm === 'aces' ? 1 : tm === 'agxp' ? 2 : 0 } });

const viewPass = fsPass(/* glsl */ `precision highp float; precision highp sampler3D;
uniform highp sampler2D tTex; uniform highp sampler3D tTex3; uniform int uIs3D; uniform float uScale; uniform float uSlice; uniform int uAxis; uniform float uLod;
in vec2 vUv; layout(location = 0) out vec4 o;
void main() {
  vec3 c3 = uAxis == 1 ? vec3(vUv.x, uSlice, vUv.y) : vec3(vUv, uSlice);
  vec4 c = uIs3D == 1 ? textureLod(tTex3, c3, uLod) : textureLod(tTex, vUv, uLod);
  if (uIs3D == 1) c = vec4(c.r);
  vec3 v = c.rgb * uScale;
  o = vec4(pow(clamp(v, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}`, { tTex: { value: null }, tTex3: { value: null }, uIs3D: { value: 0 }, uScale: { value: 1 }, uSlice: { value: num('slice', 0.5) }, uAxis: { value: num("axis", 0) }, uLod: { value: num("lod", 0) } });

// ---------------------------------------------------------------------------------------------
// frame loop
// ---------------------------------------------------------------------------------------------
const params: SkyParams = {
  sunDir: cel.sunDir.clone(),
  moonDir: cel.moonDir.clone(),
  moonPhase,
  time: ticks / 20,
  rain,
  thunder,
  dimension,
  cameraPosition: camera.position,
  renderDistance,
  biomeFogColor: dimension === 'nether' ? new THREE.Color(0x330808) : dimension === 'end' ? new THREE.Color(0x1a0d22) : undefined,
};

let frame = 0;
let exposure = 1;
const up = new THREE.Vector3(0, 1, 0);
const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function computeExposure() {
  const amb = evalAmbientSH(atmosphere.ambientSH, up);
  const lc = atmosphere.lightColor;
  const E = Math.max(lum(amb.x, amb.y, amb.z) + lum(lc.r, lc.g, lc.b) * Math.max(atmosphere.lightDir.y, 0) * 0.8, 1e-4);
  // middle grey for the scene's irradiance, compressed so nights stay dark
  let ex = (1.0 * Math.PI) / E * Math.pow(E / 20, 0.32);
  ex = Math.min(Math.max(ex, 0.02), 200);
  return ex * Math.pow(2, evBias);
}

function updateShadowCamera() {
  const L = atmosphere.lightDir;
  const c = camera.position;
  shadowCam.position.copy(c).addScaledVector(L, 400);
  shadowCam.up.set(0, 1, 0);
  if (Math.abs(L.y) > 0.99) shadowCam.up.set(0, 0, 1);
  shadowCam.lookAt(c);
  shadowCam.updateMatrixWorld();
  shadowCam.updateProjectionMatrix();
  shadowMatrix.multiplyMatrices(shadowCam.projectionMatrix, shadowCam.matrixWorldInverse);
}

const timings: number[] = [];
function renderFrame() {
  const t0 = performance.now();
  if (spin !== 0 && frame > 0) {
    yaw += spin;
    orientCamera();
  }
  if (animate) {
    ticks += 4;
    celestialFromTicks(ticks, undefined, cel);
    params.sunDir.copy(cel.sunDir);
    params.moonDir.copy(cel.moonDir);
    params.time = ticks / 20;
  }
  atmosphere.update(params, camera, frame);
  (sceneUniforms.uLightColor.value as THREE.Vector3).set(atmosphere.lightColor.r, atmosphere.lightColor.g, atmosphere.lightColor.b);
  sceneUniforms.uCamPos.value.copy(camera.position);

  // shadow map
  updateShadowCamera();
  renderer.setRenderTarget(shadowRT);
  renderer.setClearColor(0xffffff, 1);
  renderer.clear(true, true, false);
  renderer.render(casters, shadowCam);

  // scene
  renderer.setRenderTarget(sceneRT);
  renderer.setClearColor(0x000000, 1);
  renderer.clear(true, true, false);
  renderer.autoClear = false;
  renderer.render(scene, camera);

  let hdr: THREE.WebGLRenderTarget = sceneRT;
  if (hdrRT) {
    renderer.setRenderTarget(hdrRT);
    renderer.render(copyPass.scene, orthoCam);
    hdr = hdrRT;
  }
  atmosphere.render(hdr, sceneRT.depthTexture!, camera);

  // output
  renderer.setRenderTarget(null);
  if (view) {
    const tex = atmosphere.debugTextures();
    const u = viewPass.mat.uniforms;
    const key = view === 'skyview' ? 'skyView' : view === 'cloudenv' ? 'cloudEnv' : view === 'shadow' ? 'cloudShadow' : view === 'multiscat' ? 'multiScat' : view;
    const t = tex[key] ?? null;
    u.uIs3D.value = view === 'shape' ? 1 : 0;
    if (view === 'shape') u.tTex3.value = t;
    else u.tTex.value = t;
    u.uScale.value = num('scale', view === 'skyview' || view === 'cloudenv' || view === 'clouds' ? 0.4 : view === 'multiscat' ? 20 : 1);
    renderer.render(viewPass.scene, orthoCam);
  } else {
    exposure = computeExposure();
    tonemapPass.mat.uniforms.tHdr.value = hdr.texture;
    tonemapPass.mat.uniforms.uExposure.value = exposure;
    renderer.render(tonemapPass.scene, orthoCam);
  }
  renderer.autoClear = true;
  timings.push(performance.now() - t0);
  frame++;
}

function info() {
  const lc = atmosphere.lightColor;
  const amb = evalAmbientSH(atmosphere.ambientSH, up);
  const sunEl = (Math.asin(params.sunDir.y) * 180) / Math.PI;
  return {
    ticks, sunElevationDeg: +sunEl.toFixed(2), yaw: +yaw.toFixed(1), pitch,
    lightDir: atmosphere.lightDir.toArray().map((v) => +v.toFixed(3)),
    lightColor: [lc.r, lc.g, lc.b].map((v) => +v.toFixed(4)),
    ambientUp: amb.toArray().map((v) => +v.toFixed(4)),
    fogColor: [atmosphere.fogColor.r, atmosphere.fogColor.g, atmosphere.fogColor.b].map((v) => +v.toFixed(4)),
    exposure: +exposure.toFixed(4),
    msPerFrame: timings.length ? +(timings.reduce((a, b) => a + b, 0) / timings.length).toFixed(1) : 0,
    frames: frame,
  };
}

function updateHud() {
  const i = info();
  hud.textContent = `t=${Math.round(ticks)} sun=${i.sunElevationDeg}° light=${i.lightColor.join(',')} amb=${i.ambientUp.join(',')} ev=${i.exposure} ${i.msPerFrame}ms`;
}

// interactive look
let dragging = false;
canvas.addEventListener('pointerdown', () => (dragging = true));
window.addEventListener('pointerup', () => (dragging = false));
window.addEventListener('pointermove', (e: PointerEvent) => {
  if (!dragging) return;
  yaw += e.movementX * 0.2;
  pitch = Math.max(-89, Math.min(89, pitch - e.movementY * 0.2));
  orientCamera();
});

async function run() {
  while (frame < frames) {
    renderFrame();
    if (frame % 4 === 0 || frame === frames) updateHud();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
  updateHud();
  (window as unknown as { __shotInfo: unknown }).__shotInfo = info();
  (window as unknown as { __shotReady: boolean }).__shotReady = true;
}
run();
