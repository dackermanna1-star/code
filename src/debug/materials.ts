/**
 * Debug page for the procedural block materials.
 *
 *   /debug/materials.html?size=64&view=albedo            contact sheet of every layer
 *   ...&view=normal|height|rough|alpha|lit|rgb              other channels (lit = static lit shading, rgb = albedo ignoring alpha)
 *   ...&from=0&count=100  or  &names=stone,dirt  or &filter=planks   choose layers
 *   ...&cell=96&cols=12                                     display cell size / columns
 *   ...&tint=1                                              apply representative biome/constant tints
 *   ...&preview=oak_planks,stone                            lit cubes (normal map + parallax) with a moving light
 *   ...&ss=1                                                material supersampling override
 */
import * as THREE from 'three';
import { TEXTURE_NAMES } from '../render/materials/textureList';
import { generateMaterialSubset, lastGenerationMs } from '../render/materials/generator';
import { BLOCKS, facesFor } from '../world/blocks/registry';
import '../world/blocks/blocks';

declare global {
  interface Window {
    __shotReady?: boolean;
    __shotInfo?: unknown;
  }
}

const q = new URLSearchParams(location.search);
const size = +(q.get('size') ?? 64);
const view = q.get('view') ?? 'albedo';
const tintOn = q.get('tint') === '1';
const ssParam = q.get('ss');
const status = document.getElementById('status')!;

// ------------------------------------------------------------------ texture usage info
interface Usage { opacityAlpha: boolean; tint: number | null }
function usageInfo(): Map<string, Usage> {
  const map = new Map<string, Usage>();
  const tints = new Map<string, Set<number>>();
  const biome = { grass: 0x91bd59, foliage: 0x77ab2f, water: 0x3f76e4 } as Record<string, number>;
  for (const b of BLOCKS) {
    if (b.shape === 'air') continue;
    for (let m = 0; m < 16; m++) {
      const f = facesFor(b, m);
      for (const t of [f.up, f.down, f.north, f.south, f.west, f.east]) {
        const u = map.get(t) ?? { opacityAlpha: false, tint: null };
        if (b.layer === 'cutout' || b.layer === 'translucent') u.opacityAlpha = true;
        map.set(t, u);
        if (b.tint !== 'none') {
          const c = typeof b.tint === 'number' ? b.tint : biome[b.tint];
          if (!tints.has(t)) tints.set(t, new Set());
          tints.get(t)!.add(c);
        }
      }
    }
  }
  for (const [t, s] of tints) if (s.size === 1) map.get(t)!.tint = [...s][0];
  for (const e of ['grass_tuft', 'leaves_fluff_oak', 'leaves_fluff_needle', 'snow_side_overlay', 'water_flow', 'lava_flow']) {
    map.set(e, { opacityAlpha: true, tint: e === 'grass_tuft' ? 0x91bd59 : e.startsWith('leaves') ? 0x77ab2f : e === 'water_flow' ? 0x3f76e4 : null });
  }
  return map;
}
const USAGE = usageInfo();

function pickNames(): string[] {
  if (q.get('preview')) return q.get('preview')!.split(',').filter((n) => TEXTURE_NAMES.includes(n));
  if (q.get('names')) return q.get('names')!.split(',').filter((n) => TEXTURE_NAMES.includes(n));
  let list = [...TEXTURE_NAMES];
  const filter = q.get('filter');
  if (filter) list = list.filter((n) => filter.split(',').some((f) => n.includes(f)));
  const from = +(q.get('from') ?? 0);
  const count = +(q.get('count') ?? list.length);
  return list.slice(from, from + count);
}

const names = pickNames();
if (names.length === 0) {
  status.textContent = "no matching texture names";
  window.__shotReady = true;
  throw new Error("[materials] no matching texture names");
}
const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);

