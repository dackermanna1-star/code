import * as THREE from 'three';

// =============================================================================
// PHYSICALLY BASED ATMOSPHERE
//
// Single + multiple scattering sky after Hillaire 2020 ("A Scalable and
// Production Ready Sky and Atmosphere Rendering Technique") with Bruneton's
// transmittance parameterisation:
//
//   * Transmittance LUT (256x64, stores OPTICAL DEPTH so differences stay precise)
//   * Multiple-scattering LUT (32x32, Psi_ms of the paper)
//     -> both baked once on the CPU at start-up (~60 ms) and uploaded as
//        half-float textures. The CPU keeps the float copies, so JS can evaluate
//        exactly the same sky as the GPU (skyColorAt, irradiance, fog colour).
//   * Sky-view LUT (192x108, GPU render-to-texture) re-rendered whenever the sun
//     or the observer altitude changes noticeably. The sky dome, the terrain /
//     water aerial perspective and the env-map capture all sample it.
//
// Units: kilometres inside the model, scene radiance units outside (the sun's
// top-of-atmosphere illuminance is ATM.sunE, ~7 at noon on the ground).
// The flat world frame is treated as the local tangent frame (y up).
// =============================================================================

export const ATM = {
  Rg: 6360.0,                               // ground radius (km)
  Rt: 6460.0,                               // top of atmosphere (km)
  rayScat: [5.802e-3, 13.558e-3, 33.1e-3],  // Rayleigh scattering at sea level (1/km)
  rayH: 8.0,                                // Rayleigh scale height (km)
  mieScat: 0.0225,                          // Mie (aerosol) scattering at sea level (1/km): summer haze, ~60 km visibility
  mieAbs: 0.0025,                           // aerosol absorption (1/km)
  mieH: 1.25,                               // aerosol scale height (km): boundary-layer haze
  mieG: 0.8,                                // Mie anisotropy
  ozAbs: [0.650e-3, 1.881e-3, 0.085e-3],    // ozone absorption at the layer peak (1/km)
  ozCenter: 25.0, ozHalfWidth: 15.0,
  groundAlbedo: 0.11,
  sunE: [8.4, 8.25, 8.05],                  // top-of-atmosphere solar illuminance (scene units, slightly warm)
  sunAngularRadius: 0.004654,               // radians (0.2666 deg)
};

const TW = 256, TH = 64, MW = 32, MH = 32, SVW = 192, SVH = 108;
const Rg = ATM.Rg, Rt = ATM.Rt;
const HT = Math.sqrt(Rt * Rt - Rg * Rg);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// ----------------------------------------------------------------------------- CPU model
function extinctionAt(h, out) {
  const dR = Math.exp(-h / ATM.rayH), dM = Math.exp(-h / ATM.mieH);
  const dO = Math.max(0, 1 - Math.abs(h - ATM.ozCenter) / ATM.ozHalfWidth);
  const me = (ATM.mieScat + ATM.mieAbs) * dM;
  out[0] = ATM.rayScat[0] * dR + me + ATM.ozAbs[0] * dO;
  out[1] = ATM.rayScat[1] * dR + me + ATM.ozAbs[1] * dO;
  out[2] = ATM.rayScat[2] * dR + me + ATM.ozAbs[2] * dO;
  return out;
}

function transUvToRMu(xmu, xr) {
  const rho = HT * xr;
  const r = Math.sqrt(rho * rho + Rg * Rg);
  const dmin = Rt - r, dmax = rho + HT;
  const d = dmin + xmu * (dmax - dmin);
  const mu = d === 0 ? 1 : (HT * HT - rho * rho - d * d) / (2 * r * d);
  return [r, clamp(mu, -1, 1)];
}

