/**
 * Asteroid / Kuiper belts as GPU particles. Each particle stores orbital
 * elements; the vertex shader solves Kepler's equation (Newton iterations)
 * so the whole belt orbits correctly at any time-warp. Brightness follows
 * reflected starlight (∝ size², 1/r², phase). Individual large members are
 * real bodies in the system; the particles represent the unresolved swarm.
 */
import * as THREE from 'three';
import type { BeltInfo } from '../astro/body';
import { Rng } from '../core/rng';
import { G } from '../core/constants';
import { PRE_EXPOSURE, PRE_EXPOSURE_TEX, PRE_EXPOSURE_GLSL } from './exposure';


const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec4 el1; // a, e, i, node
attribute vec4 el2; // peri, M0, size(m), albedo
uniform float uTime;
uniform float uMu;
uniform vec3 uParentRel;   // parent centre relative to camera (world axes)
uniform mat3 uSysRot;      // system frame → world
uniform vec3 uSunRel;
uniform float uSunLum;     // relative irradiance scale at 1 m (L / (4π) / solar constant)
uniform float uPixelAngle;
${PRE_EXPOSURE_GLSL}
uniform vec3 uTint;
varying vec3 vColor;
varying float vAlpha;
vec3 keplerPos(vec4 e1, vec4 e2, float t) {
  float a = e1.x, e = e1.y, inc = e1.z, node = e1.w, w = e2.x;
  float n = sqrt(uMu / (a * a * a));
  float M = mod(e2.y + n * t, 6.2831853);
  float E = M + e * sin(M);
  for (int k = 0; k < 4; k++) E -= (E - e * sin(E) - M) / (1.0 - e * cos(E));
  float px = a * (cos(E) - e), py = a * sqrt(1.0 - e * e) * sin(E);
  float cO = cos(node), sO = sin(node), ci = cos(inc), si = sin(inc), cw = cos(w), sw = sin(w);
  float X = (cO * cw - sO * sw * ci) * px + (-cO * sw - sO * cw * ci) * py;
  float Y = (sO * cw + cO * sw * ci) * px + (-sO * sw + cO * cw * ci) * py;
  float Z = sw * si * px + cw * si * py;
  return vec3(X, Z, -Y);
}
void main() {
  vec3 local = uSysRot * keplerPos(el1, el2, uTime);
  vec3 p = uParentRel + local;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = length(p);
  vec3 toSun = uSunRel - p;
  float ds = length(toSun);
  float phaseAng = acos(clamp(dot(toSun / ds, -p / d), -1.0, 1.0));
  float phase = (sin(phaseAng) + (3.14159 - phaseAng) * cos(phaseAng)) / 3.14159;
  float r = el2.z;
  float flux = el2.w * uSunLum / (ds * ds) * (r * r) / (d * d) * phase * 0.66;
  float peak = flux / (uPixelAngle * uPixelAngle * 2.26);
  vColor = uTint * min(peak * uPreExposure, 6e4);
  vAlpha = 1.0;
  gl_PointSize = 2.2;
  // fade very near particles (resolved bodies take over)
  if (d < 2e6) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vColor;
void main() {
  #include <logdepthbuf_fragment>
  vec2 d = gl_PointCoord - 0.5;
  float g = exp(-dot(d, d) * 16.0);
  gl_FragColor = vec4(vColor * g, 1.0);
}
`;

export class BeltRenderer {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;

  constructor(readonly belt: BeltInfo, adapt: () => THREE.Texture) {
    const rng = new Rng(belt.seed);
    const n = belt.count;
    const e1 = new Float32Array(n * 4), e2 = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      // radial distribution with Kirkwood-like gaps
      let a: number;
      do a = rng.range(belt.inner, belt.outer);
      while (rng.chance(0.5 * Math.exp(-(((a - (belt.inner + belt.outer) * 0.5) / ((belt.outer - belt.inner) * 0.03)) ** 2))));
      e1[i * 4] = a;
      e1[i * 4 + 1] = Math.min(0.35, Math.abs(rng.normal(0, 0.08)));
      e1[i * 4 + 2] = Math.abs(rng.normal(0, belt.thickness * 0.6));
      e1[i * 4 + 3] = rng.range(0, Math.PI * 2);
      e2[i * 4] = rng.range(0, Math.PI * 2);
      e2[i * 4 + 1] = rng.range(0, Math.PI * 2);
      e2[i * 4 + 2] = 2000 * Math.pow(rng.next(), -0.8); // size-frequency power law (m)
      e2[i * 4 + 3] = belt.icy ? rng.range(0.08, 0.25) : rng.range(0.04, 0.2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('el1', new THREE.BufferAttribute(e1, 4));
    g.setAttribute('el2', new THREE.BufferAttribute(e2, 4));
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 }, uMu: { value: G * belt.parent.mass }, uParentRel: { value: new THREE.Vector3() },
        uSysRot: { value: new THREE.Matrix3() }, uSunRel: { value: new THREE.Vector3() }, uSunLum: { value: 1 },
        uPixelAngle: { value: 0.001 }, tPreExposure: PRE_EXPOSURE_TEX,
        uTint: { value: belt.icy ? new THREE.Vector3(0.9, 0.95, 1.05) : new THREE.Vector3(1.05, 0.95, 0.85) },
      },
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    void adapt;
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  update(time: number, parentRel: THREE.Vector3, sysQ: THREE.Quaternion, sunRel: THREE.Vector3, sunLumRel: number, pixelAngle: number) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uParentRel.value.copy(parentRel);
    u.uSysRot.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(sysQ));
    u.uSunRel.value.copy(sunRel);
    u.uSunLum.value = sunLumRel;
    u.uPixelAngle.value = pixelAngle;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
