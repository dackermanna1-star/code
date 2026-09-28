// Dead Air 5 — effects & model toolkit.
//  FlameField: instanced procedural flame / fireball sprites (one draw call)
//    for big fires that must read from 100+ m (the crashed airliner, burning
//    jets, fuel fires) and for the crash fireballs. Additive, HDR (blooms),
//    own distance haze instead of scene fog.
//  MeshKit: builds animated models from primitives merged per material, with
//    box-projected UVs (like level geometry) so tiling panel textures work.
//  panelTexture / decalTexture: procedural canvas textures for aircraft skins.
import * as THREE from 'three';

// ------------------------------------------------------------ FlameField --
const FLAME_VS = `
attribute vec3 iPos; attribute vec2 iSize; attribute vec4 iA;
varying vec2 vUv; varying vec4 vA; varying float vFade;
uniform float fogD;
void main(){
  vUv = uv; vA = iA;
  vec3 toCam = cameraPosition - iPos;
  vec3 wp;
  if (iA.z < 0.5) {
    vec3 f = normalize(vec3(toCam.x, 0.0, toCam.z) + vec3(1e-4, 0.0, 0.0));
    vec3 right = vec3(f.z, 0.0, -f.x);
    wp = iPos + right * position.x * iSize.x + vec3(0.0, (position.y + 0.5) * iSize.y, 0.0);
  } else {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float c = cos(iA.x * 6.28), s = sin(iA.x * 6.28);
    vec2 p = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
    wp = iPos + (right * p.x + up * p.y) * iSize.x;
  }
  float d = length(cameraPosition - wp);
  vFade = exp(-pow(d * fogD, 2.0));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const FLAME_FS = `
