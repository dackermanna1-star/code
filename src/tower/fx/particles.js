// LAST LOOKOUT — pixel particles: one THREE.Points draw call per system, fixed-size typed arrays,
// no allocation per frame. Each particle is drawn as a chunky pixel blob (its point sprite is cut
// into at most 8×8 cells, round with a ragged edge; tiny ones are plain squares), coloured from a
// palette ramp over its life (a 16-step lookup texture), with ordered-dither transparency:
// normal particles are screen-door (opaque fragments or none: no sorting, they write depth),
// additive ones post-quantise their glow to four dithered levels. Sizes are in metres with a
// minimum on-screen size, so a blood mist 250 m out is still a few pixels.

import * as THREE from 'three';

/** Palette ramps: rows of [hex, alpha] keyframes, resampled to 16 steps over a particle's life. */
export const RAMPS = {
  fire: [['#fff8d0', 1], ['#ffe070', 1], ['#ffa030', 1], ['#e05a18', 0.9], ['#902810', 0.7], ['#401008', 0]],
  smoke: [['#4a4440', 0.0], ['#3c3836', 0.85], ['#45403c', 0.8], ['#57524c', 0.55], ['#615c55', 0.3], ['#6a655e', 0]],
  smokeLight: [['#c8c2b4', 0.65], ['#aaa498', 0.5], ['#948e84', 0.3], ['#857f76', 0]],
  dust: [['#a8946c', 0.8], ['#9c8a66', 0.6], ['#8e7e60', 0.35], ['#857758', 0]],
  dirt: [['#3e2e1e', 1], ['#3e2e1e', 1], ['#35281a', 1], ['#35281a', 0]],
  spark: [['#ffffff', 1], ['#fff0a0', 1], ['#ffb040', 0.9], ['#d05010', 0]],
  blood: [['#b01810', 1], ['#901008', 1], ['#6a0a06', 0.9], ['#4a0604', 0.5], ['#300302', 0]],
  bloodMist: [['#c02818', 0.9], ['#8a1209', 0.75], ['#5a0a06', 0.45], ['#3a0503', 0]],
  gas: [['#d0dc70', 0.0], ['#b4c454', 0.5], ['#9cb048', 0.45], ['#80963c', 0.32], ['#647a30', 0.16], ['#506428', 0]],
  flash: [['#ffffff', 1], ['#fff4c0', 1], ['#ffc860', 0.6], ['#ff8020', 0]],
  wood: [['#c09060', 1], ['#a87c50', 1], ['#8a6440', 0.9], ['#8a6440', 0]],
  concrete: [['#a8a49c', 1], ['#959188', 1], ['#85817a', 0.9], ['#85817a', 0]],
  ember: [['#ffd070', 1], ['#ff9030', 1], ['#d04010', 0.8], ['#601808', 0]],
  water: [['#e8f4ff', 0.9], ['#b8d0e0', 0.7], ['#90a8b8', 0.4], ['#90a8b8', 0]],
  shock: [['#fff0c8', 0.9], ['#e0c890', 0.5], ['#b09870', 0]],
  steam: [['#e8e4dc', 0.5], ['#d0ccc4', 0.3], ['#c0bcb4', 0]],
};
export const RAMP_INDEX = Object.fromEntries(Object.keys(RAMPS).map((k, i) => [k, i]));
/** How much the scene fog swallows each ramp (gameplay signals cut through the haze). */
const FOG_MUL = { blood: 0.25, bloodMist: 0.25, fire: 0.45, flash: 0.3, spark: 0.4, ember: 0.45, gas: 0.6, smoke: 0.8 };
const RAMP_ROWS = 16;
const STEPS = 16;

// flags
export const FLOOR = 1; // collide with the ground plane
export const STICK = 2; // stop dead on landing (debris, blood)
export const GROW_EASE = 4; // size grows fast then settles (smoke)

let rampTex = null;
function rampTexture() {
  if (rampTex) return rampTex;
  const data = new Uint8Array(STEPS * RAMP_ROWS * 4);
  Object.values(RAMPS).forEach((keys, row) => {
    for (let s = 0; s < STEPS; s++) {
      const u = (s / (STEPS - 1)) * (keys.length - 1);
      const i = Math.min(keys.length - 2, Math.floor(u)), f = u - i;
      const a = keys[i], b = keys[i + 1];
      const ca = parseInt(a[0].slice(1), 16), cb = parseInt(b[0].slice(1), 16);
      const lerp = (sh) => Math.round(((ca >> sh) & 255) * (1 - f) + ((cb >> sh) & 255) * f);
      const o = (row * STEPS + s) * 4;
      data[o] = lerp(16);
      data[o + 1] = lerp(8);
      data[o + 2] = lerp(0);
      data[o + 3] = Math.round(255 * (a[1] * (1 - f) + b[1] * f));
    }
  });
  rampTex = new THREE.DataTexture(data, STEPS, RAMP_ROWS, THREE.RGBAFormat);
  rampTex.colorSpace = THREE.SRGBColorSpace;
  rampTex.magFilter = rampTex.minFilter = THREE.NearestFilter;
  rampTex.generateMipmaps = false;
  rampTex.needsUpdate = true;
  return rampTex;
}

