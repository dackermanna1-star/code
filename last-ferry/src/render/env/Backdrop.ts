// The backdrop: a matte-painting layer drawn behind the gameplay scene.
//
// The gameplay camera looks down 36°, so the true horizon is far above the
// frame. Like Seal Hunter's backdrop, the far world is rendered by its own
// near-horizontal camera (same horizontal angle of view) whose frustum puts
// the horizon at frame v = HORIZON_V, straight into the main target before the
// gameplay scene (Stage.onBeforeMainRender). The gameplay sea fades into it
// across a seam band (SEAM_V0..SEAM_V1) behind the pier.
//
// Content (backdrop world: camera at (0, CAM_H, 0) looking down -z, sea y = 0):
//  * sky dome: matte-stretched sunset/night gradient, sun, moon, stars,
//    underlit stratus streaks, the burning town's glow on the left;
//  * the sea to the horizon: waves, Fresnel sky reflection, sun / moon
//    glitter paths, fire reflections, the departing ferry's wake;
//  * the coast receding on the left: promenade sea wall, hills, the seafront
//    (hotels, terraces, a church, a clock tower, flats, a Ferris wheel) with
//    lit / burning windows; fires; leaning smoke columns lit by the sunset
//    and by the fires underneath;
//  * the lighthouse on its rock with two rotating beams;
//  * a couple of distant ships, and the departing ferry for the victory.
import * as THREE from 'three';
import { CAMERA_FOV, DESIGN_H, DESIGN_W } from '../../config/view';
import { GeoBuilder, box, cone, cyl, sphere, torus } from './geo';
import { NOISE_GLSL, SKY_FN_GLSL, SKY_PARS_GLSL, type SkyUniforms } from './glsl';
import { mulberry32 } from './noise';

const DEG = Math.PI / 180;
const TV = Math.tan((CAMERA_FOV / 2) * DEG);
const TH = TV * (DESIGN_W / DESIGN_H);

/** Frame v (0 = top) of the backdrop horizon. */
export const HORIZON_V = 0.235;
/** The gameplay sea is fully transparent above SEAM_V0 and opaque below SEAM_V1. */
export const SEAM_V0 = 0.255;
export const SEAM_V1 = 0.35;
/** Backdrop camera height above its sea (m). */
export const CAM_H = 8;
/** tan(elevation) of the top of the frame in the backdrop. */
export const BAND_TOP = HORIZON_V * 2 * TV;

/** Direction (backdrop frame) through frame point (u, v). */
export function backdropDir(u: number, v: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set((u - 0.5) * 2 * TH, (HORIZON_V - v) * 2 * TV, -1).normalize();
}
/** Backdrop world point on the sea (y = 0) at frame u and distance d (m). */
function seaPointAt(u: number, d: number): THREE.Vector3 {
  return new THREE.Vector3((u - 0.5) * 2 * TH * d, 0, -d);
}

/** Sun / moon frame positions. */
export const SUN_U = 0.6;
// The moon sits in open sky between the passengers bar and the money panel (frame x ≈ 900 px at 1280).
export const MOON_U = 0.705;
export const MOON_TAN = 0.072;

/** Lighthouse position in the backdrop (frame u ≈ 0.2). */
export const LIGHTHOUSE = { u: 0.205, dist: 640, rockH: 13, towerH: 27 };

interface Fire {
  p: THREE.Vector3;
  size: number;
  smoke: number;
}

// ---------------------------------------------------------------- shaders