const t0 = performance.now();
const genOpts: { supersample?: number; mipmaps?: boolean; anisotropy?: number; timing?: boolean } = {};
if (ssParam) genOpts.supersample = +ssParam;
if (q.get('mips') === '0') genOpts.mipmaps = false;
if (q.get('aniso')) genOpts.anisotropy = +q.get('aniso')!;
if (q.get('timing') === '1') genOpts.timing = true;
const set = await generateMaterialSubset(renderer, size, names, (f) => {
  status.textContent = `generating… ${(f * 100).toFixed(0)}%`;
}, genOpts);
const tQueued = performance.now() - t0;
{
  // GPU sync: read back one texel so the measured time includes the queued GPU work.
  const rt = set.normal.renderTarget as THREE.WebGLArrayRenderTarget | undefined;
  if (rt) {
    const gl = renderer.getContext();
    const px = new Uint8Array(4);
    renderer.setRenderTarget(rt, names.length - 1);
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    console.log(`[materials] sync fb status ${st === gl.FRAMEBUFFER_COMPLETE ? 'complete' : st} err ${gl.getError()} px ${px.join(',')}`);
    renderer.setRenderTarget(null);
  }
}
const genMs = performance.now() - t0;
console.log(`[materials] queued in ${tQueued.toFixed(0)} ms, GPU done at ${genMs.toFixed(0)} ms`);
console.log(`[materials] generated ${names.length} layers @${size}px in ${genMs.toFixed(0)} ms (core ${lastGenerationMs.toFixed(0)} ms)`);

