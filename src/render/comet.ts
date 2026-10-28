/**
 * Cometary comae and tails. Activity switches on inside ~4 AU (water-ice
 * sublimation) and grows roughly as r⁻²; the ion tail (CO⁺ fluorescence,
 * blue) points straight away from the star, the dust tail (scattered
 * sunlight, yellow-white) is broader and curves back along the orbit.
 *
 * Each comet is a back-faced box ray-marched through an analytic density:
 * radiance = Σ κ(s, ρ)·E☉·ϖ/(4π)·Δs with optical depths of order 10⁻³,
 * in the same units as everything else (solar constant per steradian).
 */
import * as THREE from 'three';
import type { Body } from '../astro/body';
import { AU } from '../core/constants';
import { PRE_EXPOSURE_TEX, PRE_EXPOSURE_GLSL } from './exposure';

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uNucleus;     // camera-relative position (m)
uniform vec3 uIonDir;      // unit, anti-sunward
uniform vec3 uDustDir;     // unit, anti-sunward bent back along the orbit
uniform float uIonL, uDustL, uComaR;   // m
uniform float uIonK, uDustK, uComaK;   // radiance per metre at the core
uniform vec3 uSunE;        // stellar irradiance at the comet (scene units, coloured)
uniform float uExtent;     // m, half-size of the bounding box
uniform int uSteps;
${PRE_EXPOSURE_GLSL}
varying vec3 vWorld;

// Analytic line-of-sight integral through a Gaussian tube along dir from the
// nucleus: width w(s) = w0 + s·spread, density ∝ exp(−s/L)·(w0/w)² (column
// conserved as the tail widens). ∫exp(−r²/w²)dt = w√π / sinθ at closest approach.
float tailColumn(vec3 rd, vec3 dir, float L, float w0, float spread) {
  vec3 w = -uNucleus;                 // nucleus → camera
  float b = dot(rd, dir);
  float d = dot(rd, w), e = dot(dir, w);
  float den = 1.0 - b * b;
  float t, s;
  if (den < 1e-6) { t = 0.0; s = max(e, 0.0); }
  else { t = (b * e - d) / den; s = (e - b * d) / den; }
  // ray only extends forward from the camera
  t = max(t, 0.0);
  s = dot(rd * t - uNucleus, dir);
  if (s < -w0 * 2.0) return 0.0;
  float sp = max(s, 0.0);
  float wid = w0 + sp * spread;
  vec3 perp = rd * t - uNucleus - dir * s;
  float rho2 = dot(perp, perp) / (wid * wid);
  float sinT = sqrt(max(den, 1e-6));
  float path = min(wid * 1.772 / sinT, L * 2.0);
  return exp(-sp / L) * exp(-rho2) * (w0 * w0) / (wid * wid) * smoothstep(-w0 * 2.0, 0.0, s) * path;
}