function transRMuToUv(r, mu) {
  const rho = Math.sqrt(Math.max(0, r * r - Rg * Rg));
  const disc = r * r * (mu * mu - 1) + Rt * Rt;
  const d = Math.max(0, -r * mu + Math.sqrt(Math.max(0, disc)));
  const dmin = Rt - r, dmax = rho + HT;
  return [clamp((d - dmin) / (dmax - dmin), 0, 1), clamp(rho / HT, 0, 1)];
}

/** Bilinear sample of an RGB float LUT at unit coords (texel i <-> i/(N-1)). */
function sampleLut(arr, w, h, u, v, out) {
  const x = clamp(u, 0, 1) * (w - 1), y = clamp(v, 0, 1) * (h - 1);
  const x0 = Math.min(w - 2, Math.floor(x)), y0 = Math.min(h - 2, Math.floor(y));
  const fx = x - x0, fy = y - y0;
  const i00 = (y0 * w + x0) * 3, i10 = i00 + 3, i01 = i00 + w * 3, i11 = i01 + 3;
  for (let c = 0; c < 3; c++) {
    const a = arr[i00 + c] + (arr[i10 + c] - arr[i00 + c]) * fx;
    const b = arr[i01 + c] + (arr[i11 + c] - arr[i01 + c]) * fx;
    out[c] = a + (b - a) * fy;
  }
  return out;
}

function rayPhase(c) { return 3 / (16 * Math.PI) * (1 + c * c); }
function miePhase(c, g) {
  // Cornette-Shanks
  const g2 = g * g;
  return 3 / (8 * Math.PI) * ((1 - g2) * (1 + c * c)) / ((2 + g2) * Math.pow(Math.max(1e-4, 1 + g2 - 2 * g * c), 1.5));
}

export class AtmosphereModel {
  constructor() {
    const t0 = performance.now();
    this.trans = new Float32Array(TW * TH * 3);   // optical depth to the top of the atmosphere
    this.ms = new Float32Array(MW * MH * 3);
    this._bakeTransmittance();
    this._bakeMultiScattering();
    this.bakeMs = performance.now() - t0;
    this._e = [0, 0, 0];
    this._t = [0, 0, 0];
    this._m = [0, 0, 0];
  }

  _bakeTransmittance() {
    const ext = [0, 0, 0];
    const N = 64;
    for (let j = 0; j < TH; j++) {
      for (let i = 0; i < TW; i++) {
        const [r, mu] = transUvToRMu(i / (TW - 1), j / (TH - 1));
        const d = Math.max(0, -r * mu + Math.sqrt(Math.max(0, r * r * (mu * mu - 1) + Rt * Rt)));
        const dt = d / N;
        let o0 = 0, o1 = 0, o2 = 0;
        for (let k = 0; k < N; k++) {
          const t = (k + 0.5) * dt;
          const h = Math.sqrt(r * r + t * t + 2 * r * mu * t) - Rg;
          extinctionAt(Math.max(0, h), ext);
          o0 += ext[0]; o1 += ext[1]; o2 += ext[2];
        }
        const o = (j * TW + i) * 3;
        this.trans[o] = o0 * dt; this.trans[o + 1] = o1 * dt; this.trans[o + 2] = o2 * dt;
      }
    }
  }

  /** Optical depth from radius r (km) along zenith cosine mu to the top of the atmosphere. */
  od(r, mu, out) {
    const [u, v] = transRMuToUv(r, mu);
    return sampleLut(this.trans, TW, TH, u, v, out);
  }
  transmittance(r, mu, out) {
    this.od(r, mu, out);
    out[0] = Math.exp(-out[0]); out[1] = Math.exp(-out[1]); out[2] = Math.exp(-out[2]);
    return out;
  }
  multiScat(r, muS, out) {
    return sampleLut(this.ms, MW, MH, muS * 0.5 + 0.5, (r - Rg) / (Rt - Rg), out);
  }