// per-layer info texture: r = alpha is opacity, gba = tint colour (or white)
const info = new Uint8Array(names.length * 4);
names.forEach((n, i) => {
  const u = USAGE.get(n);
  info[i * 4] = u?.opacityAlpha ? 255 : 0;
  const t = tintOn && u?.tint != null ? u.tint : 0xffffff;
  info[i * 4 + 1] = (t >> 16) & 255;
  info[i * 4 + 2] = (t >> 8) & 255;
  info[i * 4 + 3] = t & 255;
});
const infoTex = new THREE.DataTexture(info, names.length, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
infoTex.needsUpdate = true;

const COMMON = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2DArray;
uniform sampler2DArray tAlb;
uniform sampler2DArray tNrm;
uniform sampler2D tInfo;
uniform sampler2D tProps;
vec3 srgb2lin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 lin2srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 tonemap(vec3 x) { x *= 1.0; return x / (1.0 + x * 0.45); }
`;

if (q.get('preview')) runPreview();
else runSheet();

// ------------------------------------------------------------------ contact sheet
function runSheet() {
  const cell = +(q.get('cell') ?? Math.max(64, Math.min(160, size)));
  const labelH = 14;
  const pad = 4;
  const cols = +(q.get('cols') ?? Math.max(1, Math.floor((window.innerWidth - pad) / (cell + pad))));
  const rows = Math.ceil(names.length / cols);
  const W = cols * (cell + pad) + pad;
  const H = rows * (cell + labelH + pad) + pad;
  renderer.setSize(W, H, true);
  const viewId = ['albedo', 'normal', 'height', 'rough', 'alpha', 'lit', 'rgb'].indexOf(view);

  const mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: `in vec3 position; void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: COMMON + /* glsl */ `
uniform float uCell, uPad, uLabelH, uH, uTile;
uniform int uCols, uCount, uView;
out vec4 o;
void main() {
  vec2 fc = vec2(gl_FragCoord.x, uH - gl_FragCoord.y);
  vec2 slot = vec2(uCell + uPad, uCell + uLabelH + uPad);
  vec2 cellI = floor((fc - vec2(uPad)) / slot);
  vec2 local = fc - vec2(uPad) - cellI * slot;
  int idx = int(cellI.y) * uCols + int(cellI.x);
  vec3 bg = vec3(0.105, 0.113, 0.133);
  if (cellI.x < 0.0 || cellI.x >= float(uCols) || idx >= uCount || local.x >= uCell || local.y >= uCell || local.x < 0.0 || local.y < 0.0) { o = vec4(lin2srgb(bg * bg), 1.0); return; }
  vec2 uv = vec2(local.x, uCell - local.y) / uCell * uTile;
  float layer = float(idx);
  vec4 a = textureLod(tAlb, vec3(uv, layer), 0.0);
  vec4 n = textureLod(tNrm, vec3(uv, layer), 0.0);
  vec4 info = texelFetch(tInfo, ivec2(idx, 0), 0);
  vec4 props = texelFetch(tProps, ivec2(idx, 0), 0);
  bool opac = info.r > 0.5;
  vec3 tint = srgb2lin(info.gba);
  vec3 alb = srgb2lin(a.rgb);
  if (opac) alb *= tint; else alb = mix(alb, alb * tint, a.a);
  vec2 chk = floor(uv * 8.0);
  vec3 checker = mix(vec3(0.30), vec3(0.42), mod(chk.x + chk.y, 2.0));
  vec3 col;
  if (uView == 0) {
    col = opac ? mix(checker * checker, alb, a.a) : alb;
    // emissive preview: brighten texels above threshold
    float l = dot(alb, vec3(0.2126, 0.7152, 0.0722));
    if (props.g > 0.0 && l > props.b) col += alb * props.g * 0.6 * (opac ? a.a : 1.0);
    col = lin2srgb(clamp(col, 0.0, 1.0));
  } else if (uView == 1) {
    col = vec3(n.xy, sqrt(max(0.0, 1.0 - dot(n.xy * 2.0 - 1.0, n.xy * 2.0 - 1.0))) * 0.5 + 0.5);
  } else if (uView == 2) {
    col = vec3(n.z);
  } else if (uView == 3) {
    col = vec3(n.w);
  } else if (uView == 6) {
    col = a.rgb;
  } else if (uView == 4) {
    col = vec3(a.a);
  } else {
    vec3 nn = vec3(n.xy * 2.0 - 1.0, 0.0);
    nn.z = sqrt(max(0.0, 1.0 - dot(nn.xy, nn.xy)));
    vec3 L = normalize(vec3(-0.6, 0.7, 0.55));
    float d = max(dot(nn, L), 0.0);
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 Hh = normalize(L + V);
    float r = max(n.w * n.w, 0.02);
    float a2 = r * r;
    float nh = max(dot(nn, Hh), 0.0);
    float D = a2 / (3.14159 * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));
    vec3 F0 = mix(vec3(0.04), alb, props.r);
    // crude environment reflection (sky above, ground below) so metals read correctly
    vec3 R = reflect(-V, nn);
    vec3 env = mix(vec3(0.18, 0.16, 0.14), vec3(0.55, 0.62, 0.72), smoothstep(-0.3, 0.6, R.y));
    vec3 Fe = F0 + (1.0 - F0) * pow(1.0 - max(nn.z, 0.0), 5.0);
    vec3 c = alb * (1.0 - props.r) * d * 2.2 + F0 * D * d * 0.6 + alb * 0.25 * (1.0 - props.r) + Fe * env * (1.0 - r * 0.85) * 1.2;
    col = opac ? mix(checker * checker, c, a.a) : c;
    col = lin2srgb(clamp(tonemap(col), 0.0, 1.0));
  }
  o = vec4(col, 1.0);
}`,
    uniforms: {
      tAlb: { value: set.albedo },
      tNrm: { value: set.normal },
      tInfo: { value: infoTex },
      tProps: { value: set.props },
      uCell: { value: cell },
      uPad: { value: pad },
      uLabelH: { value: labelH },
      uH: { value: H },
      uCols: { value: cols },
      uCount: { value: names.length },
      uView: { value: Math.max(0, viewId) },
      uTile: { value: +(q.get("tile") ?? 1) },
    },
    depthTest: false,
    depthWrite: false,
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  renderer.setRenderTarget(null);
  const tDraw = performance.now();
  renderer.render(mesh, new THREE.OrthographicCamera());
  {
    const gl = renderer.getContext();
    const px = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  }
  console.log(`[materials] sheet draw ${(performance.now() - tDraw).toFixed(0)} ms`);

  const labels = document.getElementById('labels')!;
  names.forEach((n, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const d = document.createElement('div');
    d.className = 'lbl';
    d.style.left = `${pad + c * (cell + pad)}px`;
    d.style.top = `${pad + r * (cell + labelH + pad) + cell}px`;
    d.style.width = `${cell}px`;
    d.textContent = n;
    d.title = n;
    labels.appendChild(d);
  });
  status.textContent = `${names.length} layers @${size}px · ${genMs.toFixed(0)} ms · view=${view}`;
  window.__shotInfo = { layers: names.length, size, ms: Math.round(genMs) };
  requestAnimationFrame(() => {
    window.__shotReady = true;
  });
}