uniform float time;
varying vec2 vUv; varying vec4 vA; varying float vFade;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.07 + vec2(1.7, 9.2); a *= 0.5; } return v; }
void main(){
  float seed = vA.x, inten = vA.y;
  vec3 col; float a;
  if (vA.z < 0.5) {
    vec2 q = vec2(vUv.x * 2.0 - 1.0, vUv.y);
    float t = time * (0.9 + fract(seed * 3.7) * 0.6);
    float n = fbm(vec2(q.x * 1.7 + seed * 13.0, q.y * 2.3 - t * 2.3));
    float n2 = fbm(vec2(q.x * 3.3 - seed * 5.0, q.y * 4.2 - t * 3.7));
    float w = mix(0.92, 0.06, pow(q.y, 0.75));
    float dx = abs(q.x + (n - 0.5) * 0.65 * q.y);
    float body = smoothstep(w, w * 0.3, dx);
    body *= smoothstep(1.0, 0.3, q.y + (n2 - 0.5) * 0.6);
    body *= smoothstep(0.0, 0.07, q.y);
    float heat = body * (1.15 - q.y * 0.95) * (0.7 + n2 * 0.6);
    col = mix(vec3(0.5, 0.06, 0.01), vec3(1.0, 0.4, 0.05), smoothstep(0.12, 0.5, heat));
    col = mix(col, vec3(1.0, 0.86, 0.52), smoothstep(0.62, 1.05, heat));
    a = body * (0.55 + heat * 0.6);
  } else {
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    float n = fbm(q * 1.9 + seed * 11.0 + vec2(0.0, -time * 0.7));
    float body = smoothstep(1.0, 0.4, r + (n - 0.5) * 0.7);
    float heat = vA.w;
    float core = body * (0.55 + n * 0.9) * heat;
    col = mix(vec3(0.3, 0.05, 0.01), vec3(1.0, 0.38, 0.05), smoothstep(0.08, 0.55, core));
    col = mix(col, vec3(1.0, 0.9, 0.62), smoothstep(0.62, 1.15, core));
    a = body * (0.2 + 0.8 * heat);
  }
  gl_FragColor = vec4(col * a * inten * vFade, 1.0);
}`;

export class FlameField {
  // cap: static flames; pcap: transient fireball puffs
  constructor(L, game, cap = 96, pcap = 96, o = {}) {
    this.game = game;
    this.cap = cap; this.pcap = pcap;
    const N = cap + pcap;
    const geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    this.pos = new Float32Array(N * 3);
    this.size = new Float32Array(N * 2);
    this.attr = new Float32Array(N * 4);
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.pos, 3));
    geo.setAttribute('iSize', new THREE.InstancedBufferAttribute(this.size, 2));
    geo.setAttribute('iA', new THREE.InstancedBufferAttribute(this.attr, 4));
    geo.instanceCount = N;
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, fogD: { value: o.fogD ?? 0.0035 } },
      vertexShader: FLAME_VS, fragmentShader: FLAME_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;
    mesh.userData.noCull = true;
    L.addObject(mesh);
    this.mesh = mesh;
    this.n = 0;
    this.flames = []; // {i, base intensity, target, cur, flick}
    this.puffs = [];
    for (let i = 0; i < pcap; i++) this.puffs.push({ i: cap + i, life: 0, t: 1 });
    this.pNext = 0;
    L.dynamics.push(this);
  }
  // A standing flame (base centre x,y,z; w x h metres). Returns handle.
  add(x, y, z, w, h, o = {}) {
    if (this.n >= this.cap) return null;
    const i = this.n++;
    const f = { i, x, y, z, w, h, seed: o.seed ?? ((i * 0.6180339) % 1), target: o.intensity ?? 1, cur: o.on === false ? 0 : (o.intensity ?? 1), rate: o.rate ?? 0.5, flick: o.flicker ?? 0.15 };
    this.flames.push(f);
    this._write(f);
    return f;
  }
  _write(f) {
    const i = f.i;
    this.pos[i * 3] = f.x; this.pos[i * 3 + 1] = f.y; this.pos[i * 3 + 2] = f.z;
    this.size[i * 2] = f.w; this.size[i * 2 + 1] = f.h;
    this.attr[i * 4] = f.seed; this.attr[i * 4 + 1] = f.cur; this.attr[i * 4 + 2] = 0; this.attr[i * 4 + 3] = 1;
  }
  // transient fireball puff (spherical billboard) moving/expanding over its life
  puff(x, y, z, o = {}) {
    const p = this.puffs[this.pNext];
    this.pNext = (this.pNext + 1) % this.pcap;
    p.x = x; p.y = y; p.z = z;
    p.vx = o.vx ?? 0; p.vy = o.vy ?? 0; p.vz = o.vz ?? 0;
    p.s0 = o.s0 ?? 2; p.s1 = o.s1 ?? 8;
    p.life = o.life ?? 1.6; p.t = 0;
    p.heat = o.heat ?? 1.2; p.inten = o.intensity ?? 1.4;
    p.drag = o.drag ?? 1.2; p.rise = o.rise ?? 3;
    p.seed = Math.random();
    return p;
  }
  // big multi-puff fireball
  fireball(x, y, z, r = 10, n = 22, o = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.283, e = Math.random() * 1.2 - 0.2;
      const s = (0.4 + Math.random()) * r * (o.speed ?? 1.2);
      this.puff(x + (Math.random() - 0.5) * r * 0.4, y + Math.random() * r * 0.3, z + (Math.random() - 0.5) * r * 0.4, {
        vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + r * 0.4, vz: Math.sin(a) * Math.cos(e) * s,
        s0: r * (0.25 + Math.random() * 0.2), s1: r * (0.9 + Math.random() * 0.8), life: (o.life ?? 2.2) * (0.6 + Math.random() * 0.7),
        heat: 1.3, intensity: o.intensity ?? 1.6, drag: 1.6, rise: r * 0.5,
      });
    }
  }
  update(dt) {
    const g = this.game;
    this.mat.uniforms.time.value = g.time;
    for (const f of this.flames) {
      if (f.cur !== f.target) {
        const d = f.target - f.cur, st = dt * f.rate;
        f.cur = Math.abs(d) <= st ? f.target : f.cur + Math.sign(d) * st;
      }
      const k = f.cur * (1 - f.flick + f.flick * (0.6 + 0.4 * Math.sin(g.time * (7 + f.seed * 9) + f.seed * 40)));
      this.attr[f.i * 4 + 1] = k;
    }
    for (const p of this.puffs) {
      const i = p.i;
      if (p.t >= p.life) { this.size[i * 2] = 0; this.attr[i * 4 + 1] = 0; continue; }
      p.t += dt;
      const k = Math.min(1, p.t / p.life);
      const dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr + p.rise * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      const s = p.s0 + (p.s1 - p.s0) * (1 - (1 - k) * (1 - k));
      this.size[i * 2] = s; this.size[i * 2 + 1] = s;
      this.attr[i * 4] = p.seed; this.attr[i * 4 + 1] = p.inten * (1 - k * k) * Math.min(1, p.t * 12); this.attr[i * 4 + 2] = 1; this.attr[i * 4 + 3] = Math.max(0, p.heat * (1 - k * 1.1));
    }
    this.geo.attributes.iPos.needsUpdate = true;
    this.geo.attributes.iSize.needsUpdate = true;
    this.geo.attributes.iA.needsUpdate = true;
  }
}

// --------------------------------------------------------------- MeshKit --
// Add primitives (THREE geometries + transform) per material; build() merges
// them into one mesh per material with box-projected world-ish UVs (scale =
// metres per texture tile) and flat vertex colours (tint).
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
export function trsM(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
}
export class MeshKit {
  constructor() { this.parts = new Map(); }
  add(geo, mat, m, tint = 0xffffff, uvScale = 2) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push({ g, tint: new THREE.Color(tint), uvScale });
    return this;
  }
  // helpers (rotation order YXZ like Flyer)
  box(x, y, z, sx, sy, sz, mat, tint, rot = [0, 0, 0]) { return this.add(new THREE.BoxGeometry(1, 1, 1), mat, trsM(x, y, z, rot[0], rot[1], rot[2], sx, sy, sz), tint); }
  cyl(x, y, z, r0, r1, h, mat, tint, rot = [0, 0, 0], seg = 16, open = false) { return this.add(new THREE.CylinderGeometry(r0, r1, h, seg, 1, open), mat, trsM(x, y, z, rot[0], rot[1], rot[2]), tint); }
  cylZ(x, y, z, r0, r1, len, mat, tint, seg = 16, open = false) { return this.cyl(x, y, z, r0, r1, len, mat, tint, [Math.PI / 2, 0, 0], seg, open); }
  sph(x, y, z, r, mat, tint, sc = [1, 1, 1], seg = 14, part) {
    const g = part ? new THREE.SphereGeometry(1, seg, Math.max(4, seg >> 1), part[0], part[1], part[2], part[3]) : new THREE.SphereGeometry(1, seg, Math.max(4, seg >> 1));
    return this.add(g, mat, trsM(x, y, z, 0, 0, 0, r * sc[0], r * sc[1], r * sc[2]), tint);
  }
  // quad (8 corners) prism: corners [x,y,z] x8 in BoxGeometry corner order via
  // bottom/top rectangles (for tapered wings/fins): a0..a3 one end, b0..b3 other end
  prism(a, b, mat, tint) {
    const g = new THREE.BufferGeometry();
    const P = [...a, ...b];
    const idx = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0];
    const pos = [];
    for (const k of idx) pos.push(P[k][0], P[k][1], P[k][2]);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return this.add(g, mat, new THREE.Matrix4(), tint);
  }
  build(o = {}) {
    const grp = new THREE.Group();
    for (const [mat, list] of this.parts) {
      let n = 0;
      for (const p of list) n += p.g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
      let o2 = 0;
      for (const p of list) {
        const P = p.g.attributes.position, N = p.g.attributes.normal;
        const c = P.count;
        pos.set(P.array, o2 * 3);
        nor.set(N.array, o2 * 3);
        for (let i = 0; i < c; i++) {
          const nx = Math.abs(N.getX(i)), ny = Math.abs(N.getY(i)), nz = Math.abs(N.getZ(i));
          const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
          let u, v;
          if (nx >= ny && nx >= nz) { u = z; v = y; } else if (ny >= nz) { u = x; v = z; } else { u = x; v = y; }
          uv[(o2 + i) * 2] = u / p.uvScale; uv[(o2 + i) * 2 + 1] = v / p.uvScale;
          col[(o2 + i) * 3] = p.tint.r; col[(o2 + i) * 3 + 1] = p.tint.g; col[(o2 + i) * 3 + 2] = p.tint.b;
        }
        o2 += c;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.castShadow = o.shadows !== false && !mat.userData?.noShadow;
      m.receiveShadow = true;
      m.frustumCulled = o.cull ?? false;
      grp.add(m);
    }
    return grp;
  }
}

// ------------------------------------------------------ canvas textures --
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function seeded(s) { return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
// Aircraft skin: panel seams, rivet rows, access hatches, grime streaks.
export function panelTexture(o = {}) {
  const S = 256;
  const [c, g] = canvas(S, S);
  const r = seeded(o.seed ?? 4417);
  const base = o.base ?? [200, 200, 200];
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  g.fillRect(0, 0, S, S);
  // mottled paint
  for (let i = 0; i < 260; i++) {
    const v = (r() - 0.5) * 26;
    g.fillStyle = `rgba(${128 + v | 0},${128 + v | 0},${128 + v | 0},0.08)`;
    const w = 8 + r() * 40;
    g.fillRect(r() * S, r() * S, w, w * (0.3 + r()));
  }
  // panels
  g.strokeStyle = 'rgba(30,30,30,0.55)';
  g.lineWidth = 1.2;
  for (let y = 0; y <= S; y += 64) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(S, y + 0.5); g.stroke(); }
  for (let y = 0; y < S; y += 64) for (let x = (y / 64) % 2 ? 48 : 0; x <= S; x += 96) { g.beginPath(); g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + 64); g.stroke(); }
  // rivets
  g.fillStyle = 'rgba(40,40,40,0.35)';
  for (let y = 0; y < S; y += 64) for (let x = 0; x < S; x += 5) { g.fillRect(x, y + 3, 1, 1); g.fillRect(x, y + 61, 1, 1); }
  for (let x = 0; x < S; x += 32) for (let y = 0; y < S; y += 5) g.fillRect(x + 3, y, 1, 1);
  // hatches
  for (let i = 0; i < 5; i++) { g.strokeStyle = 'rgba(20,20,20,0.5)'; const x = r() * 220, y = r() * 220, w = 10 + r() * 22, h = 8 + r() * 16; g.strokeRect(x, y, w, h); }
  // grime streaks (vertical runs)
  for (let i = 0; i < (o.grime ?? 60); i++) {
    const x = r() * S, y = r() * S, h = 20 + r() * 90;
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, `rgba(20,18,14,${0.12 + r() * 0.18})`);
    gr.addColorStop(1, 'rgba(20,18,14,0)');
    g.fillStyle = gr;
    g.fillRect(x, y, 1 + r() * 3, h);
  }
  if (o.char) {
    for (let i = 0; i < 70; i++) {
      const x = r() * S, y = r() * S, rad = 10 + r() * 50;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(8,6,5,${0.5 + r() * 0.4})`);
      gr.addColorStop(1, 'rgba(8,6,5,0)');
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// Transparent decal with text lines: [{text, size, color, y, font, weight}]
export function decalTexture(w, h, draw) {
  const [c, g] = canvas(w, h);
  g.clearRect(0, 0, w, h);
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
export function decalMesh(tex, w, h, o = {}) {
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.7, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -2, side: o.side ?? THREE.FrontSide });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.renderOrder = 2;
  return m;
}
// simple soft round glow sprite material (for lamp halos on moving models)
let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const [c, g] = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}
export function glowSprite(color, size, o = {}) {
  const m = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: o.fog ?? false });
  const s = new THREE.Sprite(m);
  s.scale.set(size, size, 1);
  s.renderOrder = 7;
  return s;
}