void main() {
  #include <logdepthbuf_fragment>
  vec3 rd = normalize(vWorld);
  vec3 col = vec3(0.0);
  // tails: analytic
  float dust = uDustK * tailColumn(rd, uDustDir, uDustL, uComaR * 0.6, 0.12);
  float ion = uIonK * tailColumn(rd, uIonDir, uIonL, uComaR * 0.25, 0.03);
  col += vec3(1.0, 0.95, 0.85) * dust + vec3(0.35, 0.6, 1.3) * ion;
  // coma: short march through a sphere of a few coma radii
  float R = uComaR * 5.0;
  float bb = dot(uNucleus, rd);
  float c = dot(uNucleus, uNucleus) - R * R;
  float disc = bb * bb - c;
  if (disc > 0.0) {
    float sq = sqrt(disc);
    float t0 = max(bb - sq, 0.0), t1 = bb + sq;
    float dt = (t1 - t0) / float(uSteps);
    for (int i = 0; i < 48; i++) {
      if (i >= uSteps || t1 <= t0) break;
      float t = t0 + (float(i) + 0.5) * dt;
      float rn = length(rd * t - uNucleus);
      col += vec3(1.0, 0.95, 0.85) * uComaK * exp(-rn / uComaR) / (1.0 + rn / (uComaR * 0.05)) * dt;
    }
  }
  if (max(col.r, max(col.g, col.b)) <= 0.0) discard;
  gl_FragColor = vec4(min(col * uSunE * uPreExposure, vec3(6e4)), 1.0);
}
`;

export class CometTail {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  active = false;

  constructor(readonly body: Body) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uNucleus: { value: new THREE.Vector3() },
        uIonDir: { value: new THREE.Vector3(1, 0, 0) },
        uDustDir: { value: new THREE.Vector3(1, 0, 0) },
        uIonL: { value: 1e10 }, uDustL: { value: 5e9 }, uComaR: { value: 1e8 },
        uIonK: { value: 0 }, uDustK: { value: 0 }, uComaK: { value: 0 },
        uSunE: { value: new THREE.Vector3() },
        uExtent: { value: 1e10 },
        uSteps: { value: 32 },
        tPreExposure: PRE_EXPOSURE_TEX,
      },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
  }

  /**
   * rel: nucleus relative to the camera; toStar: unit vector nucleus → star;
   * vel: orbital velocity (world axes); rAU: distance to the star (AU);
   * E: stellar irradiance at the comet (scene units, coloured).
   */
  update(rel: THREE.Vector3, toStar: THREE.Vector3, vel: THREE.Vector3, rAU: number, E: THREE.Vector3, pixelAngle: number) {
    // sublimation turns on inside ~4 AU and scales ~r⁻² (steeper near the snow line)
    const act = rAU < 4.5 ? Math.pow(1 / Math.max(rAU, 0.05), 2) * (1 - Math.min(1, Math.max(0, (rAU - 3) / 1.5))) : 0;
    const size = Math.cbrt(this.body.radius / 3000);
    if (act <= 1e-4) {
      this.mesh.visible = this.active = false;
      return;
    }
    const comaR = 1.2e8 * Math.min(3, Math.sqrt(act)) * size;
    const ionL = 0.12 * AU * Math.min(4, Math.sqrt(act)) * size;
    const dustL = 0.06 * AU * Math.min(4, Math.sqrt(act)) * size;
    const extent = Math.max(ionL * 3.5, dustL * 3.5, comaR * 6);
    const d = rel.length();
    // skip when the whole thing is sub-pixel
    if (extent / Math.max(d - extent, 1) < pixelAngle * 2) {
      this.mesh.visible = this.active = false;
      return;
    }
    this.mesh.visible = this.active = true;
    const u = this.material.uniforms;
    const anti = toStar.clone().negate();
    u.uNucleus.value.copy(rel);
    u.uIonDir.value.copy(anti);
    // dust lags behind the nucleus along the orbit (syndyne curvature, approximated)
    const back = vel.lengthSq() > 0 ? vel.clone().normalize().negate() : anti;
    u.uDustDir.value.copy(anti).addScaledVector(back, 0.35).normalize();
    u.uIonL.value = ionL;
    u.uDustL.value = dustL;
    u.uComaR.value = comaR;
    // optical depth of order 1e-3 across the core, single-scattering albedo ~0.04 (dark dust)
    u.uComaK.value = (3e-2 * act * size) / comaR;
    u.uDustK.value = (6e-3 * act * size) / (comaR * 0.6);
    u.uIonK.value = (2e-3 * act * size) / (comaR * 0.25);
    u.uSunE.value.copy(E).multiplyScalar(0.04 / (4 * Math.PI));
    u.uExtent.value = extent;
    // bounding sphere around the nucleus; the shader marches in true metres
    // and uses the rasterised position only as a view direction
    this.mesh.position.copy(rel);
    this.mesh.scale.setScalar(extent);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