  _bakeMultiScattering() {
    const SQ = 6, NS = 16;
    const ext = [0, 0, 0], tsun = [0, 0, 0];
    const dirs = [];
    for (let a = 0; a < SQ; a++) {
      for (let b = 0; b < SQ; b++) {
        const theta = 2 * Math.PI * (a + 0.5) / SQ;
        const phi = Math.acos(1 - 2 * (b + 0.5) / SQ);
        dirs.push([Math.cos(theta) * Math.sin(phi), Math.cos(phi), Math.sin(theta) * Math.sin(phi)]);
      }
    }
    const iso = 1 / (4 * Math.PI);
    const sphereW = 4 * Math.PI / dirs.length;
    for (let j = 0; j < MH; j++) {
      const h = clamp(j / (MH - 1) * (Rt - Rg), 0.002, Rt - Rg - 0.002);
      const r = Rg + h;
      for (let i = 0; i < MW; i++) {
        const muS = i / (MW - 1) * 2 - 1;
        const sx = Math.sqrt(Math.max(0, 1 - muS * muS)), sy = muS;
        const L = [0, 0, 0], F = [0, 0, 0];
        for (const d of dirs) {
          const mu = d[1];
          const discG = r * r * mu * mu - h * (r + Rg);
          const hitsGround = mu < 0 && discG >= 0;
          const tMax = hitsGround ? -r * mu - Math.sqrt(discG) : -r * mu + Math.sqrt(Math.max(0, r * r * (mu * mu - 1) + Rt * Rt));
          const thr = [1, 1, 1];
          const l = [0, 0, 0], f = [0, 0, 0];
          let tPrev = 0;
          for (let s = 0; s < NS; s++) {
            const t1 = tMax * ((s + 1) / NS) * ((s + 1) / NS);
            const tm = tPrev + (t1 - tPrev) * 0.3;
            const dt = t1 - tPrev; tPrev = t1;
            const px = d[0] * tm, py = r + d[1] * tm, pz = d[2] * tm;
            const rr = Math.sqrt(px * px + py * py + pz * pz);
            const hh = Math.max(0, rr - Rg);
            extinctionAt(hh, ext);
            const dR = Math.exp(-hh / ATM.rayH), dM = Math.exp(-hh / ATM.mieH);
            const mus = (px * sx + py * sy) / rr;
            const muH = -Math.sqrt(Math.max(0, hh * (rr + Rg))) / rr;
            const shadow = mus < muH ? 0 : 1;
            this.transmittance(rr, mus, tsun);
            for (let c = 0; c < 3; c++) {
              const scat = ATM.rayScat[c] * dR + ATM.mieScat * dM;
              const S = shadow * tsun[c] * scat * iso;
              const Ts = Math.exp(-ext[c] * dt);
              const e = Math.max(ext[c], 1e-9);
              l[c] += thr[c] * (S - S * Ts) / e;
              f[c] += thr[c] * (scat - scat * Ts) / e;
              thr[c] *= Ts;
            }
          }
          if (hitsGround) {
            // ground bounce (Lambert)
            const gx = d[0] * tMax, gy = r + d[1] * tMax, gz = d[2] * tMax;
            const gl = Math.sqrt(gx * gx + gy * gy + gz * gz);
            const ndl = Math.max(0, (gx * sx + gy * sy) / gl);
            this.transmittance(Rg + 0.001, (gx * sx + gy * sy) / gl, tsun);
            for (let c = 0; c < 3; c++) l[c] += thr[c] * tsun[c] * ndl * ATM.groundAlbedo / Math.PI;
          }
          for (let c = 0; c < 3; c++) { L[c] += l[c] * sphereW; F[c] += f[c] * sphereW; }
        }
        const o = (j * MW + i) * 3;
        for (let c = 0; c < 3; c++) {
          const l2 = L[c] * iso, fms = F[c] * iso;
          this.ms[o + c] = l2 / Math.max(1e-4, 1 - fms);
        }
      }
    }
  }

