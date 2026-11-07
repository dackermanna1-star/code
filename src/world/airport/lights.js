// =============================================================================
// Airfield lighting: every lamp of an airport is one instance of a single
// instanced billboard draw call (HDR additive sprites).  Per instance:
//   position, colour seen from the +axis side, colour seen from the -axis side,
//   beam axis + type (omni / bidirectional / unidirectional), size, mode
//   (steady, inset, rabbit flasher, rotating beacon, PAPI, flood lamp, blink),
//   phase / PAPI angle, category (intensity group driven per frame).
// PAPI units compute the viewer's elevation angle in the vertex shader and
// show white above / red below their setting angle.
// =============================================================================
import * as THREE from 'three';

export const CAT = { RUNWAY: 0, TAXI: 1, APPROACH: 2, STOPBAR: 3, FLOOD: 4, OBSTRUCTION: 5, PAPI: 6, BEACON: 7, STOPBAR_OWN: 8, RABBIT: 9 };
export const NCAT = 10;
export const MODE = { STEADY: 0, INSET: 1, RABBIT: 2, BEACON: 3, PAPI: 4, FLOOD: 5, BLINK: 6 };
export const BEAM = { OMNI: 0, BIDIR: 1, UNI: 2 };

export const LC = {
  white: [1.0, 0.93, 0.8],
  warm: [1.0, 0.82, 0.55],
  red: [1.0, 0.08, 0.03],
  green: [0.15, 1.0, 0.45],
  blue: [0.12, 0.3, 1.0],
  yellow: [1.0, 0.7, 0.12],
  none: [0, 0, 0],
};

export class LightList {
  constructor() { this.items = []; }
  /**
   * @param p [x,y,z] airport-local
   * @param colA colour seen from the +axis side (or the only colour)
   * @param colB colour seen from the -axis side
   * @param o { axis:[x,y,z], beam, size, mode, phase, papi, cat, gain }
   */
  add(p, colA, colB = null, o = {}) {
    const g = o.gain ?? 1;
    this.items.push({
      p, a: colA.map((c) => c * g), b: (colB || colA).map((c) => c * g),
      axis: o.axis || [1, 0, 0], beam: o.beam ?? BEAM.OMNI, size: o.size ?? 0.35,
      mode: o.mode ?? MODE.STEADY, phase: o.phase ?? 0, papi: o.papi ?? 0, cat: o.cat ?? CAT.RUNWAY,
    });
  }
  get count() { return this.items.length; }
}