const DIR_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const SKY_FRAG = /* glsl */ `
  ${SKY_PARS_GLSL}
  uniform float uQuality;
  varying vec3 vWorld;
  ${NOISE_GLSL}
  ${SKY_FN_GLSL}
  void main() {
    vec3 d = normalize(vWorld - cameraPosition);
    float s = skyBandS(d);
    vec3 c = skyGradient(d, s * 0.82);
    float az = skyAz(d);
    float sunAz = skyAz(uSunDir);
    // --- stars (behind everything else)
    if (uStars > 0.01) {
      vec2 sc = vec2(az, d.y) * 520.0;
      vec2 cell = floor(sc);
      vec2 f = fract(sc) - 0.5;
      float h = envHash12(cell);
      vec2 o = envHash22(cell) - 0.5;
      float star = step(0.985, h) * smoothstep(0.32, 0.0, length(f - o * 0.5));
      float tw = 0.65 + 0.35 * sin(uTime * (2.0 + h * 9.0) + h * 40.0);
      float big = step(0.9975, h);
      c += vec3(0.9, 0.95, 1.1) * star * tw * (0.35 + big * 1.6) * uStars * smoothstep(0.05, 0.35, s);
      // A faint milky band.
      float mw = envFbm3(vec2(az * 6.0, d.y * 40.0) + 3.0);
      c += vec3(0.02, 0.025, 0.04) * smoothstep(0.45, 0.8, mw) * uStars * smoothstep(0.2, 0.9, s);
    }
    // --- moon
    float md = dot(d, uMoonDir);
    if (uMoon > 0.001) {
      float mr = 0.0115;
      float ang = acos(clamp(md, -1.0, 1.0));
      float disc = smoothstep(mr, mr * 0.9, ang);
      vec3 mp = d - uMoonDir * md;
      vec2 mq = vec2(mp.x, mp.y) / mr;
      float mare = envFbm3(mq * 2.2 + 4.0);
      vec3 moonCol = vec3(2.2, 2.3, 2.5) * (0.78 + 0.35 * smoothstep(0.35, 0.65, mare));
      c = mix(c, moonCol, disc * uMoon);
      c += vec3(0.25, 0.32, 0.5) * uMoon * (exp(-ang * 40.0) * 0.6 + exp(-ang * 9.0) * 0.12);
    }
    // --- sun disc + halo
    float sd = dot(d, uSunDir);
    float sang = acos(clamp(sd, -1.0, 1.0));
    float sunDisc = smoothstep(0.0215, 0.0195, sang);
    c += uSunDisc * (exp(-sang * 60.0) * 0.06 + exp(-sang * 14.0) * 0.03);
    // --- clouds: underlit stratus streaks in (azimuth, band height)
    float cl = 0.0;
    {
      vec2 q = vec2(az * 7.0 + uTime * 0.003, s * 2.6);
      vec2 w = vec2(envFbm3(q * vec2(0.6, 2.0) + 3.7), envFbm3(q * vec2(0.6, 2.0) + 9.1));
      q += (w - 0.5) * vec2(1.4, 0.5);
      float n = envFbm(q * vec2(0.9, 3.4));
      float fine = envFbm3(q * vec2(4.0, 16.0) + 5.0);
      float dens = n + (fine - 0.5) * 0.35;
      float cover = uCloudCover;
      cl = smoothstep(1.0 - cover, 1.0 - cover + 0.28, dens);
      // Thin out at the horizon and in a clear slot just above it.
      cl *= smoothstep(0.03, 0.22, s) * (0.55 + 0.45 * smoothstep(0.15, 0.6, s));
      float dAz = az - sunAz;
      float nearSun = exp(-dAz * dAz / 0.35);
      // Lit from below: lower clouds and the edges facing the sun glow.
      float edge = 1.0 - smoothstep(0.0, 0.6, cl);
      float lit = clamp(nearSun * (1.1 - 0.6 * s) + 0.25 + edge * nearSun * 0.8, 0.0, 1.6);
      vec3 cc = mix(uCloudDark, uCloudLit, clamp(lit * (0.55 + 0.45 * fine), 0.0, 1.4));
      float ta = az + 0.33;
      cc += uTownGlow * 0.16 * exp(-ta * ta / 0.06) * (1.0 - 0.6 * s);
      // Moonlit rims at night.
      cc += vec3(0.05, 0.06, 0.1) * uMoon * edge * exp(-pow(az - skyAz(uMoonDir), 2.0) / 0.08);
      c = mix(c, cc, cl * 0.92);
    }
    c += uSunDisc * sunDisc * (1.0 - cl * 0.9) * step(0.0, d.y);
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const SEA_FRAG = /* glsl */ `
  ${SKY_PARS_GLSL}
  uniform vec3 uSeaDeep, uSeaShallow;
  uniform float uGlitter;
  uniform vec4 uFires[8];
  uniform vec4 uWake; // x, z, strength, unused
  uniform vec4 uBeam; // lighthouse: dir azimuth of the beam facing us, strength
  varying vec3 vWorld;
  ${NOISE_GLSL}
  ${SKY_FN_GLSL}
  void main() {
    vec3 V = vWorld - cameraPosition;
    float dist = length(V);
    vec3 d = V / dist;
    vec2 p = vWorld.xz;
    // Wave slopes, fading high frequencies with distance (no aliasing on the horizon).
    float lod = clamp(dist / 2500.0, 0.0, 1.0);
    vec3 n1 = envNoiseD(p * vec2(0.016, 0.045) + vec2(uTime * 0.03, uTime * 0.01));
    vec3 n2 = envNoiseD(p * vec2(0.05, 0.13) + vec2(-uTime * 0.05, uTime * 0.04) + 7.0);
    vec3 n3 = envNoiseD(p * vec2(0.18, 0.42) + vec2(uTime * 0.11, -uTime * 0.07) + 13.0);
    // A cross-swell at an angle and slow large patches of calmer / rougher water break up
    // the evenly spaced horizontal bands the stretched octaves alone make.
    vec2 pr = mat2(0.8, -0.6, 0.6, 0.8) * p;
    vec3 n4 = envNoiseD(pr * vec2(0.03, 0.06) + vec2(uTime * 0.02, -uTime * 0.03) + 23.0);
    float patchK = 0.45 + 1.1 * envNoise(p * vec2(0.0035, 0.009) + vec2(uTime * 0.004, 31.0));
    vec2 g4 = mat2(0.8, 0.6, -0.6, 0.8) * (n4.yz * vec2(0.03, 0.06));
    vec2 grad = n1.yz * vec2(0.016, 0.045) * 1.6
              + g4 * 0.7
              + (n2.yz * vec2(0.05, 0.13) * 0.55 * (1.0 - lod * 0.7)
              + n3.yz * vec2(0.18, 0.42) * 0.1 * (1.0 - lod)) * patchK;
    grad *= vec2(1.0, 1.5);
    vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));
    vec3 R = reflect(d, N);
    R.y = abs(R.y);
    float ndv = max(dot(N, -d), 0.0);
    float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
    vec3 refl = skyBand(R);
    vec3 col = mix(uSeaDeep, refl, clamp(fres, 0.0, 1.0));
    // Sun glitter path.
    float sd = max(dot(R, uSunDir), 0.0);
    float glit = pow(sd, 900.0) * 18.0 + pow(sd, 120.0) * 1.2 + pow(sd, 20.0) * 0.08;
    col += uSunDisc * glit * uGlitter * 0.16 * step(0.0, uSunDir.y + 0.01);
    // Moon glitter path.
    float md = max(dot(R, uMoonDir), 0.0);
    // Narrow and broken into glints by the waves (a broad term here blooms into a white band).
    col += vec3(0.85, 0.95, 1.2) * (pow(md, 1400.0) * 2.0 + pow(md, 160.0) * 0.05) * uMoon * uGlitter;
    // Fire reflections: wobbly orange streaks below each fire.
    float az = skyAz(d);
    for (int i = 0; i < 8; i++) {
      vec4 f = uFires[i];
      if (f.w <= 0.0) continue;
      vec3 fd = vec3(f.x, 0.0, f.z) - cameraPosition;
      float faz = atan(fd.x, -fd.z);
      float fdist = length(fd.xz);
      float da = (az - faz + grad.x * 0.4) * fdist / 30.0;
      float streak = exp(-da * da) * smoothstep(fdist * 1.02, fdist * 0.55, dist) * smoothstep(fdist * 0.15, fdist * 0.6, dist);
      col += vec3(1.6, 0.42, 0.08) * f.w * streak * (0.35 + 0.65 * smoothstep(0.4, 0.8, n2.x)) * 0.5;
    }
    // Wake of the departing ferry (a V of foam behind it).
    if (uWake.z > 0.0) {
      vec2 w = p - uWake.xy;
      float back = w.y; // the ferry heads to -z: the wake trails to +z
      float side = abs(w.x - back * 0.12);
      float vw = exp(-pow(side - back * 0.18, 2.0) / (6.0 + back * 0.4)) * smoothstep(0.0, 20.0, back) * exp(-back / 600.0);
      float centre = exp(-side * side / (40.0 + back)) * smoothstep(-10.0, 30.0, back) * exp(-back / 300.0);
      float foam = (vw + centre * 0.6) * (0.5 + 0.5 * envNoise(p * 0.15 + uTime * 0.3));
      col = mix(col, uHaze * 0.5 + vec3(0.08), clamp(foam * uWake.z, 0.0, 0.7));
    }
    // Lighthouse beam glint on the water when it sweeps towards us.
    col += vec3(1.0, 0.95, 0.8) * uBeam.w * exp(-pow((az - uBeam.x) * 5.0, 2.0)) * pow(fres, 0.5) * 0.25;
    // Haze toward the horizon.
    float hz = smoothstep(300.0, 9000.0, dist);
    col = mix(col, uHaze, hz * 0.85);
    // Keep the HDR glints in a range the bloom can carry without smearing.
    col = min(col, vec3(4.0));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Coast, town, hills, rock, ships: silhouettes with lit windows and fire light. */