const VERT = /* glsl */ `
attribute float aSize;
attribute float aT;
attribute float aRamp;
attribute float aSeed;
uniform float uViewH;
uniform float uMinPx;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFogMul[${RAMP_ROWS}];
varying float vT;
varying float vRamp;
varying float vSeed;
varying float vPx;
varying float vFog;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = aSize * uViewH * 0.5 * projectionMatrix[1][1] / max(0.05, -mv.z);
  px = clamp(px, uMinPx, 160.0);
  if (aT < 0.0 || aT >= 1.0) px = 0.0;
  gl_PointSize = px;
  vPx = px;
  vT = clamp(aT, 0.0, 0.999);
  vRamp = aRamp;
  vSeed = aSeed;
  vFog = uFogFar > uFogNear ? smoothstep(uFogNear, uFogFar, -mv.z) * uFogMul[int(aRamp + 0.5)] : 0.0;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uRamp;
uniform float uAdditive;
uniform vec3 uFogColor;
varying float vT;
varying float vRamp;
varying float vSeed;
varying float vPx;
varying float vFog;
float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float i = q.x + q.y * 4.0;
  // 0 8 2 10 / 12 4 14 6 / 3 11 1 9 / 15 7 13 5
  float b = i == 0.0 ? 0.0 : i == 1.0 ? 8.0 : i == 2.0 ? 2.0 : i == 3.0 ? 10.0 : i == 4.0 ? 12.0 : i == 5.0 ? 4.0 :
    i == 6.0 ? 14.0 : i == 7.0 ? 6.0 : i == 8.0 ? 3.0 : i == 9.0 ? 11.0 : i == 10.0 ? 1.0 : i == 11.0 ? 9.0 :
    i == 12.0 ? 15.0 : i == 13.0 ? 7.0 : i == 14.0 ? 13.0 : 5.0;
  return (b + 0.5) / 16.0;
}
float hash12(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}
void main() {
  float cells = clamp(floor(vPx / 2.0), 1.0, 8.0);
  vec2 cell = floor(gl_PointCoord * cells);
  vec2 c = (cell + 0.5) / cells - 0.5;
  float r = length(c) * 2.0;
  float jag = cells > 2.5 ? (hash12(cell + vSeed * 17.0) - 0.5) * 0.45 : 0.0;
  if (r > 1.0 + jag) discard;
  vec4 col = texture2D(uRamp, vec2((floor(vT * 16.0) + 0.5) / 16.0, (vRamp + 0.5) / ${RAMP_ROWS}.0));
  float a = col.a * (1.0 - 0.55 * smoothstep(0.45, 1.0, r));
  if (uAdditive > 0.5) {
    a = floor(a * 4.0 + bayer4(gl_FragCoord.xy)) / 4.0;
    if (a <= 0.0) discard;
    gl_FragColor = vec4(col.rgb * a * (1.0 - vFog), 1.0);
  } else {
    if (a < bayer4(gl_FragCoord.xy) * 0.94 + 0.03) discard;
    gl_FragColor = vec4(mix(col.rgb, uFogColor, vFog), 1.0);
  }
  #include <colorspace_fragment>
}`;

const _size = new THREE.Vector2();

