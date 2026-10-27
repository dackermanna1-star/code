/**
 * Cloud resources: per-planet weather cubemap (coverage, cyclones, zonal
 * bands) generated on the GPU, and a shared tiling 3-D detail texture
 * (inverted Worley + gradient noise) used to erode cloud shapes.
 */
import * as THREE from 'three';
import { NOISE_GLSL } from './shaders/noise.glsl';
import { FullscreenPass, FS_VERT } from './fullscreen';

export interface CloudParams {
  bottom: number;      // m above datum
  top: number;         // m above datum
  coverage: number;    // 0..1
  density: number;     // extinction (1/m) at full density
  scale: number;       // m, horizontal feature size
  albedo: [number, number, number];
  windSpeed: number;   // m/s (equatorial zonal flow)
  seed: number;
  storminess: number;  // 0..1 cyclone frequency
  bands: number;       // 0..1 zonal banding
  overcast: number;    // 0..1 → smooth stratiform deck (Venus/Titan)
}

const WEATHER_FRAG = /* glsl */ `
${NOISE_GLSL}
uniform int uFace;
uniform float uSeed, uCoverage, uStorm, uBands, uOvercast;
varying vec2 vUv;
vec3 faceDir(int f, vec2 uv) {
  float s = uv.x * 2.0 - 1.0, t = uv.y * 2.0 - 1.0;
  if (f == 0) return normalize(vec3(1.0, -t, -s));
  if (f == 1) return normalize(vec3(-1.0, -t, s));
  if (f == 2) return normalize(vec3(s, 1.0, t));
  if (f == 3) return normalize(vec3(s, -1.0, -t));
  if (f == 4) return normalize(vec3(s, -t, 1.0));
  return normalize(vec3(-s, -t, -1.0));
}
vec3 rotateAround(vec3 v, vec3 k, float a) {
  float c = cos(a), sn = sin(a);
  return v * c + cross(k, v) * sn + k * dot(k, v) * (1.0 - c);
}
// nearest jittered feature point (xyz) and its hash (w)
vec4 nearestFeature(vec3 p) {
  vec3 i = floor(p), f = p - i;
  float best = 9.0; vec4 r = vec4(0.0);
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(x, y, z);
    vec3 h = hash33(i + o);
    vec3 fp = o + 0.15 + h * 0.7;
    vec3 dv = fp - f;
    float dd = dot(dv, dv);
    if (dd < best) { best = dd; r = vec4(i + fp, h.y); }
  }
  return r;
}
void main() {
  vec3 d = faceDir(uFace, vUv);
  vec3 sd = vec3(uSeed * 0.013, uSeed * 0.007, uSeed * 0.011);
  // cyclones: rotate the sampling point around nearby storm centres. Spiral
  // sense follows the Coriolis effect (counter-clockwise in the north).
  vec3 p = d;
  for (int i = 0; i < 2; i++) {
    float f = 2.2 + float(i) * 2.8;
    vec4 c = nearestFeature(d * f + sd * (1.0 + float(i)));
    vec3 axis = normalize(c.xyz / f - sd * (1.0 + float(i)) / f);
    float r = acos(clamp(dot(axis, d), -1.0, 1.0));
    float rad = 0.2 / f; // ≪ cell size so the warp vanishes before cell borders
    float on = step(1.0 - uStorm * 0.22, c.w) * smoothstep(0.1, 0.3, abs(axis.y));
    float hemi = axis.y >= 0.0 ? 1.0 : -1.0;
    float ang = on * hemi * 4.5 * exp(-(r * r) / (rad * rad));
    p = rotateAround(p, axis, ang);
  }
  // mild zonal elongation (prevailing east–west flow)
  vec3 q = vec3(p.x, p.y * (1.4 + uBands * 4.0), p.z);
  vec3 w1 = vec3(fbm3(q * 1.7 + sd, 4), fbm3(q * 1.7 + sd + 5.3, 4), fbm3(q * 1.7 + sd + 9.1, 4));
  float n = fbm3(q * 3.0 + sd + w1 * 0.8, 7) + 0.5;
  // finer cumulus clumping
  n += fbm3(q * 18.0 + w1 * 1.5 + sd, 4) * 0.22;
  float lat = abs(d.y);
  // latitudinal climate: wet ITCZ, dry subtropics, stormy mid-latitudes
  float climate = 0.75 + 0.2 * cos(lat * 3.14159 * 3.0) - 0.12 * smoothstep(0.8, 1.0, lat);
  float thr = 1.0 - uCoverage * climate * 1.15;
  // fairly sharp edges: real cloud fields are mostly either clear or cloudy at 10–100 km scales
  float cov = smoothstep(thr - 0.05, thr + 0.12, n);
  cov = mix(cov, 0.72 + 0.28 * clamp(n, 0.0, 1.0), uOvercast);
  float height = clamp(0.3 + 0.8 * (n - thr) + 0.3 * fbm3(q * 6.0 + sd * 3.1, 3), 0.15, 1.0);
  gl_FragColor = vec4(cov, height, n, 1.0);
}
`;