const TOWN_VERT = /* glsl */ `
  attribute vec3 color;
  attribute vec4 aInfo; // seed, kind (0 wall, 1 roof, 2 ground, 3 rock, 4 bulb), litFrac, warmth
  varying vec3 vColor;
  varying vec4 vInfo;
  varying vec2 vUv2;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vColor = color;
    vInfo = aInfo;
    vUv2 = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const TOWN_FRAG = /* glsl */ `
  ${SKY_PARS_GLSL}
  uniform vec4 uFires[8];
  uniform float uWindows, uFireFlicker;
  uniform vec3 uAmbient, uRim;
  varying vec3 vColor;
  varying vec4 vInfo;
  varying vec2 vUv2;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  ${NOISE_GLSL}
  void main() {
    vec3 V = vWorld - cameraPosition;
    float dist = length(V);
    vec3 N = normalize(vNormalW);
    float kind = vInfo.y;
    // Sky light: a little from above, rim from the sun's side.
    vec3 base = vColor * (uAmbient * (0.55 + 0.45 * max(N.y, 0.0)) + uRim * max(dot(N, normalize(vec3(uSunDir.x, 0.25, uSunDir.z))), 0.0));
    vec3 col = base;
    // Fire light (orange, flickering), from each fire.
    vec3 fl = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      vec4 f = uFires[i];
      if (f.w <= 0.0) continue;
      vec3 L = f.xyz - vWorld;
      float ld = length(L);
      float k = f.w * 900.0 / (ld * ld + 400.0);
      float fk = 0.8 + 0.2 * sin(uTime * (7.0 + float(i)) + float(i) * 3.0) * uFireFlicker;
      fl += vec3(1.0, 0.35, 0.08) * k * fk * (0.3 + 0.7 * max(dot(N, L / ld), 0.0));
    }
    col += vColor * fl * 1.4 + fl * 0.05;
    // Windows on walls.
    if (kind < 0.5) {
      vec2 g = vUv2 / vec2(2.6, 3.2);
      vec2 cell = floor(g);
      vec2 f = fract(g);
      float win = step(0.3, f.x) * step(f.x, 0.75) * step(0.3, f.y) * step(f.y, 0.8);
      float h = envHash12(cell + vInfo.x * 17.0);
      float lit = step(h, vInfo.z * uWindows);
      float flick = 0.75 + 0.25 * sin(uTime * (1.0 + h * 5.0) + h * 30.0);
      // Burning rooms: orange and bright near fires.
      float hot = clamp(length(fl) * 0.6, 0.0, 1.0);
      vec3 wc = mix(vec3(1.6, 1.0, 0.45), vec3(4.0, 1.2, 0.25), hot * step(0.5, envHash12(cell * 1.7 + vInfo.x)));
      // Far away the grid is sub-pixel: use its average.
      float px = dist / 900.0;
      float avgWin = 0.17 * vInfo.z * uWindows;
      float w = mix(win * lit * flick, avgWin, smoothstep(0.6, 2.2, px));
      col += wc * w * (0.6 + 0.4 * vInfo.w);
    } else if (kind > 3.5) {
      // Light bulbs (Ferris wheel, ship lights): emissive colour in vColor.
      float h = envHash12(vec2(vInfo.x, 3.0));
      float on = step(0.25, h) * (0.6 + 0.4 * step(0.5, sin(uTime * (1.5 + h * 4.0) + h * 20.0)));
      col = vColor * on * uWindows * 3.0;
    }
    // Haze.
    float hz = smoothstep(200.0, 5000.0, dist);
    col = mix(col, uHaze, hz * 0.8);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const SMOKE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SMOKE_FRAG = /* glsl */ `
  uniform float uTime, uSeed, uLean, uFire, uAlpha;
  uniform vec3 uLit, uDark, uFireCol, uHaze;
  uniform float uSunSide;
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main() {
    float v = vUv.y;
    float cx = 0.2 + uLean * pow(v, 1.6) * 0.6;
    float width = mix(0.03, 0.2, pow(v, 0.75));
    float x = (vUv.x - cx) / width;
    float prof = exp(-x * x * 1.3);
    vec2 q = vec2((vUv.x - cx) * 5.0 / (0.4 + v), v * 5.0 - uTime * 0.035) + uSeed;
    float n = envFbm(q + vec2(envFbm3(q * 0.7 + 2.0) * 1.5, 0.0));
    float dens = prof * smoothstep(0.22, 0.58, n * 0.75 + prof * 0.5);
    dens *= smoothstep(1.0, 0.55, v) * smoothstep(0.0, 0.03, v);
    // Light: the sunward side brighter; fire underglow at the base.
    float side = clamp(0.5 + x * 0.35 * uSunSide, 0.0, 1.0);
    float shade = clamp(side * (0.6 + 0.6 * n), 0.0, 1.2);
    vec3 col = mix(uDark, uLit, shade);
    col += uFireCol * uFire * (exp(-v * 9.0) * 1.6 + exp(-v * 3.0) * 0.25) * (0.6 + 0.4 * n);
    col = mix(col, uHaze, 0.25 * v);
    float a = clamp(dens * uAlpha, 0.0, 1.0);
    gl_FragColor = vec4(col * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const FLAME_FRAG = /* glsl */ `
  uniform float uTime, uSeed, uLevel;
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main() {
    vec2 uv = vUv;
    float x = (uv.x - 0.5) * 2.0;
    float n = envFbm3(vec2(uv.x * 4.0 + uSeed, uv.y * 3.0 - uTime * 1.6));
    float n2 = envNoise(vec2(uv.x * 9.0 - uSeed, uv.y * 6.0 - uTime * 2.6));
    float shape = (1.0 - uv.y) * (1.0 - x * x * 1.2) + (n - 0.5) * 0.9 + (n2 - 0.5) * 0.3;
    float f = smoothstep(0.08, 0.5, shape);
    float core = smoothstep(0.45, 0.95, shape);
    vec3 col = mix(vec3(2.4, 0.5, 0.06), vec3(6.0, 3.0, 0.8), core) * f;
    gl_FragColor = vec4(col * uLevel, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const BEAM_VERT = /* glsl */ `
  varying float vAlong;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vAlong = uv.y;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const BEAM_FRAG = /* glsl */ `
  uniform float uLevel;
  uniform vec3 uColor;
  varying float vAlong;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float f = abs(dot(normalize(vN), normalize(vV)));
    float core = pow(f, 4.0);
    float along = (1.0 - vAlong);
    float k = core * pow(along, 1.6) * uLevel;
    gl_FragColor = vec4(uColor * k, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const GLOW_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uLevel;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float g = exp(-r * r * 9.0) + 0.25 * exp(-r * 3.5);
    // Horizontal anamorphic streak.
    g += exp(-abs(p.y) * 40.0) * exp(-abs(p.x) * 2.5) * 0.35;
    g *= smoothstep(1.0, 0.8, r);
    gl_FragColor = vec4(uColor * g * uLevel, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const additive = (frag: string, uniforms: Record<string, THREE.IUniform>, vert = SMOKE_VERT) =>
  new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

export interface BackdropState {
  /** Lighthouse lantern / beam level 0..1. */
  lighthouse: number;
  /** Lighthouse rotation angle (rad). */
  beamAngle: number;
  windows: number;
}

export class Backdrop {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera();
  readonly fires: Fire[] = [];
  private skyMat: THREE.ShaderMaterial;
  private seaMat: THREE.ShaderMaterial;
  private townMat: THREE.ShaderMaterial;
  private smokes: Array<{ mesh: THREE.Mesh; mat: THREE.ShaderMaterial }> = [];
  private flames: Array<{ mesh: THREE.Mesh; mat: THREE.ShaderMaterial; base: number }> = [];
  private beams: THREE.Mesh[] = [];
  private beamMat: THREE.ShaderMaterial;
  private lantern: THREE.Mesh;
  private lanternMat: THREE.ShaderMaterial;
  private beamPivot = new THREE.Group();
  readonly lighthousePos: THREE.Vector3;
  readonly lanternPos: THREE.Vector3;
  /** The departing ferry (victory). */
  readonly ferry = new THREE.Group();
  private fireUniform: THREE.Vector4[] = [];
  private wheel = new THREE.Group();
  /** 0..1 departure progress for the backdrop ferry. */
  departure = 0;
  /** Debug multiplier on the sky beams. */
  beamBoost = 1;

  constructor(
    private sky: SkyUniforms,
    seaU: { uSeaDeep: { value: THREE.Vector3 }; uSeaShallow: { value: THREE.Vector3 }; uGlitter: { value: number } },
    quality: 'low' | 'medium' | 'high',
  ) {
    const near = 1;
    this.camera.position.set(0, CAM_H, 0);
    this.camera.lookAt(0, CAM_H, -1);
    this.camera.updateMatrixWorld();
    this.camera.projectionMatrix.makePerspective(-TH * near, TH * near, BAND_TOP * near, -(1 - HORIZON_V) * 2 * TV * near, near, 40000);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.camera.matrixAutoUpdate = false;

    for (let i = 0; i < 8; i++) this.fireUniform.push(new THREE.Vector4(0, 0, 0, 0));

    // Sky dome.
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { ...sky, uQuality: { value: quality === 'low' ? 0 : 1 } },
      vertexShader: DIR_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(30000, 48, 24), this.skyMat);
    dome.position.copy(this.camera.position);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.scene.add(dome);

    // Sea.
    this.seaMat = new THREE.ShaderMaterial({
      uniforms: {
        ...sky,
        ...seaU,
        uFires: { value: this.fireUniform },
        uWake: { value: new THREE.Vector4(0, 0, 0, 0) },
        uBeam: { value: new THREE.Vector4(0, 0, 0, 0) },
      },
      vertexShader: DIR_VERT,
      fragmentShader: SEA_FRAG,
      depthWrite: true,
    });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(80000, 40000).rotateX(-Math.PI / 2).translate(0, 0, -20000 + 50), this.seaMat);
    sea.renderOrder = -9;
    sea.frustumCulled = false;
    this.scene.add(sea);

    // Town / coast / hills / rocks.
    this.townMat = new THREE.ShaderMaterial({
      uniforms: {
        ...sky,
        uFires: { value: this.fireUniform },
        uWindows: { value: 1 },
        uFireFlicker: { value: 1 },
        uAmbient: { value: new THREE.Vector3(0.1, 0.08, 0.1) },
        uRim: { value: new THREE.Vector3(0.3, 0.15, 0.08) },
      },
      vertexShader: TOWN_VERT,
      fragmentShader: TOWN_FRAG,
    });
    this.buildCoast();

    // Lighthouse.
    const lh = seaPointAt(LIGHTHOUSE.u, LIGHTHOUSE.dist);
    this.lighthousePos = lh;
    this.lanternPos = lh.clone().add(new THREE.Vector3(0, LIGHTHOUSE.rockH + LIGHTHOUSE.towerH + 1.5, 0));
    this.buildLighthouse(lh);
    this.lanternMat = additive(GLOW_FRAG, { uColor: { value: new THREE.Color(3, 2.6, 1.8) }, uLevel: { value: 1 } });
    this.lantern = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.lanternMat);
    this.lantern.position.copy(this.lanternPos).add(new THREE.Vector3(0, 0, 3));
    this.lantern.scale.setScalar(17);
    this.lantern.renderOrder = 5;
    this.scene.add(this.lantern);
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { uLevel: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.92, 0.75) } },
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const beamLen = 2400;
    const beamGeo = new THREE.CylinderGeometry(70, 1.2, beamLen, 20, 1, true);
    // uv.y: 0 at the lantern, 1 at the far end.
    {
      const uv = beamGeo.attributes.uv as THREE.BufferAttribute;
      const pos = beamGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 0.5 + pos.getY(i) / beamLen);
    }
    beamGeo.rotateX(-Math.PI / 2).translate(0, 0, -beamLen / 2);
    this.beamPivot.position.copy(this.lanternPos);
    for (let k = 0; k < 2; k++) {
      const b = new THREE.Mesh(beamGeo, this.beamMat);
      b.rotation.y = k * Math.PI;
      b.renderOrder = 4;
      b.frustumCulled = false;
      this.beamPivot.add(b);
      this.beams.push(b);
    }
    this.scene.add(this.beamPivot);

    // Fires, smoke.
    this.buildFires();
    // Distant ships + the departing ferry.
    this.buildShips();
    this.buildFerry();
  }

  // ------------------------------------------------------------------ coast

  private buildCoast(): void {
    const rnd = mulberry32(1987);
    const gb = new GeoBuilder({ aInfo: 4 });
    /** A building: `along` m of facade along the shore, `inland` m deep, metre UVs for windows. */
    const wall = (along: number, h: number, inland: number, x: number, z: number, rotY: number, color: THREE.ColorRepresentation, seed: number, lit: number, warm = 0.5, y0 = 0) => {
      const g = box(inland, h, along);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      const nor = g.attributes.normal as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) {
        const nx = Math.abs(nor.getX(i));
        const nz = Math.abs(nor.getZ(i));
        // Roofs get u = 0 (no window column there).
        const su = nx > 0.5 ? along : nz > 0.5 ? inland : 0;
        uv.setXY(i, uv.getX(i) * su, uv.getY(i) * h);
      }
      gb.add(g, color, { p: [x, y0 + h / 2, z], r: [0, rotY, 0] }, { aInfo: [seed, 0, lit, warm] });
    };
    const roof = (w: number, h: number, d: number, x: number, y: number, z: number, rotY: number, color: THREE.ColorRepresentation) => {
      // Gable prism along local x.
      const shape = new THREE.Shape();
      shape.moveTo(-d / 2, 0);
      shape.lineTo(d / 2, 0);
      shape.lineTo(0, h);
      shape.lineTo(-d / 2, 0);
      const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
      g.translate(0, 0, -w / 2);
      g.rotateY(Math.PI / 2);
      gb.add(g, color, { p: [x, y, z], r: [0, rotY, 0] }, { aInfo: [0, 1, 0, 0] });
    };

    // Shoreline: from just left of the frame, receding to the horizon.
    const shoreAt = (s: number) => {
      const u = -0.06 + 0.29 * Math.pow(s, 0.75);
      const d = 280 * Math.exp(s * Math.log(14));
      return seaPointAt(u, d);
    };
    // Sea wall + promenade (a long low dark band) and the hills behind.
    const N = 60;
    for (let i = 0; i < N; i++) {
      const a = shoreAt(i / N);
      const b = shoreAt((i + 1) / N);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const len = a.distanceTo(b) + 2;
      const ang = Math.atan2(b.x - a.x, b.z - a.z);
      const wallCol = new THREE.Color(0.32, 0.3, 0.3);
      gb.add(box(9, 4.5, len), wallCol, { p: [mid.x - 3, 2.25, mid.z], r: [0, ang, 0] }, { aInfo: [0, 3, 0, 0] });
      // Ground behind the promenade.
      gb.add(box(260, 4, len), new THREE.Color(0.12, 0.11, 0.1), { p: [mid.x - 135, 2.0, mid.z], r: [0, ang, 0] }, { aInfo: [0, 2, 0, 0] });
    }
    // Hills: two smooth ridge curtains inland (rolling silhouettes, not boxes).
    for (const [back, h0, h1, col] of [
      [200, 30, 70, new THREE.Color(0.075, 0.07, 0.075)],
      [480, 60, 120, new THREE.Color(0.06, 0.06, 0.07)],
    ] as Array<[number, number, number, THREE.Color]>) {
      const M = 90;
      const pos: number[] = [];
      const nor: number[] = [];
      const ridge = (t: number) => {
        const p = shoreAt(t);
        const ang = Math.atan2(shoreAt(t + 0.01).x - p.x, shoreAt(t + 0.01).z - p.z);
        const x = p.x + back * Math.cos(ang);
        const z = p.z - back * Math.sin(ang);
        const h = h0 + (h1 - h0) * (0.5 + 0.5 * Math.sin(t * 9.0 + back)) * (0.6 + 0.4 * Math.sin(t * 23.0 + 1.7)) + t * h1 * 0.6;
        return new THREE.Vector3(x, h, z);
      };
      for (let i = 0; i < M; i++) {
        const a = ridge((i / M) * 1.1);
        const b = ridge(((i + 1) / M) * 1.1);
        const quad = [
          [a.x, 0, a.z],
          [b.x, 0, b.z],
          [b.x, b.y, b.z],
          [a.x, 0, a.z],
          [b.x, b.y, b.z],
          [a.x, a.y, a.z],
        ];
        for (const v of quad) {
          pos.push(v[0], v[1], v[2]);
          nor.push(0.3, 0.2, 1);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      gb.add(g, col, {}, { aInfo: [0, 2, 0, 0] });
    }
    // Seafront buildings.
    let s = 0.0;
    let seed = 1;
    const palette = [0xb9a68a, 0xd8c7a6, 0x9a8c7c, 0xc2a5a0, 0x8f9aa2, 0xa89a72, 0xd0d0c4, 0x9e7e6a];
    while (s < 1) {
      const p = shoreAt(s);
      const d = -p.z;
      const scale = 1;
      const ang = Math.atan2(shoreAt(s + 0.01).x - p.x, shoreAt(s + 0.01).z - p.z);
      const kindR = rnd();
      const col = new THREE.Color(palette[Math.floor(rnd() * palette.length)]).multiplyScalar(0.55 + rnd() * 0.3);
      const inland = 14 + rnd() * 10;
      const bx = p.x + inland * Math.cos(ang);
      const bz = p.z - inland * Math.sin(ang);
      const front = 12 + rnd() * 18;
      const depth = 12 + rnd() * 10;
      let h = 10 + rnd() * 14;
      const lit = 0.25 + rnd() * 0.35;
      if (kindR < 0.12) {
        // Block of flats.
        h = 28 + rnd() * 18;
        wall(front, h, depth, bx, bz, ang, col.clone().multiplyScalar(0.8), seed++, lit + 0.1);
      } else if (kindR < 0.18 && d < 1500) {
        // Church with a spire.
        wall(12, 14, 26, bx, bz, ang, col, seed++, 0.15);
        roof(26, 7, 12, bx, 14, bz, ang, 0x3a3436);
        wall(6, 26, 6, bx + 3, bz - 13, ang, col, seed++, 0.1);
        gb.add(cone(4.4, 22, 4), 0x3a3436, { p: [bx + 3, 26 + 11, bz - 13], r: [0, Math.PI / 4 + ang, 0] }, { aInfo: [0, 1, 0, 0] });
      } else if (kindR < 0.24 && d < 1800) {
        // Clock tower.
        wall(7, 30, 7, bx, bz, ang, col, seed++, 0.2);
        gb.add(cone(5.5, 8, 4), 0x2e3a3a, { p: [bx, 34, bz], r: [0, Math.PI / 4 + ang, 0] }, { aInfo: [0, 1, 0, 0] });
        gb.add(cyl(2.2, 2.2, 0.4, 14), new THREE.Color(3.0, 2.5, 1.6), { p: [bx + 3.6, 25, bz], r: [0, 0, Math.PI / 2] }, { aInfo: [seed, 4, 0, 0] });
      } else {
        // Seafront terrace / hotel with gables.
        const n = 2 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) {
          const off = (k - (n - 1) / 2) * (front / n);
          const ox = bx + Math.sin(ang) * off;
          const oz = bz + Math.cos(ang) * off;
          const hk = h + (rnd() - 0.5) * 3;
          wall(front / n + 0.2, hk, depth, ox, oz, ang, col.clone().multiplyScalar(0.9 + rnd() * 0.2), seed++, lit);
          if (rnd() < 0.7) roof(front / n, 4 + rnd() * 3, depth, ox, hk, oz, ang + Math.PI / 2, 0x3b2f2e);
          if (rnd() < 0.5) gb.add(box(1, 3, 1), 0x4a3a34, { p: [ox + 2, hk + 3, oz], r: [0, ang, 0] }, { aInfo: [0, 1, 0, 0] });
        }
      }
      // Second row behind (taller, darker).
      if (rnd() < 0.8) {
        const back = 30 + rnd() * 30;
        const bx2 = bx + back * Math.cos(ang);
        const bz2 = bz - back * Math.sin(ang);
        wall(14 + rnd() * 16, 14 + rnd() * 22, 14, bx2, bz2, ang, col.clone().multiplyScalar(0.7), seed++, lit * 0.8);
      }
      s += (front + 6) / (d * 1.2) * 0.9 * scale * 0.06 + 0.008;
    }
    // Hillside houses (tiny lights at night).
    for (let i = 0; i < 70; i++) {
      const t = rnd();
      const p = shoreAt(t);
      const back = 80 + rnd() * 220;
      const hx = p.x - back;
      const hz = p.z - 40 + (rnd() - 0.5) * 60;
      const hy = 4 + rnd() * 40;
      wall(8, 6, 8, hx, hz, 0, new THREE.Color(0.2, 0.18, 0.17), seed++, 0.5, 0.4, hy);
    }
    // Ferris wheel on the promenade (stopped; a few bulbs still alive).
    {
      const p = shoreAt(0.16);
      const cx = p.x - 8;
      const cz = p.z;
      const R = 22;
      const hub = R + 6;
      const wb = new GeoBuilder({ aInfo: 4 });
      const dark = new THREE.Color(0.16, 0.16, 0.18);
      wb.add(torus(R, 0.5, 4, 48), dark, {}, { aInfo: [0, 3, 0, 0] });
      wb.add(torus(R - 1.6, 0.3, 4, 48), dark, {}, { aInfo: [0, 3, 0, 0] });
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        wb.add(box(0.35, R, 0.35), dark, { p: [Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, 0], r: [0, 0, a - Math.PI / 2] }, { aInfo: [0, 3, 0, 0] });
        // Gondolas hang straight down.
        wb.add(box(2.2, 2.4, 2.0), new THREE.Color(0.35, 0.12, 0.1), { p: [Math.cos(a) * R, Math.sin(a) * R - 1.8, 0] }, { aInfo: [0, 3, 0, 0] });
      }
      for (let k = 0; k < 48; k++) {
        const a = (k / 48) * Math.PI * 2;
        const c = [new THREE.Color(1.0, 0.75, 0.3), new THREE.Color(1.0, 0.3, 0.3), new THREE.Color(0.4, 0.8, 1.0)][k % 3];
        wb.add(sphere(0.45, 4, 3), c, { p: [Math.cos(a) * (R + 0.6), Math.sin(a) * (R + 0.6), 0.4] }, { aInfo: [k * 1.37, 4, 0, 0] });
      }
      wb.add(box(0.8, 0.8, 4), dark, {}, { aInfo: [0, 3, 0, 0] });
      const wheelMesh = wb.mesh(this.townMat, 'FerrisWheel');
      this.wheel.add(wheelMesh);
      this.wheel.position.set(cx, hub, cz);
      this.wheel.rotation.y = 0.5;
      this.scene.add(this.wheel);
      // A-frame legs.
      for (const sgn of [-1, 1]) {
        for (const lean of [-1, 1]) {
          const leg = new THREE.Mesh(box(0.7, hub + 2, 0.7), this.townMat);
          leg.position.set(cx + lean * 6, hub / 2, cz + sgn * 2.5);
          leg.rotation.set(0, 0.5, lean * 0.22);
          setInfo(leg.geometry, [0, 3, 0, 0], dark);
          this.scene.add(leg);
        }
      }
    }
    // The lighthouse rock and some outcrops.
    const coast = gb.mesh(this.townMat, 'Coast');
    coast.frustumCulled = false;
    this.scene.add(coast);
  }

  private buildLighthouse(base: THREE.Vector3): void {
    const gb = new GeoBuilder({ aInfo: 4 });
    const rnd = mulberry32(77);
    const rockCol = new THREE.Color(0.16, 0.14, 0.13);
    // Rock: a few squashed lumps.
    for (let i = 0; i < 7; i++) {
      const r = 10 + rnd() * 12;
      const r0 = 7 + rnd() * 7;
      const g = new THREE.SphereGeometry(1, 10, 6);
      g.scale(r0 * (1.2 + rnd() * 0.6), LIGHTHOUSE.rockH * (0.55 + rnd() * 0.5), r0);
      void r;
      gb.add(g, rockCol.clone().multiplyScalar(0.8 + rnd() * 0.4), { p: [(rnd() - 0.5) * 26, 0, (rnd() - 0.5) * 16] }, { aInfo: [0, 3, 0, 0] });
    }
    const y0 = LIGHTHOUSE.rockH;
    const H = LIGHTHOUSE.towerH;
    // Tower with red bands.
    const bands = 5;
    for (let i = 0; i < bands; i++) {
      const t0 = i / bands;
      const t1 = (i + 1) / bands;
      const r0 = 3.4 - t0 * 1.3;
      const r1 = 3.4 - t1 * 1.3;
      const col = i % 2 === 0 ? new THREE.Color(0.85, 0.83, 0.78) : new THREE.Color(0.62, 0.1, 0.08);
      gb.add(cyl(r1, r0, H / bands, 14), col, { p: [0, y0 + (t0 + t1) * 0.5 * H, 0] }, { aInfo: [0, 3, 0, 0] });
    }
    // Gallery, lantern room, cap.
    gb.add(cyl(2.9, 2.9, 0.6, 14), 0x222222, { p: [0, y0 + H + 0.3, 0] }, { aInfo: [0, 3, 0, 0] });
    gb.add(cyl(1.7, 1.7, 2.6, 10), new THREE.Color(2.4, 2.1, 1.4), { p: [0, y0 + H + 1.9, 0] }, { aInfo: [5, 4, 0, 0] });
    gb.add(cone(2.1, 1.8, 10), 0x1c1c1c, { p: [0, y0 + H + 4.1, 0] }, { aInfo: [0, 3, 0, 0] });
    // Keeper's cottage.
    gb.add(box(9, 4, 6), new THREE.Color(0.7, 0.68, 0.62), { p: [9, y0 + 0.5, 3] }, { aInfo: [3, 0, 0.6, 0.8] });
    gb.add(box(9.5, 0.5, 6.5), 0x2a2222, { p: [9, y0 + 2.8, 3] }, { aInfo: [0, 1, 0, 0] });
    const m = gb.mesh(this.townMat, 'Lighthouse');
    m.position.copy(base);
    m.frustumCulled = false;
    this.scene.add(m);
  }

  private buildFires(): void {
    const shore = (s: number) => {
      const u = -0.06 + 0.29 * Math.pow(s, 0.75);
      const d = 280 * Math.exp(s * Math.log(14));
      return seaPointAt(u, d);
    };
    const specs: Array<[number, number, number, number]> = [
      // s along the coast, inland offset, size, smoke column scale (0 = none)
      [0.02, 30, 22, 1.25],
      [0.09, 16, 12, 0],
      [0.16, 40, 26, 1.0],
      [0.27, 25, 14, 0.7],
      [0.38, 60, 30, 0.9],
      [0.55, 40, 22, 0],
      [0.7, 90, 40, 0.6],
    ];
    let i = 0;
    for (const [s, inland, size, smoke] of specs) {
      const p = shore(s);
      p.x -= inland;
      // Fires burn on the roofs / upper floors so the flames show over the seafront.
      p.y = 8 + size * 0.45;
      this.fires.push({ p, size, smoke });
      if (i < 8) this.fireUniform[i].set(p.x, p.y + size * 0.5, p.z, 1);
      // Flame billboard (faces the camera).
      const fm = additive(FLAME_FRAG, { uTime: { value: 0 }, uSeed: { value: i * 3.7 }, uLevel: { value: 1 } });
      const flame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), fm);
      flame.position.copy(p);
      flame.scale.set(size * 1.6, size * 1.3, 1);
      flame.lookAt(this.camera.position.x, p.y, this.camera.position.z);
      flame.renderOrder = 3;
      this.scene.add(flame);
      this.flames.push({ mesh: flame, mat: fm, base: size });
      if (smoke > 0) {
        const H = 420 * smoke;
        const W = H * 0.9;
        const sm = new THREE.ShaderMaterial({
          uniforms: {
            uTime: { value: 0 },
            uSeed: { value: i * 11.3 },
            uLean: { value: 1 },
            uFire: { value: 1 },
            uAlpha: { value: 0.95 },
            uLit: { value: new THREE.Vector3(0.5, 0.3, 0.25) },
            uDark: { value: new THREE.Vector3(0.08, 0.06, 0.07) },
            uFireCol: { value: new THREE.Vector3(2.2, 0.6, 0.12) },
            uHaze: { value: new THREE.Vector3(0.5, 0.3, 0.3) },
            uSunSide: { value: 1 },
          },
          vertexShader: SMOKE_VERT,
          fragmentShader: SMOKE_FRAG,
          transparent: true,
          depthWrite: false,
          blending: THREE.CustomBlending,
          blendSrc: THREE.OneFactor,
          blendDst: THREE.OneMinusSrcAlphaFactor,
        });
        const g = new THREE.PlaneGeometry(W, H).translate(W * 0.3, H / 2, 0);
        const mesh = new THREE.Mesh(g, sm);
        mesh.position.copy(p);
        mesh.position.y = 0;
        mesh.lookAt(this.camera.position.x, 0, this.camera.position.z);
        mesh.renderOrder = 2;
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        this.smokes.push({ mesh, mat: sm });
      }
      i++;
    }
  }

  private buildShips(): void {
    // A distant container ship on the horizon and a burning tanker.
    const gb = new GeoBuilder({ aInfo: 4 });
    const ship = (u: number, d: number, len: number, col: THREE.ColorRepresentation, lights: boolean) => {
      const p = seaPointAt(u, d);
      gb.add(box(len, 7, 14), col, { p: [p.x, 3, p.z] }, { aInfo: [0, 3, 0, 0] });
      gb.add(box(len * 0.18, 12, 12), col, { p: [p.x + len * 0.36, 12, p.z] }, { aInfo: [91 + u, 0, 0.6, 0.6] });
      for (let k = 0; k < 6; k++) gb.add(box(len * 0.1, 4 + (k % 3), 12), new THREE.Color(0.25 + 0.1 * (k % 2), 0.12, 0.1), { p: [p.x - len * 0.35 + k * len * 0.11, 8, p.z] }, { aInfo: [0, 3, 0, 0] });
      if (lights) {
        gb.add(sphere(1.4, 4, 3), new THREE.Color(1.5, 0.2, 0.15), { p: [p.x - len * 0.5, 9, p.z] }, { aInfo: [3.3, 4, 0, 0] });
        gb.add(sphere(1.4, 4, 3), new THREE.Color(1.6, 1.5, 1.2), { p: [p.x + len * 0.36, 20, p.z] }, { aInfo: [7.9, 4, 0, 0] });
      }
    };
    ship(0.44, 4200, 120, new THREE.Color(0.12, 0.12, 0.14), true);
    ship(0.97, 5200, 90, new THREE.Color(0.1, 0.1, 0.12), true);
    const m = gb.mesh(this.townMat, 'Ships');
    m.frustumCulled = false;
    this.scene.add(m);
  }

  private buildFerry(): void {
    // Silhouette version of the ferry for the departure (seen from behind).
    const gb = new GeoBuilder({ aInfo: 4 });
    const hull = new THREE.Color(0.1, 0.14, 0.22);
    gb.add(box(14, 7, 56), hull, { p: [0, 2.5, 0] }, { aInfo: [0, 3, 0, 0] });
    gb.add(box(14.2, 1.2, 56.2), new THREE.Color(0.55, 0.1, 0.08), { p: [0, -0.4, 0] }, { aInfo: [0, 3, 0, 0] });
    gb.add(box(12, 5, 30), new THREE.Color(0.75, 0.74, 0.7), { p: [0, 8.5, -2] }, { aInfo: [41, 0, 0.85, 1] });
    gb.add(box(10, 3.5, 12), new THREE.Color(0.75, 0.74, 0.7), { p: [0, 12.7, -8] }, { aInfo: [42, 0, 0.85, 1] });
    gb.add(cyl(1.8, 2.1, 7, 10), new THREE.Color(0.65, 0.12, 0.08), { p: [0, 16, 2] }, { aInfo: [0, 3, 0, 0] });
    gb.add(cyl(1.85, 1.85, 1.4, 10), 0x111111, { p: [0, 19.6, 2] }, { aInfo: [0, 3, 0, 0] });
    // Nav / deck lights.
    gb.add(sphere(1.1, 4, 3), new THREE.Color(3.0, 2.7, 2.0), { p: [0, 22, -10] }, { aInfo: [12.1, 4, 0, 0] });
    gb.add(sphere(0.9, 4, 3), new THREE.Color(3.0, 2.6, 1.8), { p: [0, 12, 26] }, { aInfo: [12.9, 4, 0, 0] });
    gb.add(sphere(0.6, 4, 3), new THREE.Color(0.2, 1.8, 0.4), { p: [7.2, 7, -20] }, { aInfo: [13.7, 4, 0, 0] });
    gb.add(sphere(0.6, 4, 3), new THREE.Color(1.8, 0.2, 0.15), { p: [-7.2, 7, -20] }, { aInfo: [17.3, 4, 0, 0] });
    for (let k = 0; k < 12; k++) {
      gb.add(sphere(0.55, 4, 3), new THREE.Color(1.8, 1.2, 0.55), { p: [-7.05, 4.5, -24 + k * 4] }, { aInfo: [30 + k, 4, 0, 0] });
      gb.add(sphere(0.55, 4, 3), new THREE.Color(1.8, 1.2, 0.55), { p: [7.05, 4.5, -24 + k * 4] }, { aInfo: [50 + k, 4, 0, 0] });
    }
    // Stern windows (seen from behind as she sails away).
    for (let k = 0; k < 6; k++) gb.add(box(1.2, 0.9, 0.2), new THREE.Color(2.2, 1.5, 0.7), { p: [-4.5 + k * 1.8, 9.2, 13.1] }, { aInfo: [60 + k, 4, 0, 0] });
    const m = gb.mesh(this.townMat, 'BackdropFerry');
    m.frustumCulled = false;
    this.ferry.add(m);
    this.ferry.visible = false;
    this.scene.add(this.ferry);
  }

  // ------------------------------------------------------------------ update

  /** Per-frame animation; palette-driven values come from the environment. */
  update(dt: number, time: number, st: BackdropState, pal: { haze: THREE.Vector3; ambient: THREE.Vector3; rim: THREE.Vector3; smokeLit: THREE.Vector3; smokeDark: THREE.Vector3; fire: number; sunSide: number }): void {
    this.sky.uTime.value = time;
    const tu = this.townMat.uniforms;
    tu.uWindows.value = st.windows;
    tu.uAmbient.value.copy(pal.ambient);
    tu.uRim.value.copy(pal.rim);
    for (const f of this.flames) {
      f.mat.uniforms.uTime.value = time;
      f.mat.uniforms.uLevel.value = 0.55 + 0.45 * pal.fire;
    }
    for (const s of this.smokes) {
      const u = s.mat.uniforms;
      u.uTime.value = time;
      u.uLit.value.copy(pal.smokeLit);
      u.uDark.value.copy(pal.smokeDark);
      u.uHaze.value.copy(pal.haze);
      u.uFire.value = pal.fire;
      u.uSunSide.value = pal.sunSide;
    }
    // Ferris wheel: stopped, swaying a little.
    this.wheel.children[0].rotation.z = Math.sin(time * 0.15) * 0.01;
    // Lighthouse beams.
    this.beamPivot.rotation.y = st.beamAngle;
    this.beamMat.uniforms.uLevel.value = 0.11 * st.lighthouse * this.beamBoost;
    // Lantern flash when a beam faces the camera.
    const toCam = Math.atan2(-this.lanternPos.x, -this.lanternPos.z);
    let face = 0;
    for (let k = 0; k < 2; k++) {
      const a = st.beamAngle + k * Math.PI;
      // Beam direction (local -z rotated by a about y).
      const bx = -Math.sin(a);
      const bz = -Math.cos(a);
      const dot = bx * Math.sin(toCam) + bz * Math.cos(toCam);
      face = Math.max(face, Math.pow(Math.max(0, dot), 40));
    }
    this.lanternMat.uniforms.uLevel.value = st.lighthouse * (0.35 + 2.5 * face);
    const sea = this.seaMat.uniforms;
    sea.uBeam.value.set(Math.atan2(this.lanternPos.x, -this.lanternPos.z), 0, 0, face * st.lighthouse);
    // Departing ferry: from the right edge out towards the moon path.
    const k = this.departure;
    this.ferry.visible = k > 0.001;
    if (this.ferry.visible) {
      const e = Math.pow(k, 1.6);
      const a = new THREE.Vector3(110, 0, -230);
      // Out along the moon's azimuth.
      const b = new THREE.Vector3(1500 * (MOON_U - 0.5) * 2 * TH, 0, -1500);
      this.ferry.position.lerpVectors(a, b, e);
      this.ferry.rotation.y = -0.12 - 0.08 * e;
      sea.uWake.value.set(this.ferry.position.x, this.ferry.position.z + 28, Math.min(1, k * 4) * 0.8, 0);
    } else sea.uWake.value.set(0, 0, 0, 0);
    void dt;
  }

  /** Render into the currently bound target (scissored to the top of the frame). */
  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null, bottomV = SEAM_V1 + 0.03): void {
    const h = target ? target.height : renderer.getDrawingBufferSize(_size).y / renderer.getPixelRatio();
    const w = target ? target.width : renderer.getDrawingBufferSize(_size).x / renderer.getPixelRatio();
    const sh = Math.ceil(h * Math.min(1, bottomV));
    if (target) {
      target.scissor.set(0, h - sh, w, sh);
      target.scissorTest = true;
      renderer.setRenderTarget(target);
    } else {
      renderer.setScissor(0, h - sh, w, sh);
      renderer.setScissorTest(true);
    }
    renderer.render(this.scene, this.camera);
    if (target) {
      target.scissorTest = false;
      renderer.setRenderTarget(target);
    } else renderer.setScissorTest(false);
  }

  /** Horizontal direction (backdrop yaw) from the lighthouse toward the camera. */
  get lighthouseYawToCamera(): number {
    return Math.atan2(-this.lanternPos.x, -this.lanternPos.z);
  }

  dispose(): void {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
  }
}

const _size = new THREE.Vector2();

function setInfo(g: THREE.BufferGeometry, info: number[], color: THREE.Color): void {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 4);
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a.set(info, i * 4);
    c.set([color.r, color.g, color.b], i * 3);
  }
  g.setAttribute('aInfo', new THREE.BufferAttribute(a, 4));
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
}