  /**
   * Single+multiple scattered sky radiance seen from altitude h (km) towards
   * `dir` (unit, y up) with the light towards `sun` (unit, y up). Excludes the
   * sun disc and the ground. Matches the GPU sky-view LUT. Returns [r,g,b]
   * scaled by `illum` ([r,g,b]).
   */
  skyRadiance(h, dir, sun, illum, out = [0, 0, 0], steps = 24) {
    const r = Rg + Math.max(h, 0.001);
    const mu = dir[1];
    const discG = r * r * mu * mu - h * (r + Rg);
    const hitsGround = mu < 0 && discG >= 0;
    const tMax = hitsGround ? -r * mu - Math.sqrt(discG) : -r * mu + Math.sqrt(Math.max(0, r * r * (mu * mu - 1) + Rt * Rt));
    const cosT = dir[0] * sun[0] + dir[1] * sun[1] + dir[2] * sun[2];
    const pR = rayPhase(cosT), pM = miePhase(cosT, ATM.mieG);
    const ext = this._e, tsun = this._t, ms = this._m;
    let L0 = 0, L1 = 0, L2 = 0, th0 = 1, th1 = 1, th2 = 1, tPrev = 0;
    for (let s = 0; s < steps; s++) {
      const t1 = tMax * ((s + 1) / steps) * ((s + 1) / steps);
      const tm = tPrev + (t1 - tPrev) * 0.3;
      const dt = t1 - tPrev; tPrev = t1;
      const px = dir[0] * tm, py = r + dir[1] * tm, pz = dir[2] * tm;
      const rr = Math.sqrt(px * px + py * py + pz * pz);
      const hh = Math.max(0, rr - Rg);
      extinctionAt(hh, ext);
      const dR = Math.exp(-hh / ATM.rayH), dM = Math.exp(-hh / ATM.mieH);
      const mus = (px * sun[0] + py * sun[1] + pz * sun[2]) / rr;
      const muH = -Math.sqrt(hh * (rr + Rg)) / rr;
      const shadow = clamp((mus - muH) / 0.009 + 0.5, 0, 1);
      this.transmittance(rr, mus, tsun);
      this.multiScat(rr, mus, ms);
      const sR = [ATM.rayScat[0] * dR, ATM.rayScat[1] * dR, ATM.rayScat[2] * dR], sM = ATM.mieScat * dM;
      const S0 = shadow * tsun[0] * (sR[0] * pR + sM * pM) + ms[0] * (sR[0] + sM);
      const S1 = shadow * tsun[1] * (sR[1] * pR + sM * pM) + ms[1] * (sR[1] + sM);
      const S2 = shadow * tsun[2] * (sR[2] * pR + sM * pM) + ms[2] * (sR[2] + sM);
      const T0 = Math.exp(-ext[0] * dt), T1 = Math.exp(-ext[1] * dt), T2 = Math.exp(-ext[2] * dt);
      L0 += th0 * (S0 - S0 * T0) / ext[0]; th0 *= T0;
      L1 += th1 * (S1 - S1 * T1) / ext[1]; th1 *= T1;
      L2 += th2 * (S2 - S2 * T2) / ext[2]; th2 *= T2;
    }
    out[0] = L0 * illum[0]; out[1] = L1 * illum[1]; out[2] = L2 * illum[2];
    out.hitsGround = hitsGround;
    out.tMax = tMax;
    out.T = [th0, th1, th2];
    return out;
  }

  /** Transmittance of the sun light arriving at altitude h (km) for a sun with zenith cosine muS (with Earth shadow). */
  sunTransmittance(h, muS, out = [0, 0, 0]) {
    const r = Rg + Math.max(0.001, h);
    this.transmittance(r, muS, out);
    const muH = -Math.sqrt(Math.max(0, h) * (r + Rg)) / r;
    const vis = clamp((muS - muH) / (2 * ATM.sunAngularRadius) + 0.5, 0, 1);
    out[0] *= vis; out[1] *= vis; out[2] *= vis;
    return out;
  }