const VERT = /* glsl */`
attribute vec3 iPos;
attribute vec3 iColA;
attribute vec3 iColB;
attribute vec4 iDir;
attribute vec4 iPar;
attribute float iCat;
uniform float uTime;
uniform float uResY;
uniform float uFogDensity;
uniform float uMinPx;
uniform float uCat[10];
varying vec3 vCol;
varying vec2 vUv;
void main() {
  vec4 wp = modelMatrix * vec4(iPos, 1.0);
  vec3 toCam = cameraPosition - wp.xyz;
  float dist = max(length(toCam), 0.01);
  vec3 V = toCam / dist;
  vec3 up = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
  float I = uCat[int(iCat + 0.5)];
  vec3 col = iColA;
  int mode = int(iPar.y + 0.5);
  vec3 ax = normalize(mat3(modelMatrix) * iDir.xyz);
  float d = dot(V, ax);
  if (iDir.w > 0.5 && iDir.w < 1.5) { col = d >= 0.0 ? iColA : iColB; I *= smoothstep(0.0, 0.06, abs(d)); }
  else if (iDir.w > 1.5) { I *= smoothstep(-0.05, 0.3, d); }
  float el = dot(V, up);
  if (mode == 1) I *= mix(1.0, 0.3, smoothstep(0.15, 0.7, el));
  else if (mode == 2) {
    float ph = fract(uTime * 2.0) - iPar.z;
    I *= 5.0 * exp(-ph * ph / 0.0009);
  } else if (mode == 3) {
    // rotating beacon: white and green beams 180 deg apart, 12 rpm
    vec3 e = normalize(mat3(modelMatrix) * vec3(1.0, 0.0, 0.0));
    vec3 n = normalize(cross(up, e));
    float az = atan(dot(V, n), dot(V, e));
    float b = uTime * 1.2566 + iPar.z;
    float w = pow(max(cos(az - b), 0.0), 60.0), g = pow(max(cos(az - b - 3.14159), 0.0), 60.0);
    col = iColA * w + iColB * g;
    I *= 0.04 + 6.0 * smoothstep(-0.3, 0.1, el) * (1.0 - smoothstep(0.4, 0.9, el));
  } else if (mode == 4) {
    float eDeg = degrees(asin(clamp(el, -1.0, 1.0)));
    col = mix(iColB, iColA, smoothstep(iPar.w - 0.03, iPar.w + 0.03, eDeg));
    I *= smoothstep(-0.6, 0.3, eDeg) * (1.0 - smoothstep(9.0, 14.0, eDeg));
  } else if (mode == 5) {
    I *= 0.25 + 0.75 * smoothstep(0.2, -0.3, el);
  } else if (mode == 6) {
    I *= step(0.5, fract(uTime * 0.5 + iPar.z)) * 0.9 + 0.1;
  }
  // haze extinction (matches FogExp2)
  float fd = uFogDensity * dist;
  I *= exp(-fd * fd);
  // size: real size up close, at least uMinPx pixels far away (dimmer, so energy stays plausible)
  float pix = dist * 2.0 / (projectionMatrix[1][1] * uResY);
  float s = iPar.x;
  float sEff = max(s, uMinPx * pix);
  I *= pow(s / sEff, 1.35);
  vCol = col * I;
  vec4 mv = viewMatrix * wp;
  mv.xyz += normalize(-mv.xyz) * min(sEff * 1.2, dist * 0.5);
  mv.xy += position.xy * sEff * 2.2;
  gl_Position = (I < 1e-4) ? vec4(0.0, 0.0, -2.0, 1.0) : projectionMatrix * mv;
  vUv = position.xy;
}
`;

const FRAG = /* glsl */`
varying vec3 vCol;
varying vec2 vUv;
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 22.0);
  float halo = exp(-r2 * 5.0) * 0.12 + (1.0 - r2) * 0.015;
  gl_FragColor = vec4(vCol * (core + halo), 1.0);
}
`;

/** Build the instanced sprite mesh for a LightList. */
export function buildLightMesh(list, shared) {
  const n = list.count;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const P = new Float32Array(n * 3), A = new Float32Array(n * 3), B = new Float32Array(n * 3);
  const D = new Float32Array(n * 4), R = new Float32Array(n * 4), C = new Float32Array(n);
  list.items.forEach((it, i) => {
    P.set(it.p, i * 3); A.set(it.a, i * 3); B.set(it.b, i * 3);
    D.set([...it.axis, it.beam], i * 4);
    R.set([it.size, it.mode, it.phase, it.papi], i * 4);
    C[i] = it.cat;
  });
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(P, 3));
  g.setAttribute('iColA', new THREE.InstancedBufferAttribute(A, 3));
  g.setAttribute('iColB', new THREE.InstancedBufferAttribute(B, 3));
  g.setAttribute('iDir', new THREE.InstancedBufferAttribute(D, 4));
  g.setAttribute('iPar', new THREE.InstancedBufferAttribute(R, 4));
  g.setAttribute('iCat', new THREE.InstancedBufferAttribute(C, 1));
  g.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    name: 'airport-lights',
    uniforms: {
      uTime: shared.uTime,
      uResY: shared.uResY,
      uFogDensity: { value: 0 },
      uMinPx: { value: 1.6 },
      uCat: { value: new Array(NCAT).fill(1) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.name = 'airfield-lights';
  return mesh;
}
