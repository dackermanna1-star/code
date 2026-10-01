// The visible spray: a cone of fine droplets leaving the nozzle and a soft
// overspray cloud that hangs at the wall, drifts with the wind and thins out.
// Particles are analytic (spawn state + age) and live in a ring buffer of
// instanced billboards. They are lit by the irradiance volume plus the lamps
// nearest the walker, with strong forward scattering, so a mist cloud lights up
// when it drifts between you and a lamp.
import * as THREE from 'three';
import { GLSL_COMMON, shared } from '../render/shaderlib.js';

const N = 4096;

const VS = /* glsl */ `
precision highp float;
in vec2 position;
in vec4 aP;   // spawn position, spawn time
in vec4 aV;   // velocity, life (s)
in vec4 aC;   // linear colour, kind (0 jet, 1 cloud, 2 droplet)
in vec4 aS;   // size start, size end, drag, opacity
uniform mat4 viewMatrix, projectionMatrix;
uniform float uTime, uWind;
out vec2 vUv;
out vec4 vCol;
out vec3 vWPos;
flat out float vKind;
void main() {
  float age = uTime - aP.w;
  float life = aV.w;
  vKind = aC.w;
  if (age < 0.0 || age > life || life <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float k = aS.z;
  float tt = k > 0.0 ? (1.0 - exp(-k * age)) / k : age;
  vec3 p = aP.xyz + aV.xyz * tt;
  float x = age / life;
  // clouds drift with the shared wind and sink a little
  if (aC.w > 0.5 && aC.w < 1.5) p += vec3(0.22, -0.035, -0.12) * (0.3 + uWind) * age * age * 0.5 + vec3(0.0, 0.02, 0.0) * age;
  float size = mix(aS.x, aS.y, sqrt(x));
  vec4 vp = viewMatrix * vec4(p, 1.0);
  vp.xy += position * size;
  gl_Position = projectionMatrix * vp;
  vUv = position;
  float fade = aC.w > 1.5 ? (1.0 - x) : smoothstep(0.0, 0.12, x) * (1.0 - x) * (1.0 - x);
  vCol = vec4(aC.rgb, aS.w * fade);
  vWPos = p;
}
`;