export class PixelParticles {
  /** opts.max (capacity), opts.additive, opts.minPx (smallest on-screen size in target pixels). */
  constructor(scene, opts = {}) {
    const max = (this.max = opts.max || 4096);
    this.additive = !!opts.additive;
    this.n = 0;
    this.px = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.ramp = new Float32Array(max);
    this.seed = new Float32Array(max);
    this.flags = new Uint8Array(max);
    this.floor = opts.floorY || 0;
    const g = (this.geo = new THREE.BufferGeometry());
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1);
    this.aT = new THREE.BufferAttribute(new Float32Array(max), 1);
    this.aRamp = new THREE.BufferAttribute(new Float32Array(max), 1);
    this.aSeed = new THREE.BufferAttribute(new Float32Array(max), 1);
    this.attrs = [this.aPos, this.aSize, this.aT, this.aRamp, this.aSeed];
    for (const a of this.attrs) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aSize', this.aSize);
    g.setAttribute('aT', this.aT);
    g.setAttribute('aRamp', this.aRamp);
    g.setAttribute('aSeed', this.aSeed);
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uRamp: { value: rampTexture() },
        uViewH: { value: 360 },
        uMinPx: { value: opts.minPx ?? 2 },
        uAdditive: { value: this.additive ? 1 : 0 },
        uFogColor: { value: new THREE.Color(0x000000) },
        uFogNear: { value: 0 },
        uFogFar: { value: 0 },
        uFogMul: { value: Object.keys(RAMPS).map((k) => FOG_MUL[k] ?? 1).concat(new Array(RAMP_ROWS).fill(1)).slice(0, RAMP_ROWS) },
      },
      transparent: this.additive,
      depthWrite: !this.additive,
      depthTest: true,
      blending: this.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = this.additive ? 6 : 2;
    const U = this.mat.uniforms;
    this.points.onBeforeRender = (renderer) => {
      const rt = renderer.getRenderTarget();
      U.uViewH.value = rt ? rt.height : renderer.getDrawingBufferSize(_size).y;
    };
    this.scene = scene;
    scene.add(this.points);
  }

  /**
   * Adds a particle; returns false when the system is full. age0 < 0 delays its birth.
   * size0 -> size1 over its life (metres).
   */
  spawn(x, y, z, vx, vy, vz, life, size0, size1, ramp, drag = 0, grav = 0, flags = 0, age0 = 0) {
    if (this.n >= this.max) return false;
    const i = this.n++;
    const i3 = i * 3;
    this.px[i3] = x;
    this.px[i3 + 1] = y;
    this.px[i3 + 2] = z;
    this.vel[i3] = vx;
    this.vel[i3 + 1] = vy;
    this.vel[i3 + 2] = vz;
    this.age[i] = age0;
    this.life[i] = Math.max(0.01, life);
    this.s0[i] = size0;
    this.s1[i] = size1;
    this.ramp[i] = ramp;
    this.drag[i] = drag;
    this.grav[i] = grav;
    this.flags[i] = flags;
    this.seed[i] = Math.random() * 64;
    return true;
  }

  _move(from, to) {
    const f3 = from * 3, t3 = to * 3;
    for (let k = 0; k < 3; k++) {
      this.px[t3 + k] = this.px[f3 + k];
      this.vel[t3 + k] = this.vel[f3 + k];
    }
    this.age[to] = this.age[from];
    this.life[to] = this.life[from];
    this.s0[to] = this.s0[from];
    this.s1[to] = this.s1[from];
    this.ramp[to] = this.ramp[from];
    this.drag[to] = this.drag[from];
    this.grav[to] = this.grav[from];
    this.flags[to] = this.flags[from];
    this.seed[to] = this.seed[from];
  }

  update(dt, fog) {
    const { px, vel, age, life, s0, s1, drag, grav, flags } = this;
    const P = this.aPos.array, S = this.aSize.array, T = this.aT.array, R = this.aRamp.array, D = this.aSeed.array;
    const fl = this.floor;
    let n = this.n;
    for (let i = 0; i < n;) {
      const a = (age[i] += dt);
      if (a >= life[i]) {
        n--;
        if (i !== n) this._move(n, i);
        continue;
      }
      const i3 = i * 3;
      if (a >= 0) {
        const k = Math.max(0, 1 - drag[i] * dt);
        vel[i3] *= k;
        vel[i3 + 1] = vel[i3 + 1] * k - grav[i] * dt;
        vel[i3 + 2] *= k;
        px[i3] += vel[i3] * dt;
        px[i3 + 1] += vel[i3 + 1] * dt;
        px[i3 + 2] += vel[i3 + 2] * dt;
        const f = flags[i];
        if (f & FLOOR && px[i3 + 1] < fl + s0[i] * 0.3) {
          px[i3 + 1] = fl + s0[i] * 0.3;
          if (f & STICK) {
            vel[i3] = vel[i3 + 1] = vel[i3 + 2] = 0;
          } else {
            vel[i3 + 1] = Math.abs(vel[i3 + 1]) * 0.3;
            vel[i3] *= 0.55;
            vel[i3 + 2] *= 0.55;
          }
        }
      }
      const t = a / life[i];
      const e = flags[i] & GROW_EASE ? 1 - (1 - Math.max(0, t)) ** 3 : Math.max(0, t);
      P[i3] = px[i3];
      P[i3 + 1] = px[i3 + 1];
      P[i3 + 2] = px[i3 + 2];
      S[i] = s0[i] + (s1[i] - s0[i]) * e;
      T[i] = t;
      R[i] = this.ramp[i];
      D[i] = this.seed[i];
      i++;
    }
    this.n = n;
    this.geo.setDrawRange(0, n);
    if (n) {
      for (const at of this.attrs) {
        at.clearUpdateRanges();
        at.addUpdateRange(0, n * at.itemSize);
        at.needsUpdate = true;
      }
    }
    this.points.visible = n > 0;
    if (fog) {
      const U = this.mat.uniforms;
      U.uFogColor.value.copy(fog.color);
      if (fog.isFog) {
        U.uFogNear.value = fog.near;
        U.uFogFar.value = fog.far;
      } else if (fog.isFogExp2) {
        U.uFogNear.value = 0;
        U.uFogFar.value = 2.3 / Math.max(1e-4, fog.density);
      }
    }
  }

  clear() {
    this.n = 0;
    this.geo.setDrawRange(0, 0);
  }

  dispose() {
    this.scene.remove(this.points);
    this.geo.dispose();
    this.mat.dispose();
  }
}