  /** Data textures for the GPU (half float, linear). */
  makeTextures() {
    const mk = (arr, w, h) => {
      const data = new Uint16Array(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        data[i * 4] = THREE.DataUtils.toHalfFloat(Math.min(arr[i * 3], 65000));
        data[i * 4 + 1] = THREE.DataUtils.toHalfFloat(Math.min(arr[i * 3 + 1], 65000));
        data[i * 4 + 2] = THREE.DataUtils.toHalfFloat(Math.min(arr[i * 3 + 2], 65000));
        data[i * 4 + 3] = THREE.DataUtils.toHalfFloat(1);
      }
      const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
      t.minFilter = t.magFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.generateMipmaps = false;
      t.colorSpace = THREE.NoColorSpace;
      t.needsUpdate = true;
      return t;
    };
    return { trans: mk(this.trans, TW, TH), ms: mk(this.ms, MW, MH) };
  }
}

// ----------------------------------------------------------------------------- GLSL
const f = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
const v3 = (a) => `vec3(${a.map((x) => x.toExponential(6)).join(', ')})`;

/**
 * Shared GLSL: constants, LUT lookups, phase functions and the aerial
 * perspective helpers. Needs the uniforms of `createAtmosphereUniforms()`.
 */
export const ATMOSPHERE_GLSL = /* glsl */`
#ifndef ATM_GLSL
#define ATM_GLSL
#define ATM_PI 3.14159265359
#define ATM_RG ${f(Rg)}
#define ATM_RT ${f(Rt)}
#define ATM_TW ${f(TW)}
#define ATM_TH ${f(TH)}
#define ATM_MW ${f(MW)}
#define ATM_MH ${f(MH)}
#define ATM_SVW ${f(SVW)}
#define ATM_SVH ${f(SVH)}
const vec3 ATM_RAY = ${v3(ATM.rayScat)};
const float ATM_RAY_H = ${f(ATM.rayH)};
const float ATM_MIE = ${ATM.mieScat.toExponential(6)};
const float ATM_MIE_EXT = ${(ATM.mieScat + ATM.mieAbs).toExponential(6)};
const float ATM_MIE_H = ${f(ATM.mieH)};
const float ATM_MIE_G = ${f(ATM.mieG)};
const vec3 ATM_OZ = ${v3(ATM.ozAbs)};
const float ATM_OZ_C = ${f(ATM.ozCenter)};
const float ATM_OZ_W = ${f(ATM.ozHalfWidth)};
const float ATM_HT = ${HT.toFixed(6)};

uniform sampler2D tAtmTrans;     // optical depth LUT
uniform sampler2D tAtmMS;        // multiple scattering LUT
uniform sampler2D tAtmSkyView;   // sky-view LUT (current observer)
uniform vec3 uAtmSunDir;         // world/local (y up) direction towards the sun
uniform vec3 uAtmSunIllum;       // top-of-atmosphere solar illuminance (scene units)
uniform float uAtmCamH;          // observer altitude (km)
uniform float uAtmCamR;          // observer radius (km)

float atmSubUv(float u, float n) { return (u * (n - 1.0) + 0.5) / n; }
float atmUnitUv(float u, float n) { return (u * n - 0.5) / (n - 1.0); }

vec2 atmTransUv(float r, float mu) {
  float rho = sqrt(max(0.0, r * r - ATM_RG * ATM_RG));
  float disc = r * r * (mu * mu - 1.0) + ATM_RT * ATM_RT;
  float d = max(0.0, -r * mu + sqrt(max(0.0, disc)));
  float dmin = ATM_RT - r, dmax = rho + ATM_HT;
  return vec2(atmSubUv(clamp((d - dmin) / (dmax - dmin), 0.0, 1.0), ATM_TW), atmSubUv(clamp(rho / ATM_HT, 0.0, 1.0), ATM_TH));
}
vec3 atmOD(float r, float mu) { return texture2D(tAtmTrans, atmTransUv(r, mu)).rgb; }
vec3 atmTransmittance(float r, float mu) { return exp(-atmOD(r, mu)); }
vec3 atmMultiScat(float r, float muS) {
  return texture2D(tAtmMS, vec2(atmSubUv(clamp(muS * 0.5 + 0.5, 0.0, 1.0), ATM_MW), atmSubUv(clamp((r - ATM_RG) / (ATM_RT - ATM_RG), 0.0, 1.0), ATM_MH))).rgb;
}
float atmRayPhase(float c) { return 3.0 / (16.0 * ATM_PI) * (1.0 + c * c); }
float atmMiePhase(float c, float g) {
  float g2 = g * g;
  return 3.0 / (8.0 * ATM_PI) * ((1.0 - g2) * (1.0 + c * c)) / ((2.0 + g2) * pow(max(1e-4, 1.0 + g2 - 2.0 * g * c), 1.5));
}
vec3 atmExtinction(float h) {
  float dO = max(0.0, 1.0 - abs(h - ATM_OZ_C) / ATM_OZ_W);
  return ATM_RAY * exp(-h / ATM_RAY_H) + ATM_MIE_EXT * exp(-h / ATM_MIE_H) + ATM_OZ * dO;
}
// cosine of the zenith angle of the geometric horizon seen from altitude h (km)
float atmHorizonMu(float h) { float r = ATM_RG + h; return -sqrt(max(0.0, h * (r + ATM_RG))) / r; }
// transmittance of sunlight reaching altitude h (km) with sun zenith cosine muS, incl. Earth shadow
vec3 atmSunTransmittance(float h, float muS) {
  float r = ATM_RG + max(h, 0.0005);
  float vis = clamp((muS - atmHorizonMu(max(h, 0.0005))) / 0.0093 + 0.5, 0.0, 1.0);
  return atmTransmittance(r, muS) * vis;
}

// Sky-view LUT mapping (Hillaire), r/h of the observer in km.
vec2 atmSkyViewUv(float r, float h, float mu, float cosPhi, bool ground) {
  float vh = sqrt(max(0.0, h * (r + ATM_RG)));
  float beta = acos(clamp(vh / r, -1.0, 1.0));
  float zha = ATM_PI - beta;
  float ang = acos(clamp(mu, -1.0, 1.0));
  float v;
  if (!ground) {
    float c = clamp(ang / zha, 0.0, 1.0);
    c = 1.0 - sqrt(1.0 - c);
    v = c * 0.5;
  } else {
    float c = clamp((ang - zha) / beta, 0.0, 1.0);
    v = sqrt(c) * 0.5 + 0.5;
  }
  float u = sqrt(clamp(-cosPhi * 0.5 + 0.5, 0.0, 1.0));
  return vec2(atmSubUv(u, ATM_SVW), atmSubUv(v, ATM_SVH));
}
bool atmRayHitsGround(float r, float h, float mu) {
  return mu < 0.0 && r * r * mu * mu - h * (r + ATM_RG) >= 0.0;
}
// distance from the observer to the sea-level sphere (or the top of the atmosphere)
float atmRayEnd(float r, float h, float mu, bool ground) {
  if (ground) return -r * mu - sqrt(max(0.0, r * r * mu * mu - h * (r + ATM_RG)));
  return -r * mu + sqrt(max(0.0, r * r * (mu * mu - 1.0) + ATM_RT * ATM_RT));
}
// In-scattered sky radiance towards dir (y up), excluding sun disc and ground,
// for the CURRENT observer (uAtmCamR / uAtmCamH, uAtmSunDir).
vec3 atmSkyView(vec3 dir, out bool ground) {
  float mu = dir.y;
  ground = atmRayHitsGround(uAtmCamR, uAtmCamH, mu);
  vec2 hd = dir.xz, hs = uAtmSunDir.xz;
  float lh = length(hd), ls = length(hs);
  float cosPhi = (lh > 1e-5 && ls > 1e-5) ? dot(hd, hs) / (lh * ls) : 1.0;
  return texture2D(tAtmSkyView, atmSkyViewUv(uAtmCamR, uAtmCamH, mu, cosPhi, ground)).rgb;
}
vec3 atmSkyView(vec3 dir) { bool g; return atmSkyView(dir, g); }

// Optical depth of a straight segment whose altitude varies linearly from h0 to h1 (km) over length d (km).
vec3 atmSegOD(float h0, float h1, float d) {
  float dh = h1 - h0;
  float eR0 = exp(-h0 / ATM_RAY_H), eR1 = exp(-h1 / ATM_RAY_H);
  float eM0 = exp(-h0 / ATM_MIE_H), eM1 = exp(-h1 / ATM_MIE_H);
  float iR = abs(dh) > 1e-4 ? (eR0 - eR1) * ATM_RAY_H / dh : eR0;
  float iM = abs(dh) > 1e-4 ? (eM0 - eM1) * ATM_MIE_H / dh : eM0;
  float hm = 0.5 * (h0 + h1);
  float dO = max(0.0, 1.0 - abs(hm - ATM_OZ_C) / ATM_OZ_W);
  return d * (ATM_RAY * iR + ATM_MIE_EXT * iM + ATM_OZ * dO);
}
// Optical depth from the observer (radius r, altitude h) along zenith cosine mu over distance d (km), with curvature.
vec3 atmPathOD(float r, float h, float mu, float d) {
  vec3 od = vec3(0.0);
  float hp = h;
  for (int i = 1; i <= 3; i++) {
    float t = d * float(i) / 3.0;
    float hi = sqrt(max(0.0, t * t + 2.0 * r * mu * t + r * r)) - ATM_RG;
    od += atmSegOD(hp, hi, d / 3.0);
    hp = hi;
  }
  return od;
}

// Aerial perspective for a surface point seen by the current observer.
//   dir: unit view direction (y up), dKm: distance in km, surface: radiance
// returns surface * T + inscatter (consistent with the sky at the horizon).
vec3 atmAerial(vec3 surface, vec3 dir, float dKm, vec3 extraSky) {
  bool ground;
  vec3 sky = atmSkyView(dir, ground) + extraSky;
  float mu = dir.y;
  float D = atmRayEnd(uAtmCamR, uAtmCamH, mu, ground);
  vec3 odD = ground ? atmPathOD(uAtmCamR, uAtmCamH, mu, D) : atmOD(uAtmCamR, mu);
  float d = min(dKm, D);
  vec3 odd = atmPathOD(uAtmCamR, uAtmCamH, mu, d);
  vec3 Td = exp(-odd);
  vec3 F = clamp((1.0 - Td) / max(1.0 - exp(-odD), vec3(1e-5)), 0.0, 1.0);
  return surface * Td + sky * F;
}
vec3 atmAerial(vec3 surface, vec3 dir, float dKm) { return atmAerial(surface, dir, dKm, vec3(0.0)); }
#endif
`;