const FS = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler3D;
${GLSL_COMMON}
uniform vec3 uCamPos;
in vec2 vUv;
in vec4 vCol;
in vec3 vWPos;
flat in float vKind;
out vec4 fragColor;
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float a = vCol.a * (1.0 - r2) * (1.0 - r2);
  if (a < 0.002) discard;
  vec3 V = normalize(uCamPos - vWPos);
  // ambient from the irradiance volume (mist scatters what it is bathed in)
  vec3 amb = sampleIrradiance(vWPos, V) * 0.32;
  vec3 lit = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    vec4 L = uCapsuleLights[i];
    if (L.w <= 0.0) continue;
    vec3 Lv = L.xyz - vWPos;
    float d2 = max(dot(Lv, Lv), 0.25);
    vec3 l = Lv * inversesqrt(d2);
    // Henyey-Greenstein-ish forward scattering toward the eye
    float c = dot(-l, -V);
    float g = 0.55;
    float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5);
    lit += vec3(1.0, 0.78, 0.55) * L.w * (0.35 + 0.65 * hg) / d2;
  }
  vec3 col = vCol.rgb * (amb + lit * 0.45);
  fragColor = vec4(col, a);
}
`;

export class SprayMist {
  constructor(engine) {
    this.engine = engine;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.attr = {};
    for (const k of ['aP', 'aV', 'aC', 'aS']) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(k, a);
      this.attr[k] = a;
    }
    geo.instanceCount = N;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    // dead until spawned
    this.attr.aV.array.fill(0);
    this.uniforms = {
      uTime: shared.uTime,
      uWind: shared.uWind,
      uIrrA: shared.uIrrA,
      uIrrB: shared.uIrrB,
      uIrrMin: shared.uIrrMin,
      uIrrInvSize: shared.uIrrInvSize,
      uSkyIrr: shared.uSkyIrr,
      uSkyIrrSide: shared.uSkyIrrSide,
      uGroundIrr: shared.uGroundIrr,
      uCanyonFill: shared.uCanyonFill,
      uNoise3: shared.uNoise3,
      uNoise2: shared.uNoise2,
      uWetness: shared.uWetness,
      uCapsule: shared.uCapsule,
      uCapsuleLights: shared.uCapsuleLights,
      uCamPos: { value: new THREE.Vector3() },
    };
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      // leave the alpha channel alone: it carries the viewmodel mask for TAA
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.onBeforeRender = (r, s, cam) => this.uniforms.uCamPos.value.setFromMatrixPosition(cam.matrixWorld);
    engine.scene.add(this.mesh);
    this.head = 0;
    this.dirty = false;
    this.lo = N;
    this.hi = -1;
    this._v = new THREE.Vector3();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._h = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._t1 = new THREE.Vector3();
    this._t2 = new THREE.Vector3();
  }

  emit(p, v, life, col, kind, s0, s1, drag, alpha) {
    const i = this.head;
    this.head = (this.head + 1) % N;
    const o = i * 4;
    const A = this.attr;
    A.aP.array[o] = p.x; A.aP.array[o + 1] = p.y; A.aP.array[o + 2] = p.z; A.aP.array[o + 3] = shared.uTime.value;
    A.aV.array[o] = v.x; A.aV.array[o + 1] = v.y; A.aV.array[o + 2] = v.z; A.aV.array[o + 3] = life;
    A.aC.array[o] = col[0]; A.aC.array[o + 1] = col[1]; A.aC.array[o + 2] = col[2]; A.aC.array[o + 3] = kind;
    A.aS.array[o] = s0; A.aS.array[o + 1] = s1; A.aS.array[o + 2] = drag; A.aS.array[o + 3] = alpha;
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
    this.dirty = true;
  }

  /**
   * One frame of spraying. nozzle/dir: world; hitDist: metres to the surface (Infinity: into the air);
   * normal: surface normal at the hit; sigma: spray core radius at the wall; flow: 0..1; lin: linear colour.
   */
  spray(dt, nozzle, dir, hitDist, normal, sigma, flow, lin, rand) {
    const v = this._v, a = this._a, b = this._b;
    // an orthonormal frame around the jet
    a.set(0, 1, 0).cross(dir);
    if (a.lengthSq() < 1e-6) a.set(1, 0, 0);
    a.normalize();
    b.crossVectors(dir, a).normalize();
    const reach = Math.min(hitDist, 1.6);
    const spread = Math.min(0.5, Math.max(0.02, (sigma * 1.6) / Math.max(0.05, reach)));
    const col = lin;
    // jet: soft puffs that grow along the cone and vanish at the wall
    const nJet = Math.round((26 + 40 * flow) * dt * 60 * 0.5);
    for (let i = 0; i < nJet; i++) {
      const ang = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * spread;
      v.copy(dir).addScaledVector(a, Math.cos(ang) * rr).addScaledVector(b, Math.sin(ang) * rr).normalize();
      const speed = 5.5 + rand() * 4;
      const drag = 2.2;
      // time to cover the distance to the wall with drag: s = v(1 - e^{-kt})/k
      const x = (reach * drag) / speed;
      const tHit = x < 0.98 ? -Math.log(1 - x) / drag : 1.2;
      v.multiplyScalar(speed);
      const life = Math.min(tHit, 0.9) * (0.85 + 0.3 * rand());
      const s0 = 0.004 + 0.004 * rand();
      const s1 = 0.012 + sigma * (1.2 + 1.5 * rand()) * (reach / 0.3 + 0.3);
      this.emit(nozzle, v, life, col, 0, s0, s1, drag, 0.022 + 0.03 * flow);
    }
    // a few tiny bright droplets for sparkle
    const nDrop = Math.round((6 + 10 * flow) * dt * 60 * 0.5);
    for (let i = 0; i < nDrop; i++) {
      const ang = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * spread * 1.2;
      v.copy(dir).addScaledVector(a, Math.cos(ang) * rr).addScaledVector(b, Math.sin(ang) * rr).normalize();
      const speed = 7 + rand() * 5;
      const drag = 1.2;
      const x = (reach * drag) / speed;
      const tHit = x < 0.98 ? -Math.log(1 - x) / drag : 1.0;
      v.multiplyScalar(speed);
      this.emit(nozzle, v, Math.min(tHit, 0.8), col, 2, 0.0012, 0.0016, drag, 0.5);
    }
    // overspray cloud at the wall (or a fading plume in the air)
    if (hitDist < 1.8) {
      const nCloud = Math.round((3 + 7 * flow) * dt * 60 * 0.5);
      const hit = this._h.copy(nozzle).addScaledVector(dir, hitDist);
      // tangent frame on the surface
      const t1 = this._t1, t2 = this._t2;
      if (Math.abs(normal.y) < 0.9) t1.set(0, 1, 0).cross(normal).normalize();
      else t1.set(1, 0, 0);
      t2.crossVectors(normal, t1).normalize();
      for (let i = 0; i < nCloud; i++) {
        const ang = rand() * Math.PI * 2, rr = sigma * (0.5 + 2.5 * rand());
        // spread over the surface, pushed off it a little
        const p = this._p.copy(hit).addScaledVector(normal, 0.015 + 0.04 * rand()).addScaledVector(t1, Math.cos(ang) * rr).addScaledVector(t2, Math.sin(ang) * rr * 0.8);
        v.copy(normal).multiplyScalar(0.05 + 0.12 * rand());
        v.x += (rand() - 0.5) * 0.1;
        v.y += (rand() - 0.3) * 0.06;
        v.z += (rand() - 0.5) * 0.1;
        const s0 = sigma * (1.0 + rand()) + 0.02;
        this.emit(p, v, 0.9 + 1.8 * rand(), col, 1, s0, s0 * (2.4 + rand()), 0.6, 0.012 + 0.016 * flow);
      }
    }
  }

  update() {
    if (!this.dirty) return;
    for (const k of ['aP', 'aV', 'aC', 'aS']) {
      const a = this.attr[k];
      a.clearUpdateRanges();
      a.addUpdateRange(this.lo * 4, (this.hi - this.lo + 1) * 4);
      a.needsUpdate = true;
    }
    this.dirty = false;
    this.lo = N;
    this.hi = -1;
  }
}
