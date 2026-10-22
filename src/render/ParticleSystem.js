// GPU particles. Each particle's motion is evaluated in closed form in the
// vertex shader, so the CPU only writes attributes when a particle is born:
//
//   with drag k:   p(t) = p0 + vT*t + (v0 - vT)(1 - e^(-k t)) / k
//   without drag:  p(t) = p0 + v0*t + 0.5 * a * t^2        (a stored in vT)
//
// vT is the terminal velocity (wind drift + buoyancy or gravity / k). Pools
// are ring buffers; only the written range is uploaded each frame.

import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec4 aP0;   // xyz spawn position, w spawn time
attribute vec4 aV0;   // xyz initial velocity, w lifetime
attribute vec4 aVt;   // xyz terminal velocity (or acceleration when k == 0), w drag k
attribute vec4 aSz;   // size start, size end, rotation, rotation speed
attribute vec4 aC0;   // start colour rgba
attribute vec4 aC1;   // end colour rgba
attribute vec4 aMisc; // atlas frame, fade-in fraction, emissive (0..1), stretch
uniform float uTime;
uniform float uFogDensity;
varying vec2 vUv;
varying vec4 vColor;
varying float vFog;
varying float vEmissive;

vec3 posAt(float age) {
  float k = aVt.w;
  if (k > 0.0001) {
    float e = exp(-k * age);
    return aP0.xyz + aVt.xyz * age + (aV0.xyz - aVt.xyz) * (1.0 - e) / k;
  }
  return aP0.xyz + aV0.xyz * age + 0.5 * aVt.xyz * age * age;
}

void main() {
  float age = uTime - aP0.w;
  float life = aV0.w;
  float t = age / life;
  if (age < 0.0 || t >= 1.0 || life <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vColor = vec4(0.0);
    return;
  }
  vec3 p = posAt(age);
  // Size grows quickly then settles (smoke billows out, then drifts).
  float g = 1.0 - (1.0 - t) * (1.0 - t);
  float size = mix(aSz.x, aSz.y, g);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec2 corner = position.xy;
  float stretch = aMisc.w;
  if (stretch > 0.0) {
    // Align the quad with the screen-space velocity (sparks, streaks).
    vec3 p2 = posAt(age + 0.02);
    vec4 mv2 = modelViewMatrix * vec4(p2, 1.0);
    vec2 dir = mv2.xy - mv.xy;
    float len = length(dir);
    dir = len > 1e-5 ? dir / len : vec2(1.0, 0.0);
    vec2 perp = vec2(-dir.y, dir.x);
    float l = size * (1.0 + len * stretch * 50.0);
    mv.xy += dir * corner.x * l + perp * corner.y * size;
  } else {
    float r = aSz.z + aSz.w * age;
    float c = cos(r);
    float s = sin(r);
    mv.xy += vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y) * size;
  }
  gl_Position = projectionMatrix * mv;
  float fadeIn = max(aMisc.y, 0.001);
  float a = smoothstep(0.0, fadeIn, t) * (1.0 - smoothstep(0.55, 1.0, t));
  vColor = mix(aC0, aC1, t);
  vColor.a *= a;
  // Fade out particles very close to the camera (avoid big flat sprites).
  vColor.a *= smoothstep(0.3, 1.5, -mv.z / max(size, 0.25));
  float frame = aMisc.x;
  vec2 cell = vec2(mod(frame, 4.0), floor(frame / 4.0));
  vUv = (cell + (position.xy + 0.5) * vec2(1.0, -1.0) + vec2(0.0, 1.0)) / 4.0;
  vUv.y = 1.0 - vUv.y;
  float d = -mv.z;
  vFog = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
  vEmissive = aMisc.z;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uFogColor;