let detailTex: THREE.Data3DTexture | null = null;

/** 64³ tiling cloud-detail texture (R: Worley-Perlin, G: high-frequency Worley). */
export function cloudDetailTexture(): THREE.Data3DTexture {
  if (detailTex) return detailTex;
  const S = 64;
  const data = new Uint8Array(S * S * S * 2);
  // periodic feature points: 8 cells per axis for R, 16 for G
  const pts = (n: number, seed: number) => {
    const a = new Float32Array(n * n * n * 3);
    let h = seed;
    for (let i = 0; i < n * n * n * 3; i++) {
      h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x9e3779b9;
      h ^= h >>> 12;
      a[i] = ((h >>> 0) % 10000) / 10000;
    }
    return a;
  };
  const p8 = pts(8, 1337), p16 = pts(16, 7331);
  const worley = (x: number, y: number, z: number, n: number, P: Float32Array) => {
    const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
    let best = 9;
    for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const ix = cx + i, iy = cy + j, iz = cz + k;
      const wx = ((ix % n) + n) % n, wy = ((iy % n) + n) % n, wz = ((iz % n) + n) % n;
      const o = ((wz * n + wy) * n + wx) * 3;
      const dx = ix + P[o] - x, dy = iy + P[o + 1] - y, dz = iz + P[o + 2] - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };
  for (let z = 0; z < S; z++)
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S, w = z / S;
        const w1 = 1 - worley(u * 8, v * 8, w * 8, 8, p8);
        const w2 = 1 - worley(u * 16, v * 16, w * 16, 16, p16);
        const r = Math.max(0, Math.min(1, w1 * 0.75 + w2 * 0.25));
        const i = ((z * S + y) * S + x) * 2;
        data[i] = Math.round(r * 255);
        data[i + 1] = Math.round(Math.max(0, Math.min(1, w2)) * 255);
      }
  const t = new THREE.Data3DTexture(data, S, S, S);
  t.format = THREE.RGFormat;
  t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  detailTex = t;
  return t;
}

let weatherPass: FullscreenPass | null = null;

export class CloudLayer {
  readonly weather: THREE.WebGLCubeRenderTarget;
  constructor(readonly params: CloudParams, renderer: THREE.WebGLRenderer, size = 512) {
    this.weather = new THREE.WebGLCubeRenderTarget(size, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
    });
    const mat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT,
      fragmentShader: WEATHER_FRAG,
      uniforms: {
        uFace: { value: 0 },
        uSeed: { value: (params.seed % 10000) + 0.5 },
        uCoverage: { value: params.coverage },
        uStorm: { value: params.storminess },
        uBands: { value: params.bands },
        uOvercast: { value: params.overcast },
      },
      depthTest: false,
      depthWrite: false,
    });
    if (!weatherPass) weatherPass = new FullscreenPass(mat);
    const prev = renderer.getRenderTarget();
    for (let f = 0; f < 6; f++) {
      mat.uniforms.uFace.value = f;
      mat.uniformsNeedUpdate = true;
      weatherPass.mesh.material = mat;
      renderer.setRenderTarget(this.weather, f);
      renderer.render(weatherPass.scene, weatherPass.camera);
    }
    renderer.setRenderTarget(prev);
    mat.dispose();
  }
  dispose() {
    this.weather.dispose();
  }
}