// ------------------------------------------------------------------ lit cube preview
function runPreview() {
  const W = Math.min(window.innerWidth, 1600), H = Math.min(window.innerHeight, 900);
  renderer.setSize(W, H, true);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a2f38);
  const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 100);
  const n = names.length;
  const perRow = Math.min(n, 6);
  const rowsN = Math.ceil(n / perRow);
  const spacing = 1.45;
  camera.position.set(0, 1.3 + rowsN * 0.6, 2.2 + Math.max(perRow, rowsN * 1.6) * 0.9);
  camera.lookAt(0, -0.1, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  const mat = (layer: number) =>
    new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: /* glsl */ `
in vec3 position; in vec3 normal; in vec2 uv;
uniform mat4 modelMatrix, viewMatrix, projectionMatrix;
out vec3 vPos; out vec3 vN; out vec2 vUv;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,
      fragmentShader: COMMON + /* glsl */ `
uniform float uLayer, uTime;
uniform vec3 uCam, uLight;
uniform int uIdx;
in vec3 vPos; in vec3 vN; in vec2 vUv;
out vec4 o;
void main() {
  vec3 N = normalize(vN);
  vec3 dp1 = dFdx(vPos), dp2 = dFdy(vPos);
  vec2 duv1 = dFdx(vUv), duv2 = dFdy(vUv);
  vec3 dp2perp = cross(dp2, N), dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
  float invmax = inversesqrt(max(dot(T, T), dot(B, B)));
  mat3 TBN = mat3(T * invmax, B * invmax, N);
  vec3 V = normalize(uCam - vPos);
  vec3 Vt = normalize(transpose(TBN) * V);
  // parallax occlusion mapping
  const float depth = 0.06;
  vec2 uv = vUv;
  int steps = 32;
  vec2 dUV = -Vt.xy / max(Vt.z, 0.25) * depth / float(steps);
  float layerD = 1.0 / float(steps);
  float cur = 0.0;
  float h = textureLod(tNrm, vec3(uv, uLayer), 0.0).z;
  for (int i = 0; i < 32; i++) {
    if (1.0 - h <= cur) break;
    uv += dUV; cur += layerD;
    h = texture(tNrm, vec3(uv, uLayer)).z;
  }
  vec4 a = texture(tAlb, vec3(uv, uLayer));
  vec4 nm = texture(tNrm, vec3(uv, uLayer));
  vec4 info = texelFetch(tInfo, ivec2(uIdx, 0), 0);
  vec4 props = texelFetch(tProps, ivec2(uIdx, 0), 0);
  bool opac = info.r > 0.5;
  if (opac && a.a < 0.5 && a.a < 0.99) { if (a.a < 0.08) discard; }
  vec3 alb = srgb2lin(a.rgb);
  vec3 tint = srgb2lin(info.gba);
  if (opac) alb *= tint; else alb = mix(alb, alb * tint, a.a);
  vec3 nt = vec3(nm.xy * 2.0 - 1.0, 0.0);
  nt.z = sqrt(max(0.0, 1.0 - dot(nt.xy, nt.xy)));
  vec3 n = normalize(TBN * nt);
  vec3 L = normalize(uLight);
  vec3 Hh = normalize(L + V);
  float r = max(nm.w * nm.w, 0.02);
  float a2 = r * r;
  float nh = max(dot(n, Hh), 0.0);
  float nl = max(dot(n, L), 0.0);
  float D = a2 / (3.14159 * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));
  float k = r * 0.5;
  float G = nl / (nl * (1.0 - k) + k) * max(dot(n, V), 0.0) / (max(dot(n, V), 0.0) * (1.0 - k) + k);
  vec3 F0 = mix(vec3(0.04), alb, props.r);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - max(dot(Hh, V), 0.0), 5.0);
  vec3 spec = D * G * F / max(4.0 * nl * max(dot(n, V), 0.0), 1e-3);
  vec3 sun = vec3(3.2, 3.0, 2.7);
  vec3 col = (alb * (1.0 - props.r) / 3.14159 * 3.14159 * 0.9 * (1.0 - F) + spec) * sun * nl;
  col += alb * (1.0 - props.r * 0.8) * mix(vec3(0.10, 0.11, 0.12), vec3(0.22, 0.26, 0.33), n.y * 0.5 + 0.5);
  vec3 R = reflect(-V, n);
  vec3 env = mix(vec3(0.16, 0.14, 0.12), vec3(0.5, 0.58, 0.7), smoothstep(-0.3, 0.6, R.y));
  vec3 Fe = F0 + (1.0 - F0) * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  col += Fe * env * (1.0 - r * 0.85);
  float lumA = dot(alb, vec3(0.2126, 0.7152, 0.0722));
  if (props.g > 0.0 && lumA > props.b) col += alb * props.g * 4.0;
  // translucent textures (glass, water ...) as alpha blended
  o = vec4(lin2srgb(clamp(tonemap(col), 0.0, 1.0)), (opac && a.a < 0.99) ? max(a.a, 0.0) : 1.0);
}`,
      uniforms: {
        tAlb: { value: set.albedo },
        tNrm: { value: set.normal },
        tInfo: { value: infoTex },
        tProps: { value: set.props },
        uLayer: { value: layer },
        uIdx: { value: layer },
        uTime: { value: 0 },
        uCam: { value: camera.position },
        uLight: { value: new THREE.Vector3(1, 1, 1) },
      },
      transparent: true,
      side: THREE.DoubleSide,
    });
  const mats: THREE.RawShaderMaterial[] = [];
  const geo = new THREE.BoxGeometry(1, 1, 1);
  names.forEach((nm, i) => {
    const m = mat(i);
    mats.push(m);
    const mesh = new THREE.Mesh(geo, m);
    const c = i % perRow, r = Math.floor(i / perRow);
    mesh.position.set((c - (perRow - 1) / 2) * spacing, 0, (r - (rowsN - 1) / 2) * spacing * 1.1);
    mesh.rotation.y = 0.55;
    scene.add(mesh);
    const lbl = document.createElement('div');
    lbl.className = 'lbl';
    lbl.textContent = nm;
    document.getElementById('labels')!.appendChild(lbl);
    const p = mesh.position.clone().add(new THREE.Vector3(0, -0.85, 0)).project(camera);
    lbl.style.left = `${(p.x * 0.5 + 0.5) * W - 70}px`;
    lbl.style.top = `${(-p.y * 0.5 + 0.5) * H}px`;
    lbl.style.width = '140px';
  });
  let frame = 0;
  const tStart = performance.now();
  const timeParam = q.get('t');
  const tick = () => {
    const t = timeParam ? +timeParam : (performance.now() - tStart) / 1000;
    const L = new THREE.Vector3(Math.cos(t * 0.7) * 1.2, 0.9, Math.sin(t * 0.7) * 1.2 + 0.6);
    for (const m of mats) m.uniforms.uLight.value.copy(L);
    renderer.render(scene, camera);
    frame++;
    if (frame === 3) {
      status.textContent = `${names.length} layers @${size}px · ${genMs.toFixed(0)} ms`;
      window.__shotReady = true;
    }
    requestAnimationFrame(tick);
  };
  tick();
}