uniform vec3 uLight;     // ambient light level for unlit-looking smoke
uniform float uAdditive;
varying vec2 vUv;
varying vec4 vColor;
varying float vFog;
varying float vEmissive;
void main() {
  vec4 tex = texture2D(uAtlas, vUv);
  vec4 c = vColor * tex;
  if (c.a < 0.004) discard;
  if (uAdditive > 0.5) {
    c.rgb *= c.a * (1.0 - vFog * 0.85);
    gl_FragColor = vec4(c.rgb, 1.0);
  } else {
    c.rgb *= mix(uLight, vec3(1.0), vEmissive);
    c.rgb = mix(c.rgb, uFogColor, vFog);
    gl_FragColor = c;
  }
}
`;

const ATTRS = ['aP0', 'aV0', 'aVt', 'aSz', 'aC0', 'aC1', 'aMisc'];

export class ParticlePool {
  constructor(max, atlas, additive, renderOrder = 10) {
    this.max = max;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    this.arrays = {};
    for (const name of ATTRS) {
      const arr = new Float32Array(max * 4);
      const attr = new THREE.InstancedBufferAttribute(arr, 4);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, attr);
      this.arrays[name] = arr;
    }
    // All particles start expired.
    for (let i = 0; i < max; i++) this.arrays.aV0[i * 4 + 3] = 0;
    geo.instanceCount = max;
    this.geo = geo;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uAtlas: { value: atlas },
        uFogColor: { value: new THREE.Color(0.6, 0.65, 0.7) },
        uFogDensity: { value: 0.0004 },
        uLight: { value: new THREE.Color(1, 1, 1) },
        uAdditive: { value: additive ? 1 : 0 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.head = 0;
    this.frameStart = 0;
    this.time = 0;
    this.spawnedThisFrame = 0;
  }

  // p: { x,y,z, vx,vy,vz, life, k, tx,ty,tz, s0,s1, rot,spin, r,g,b,a, r1,g1,b1,a1, frame, fadeIn, emissive, stretch }
  spawn(p) {
    const i = this.head;
    if (this.spawnedThisFrame === 0) this.frameStart = i;
    this.head = (this.head + 1) % this.max;
    const o = i * 4;
    const A = this.arrays;
    A.aP0[o] = p.x;
    A.aP0[o + 1] = p.y;
    A.aP0[o + 2] = p.z;
    A.aP0[o + 3] = this.time + (p.delay || 0);
    A.aV0[o] = p.vx;
    A.aV0[o + 1] = p.vy;
    A.aV0[o + 2] = p.vz;
    A.aV0[o + 3] = p.life;
    A.aVt[o] = p.tx;
    A.aVt[o + 1] = p.ty;
    A.aVt[o + 2] = p.tz;
    A.aVt[o + 3] = p.k;
    A.aSz[o] = p.s0;
    A.aSz[o + 1] = p.s1;
    A.aSz[o + 2] = p.rot;
    A.aSz[o + 3] = p.spin;
    A.aC0[o] = p.r;
    A.aC0[o + 1] = p.g;
    A.aC0[o + 2] = p.b;
    A.aC0[o + 3] = p.a;
    A.aC1[o] = p.r1;
    A.aC1[o + 1] = p.g1;
    A.aC1[o + 2] = p.b1;
    A.aC1[o + 3] = p.a1;
    A.aMisc[o] = p.frame;
    A.aMisc[o + 1] = p.fadeIn;
    A.aMisc[o + 2] = p.emissive;
    A.aMisc[o + 3] = p.stretch;
    this.spawnedThisFrame++;
  }

  // Upload only the slots written since the last flush.
  flush(time) {
    this.time = time;
    this.material.uniforms.uTime.value = time;
    const n = this.spawnedThisFrame;
    if (n === 0) return;
    const start = this.frameStart;
    const end = this.head;
    for (const name of ATTRS) {
      const attr = this.geo.getAttribute(name);
      attr.clearUpdateRanges();
      if (n >= this.max) {
        attr.addUpdateRange(0, this.max * 4);
      } else if (end > start) {
        attr.addUpdateRange(start * 4, (end - start) * 4);
      } else {
        // Wrapped around the end of the ring.
        attr.addUpdateRange(start * 4, (this.max - start) * 4);
        if (end > 0) attr.addUpdateRange(0, end * 4);
      }
      attr.needsUpdate = true;
    }
    this.spawnedThisFrame = 0;
  }

  setEnvironment(fogColor, fogDensity, light) {
    const u = this.material.uniforms;
    u.uFogColor.value.copy(fogColor);
    u.uFogDensity.value = fogDensity;
    u.uLight.value.copy(light);
  }
}

// Reusable spawn descriptor with sensible defaults.
export function particle() {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, k: 0, tx: 0, ty: 0, tz: 0,
    s0: 1, s1: 1, rot: 0, spin: 0, r: 1, g: 1, b: 1, a: 1, r1: 1, g1: 1, b1: 1, a1: 0,
    frame: 0, fadeIn: 0.05, emissive: 0, stretch: 0, delay: 0,
  };
}
