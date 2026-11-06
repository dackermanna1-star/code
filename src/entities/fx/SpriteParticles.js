// Pool of camera-facing (or velocity-stretched / flat) sprites drawn with ONE instanced draw call.
// Two flavours: 'lit' (alpha blended, lit with LIGHTING_GLSL: smoke, dust, mist, splashes) and 'add'
// (additive, unlit HDR: fire, embers, sparks, muzzle flashes, tracers, explosion flashes).
import * as THREE from 'three';
import { LIGHTING_GLSL, globalUniforms } from '../../render/materials.js';

export const MODE = { BILLBOARD: 0, STRETCH: 1, FLAT: 2 };

const VERT = /* glsl */ `
in vec4 iPos;    // xyz, size
in vec4 iColor;  // rgb (HDR), alpha
in vec4 iVel;    // velocity xyz, stretch length
in vec4 iMisc;   // rotation, frame, mode, aspect
in vec2 iLight;  // sky, block
out vec2 vUv;
out vec4 vColor;
out vec3 vWorldPos;
out vec2 vLight;
void main() {
  vec2 c = position.xy; // -1..1
  float size = iPos.w;
  int mode = int(iMisc.z + 0.5);
  vec3 wp = iPos.xyz;
  vec4 mv;
  if (mode == 2) {
    float cr = cos(iMisc.x), sr = sin(iMisc.x);
    vec2 r = vec2(c.x * cr - c.y * sr, c.x * sr + c.y * cr) * size * 0.5;
    wp += vec3(r.x, 0.0, r.y);
    mv = viewMatrix * vec4(wp, 1.0);
  } else {
    mv = viewMatrix * vec4(wp, 1.0);
    vec2 off;
    if (mode == 1) {
      vec3 vd = (viewMatrix * vec4(iVel.xyz, 0.0)).xyz;
      vec2 d = vd.xy;
      float l = length(d);
      d = l > 1e-4 ? d / l : vec2(0.0, 1.0);
      vec2 p = vec2(-d.y, d.x);
      float len = size + iVel.w * clamp(l / max(length(vd), 1e-4), 0.15, 1.0);
      off = d * c.y * len * 0.5 + p * c.x * size * 0.5;
    } else {
      float cr = cos(iMisc.x), sr = sin(iMisc.x);
      off = vec2(c.x * cr - c.y * sr, c.x * sr + c.y * cr) * size * 0.5 * vec2(1.0, iMisc.w);
    }
    mv.xy += off;
    vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    wp += camR * off.x + camU * off.y;
  }
  float f = floor(iMisc.y + 0.5);
  vec2 cell = vec2(mod(f, 4.0), floor(f / 4.0));
  vUv = vec2((cell.x + c.x * 0.5 + 0.5) / 4.0, 1.0 - (cell.y + 0.5 - c.y * 0.5) / 4.0);
  vColor = iColor;
  vWorldPos = wp;
  vLight = iLight;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG_LIT = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
uniform sampler2D map;
in vec2 vUv;
in vec4 vColor;
in vec3 vWorldPos;
in vec2 vLight;
out vec4 fragColor;
void main() {
  vec4 t = texture(map, vUv);
  float a = t.a * vColor.a;
  if (a < 0.01) discard;
  vec3 n = normalize(vec3(0.0, 1.0, 0.0) * 0.8 + normalize(uCamPos - vWorldPos) * 0.6);
  vec3 lit = computeLighting(vWorldPos, n, vLight.x, vLight.y, 1.0);
  vec3 col = t.rgb * vColor.rgb * lit;
  col = applyFog(col, vWorldPos);
  fragColor = vec4(col, a);
}
`;
const FRAG_ADD = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
uniform sampler2D map;
in vec2 vUv;
in vec4 vColor;
in vec3 vWorldPos;
in vec2 vLight;
out vec4 fragColor;
void main() {
  vec4 t = texture(map, vUv);
  float a = t.a * vColor.a;
  if (a < 0.004) discard;
  float d = length(vWorldPos - uCamPos);
  float fog = exp(-pow(d * uFogDensity, 1.7));
  fragColor = vec4(t.rgb * vColor.rgb * a * fog, 1.0);
}
`;

const F = ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'grav', 'drag', 's0', 's1', 'life', 'age', 'r0', 'g0', 'b0', 'r1', 'g1', 'b1', 'a0', 'rot', 'spin', 'frame', 'mode', 'stretch', 'aspect', 'sky', 'block', 'fin', 'fout', 'bounce', 'grow'];

export class SpriteParticles {
  constructor(scene, map, max, additive) {
    this.max = max;
    this.n = 0;
    this.cursor = 0;
    for (const f of F) this[f] = new Float32Array(max);
    this.collide = new Uint8Array(max);
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPos = mk(4); this.aColor = mk(4); this.aVel = mk(4); this.aMisc = mk(4); this.aLight = mk(2);
    quad.setAttribute('iPos', this.aPos);
    quad.setAttribute('iColor', this.aColor);
    quad.setAttribute('iVel', this.aVel);
    quad.setAttribute('iMisc', this.aMisc);
    quad.setAttribute('iLight', this.aLight);
    quad.instanceCount = 0;
    this.geo = quad;
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: additive ? FRAG_ADD : FRAG_LIT,
      uniforms: { ...globalUniforms, map: { value: map } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(quad, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 12 : 10;
    this.mesh.name = additive ? 'fx_sprites_add' : 'fx_sprites_lit';
    scene.add(this.mesh);
  }

  /**
   * o: {vx,vy,vz, grav, drag, s0, s1, life, color:[r,g,b], color1:[r,g,b], alpha, rot, spin, frame, mode,
   *     stretch, aspect, sky, block, fadeIn, fadeOut, collide, bounce, grow}
   */
  spawn(x, y, z, o) {
    let i;
    if (this.n < this.max) i = this.n++;
    else { i = this.cursor; this.cursor = (this.cursor + 1) % this.max; }
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = o.vx || 0; this.vy[i] = o.vy || 0; this.vz[i] = o.vz || 0;
    this.grav[i] = o.grav || 0; this.drag[i] = o.drag ?? 1;
    this.s0[i] = o.s0 ?? 0.5; this.s1[i] = o.s1 ?? this.s0[i];
    this.life[i] = o.life ?? 1; this.age[i] = 0;
    const c = o.color || WHITE, c1 = o.color1 || c;
    this.r0[i] = c[0]; this.g0[i] = c[1]; this.b0[i] = c[2];
    this.r1[i] = c1[0]; this.g1[i] = c1[1]; this.b1[i] = c1[2];
    this.a0[i] = o.alpha ?? 1;
    this.rot[i] = o.rot ?? Math.random() * 6.283;
    this.spin[i] = o.spin ?? 0;
    this.frame[i] = o.frame ?? 0;
    this.mode[i] = o.mode ?? 0;
    this.stretch[i] = o.stretch ?? 0;
    this.aspect[i] = o.aspect ?? 1;
    this.sky[i] = o.sky ?? 1; this.block[i] = o.block ?? 0;
    this.fin[i] = o.fadeIn ?? 0.05; this.fout[i] = o.fadeOut ?? 0.5;
    this.collide[i] = o.collide ? 1 : 0;
    this.bounce[i] = o.bounce ?? 0.3;
    this.grow[i] = o.grow ?? 0.5; // size curve exponent (0.5 = fast early growth)
    return i;
  }

  _kill(i) {
    const j = --this.n;
    if (i !== j) { for (const f of F) this[f][i] = this[f][j]; this.collide[i] = this.collide[j]; }
    if (this.cursor >= this.n) this.cursor = 0;
  }

  clear() { this.n = 0; this.geo.instanceCount = 0; }

  update(dt, world, wind) {
    const P = this.aPos.array, C = this.aColor.array, V = this.aVel.array, M = this.aMisc.array, L = this.aLight.array;
    const wx = wind ? wind.x : 0, wz = wind ? wind.z : 0;
    for (let i = 0; i < this.n; i++) {
      const age = (this.age[i] += dt);
      const life = this.life[i];
      if (age >= life) { this._kill(i); i--; continue; }
      const t = age / life;
      // integrate
      let vx = this.vx[i], vy = this.vy[i], vz = this.vz[i];
      vy += this.grav[i] * dt;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      vx = vx * dr + wx * (1 - dr); vy *= dr; vz = vz * dr + wz * (1 - dr);
      let x = this.px[i] + vx * dt, y = this.py[i] + vy * dt, z = this.pz[i] + vz * dt;
      if (this.collide[i] && world && world.isSolid(Math.floor(x), Math.floor(y), Math.floor(z))) {
        if (!world.isSolid(Math.floor(this.px[i]), Math.floor(y), Math.floor(this.pz[i]))) { x = this.px[i]; z = this.pz[i]; vx = -vx * this.bounce[i]; vz = -vz * this.bounce[i]; }
        else { y = this.py[i]; vy = -vy * this.bounce[i]; vx *= 0.6; vz *= 0.6; }
      }
      this.px[i] = x; this.py[i] = y; this.pz[i] = z;
      this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
      this.rot[i] += this.spin[i] * dt;
      // appearance
      const size = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.pow(t, this.grow[i]);
      let a = this.a0[i];
      const fi = this.fin[i], fo = this.fout[i];
      if (fi > 0 && t < fi) a *= t / fi;
      if (t > 1 - fo) a *= (1 - t) / fo;
      const o4 = i * 4;
      P[o4] = x; P[o4 + 1] = y; P[o4 + 2] = z; P[o4 + 3] = size;
      C[o4] = this.r0[i] + (this.r1[i] - this.r0[i]) * t;
      C[o4 + 1] = this.g0[i] + (this.g1[i] - this.g0[i]) * t;
      C[o4 + 2] = this.b0[i] + (this.b1[i] - this.b0[i]) * t;
      C[o4 + 3] = a;
      V[o4] = vx; V[o4 + 1] = vy; V[o4 + 2] = vz; V[o4 + 3] = this.stretch[i];
      M[o4] = this.rot[i]; M[o4 + 1] = this.frame[i]; M[o4 + 2] = this.mode[i]; M[o4 + 3] = this.aspect[i];
      L[i * 2] = this.sky[i]; L[i * 2 + 1] = this.block[i];
    }
    this.geo.instanceCount = this.n;
    if (this.n) {
      for (const a of [this.aPos, this.aColor, this.aVel, this.aMisc, this.aLight]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, this.n * a.itemSize);
        a.needsUpdate = true;
      }
    }
  }
}
const WHITE = [1, 1, 1];