/** Uniform objects shared by every material that includes ATMOSPHERE_GLSL. */
export function createAtmosphereUniforms(textures) {
  return {
    tAtmTrans: { value: textures.trans },
    tAtmMS: { value: textures.ms },
    tAtmSkyView: { value: null },
    uAtmSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uAtmSunIllum: { value: new THREE.Vector3(...ATM.sunE) },
    uAtmCamH: { value: 0.003 },
    uAtmCamR: { value: Rg + 0.003 },
  };
}

// ----------------------------------------------------------------------------- sky-view LUT pass
const SKYVIEW_FRAG = /* glsl */`
${ATMOSPHERE_GLSL}
varying vec2 vUv;
uniform float uSteps;
void main() {
  float r = uAtmCamR, h = uAtmCamH;
  vec2 uv = vec2(atmUnitUv(vUv.x, ATM_SVW), atmUnitUv(vUv.y, ATM_SVH));
  float vh = sqrt(max(0.0, h * (r + ATM_RG)));
  float beta = acos(clamp(vh / r, -1.0, 1.0));
  float zha = ATM_PI - beta;
  float mu;
  bool ground = uv.y >= 0.5;
  if (!ground) {
    float c = 1.0 - 2.0 * uv.y; c = 1.0 - c * c;
    mu = cos(zha * c);
    mu = max(mu, cos(zha) + 2e-5);
  } else {
    float c = uv.y * 2.0 - 1.0; c *= c;
    mu = cos(zha + beta * c);
    mu = min(mu, cos(zha) - 2e-5);
  }
  float c2 = uv.x * uv.x;
  float cosPhi = -(c2 * 2.0 - 1.0);
  float sinT = sqrt(max(0.0, 1.0 - mu * mu));
  vec3 dir = vec3(sinT * cosPhi, mu, sinT * sqrt(max(0.0, 1.0 - cosPhi * cosPhi)));
  float muSun = uAtmSunDir.y;
  vec3 sunDir = vec3(sqrt(max(0.0, 1.0 - muSun * muSun)), muSun, 0.0);
  bool hits = atmRayHitsGround(r, h, mu);
  float tMax = atmRayEnd(r, h, mu, hits);
  float cosT = dot(dir, sunDir);
  float pR = atmRayPhase(cosT), pM = atmMiePhase(cosT, ATM_MIE_G);
  vec3 L = vec3(0.0), thr = vec3(1.0);
  float tPrev = 0.0;
  int N = int(uSteps);
  for (int i = 0; i < 64; i++) {
    if (i >= N) break;
    float fi = float(i + 1) / float(N);
    float t1 = tMax * fi * fi;
    float tm = tPrev + (t1 - tPrev) * 0.3;
    float dt = t1 - tPrev; tPrev = t1;
    vec3 P = vec3(0.0, r, 0.0) + dir * tm;
    float rr = length(P);
    float hh = max(0.0, rr - ATM_RG);
    float dR = exp(-hh / ATM_RAY_H), dM = exp(-hh / ATM_MIE_H);
    vec3 ext = atmExtinction(hh);
    float muS = dot(P, sunDir) / rr;
    float shadow = clamp((muS - atmHorizonMu(hh)) / 0.009 + 0.5, 0.0, 1.0);
    vec3 Tsun = atmTransmittance(rr, muS);
    vec3 ms = atmMultiScat(rr, muS);
    vec3 sR = ATM_RAY * dR; float sM = ATM_MIE * dM;
    vec3 S = shadow * Tsun * (sR * pR + sM * pM) + ms * (sR + sM);
    vec3 Ts = exp(-ext * dt);
    L += thr * (S - S * Ts) / max(ext, vec3(1e-9));
    thr *= Ts;
  }
  gl_FragColor = vec4(L * uAtmSunIllum, 1.0);
}`;

const FS_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** GPU sky-view LUT renderer. */
export class SkyViewLut {
  constructor(app, uniforms) {
    this.app = app;
    this.rt = new THREE.WebGLRenderTarget(SVW, SVH, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
    });
    this.rt.texture.wrapS = this.rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.rt.texture.name = 'env.skyViewLut';
    this.material = new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: SKYVIEW_FRAG,
      uniforms: { ...uniforms, uSteps: { value: 30 } },
      depthTest: false, depthWrite: false,
    });
    uniforms.tAtmSkyView.value = this.rt.texture;
  }
  render() {
    const r = this.app.renderer;
    const prev = r.getRenderTarget();
    this.app.pipeline.fullscreen(this.material, this.rt);
    r.setRenderTarget(prev);
  }
}

export const LUT_SIZES = { TW, TH, MW, MH, SVW, SVH };
