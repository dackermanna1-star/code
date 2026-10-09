// Effects for Vice City: everything that flies, glows, splashes and stains.
// Two instanced billboard pools (one alpha-blended: smoke, dust, blood, chips,
// shards, foam; one additive: fire, sparks, flashes, glints), each one draw
// call; bright streak tracers; flat shockwave rings; and decals laid on
// surfaces in ring buffers (bullet holes, blood, scorch marks, tyre marks,
// holes in car bodies that move with the car). Lights are made up front (one
// for muzzle flashes, two shared by explosions and fires): adding a light at
// runtime would recompile every shader in the city.
//
//   V.fx = new FX(world)
//   burst(pos, n, o)                    generic particles: o {color [r,g,b], speed, up, spread, life, size, grow, grav, drag, alpha, dir, tile, add, lit, stretch}
//   impact(pos, normal, mat, o)         a bullet hitting concrete|asphalt|metal|wood|glass|dirt|sand|grass|foliage|water|cloth (o.dir: the bullet's)
//   blood(pos, dir, o)                  o {head, heavy, melee, amount}: mist, droplets that stain where they land, a spray on the wall behind
//   pool(x, z, y, size)                 a pool of blood spreading under a body
//   decal(pos, normal, size, kind, o)   kind 'hole' | 'metal' | 'wood' | 'crack' | 'blood' | 'scorch'
//   carHole(veh, point, normal)         a bullet hole that stays on a vehicle's body
//   muzzle(pos, dir, o)                 flash, a little smoke and the light; o {big, small, light:false}
//   tracer(a, b, o)                     a bright streak racing from a to b; o {color, width, speed}
//   brass(pos, dir, shell)              a spent case flicked out to the right
//   explosion(pos, size)                fireball, shockwave, debris, sparks, dust, a smoke column, the flash, a scorch mark and shake
//   fire(pos, size, secs) -> {pos, stop(), alive}   flames and smoke (molotovs, wrecks)
//   smoke(pos, o) -> {pos, stop(), alive}            a rising column; o {secs, size, rate, dark}
//   sparks(pos, vel, n)   skid(x, z, heading, y, strength)   glass(pos, dir)   splash(pos, size)   wake(pos, heading, speed)
//   dust(pos, size)   trail(pos, dir)   update(dt)   clear()   stats()
import * as THREE from 'three';
import { V, K } from '../state.js';

// ---- textures --------------------------------------------------------------------------------------------------------------------
// The sprite atlas: 4 x 2 cells of 64 px, white with alpha. 0 puff, 1 droplet, 2 flame, 3 flash star, 4 chunk, 5 glow dot, 6 ring, 7 shard.
const T = { PUFF: 0, DROP: 1, FLAME: 2, FLASH: 3, CHUNK: 4, GLOW: 5, RING: 6, SHARD: 7 };
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function spriteAtlas() {
  const S = 64, cv = document.createElement('canvas'); cv.width = S * 4; cv.height = S * 2;
  const g = cv.getContext('2d');
  const img = g.createImageData(S * 4, S * 2), D = img.data;
  const put = (cx, cy, fn) => {
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const u = (i + 0.5) / S * 2 - 1, v = (j + 0.5) / S * 2 - 1;
      const a = Math.max(0, Math.min(1, fn(u, v)));
      const k = ((cy * S + j) * S * 4 + cx * S + i) * 4;
      D[k] = D[k + 1] = D[k + 2] = 255; D[k + 3] = Math.round(a * 255);
    }
  };
  const ss = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  // 0: a soft lumpy puff
  const blobs = []; for (let i = 0; i < 10; i++) blobs.push([(rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.9, 0.3 + rnd() * 0.3]);
  put(0, 0, (u, v) => { let a = 1 - ss(0.2, 1, Math.hypot(u, v)); let b = 0; for (const [x, y, r] of blobs) b += Math.max(0, 1 - Math.hypot(u - x, v - y) / r); return a * (0.5 + Math.min(0.5, b * 0.3)); });
  // 1: a hard droplet with a soft rim
  put(1, 0, (u, v) => 1 - ss(0.62, 0.95, Math.hypot(u, v)));
  // 2: a flame tongue: wide at the bottom, licking up, with holes
  const fl = []; for (let i = 0; i < 7; i++) fl.push([(rnd() - 0.5) * 0.7, rnd() * 0.9 - 0.3, 0.25 + rnd() * 0.25]);
  put(2, 0, (u, v) => { const y = -v; const w = 0.75 * (1 - ss(-0.6, 1, y)) * (0.75 + 0.25 * Math.sin(y * 5 + u * 3)); let a = 1 - ss(w * 0.4, w + 0.05, Math.abs(u + Math.sin(y * 3) * 0.12)); a *= 1 - ss(0.55, 1, Math.hypot(u, v * 0.8)); let b = 0; for (const [x, yy, r] of fl) b += Math.max(0, 1 - Math.hypot(u - x, y - yy) / r); return a * (0.55 + Math.min(0.45, b * 0.35)); });
  // 3: a muzzle-flash star: a bright core and spikes
  put(3, 1 - 1, (u, v) => 0); // (placeholder, drawn below with paths)
  // 4: a chunk: an irregular solid shape
  const ch = []; for (let i = 0; i < 9; i++) ch.push(0.55 + rnd() * 0.4);
  put(0, 1, (u, v) => { const a = Math.atan2(v, u), k = ((a + Math.PI) / (Math.PI * 2)) * 9, i0 = Math.floor(k) % 9, f = k - Math.floor(k); const r = ch[i0] * (1 - f) + ch[(i0 + 1) % 9] * f; return 1 - ss(r - 0.08, r, Math.hypot(u, v)); });
  // 5: a glow dot (sparks, glints, embers)
  put(1, 1, (u, v) => { const d = Math.hypot(u, v); return Math.exp(-d * d * 7) + (1 - ss(0.0, 0.25, d)) * 0.5; });
  // 6: a ring
  put(2, 1, (u, v) => { const d = Math.hypot(u, v); return Math.exp(-((d - 0.78) ** 2) * 160) * 0.9 + Math.exp(-((d - 0.7) ** 2) * 30) * 0.25; });
  // 7: a shard of glass: a thin triangle
  put(3, 1, (u, v) => { const y = (v + 1) / 2; const w = (1 - y) * 0.55; return (Math.abs(u) < w && v > -0.95) ? 1 - ss(w - 0.08, w, Math.abs(u)) : 0; });
  g.putImageData(img, 0, 0);
  // the flash star (cell 3, 0): spikes and a hot core, drawn with gradients
  g.save(); g.translate(S * 3 + S / 2, S / 2);
  const core = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.24); core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(0.4, 'rgba(255,255,255,0.8)'); core.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = core; g.beginPath(); g.arc(0, 0, S * 0.24, 0, 7); g.fill();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rnd() * 0.3, L = S * (i % 2 ? 0.28 : 0.4 + rnd() * 0.08), w = 2 + rnd() * 2.5;
    const gr = g.createLinearGradient(0, 0, Math.cos(a) * L, Math.sin(a) * L); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(Math.cos(a + 1.57) * w, Math.sin(a + 1.57) * w); g.lineTo(Math.cos(a) * L, Math.sin(a) * L); g.lineTo(Math.cos(a - 1.57) * w, Math.sin(a - 1.57) * w); g.fill();
  }
  g.restore();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true;
  return t;
}

function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
// bullet holes: 2 x 2: concrete, metal, wood, a crack in glass
const HOLES = () => canvas(256, 256, (g) => {
  const S = 128;
  const hole = (ox, oy, rim, spall) => {
    // the spall: chipped surface round the hole
    for (let i = 0; i < 22; i++) { const a = Math.random() * 6.28, r = 8 + Math.random() * 26; g.fillStyle = spall(0.15 + Math.random() * 0.35); g.beginPath(); g.ellipse(ox + Math.cos(a) * r * 0.6, oy + Math.sin(a) * r * 0.6, 4 + Math.random() * 9, 3 + Math.random() * 6, a, 0, 7); g.fill(); }
    const gr = g.createRadialGradient(ox, oy, 0, ox, oy, 26); gr.addColorStop(0, 'rgba(8,7,6,1)'); gr.addColorStop(0.3, 'rgba(14,12,10,0.95)'); gr.addColorStop(0.42, rim); gr.addColorStop(1, 'rgba(40,36,32,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(ox, oy, 26, 0, 7); g.fill();
  };
  hole(64, 64, 'rgba(70,64,58,0.65)', (a) => `rgba(150,145,138,${a})`);
  hole(192, 64, 'rgba(210,205,200,0.9)', (a) => `rgba(40,40,44,${a * 0.6})`);
  hole(64, 192, 'rgba(90,60,30,0.7)', (a) => `rgba(120,85,45,${a})`);
  // a crack: white lines radiating, a small hole
  g.save(); g.translate(192, 192); g.strokeStyle = 'rgba(235,245,255,0.85)';
  for (let i = 0; i < 11; i++) { let a = Math.random() * 6.28, r = 3, x = 0, y = 0; g.lineWidth = 1 + Math.random() * 1.5; g.beginPath(); g.moveTo(0, 0); while (r < 55) { r += 6 + Math.random() * 10; a += (Math.random() - 0.5) * 0.5; x = Math.cos(a) * r; y = Math.sin(a) * r; g.lineTo(x, y); } g.stroke(); }
  for (const R of [12, 22, 34]) { g.lineWidth = 1; g.beginPath(); for (let i = 0; i <= 12; i++) { const a = i / 12 * 6.28, r = R + (Math.random() - 0.5) * 6; i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.stroke(); }
  g.fillStyle = 'rgba(20,24,28,0.9)'; g.beginPath(); g.arc(0, 0, 4, 0, 7); g.fill();
  g.restore();
  void S;
});
// blood: 2 x 2: a splat, a spray (streaking off to +u), drops, a pool
const BLOOD = () => canvas(256, 256, (g) => {
  const S = 128;
  const red = (a, k = 1) => `rgba(${Math.round((95 + Math.random() * 40) * k)},${Math.round((3 + Math.random() * 6) * k)},${Math.round((4 + Math.random() * 6) * k)},${a})`;
  const blob = (x, y, r, a, k) => { g.fillStyle = red(a, k); g.beginPath(); g.ellipse(x, y, r * (0.8 + Math.random() * 0.4), r * (0.8 + Math.random() * 0.4), Math.random() * 3, 0, 7); g.fill(); };
  g.save();
  for (let i = 0; i < 14; i++) blob(64 + (Math.random() - 0.5) * 30, 64 + (Math.random() - 0.5) * 30, 8 + Math.random() * 14, 0.88, 0.85);
  for (let i = 0; i < 30; i++) { const a = Math.random() * 6.28, r = 26 + Math.random() * 30; blob(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 1.5 + Math.random() * 4, 0.9, 1); }
  for (let i = 0; i < 8; i++) { const a = Math.random() * 6.28; g.strokeStyle = red(0.8); g.lineWidth = 2 + Math.random() * 3; g.beginPath(); g.moveTo(64 + Math.cos(a) * 20, 64 + Math.sin(a) * 20); g.lineTo(64 + Math.cos(a) * (40 + Math.random() * 20), 64 + Math.sin(a) * (40 + Math.random() * 20)); g.stroke(); }
  g.restore();
  g.save(); g.translate(S, 0);
  for (let i = 0; i < 9; i++) blob(16 + Math.random() * 14, 64 + (Math.random() - 0.5) * 16, 6 + Math.random() * 8, 0.88, 0.85);
  for (let i = 0; i < 90; i++) { const t = Math.random(), a = (Math.random() - 0.5) * (0.35 + t * 0.6), r = 20 + t * 100; blob(10 + Math.cos(a) * r, 64 + Math.sin(a) * r, (1 - t) * 4.5 + 0.8, 0.9, 1); }
  for (let i = 0; i < 10; i++) { const a = (Math.random() - 0.5) * 0.6; g.strokeStyle = red(0.75); g.lineWidth = 1.5 + Math.random() * 2.5; g.beginPath(); g.moveTo(24, 64); g.lineTo(24 + Math.cos(a) * (50 + Math.random() * 50), 64 + Math.sin(a) * (50 + Math.random() * 50)); g.stroke(); }
  g.restore();
  g.save(); g.translate(0, S);
  for (let i = 0; i < 9; i++) blob(64 + (Math.random() - 0.5) * 70, 64 + (Math.random() - 0.5) * 70, 3 + Math.random() * 7, 0.92, 0.9);
  blob(64, 64, 14, 0.9, 0.8);
  g.restore();
  g.save(); g.translate(S, S);
  for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, r = Math.random() * 30; blob(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 16 + Math.random() * 16, 0.95, 0.6); }
  for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28; blob(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44, 6 + Math.random() * 8, 0.9, 0.7); }
  g.restore();
});
// a scorch mark: soot, darkest in the middle, ragged rays
const SCORCH = () => canvas(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(6,5,4,0.95)'); gr.addColorStop(0.45, 'rgba(14,12,10,0.8)'); gr.addColorStop(1, 'rgba(20,18,16,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, r0 = 20 + Math.random() * 15, r1 = r0 + 15 + Math.random() * 30; g.strokeStyle = `rgba(10,8,6,${0.25 + Math.random() * 0.4})`; g.lineWidth = 2 + Math.random() * 5; g.beginPath(); g.moveTo(64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0); g.lineTo(64 + Math.cos(a) * r1, 64 + Math.sin(a) * r1); g.stroke(); }
});
// a tyre mark: rubber with tread, soft edges (across v), continuous along u
const SKID = () => canvas(64, 32, (g) => {
  for (let j = 0; j < 32; j++) { const e = Math.sin((j + 0.5) / 32 * Math.PI); const a = Math.pow(e, 0.6) * (0.75 + Math.random() * 0.25); g.fillStyle = `rgba(12,12,12,${a})`; g.fillRect(0, j, 64, 1); }
  for (let i = 0; i < 64; i += 4) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(i, 4, 2, 24); }
});

// ---- billboard particles ------------------------------------------------------------------------------------------------------------
// flags
const F_COOL = 1, F_DROP = 2, F_BOUNCE = 4, F_SMOKE = 8, F_LIT = 16, F_HOT = 32, F_STILL = 64, F_FADEIN = 128;
const PVERT = `
attribute vec4 iPos; attribute vec4 iCol; attribute vec4 iVel; attribute float iTile;
varying vec2 vUv; varying vec4 vCol;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = viewMatrix * vec4(iPos.xyz, 1.0);
  vec2 q = position.xy;
  vec3 sv = (viewMatrix * vec4(iVel.xyz, 0.0)).xyz;
  float sl = length(sv.xy);
  vec2 off;
  if (sl > 0.002) { vec2 ax = sv.xy / sl; vec2 ay = vec2(-ax.y, ax.x); off = ax * q.x * (iPos.w + sl) + ay * q.y * iPos.w; }
  else { float c = cos(iVel.w), s = sin(iVel.w); off = vec2(c * q.x - s * q.y, s * q.x + c * q.y) * iPos.w; }
  mvPosition.xy += off;
  float cx = mod(iTile, 4.0), cy = floor(iTile / 4.0);
  vUv = vec2((cx + uv.x) / 4.0, (1.0 - cy + uv.y) / 2.0);
  vCol = iCol;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const PFRAG = `
uniform sampler2D map;
varying vec2 vUv; varying vec4 vCol;
#include <fog_pars_fragment>
void main() {
  float a = texture2D(map, vUv).a * vCol.a;
  if (a < 0.004) discard;
#ifdef ADD
  gl_FragColor = vec4(vCol.rgb, a);
  #ifdef USE_FOG
    float ff = smoothstep(fogNear, fogFar, vFogDepth);
    gl_FragColor.a *= 1.0 - ff;
  #endif
#else
  gl_FragColor = vec4(vCol.rgb, a);
  #include <fog_fragment>
#endif
}`;

class Particles {
  constructor(scene, max, additive, tex) {
    this.max = max; this.n = 0;
    const f = (k) => new Float32Array(max * k);
    this.p = f(3); this.v = f(3); this.age = f(1); this.life = f(1); this.s0 = f(1); this.s1 = f(1);
    this.c = f(4); this.grav = f(1); this.drag = f(1); this.tile = f(1); this.rot = f(1); this.rv = f(1); this.str = f(1); this.land = f(1);
    this.fl = new Uint8Array(max);
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index; g.setAttribute('position', quad.attributes.position); g.setAttribute('uv', quad.attributes.uv);
    const A = (k) => new THREE.InstancedBufferAttribute(f(k), k).setUsage(THREE.DynamicDrawUsage);
    this.iPos = A(4); this.iCol = A(4); this.iVel = A(4); this.iTile = A(1);
    g.setAttribute('iPos', this.iPos); g.setAttribute('iCol', this.iCol); g.setAttribute('iVel', this.iVel); g.setAttribute('iTile', this.iTile);
    g.instanceCount = 0;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null } }]),
      vertexShader: PVERT, fragmentShader: PFRAG, transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, defines: additive ? { ADD: 1 } : {},
    });
    this.mat.uniforms.map.value = tex;
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 7 : 6;
    this.mesh.name = additive ? 'fxGlow' : 'fxPuffs';
    this.geo = g;
    scene.add(this.mesh);
  }
  /** One particle; returns its index (for extra settings). */
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, tile, grav = 0, drag = 0, str = 0, fl = 0) {
    let i = this.n;
    if (i >= this.max) i = (Math.random() * this.max) | 0; else this.n++;
    const i3 = i * 3, i4 = i * 4;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
    this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.age[i] = 0; this.life[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.c[i4] = r; this.c[i4 + 1] = g; this.c[i4 + 2] = b; this.c[i4 + 3] = a;
    this.tile[i] = tile; this.grav[i] = grav; this.drag[i] = drag; this.str[i] = str; this.fl[i] = fl;
    this.rot[i] = Math.random() * 6.283; this.rv[i] = (Math.random() - 0.5) * (tile === T.CHUNK || tile === T.SHARD ? 14 : 1.2);
    this.land[i] = -1e9;
    return i;
  }
  update(dt, L, fx) {
    let n = this.n;
    const p = this.p, v = this.v, c = this.c, P = this.iPos.array, C = this.iCol.array, W = this.iVel.array, TL = this.iTile.array;
    for (let i = 0; i < n; i++) {
      this.age[i] += dt;
      let t = this.age[i] / this.life[i];
      if (t >= 1) { n--; if (i !== n) this._move(n, i); i--; continue; }
      const i3 = i * 3, i4 = i * 4, fl = this.fl[i];
      if (!(fl & F_STILL)) {
        const k = Math.exp(-this.drag[i] * dt);
        v[i3] *= k; v[i3 + 1] = v[i3 + 1] * k - this.grav[i] * dt; v[i3 + 2] *= k;
        p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
        // the ground (for drops that stain and bits that bounce)
        if (p[i3 + 1] <= this.land[i] && v[i3 + 1] < 0) {
          if (fl & F_DROP) { fx._stain(p[i3], this.land[i], p[i3 + 2]); n--; if (i !== n) this._move(n, i); i--; continue; }
          if (fl & F_BOUNCE) {
            p[i3 + 1] = this.land[i];
            if (v[i3 + 1] < -6) { v[i3 + 1] *= -0.32; v[i3] *= 0.55; v[i3 + 2] *= 0.55; this.rv[i] *= 0.5; } else { v[i3] = v[i3 + 1] = v[i3 + 2] = 0; this.rv[i] = 0; this.fl[i] |= F_STILL; }
          }
        }
        this.rot[i] += this.rv[i] * dt;
      }
      // size, colour, fade
      const s = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t);
      let r = c[i4], g = c[i4 + 1], b = c[i4 + 2], a = c[i4 + 3];
      if (fl & F_COOL) { r *= 1 - 0.45 * t; g *= (1 - t) * (1 - t * 0.5); b *= (1 - t) * (1 - t); }
      if (fl & F_HOT) {
        // a fireball's puff: glowing orange at first, then sooty smoke
        const h = Math.max(0, 1 - t * 3.2);
        const sr = 0.13 * L, sg = 0.12 * L, sb = 0.11 * L;
        r = sr + (r - sr) * h * h; g = sg + (g - sg) * h * h * h; b = sb + (b - sb) * h * h * h;
      } else if (fl & F_LIT) { r *= L; g *= L; b *= L; }
      let fa;
      if (fl & F_SMOKE) fa = Math.min(1, t * 6) * (1 - t) * (1 - t * 0.4);
      else if (fl & F_FADEIN) fa = Math.min(1, t * 3) * (1 - t);
      else fa = Math.min(1, t * 25) * (1 - t * t);
      P[i4] = p[i3]; P[i4 + 1] = p[i3 + 1]; P[i4 + 2] = p[i3 + 2]; P[i4 + 3] = s;
      C[i4] = r; C[i4 + 1] = g; C[i4 + 2] = b; C[i4 + 3] = a * fa;
      const st = this.str[i];
      if (st > 0) { W[i4] = v[i3] * st; W[i4 + 1] = v[i3 + 1] * st; W[i4 + 2] = v[i3 + 2] * st; } else { W[i4] = W[i4 + 1] = W[i4 + 2] = 0; }
      W[i4 + 3] = this.rot[i];
      TL[i] = this.tile[i];
    }
    this.n = n;
    this.geo.instanceCount = n;
    for (const at of [this.iPos, this.iCol, this.iVel, this.iTile]) { at.clearUpdateRanges(); at.addUpdateRange(0, Math.max(1, n) * at.itemSize); at.needsUpdate = true; }
    this.mesh.visible = n > 0;
  }
  _move(from, to) {
    const cp = (arr, k) => { for (let q = 0; q < k; q++) arr[to * k + q] = arr[from * k + q]; };
    cp(this.p, 3); cp(this.v, 3); cp(this.age, 1); cp(this.life, 1); cp(this.s0, 1); cp(this.s1, 1); cp(this.c, 4);
    cp(this.grav, 1); cp(this.drag, 1); cp(this.tile, 1); cp(this.rot, 1); cp(this.rv, 1); cp(this.str, 1); cp(this.land, 1);
    this.fl[to] = this.fl[from];
  }
  clear() { this.n = 0; this.geo.instanceCount = 0; }
}

// ---- tracers: camera-facing streaks between two points ------------------------------------------------------------------------------
const TVERT = `
attribute vec3 iA; attribute vec3 iB; attribute vec2 iW; attribute vec3 iC;
varying vec2 vQ; varying vec3 vC; varying float vA;
#include <fog_pars_vertex>
void main() {
  vec4 a = viewMatrix * vec4(iA, 1.0), b = viewMatrix * vec4(iB, 1.0);
  a.z = min(a.z, -0.3); b.z = min(b.z, -0.3);
  vec4 mvPosition = mix(a, b, position.x);
  vec2 d = b.xy / -b.z - a.xy / -a.z;
  float l = length(d);
  vec2 nrm = l > 1e-6 ? vec2(-d.y, d.x) / l : vec2(0.0, 1.0);
  float w = max(iW.x, -mvPosition.z * 0.0016);
  mvPosition.xy += nrm * position.y * w;
  vQ = position.xy; vC = iC; vA = iW.y;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const TFRAG = `
varying vec2 vQ; varying vec3 vC; varying float vA;
#include <fog_pars_fragment>
void main() {
  float across = 1.0 - abs(vQ.y);
  float a = across * across * (0.08 + 0.92 * vQ.x * vQ.x) * vA;
  #ifdef USE_FOG
    a *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor = vec4(vC, a);
}`;
class Tracers {
  constructor(scene, max = 64) {
    this.max = max; this.list = [];
    const quad = new THREE.PlaneGeometry(1, 2).translate(0.5, 0, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index; g.setAttribute('position', quad.attributes.position);
    const A = (k) => new THREE.InstancedBufferAttribute(new Float32Array(max * k), k).setUsage(THREE.DynamicDrawUsage);
    this.iA = A(3); this.iB = A(3); this.iW = A(2); this.iC = A(3);
    g.setAttribute('iA', this.iA); g.setAttribute('iB', this.iB); g.setAttribute('iW', this.iW); g.setAttribute('iC', this.iC);
    g.instanceCount = 0; g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.mat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), vertexShader: TVERT, fragmentShader: TFRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 8; this.mesh.name = 'fxTracers';
    this.geo = g;
    scene.add(this.mesh);
    for (let i = 0; i < max; i++) this.list.push({ on: false });
    this.used = 0;
  }
  add(a, b, speed, len, w, r, g, bl) {
    let t = null;
    for (const x of this.list) if (!x.on) { t = x; break; }
    if (!t) t = this.list[(Math.random() * this.max) | 0];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz);
    if (L < 0.5) return;
    Object.assign(t, { on: true, ax: a.x, ay: a.y, az: a.z, dx: dx / L, dy: dy / L, dz: dz / L, L, t: 0, speed, len: Math.min(len, L), w, r, g, b: bl });
  }
  update(dt) {
    let n = 0;
    const A = this.iA.array, B = this.iB.array, W = this.iW.array, C = this.iC.array;
    for (const t of this.list) {
      if (!t.on) continue;
      t.t += dt;
      const head = Math.min(t.L, t.t * t.speed), tail = Math.max(0, head - t.len);
      // the streak runs out when its tail reaches the end (plus a frame of afterglow)
      if (tail >= t.L - 0.01 && t.t * t.speed > t.L + t.len) { t.on = false; continue; }
      const fade = head >= t.L ? Math.max(0, 1 - (t.t * t.speed - t.L) / Math.max(1, t.len)) : 1;
      A[n * 3] = t.ax + t.dx * tail; A[n * 3 + 1] = t.ay + t.dy * tail; A[n * 3 + 2] = t.az + t.dz * tail;
      B[n * 3] = t.ax + t.dx * head; B[n * 3 + 1] = t.ay + t.dy * head; B[n * 3 + 2] = t.az + t.dz * head;
      W[n * 2] = t.w; W[n * 2 + 1] = fade;
      C[n * 3] = t.r; C[n * 3 + 1] = t.g; C[n * 3 + 2] = t.b;
      n++;
    }
    this.geo.instanceCount = n;
    for (const at of [this.iA, this.iB, this.iW, this.iC]) { at.clearUpdateRanges(); at.addUpdateRange(0, Math.max(1, n) * at.itemSize); at.needsUpdate = true; }
    this.mesh.visible = n > 0;
    this.used = n;
  }
}

// ---- decals: instanced quads on surfaces, ring buffered -------------------------------------------------------------------------------
const _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _w = new THREE.Vector3(), _s1 = new THREE.Vector3(1, 1, 1);
class Decals {
  constructor(scene, map, cols, rows, max, o = {}) {
    this.max = max; this.cols = cols; this.rows = rows; this.next = 0; this.used = 0;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aCell = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);
    this.aAlpha = new THREE.InstancedBufferAttribute(new Float32Array(max).fill(1), 1);
    geo.setAttribute('aCell', this.aCell); geo.setAttribute('aAlpha', this.aAlpha);
    const common = { map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: o.offset ?? -4, polygonOffsetUnits: o.offset ?? -4 };
    const mat = o.basic ? new THREE.MeshBasicMaterial({ ...common, color: o.color ?? 0xffffff }) : new THREE.MeshStandardMaterial({ ...common, roughness: o.rough ?? 0.9, metalness: 0, color: o.color ?? 0xffffff });
    const cw = (1 / cols).toFixed(5), chh = (1 / rows).toFixed(5);
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCell; attribute float aAlpha; varying float vDecalA;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv = vMapUv * vec2(${cw}, ${chh}) + aCell; vDecalA = aAlpha;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vDecalA;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vDecalA;');
    };
    mat.customProgramCacheKey = () => `vc-decal-${cols}x${rows}-${o.basic ? 'b' : 's'}`;
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.receiveShadow = !o.basic; this.mesh.renderOrder = o.order ?? 1;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.name = o.name || 'fxDecals';
    scene.add(this.mesh);
    this.base = new Float32Array(max * 14); // p(3) X(3) Y(3) Z(3) sx sy
    this.stamp = new Uint32Array(max);      // bumps each reuse (growing pools check it)
  }
  _slot() { const i = this.next; this.next = (this.next + 1) % this.max; this.used = Math.min(this.max, this.used + 1); this.stamp[i]++; return i; }
  /** A mark at p on a surface facing n, `size` across. dir: which way it streaks (else random), stretch: longer along dir. */
  add(px, py, pz, nx, ny, nz, size, cell = 0, dir = null, stretch = 1, alpha = 1) {
    const i = this._slot();
    const Z = _n.set(nx, ny, nz).normalize();
    const X = _a;
    if (dir) { X.set(dir.x, dir.y, dir.z); X.addScaledVector(Z, -X.dot(Z)); } else X.set(0, 0, 0);
    if (X.lengthSq() < 1e-4) { if (Math.abs(Z.y) > 0.9) X.set(1, 0, 0); else X.set(0, 1, 0); X.addScaledVector(Z, -X.dot(Z)).normalize(); X.applyAxisAngle(Z, Math.random() * 6.283); }
    X.normalize();
    const Y = _b.crossVectors(Z, X);
    const B = this.base, k = i * 14;
    B[k] = px + Z.x * 0.03; B[k + 1] = py + Z.y * 0.03; B[k + 2] = pz + Z.z * 0.03;
    B[k + 3] = X.x; B[k + 4] = X.y; B[k + 5] = X.z; B[k + 6] = Y.x; B[k + 7] = Y.y; B[k + 8] = Y.z; B[k + 9] = Z.x; B[k + 10] = Z.y; B[k + 11] = Z.z;
    B[k + 12] = size * stretch; B[k + 13] = size;
    this._write(i, 1);
    this.aCell.setXY(i, (cell % this.cols) / this.cols, (this.rows - 1 - Math.floor(cell / this.cols)) / this.rows); this.aCell.needsUpdate = true;
    this.aAlpha.setX(i, alpha); this.aAlpha.needsUpdate = true;
    this.mesh.count = this.used;
    return i;
  }
  /** A strip from a to b (tyre marks), w wide, lying on a surface facing up. */
  strip(ax, ay, az, bx, by, bz, w, alpha) {
    const i = this._slot();
    const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz) || 1e-3;
    const B = this.base, k = i * 14;
    B[k] = (ax + bx) / 2; B[k + 1] = (ay + by) / 2 + 0.035; B[k + 2] = (az + bz) / 2;
    B[k + 3] = dx / L; B[k + 4] = dy / L; B[k + 5] = dz / L;
    // Y: across, flat; Z: up
    const yx = -dz / L, yz = dx / L;
    B[k + 6] = yx; B[k + 7] = 0; B[k + 8] = yz; B[k + 9] = 0; B[k + 10] = 1; B[k + 11] = 0;
    B[k + 12] = L + 0.15; B[k + 13] = w;
    // (basis must be right-handed: X x Y = Z; flip Y if not)
    const zz = (B[k + 3] * yz - B[k + 5] * yx);
    if (zz > 0) { B[k + 6] = -yx; B[k + 8] = -yz; }
    this._write(i, 1);
    this.aCell.setXY(i, 0, 0); this.aCell.needsUpdate = true;
    this.aAlpha.setX(i, alpha); this.aAlpha.needsUpdate = true;
    this.mesh.count = this.used;
    return i;
  }
  _write(i, k) {
    const B = this.base, o = i * 14;
    _a.set(B[o + 3], B[o + 4], B[o + 5]).multiplyScalar(B[o + 12] * k);
    _b.set(B[o + 6], B[o + 7], B[o + 8]).multiplyScalar(B[o + 13] * k);
    _c.set(B[o + 9], B[o + 10], B[o + 11]);
    _m4.makeBasis(_a, _b, _c).setPosition(B[o], B[o + 1], B[o + 2]);
    this.mesh.setMatrixAt(i, _m4); this.mesh.instanceMatrix.needsUpdate = true;
  }
  /** Write a whole matrix (marks that move: holes in cars). */
  setMatrix(i, m) { this.mesh.setMatrixAt(i, m); this.mesh.instanceMatrix.needsUpdate = true; }
  clear() { this.used = 0; this.next = 0; this.mesh.count = 0; }
}

// ---- shockwave rings: flat, additive, expanding ----------------------------------------------------------------------------------------
class Rings {
  constructor(scene, tex, max = 8) {
    this.max = max; this.list = [];
    const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const cx = 2 / 4, cy = 1 / 2; // the ring cell of the atlas
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, cx + uv.getX(i) / 4, (1 - 1 + uv.getY(i)) / 2);
    const mat = new THREE.MeshBasicMaterial({ alphaMap: tex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    // (the atlas is white with alpha: use its alpha as the alpha map)
    mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <alphamap_fragment>', 'diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).a;'); };
    mat.customProgramCacheKey = () => 'vc-ring';
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 7; this.mesh.name = 'fxRings';
    scene.add(this.mesh);
  }
  add(x, y, z, r0, r1, life, r, g, b) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ x, y, z, r0, r1, life, t: 0, r, g, b });
  }
  update(dt) {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const R = this.list[i]; R.t += dt;
      const t = R.t / R.life;
      if (t >= 1) { this.list.splice(i, 1); continue; }
      const e = 1 - (1 - t) * (1 - t) * (1 - t);
      const s = R.r0 + (R.r1 - R.r0) * e, f = (1 - t) * (1 - t);
      _m4.compose(_w.set(R.x, R.y, R.z), _q4.identity(), _a.set(s, 1, s));
      this.mesh.setMatrixAt(n, _m4);
      this.mesh.instanceColor.setXYZ(n, R.r * f, R.g * f, R.b * f);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
    this.mesh.visible = n > 0;
  }
}

// ---- the effects ---------------------------------------------------------------------------------------------------------------------
const R = Math.random;
const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _mv = new THREE.Matrix4(), _mq = new THREE.Quaternion();
const UP = { x: 0, y: 1, z: 0 };
// impact recipes: dust colour, chips colour, decal cell, hole size
const MATS = {
  concrete: { dust: [0.62, 0.6, 0.57], chip: [0.55, 0.53, 0.5], cell: 0, hole: 0.42 },
  asphalt: { dust: [0.45, 0.44, 0.42], chip: [0.2, 0.2, 0.2], cell: 0, hole: 0.4 },
  metal: { dust: [0.5, 0.5, 0.52], chip: null, cell: 1, hole: 0.34, sparks: true },
  wood: { dust: [0.55, 0.43, 0.3], chip: [0.48, 0.33, 0.18], cell: 2, hole: 0.42 },
  glass: { dust: [0.85, 0.9, 0.95], chip: null, cell: 3, hole: 0.9, shards: true },
  dirt: { dust: [0.48, 0.4, 0.3], chip: [0.35, 0.28, 0.2], cell: 0, hole: 0.36, holeA: 0.55 },
  sand: { dust: [0.86, 0.78, 0.6], chip: [0.8, 0.72, 0.55], cell: -1 },
  grass: { dust: [0.45, 0.42, 0.3], chip: [0.25, 0.42, 0.15], cell: 0, hole: 0.3, holeA: 0.4 },
  foliage: { dust: [0.35, 0.45, 0.25], chip: [0.2, 0.45, 0.15], cell: -1 },
  cloth: { dust: [0.7, 0.68, 0.64], chip: null, cell: -1 },
};

export class FX {
  constructor(world) {
    this.world = world;
    const scene = world.scene;
    this.atlas = spriteAtlas();
    this.soft = new Particles(scene, 560, false, this.atlas);
    this.glow = new Particles(scene, 340, true, this.atlas);
    this.tracers = new Tracers(scene, 64);
    this.rings = new Rings(scene, this.atlas, 8);
    this.holes = new Decals(scene, HOLES(), 2, 2, 260, { name: 'fxHoles', rough: 0.85 });
    this.carHoles = new Decals(scene, HOLES(), 2, 2, 90, { name: 'fxCarHoles', rough: 0.5, offset: -6 });
    this.bloodD = new Decals(scene, BLOOD(), 2, 2, 300, { name: 'fxBlood', rough: 0.2 });
    this.scorch = new Decals(scene, SCORCH(), 1, 1, 40, { name: 'fxScorch', basic: true, offset: -3 });
    this.skids = new Decals(scene, SKID(), 1, 1, 700, { name: 'fxSkids', basic: true, offset: -2, order: 0 });
    this.carAtt = new Array(90).fill(null); // car holes: {veh, l: Matrix4 (in the car's frame), stamp}
    this.pools = [];   // growing blood pools
    this.strips = [];  // open tyre marks: {x, y, z, h, t}
    this.emitters = []; // fires and smoke columns
    // lights, made now: one for muzzle flashes, two shared by explosions and fires
    this.muzzleL = new THREE.PointLight(0xffb060, 0, 45, 2);
    this.muzzleL.position.set(0, -1000, 0);
    scene.add(this.muzzleL);
    this.muzzleT = 0;
    this.lights = [0, 1].map(() => { const l = new THREE.PointLight(0xff9040, 0, 180, 1.7); l.position.set(0, -1000, 0); scene.add(l); return { l, t: 0, life: 0, peak: 0, owner: null }; });
    this.t = 0;
    this.L = 1;
  }

  get scene() { return this.world.scene; }
  _cam() { return this.world.camera.position; }
  _ground(x, y, z) { const g = V.phys ? V.phys.groundAt(x, y + 1.5, z, 0.3, 30) : K.GROUND; return Number.isFinite(g) ? g : -1e9; }
  _near(p, d = 900) { const c = this._cam(); return Math.abs(c.x - p.x) + Math.abs(c.z - p.z) < d; }

  // ---- generic ----
  /** n particles from pos. o: { color, speed, up, spread, life, size, grow, grav, drag, alpha, dir, tile, add, lit (default: not additive), stretch } */
  burst(pos, n, o = {}) {
    const P = o.add ? this.glow : this.soft, col = o.color || [0.6, 0.58, 0.55];
    const lit = o.lit ?? !o.add;
    const fl = (lit ? F_LIT : 0) | (o.fl || 0);
    for (let i = 0; i < n; i++) {
      const sp = (o.speed ?? 6) * (0.4 + R() * 0.8);
      let dx = (R() - 0.5) * 2, dy = R() * (o.up ?? 1), dz = (R() - 0.5) * 2;
      if (o.dir) { const k = o.spread ?? 0.6; dx = o.dir.x + dx * k; dy = o.dir.y + dy * k; dz = o.dir.z + dz * k; }
      const L = Math.hypot(dx, dy, dz) || 1;
      const life = (o.life ?? 0.8) * (0.6 + R() * 0.8), s = (o.size ?? 0.5) * (0.6 + R() * 0.8);
      const idx = P.emit(pos.x, pos.y, pos.z, dx / L * sp, dy / L * sp, dz / L * sp, life, s, s * (o.grow ?? 2), col[0], col[1], col[2], o.alpha ?? 0.9, o.tile ?? T.PUFF, o.grav ?? 4, o.drag ?? 2, o.stretch ?? 0, fl);
      if (o.land != null) P.land[idx] = o.land;
    }
  }

  // ---- bullets ----
  /** A bullet hitting a surface. mat: concrete|asphalt|metal|wood|glass|dirt|sand|grass|foliage|cloth|water. o: { dir, big, quiet } */
  impact(pos, nrm, mat = 'concrete', o = {}) {
    if (!this._near(pos)) return;
    if (mat === 'water') return this.splash(pos, o.big ? 0.6 : 0.3);
    const M = MATS[mat] || MATS.concrete, nx = nrm?.x ?? 0, ny = nrm?.y ?? 1, nz = nrm?.z ?? 0, n = { x: nx, y: ny, z: nz };
    const k = o.big ? 1.6 : 1;
    // a puff of dust off the surface, a spurt of chips
    this.burst(pos, Math.round(3 * k), { color: M.dust, speed: 4 * k, dir: n, spread: 0.7, life: 0.9, size: 0.35 * k, grow: 3.2, grav: 2, drag: 3, alpha: 0.55 });
    this.burst(pos, Math.round(2 * k), { color: M.dust, speed: 12 * k, dir: n, spread: 0.25, life: 0.35, size: 0.16 * k, grow: 4, grav: 0, drag: 5, alpha: 0.7, stretch: 0.03 });
    if (M.chip) {
      const land = this._ground(pos.x, pos.y, pos.z);
      for (let i = 0; i < 4 * k; i++) {
        const sp = 8 + R() * 14;
        const idx = this.soft.emit(pos.x, pos.y, pos.z, (nx + (R() - 0.5) * 1.4) * sp, (ny + R() * 0.8) * sp, (nz + (R() - 0.5) * 1.4) * sp, 0.8 + R() * 0.6, 0.07 + R() * 0.07, 0.07, M.chip[0], M.chip[1], M.chip[2], 1, T.CHUNK, 60, 0.4, 0, F_LIT | F_BOUNCE);
        this.soft.land[idx] = land;
      }
    }
    if (M.sparks) {
      for (let i = 0; i < 7 * k; i++) { const sp = 15 + R() * 30; this.glow.emit(pos.x, pos.y, pos.z, (nx + (R() - 0.5) * 1.6) * sp, (ny + (R() - 0.3)) * sp, (nz + (R() - 0.5) * 1.6) * sp, 0.12 + R() * 0.2, 0.09, 0.05, 7, 4.2, 1.4, 1, T.GLOW, 50, 0.6, 0.025, 0); }
      this.glow.emit(pos.x + nx * 0.1, pos.y + ny * 0.1, pos.z + nz * 0.1, 0, 0, 0, 0.06, 0.9 * k, 0.3, 6, 4, 2, 1, T.FLASH, 0, 0, 0, F_STILL);
    }
    if (M.shards) this.glass(pos, o.dir, 0.35);
    if (M.cell >= 0 && !o.noHole) this.holes.add(pos.x, pos.y, pos.z, nx, ny, nz, (M.hole ?? 0.4) * (0.85 + R() * 0.3) * (o.big ? 1.3 : 1), M.cell, null, 1, M.holeA ?? 1);
  }

  /** A hole that stays on a vehicle (moves with it). */
  carHole(veh, point, nrm) {
    if (!veh?.quat) return;
    const D = this.carHoles;
    const i = D.add(point.x, point.y, point.z, nrm.x, nrm.y, nrm.z, 0.36 * (0.85 + R() * 0.3), 1);
    // keep it in the car's frame
    _mv.makeRotationFromQuaternion(veh.quat).setPosition(veh.pos.x, veh.pos.y, veh.pos.z).invert();
    D.mesh.getMatrixAt(i, _m4);
    const att = this.carAtt[i] || (this.carAtt[i] = { veh: null, l: new THREE.Matrix4(), stamp: 0 });
    att.veh = veh; att.l.multiplyMatrices(_mv, _m4); att.stamp = D.stamp[i];
  }

  /** Someone hit at pos, the blow or bullet going along dir. o: { head, heavy, melee, amount (0..2) } */
  blood(pos, dir, o = {}) {
    if (!this._near(pos, 700)) return;
    const L = Math.hypot(dir.x, dir.y, dir.z) || 1, d = { x: dir.x / L, y: dir.y / L, z: dir.z / L };
    const big = (o.head ? 1.6 : o.heavy ? 1.3 : 1) * (o.amount ?? 1);
    const cr = 0.42, cg = 0.012, cb = 0.012;
    // a fine mist, mostly out the far side, a little back toward the shooter
    for (let i = 0; i < 9 * big; i++) {
      const sp = (3 + R() * 6) * big;
      this.soft.emit(pos.x, pos.y, pos.z, (d.x + (R() - 0.5) * 1.1) * sp, (d.y + (R() - 0.3) * 1.1) * sp, (d.z + (R() - 0.5) * 1.1) * sp, 0.35 + R() * 0.3, 0.25 * big, 1.4 * big, cr, cg, cb, 0.5, T.PUFF, 1.5, 4, 0, F_LIT);
    }
    if (!o.melee) for (let i = 0; i < 3; i++) { const sp = 2 + R() * 2; this.soft.emit(pos.x, pos.y, pos.z, (-d.x + (R() - 0.5)) * sp, (0.3 + R() * 0.4) * sp, (-d.z + (R() - 0.5)) * sp, 0.3, 0.2, 0.9, cr, cg, cb, 0.4, T.PUFF, 1, 5, 0, F_LIT); }
    // droplets: they fly, fall, and stain where they land
    const ground = this._ground(pos.x, pos.y, pos.z);
    const n = Math.round((o.melee ? 7 : 10) * big);
    for (let k = 0; k < n; k++) {
      const sp = 5 + R() * 9 * big;
      const idx = this.soft.emit(pos.x, pos.y, pos.z, (d.x + (R() - 0.5) * 1.2) * sp, (d.y + 0.3 + (R() - 0.3) * 1) * sp, (d.z + (R() - 0.5) * 1.2) * sp, 1.6, 0.07 + R() * 0.06, 0.07, cr * 1.15, cg, cb, 1, T.DROP, 32, 0.6, 0.012, F_LIT | (k < n * 0.6 ? F_DROP : 0));
      this.soft.land[idx] = ground;
    }
    // what's behind: a spray on the wall, or a splat along the ground
    const reach = o.melee ? 3.5 : 8;
    const h = V.phys?.ray(pos.x, pos.y, pos.z, d.x, d.y, d.z, reach, { skip: (b) => b.vehicle });
    if (h && Math.abs(h.ny) < 0.75) {
      this.bloodD.add(h.x, h.y, h.z, h.nx, h.ny, h.nz, (1.7 + R() * 1.1) * big, 1, { x: d.x, y: d.y - 0.6, z: d.z }, 1.3);
    } else if (R() < 0.85) {
      const t = h ? h.d : 1.5 + R() * 2.5;
      const gx = pos.x + d.x * t, gz = pos.z + d.z * t, gy = this._ground(gx, pos.y, gz);
      if (pos.y - gy < 9) this.bloodD.add(gx, gy + 0.03, gz, 0, 1, 0, (1.4 + R() * 1.2) * big, R() < 0.6 ? 1 : 0, d, 1.35);
    }
  }
  _stain(x, y, z) { this.bloodD.add(x, y + 0.02, z, 0, 1, 0, 0.3 + R() * 0.45, 2); }
  /** A pool spreading under a body (to `size` across over half a minute). */
  pool(x, z, y = null, size = 3.6) {
    const g = this._ground(x, (y ?? K.GROUND) + 1, z);
    if (g < -100) return;
    const D = this.bloodD;
    const i = D.add(x, g + 0.025, z, 0, 1, 0, size, 3);
    D._write(i, 0.12);
    this.pools.push({ i, stamp: D.stamp[i], t: 0, dur: 22 + R() * 14 });
  }
  /** A mark on a surface. kind: hole | metal | wood | crack | blood | splat | scorch */
  decal(pos, nrm, size = 0.4, kind = 'hole', o = {}) {
    const n = nrm || UP;
    if (kind === 'blood' || kind === 'splat') return this.bloodD.add(pos.x, pos.y, pos.z, n.x, n.y, n.z, size, kind === 'blood' ? 1 : 0, o.dir || null, o.stretch || 1);
    if (kind === 'scorch') return this.scorch.add(pos.x, pos.y, pos.z, n.x, n.y, n.z, size, 0, null, 1, o.alpha ?? 0.9);
    const cell = kind === 'metal' ? 1 : kind === 'wood' ? 2 : kind === 'crack' ? 3 : 0;
    return this.holes.add(pos.x, pos.y, pos.z, n.x, n.y, n.z, size, cell);
  }

  // ---- guns ----
  /** The flash at a muzzle. o: { big (shotguns, magnums), small (suppressed / far NPCs), light (default true) } */
  muzzle(pos, dir, o = {}) {
    if (!this._near(pos, 1200)) return;
    const k = o.big ? 1.6 : o.small ? 0.6 : 1;
    const ang = R() * 6.28;
    let i = this.glow.emit(pos.x + dir.x * 0.25, pos.y + dir.y * 0.25, pos.z + dir.z * 0.25, 0, 0, 0, 0.045, 1.2 * k, 1.5 * k, 5, 3.4, 1.5, 1, T.FLASH, 0, 0, 0, F_STILL);
    this.glow.rot[i] = ang;
    // a tongue of flame out of the barrel
    i = this.glow.emit(pos.x + dir.x * 0.55 * k, pos.y + dir.y * 0.55 * k, pos.z + dir.z * 0.55 * k, dir.x * 40, dir.y * 40, dir.z * 40, 0.04, 0.3 * k, 0.4 * k, 6, 3.6, 1.4, 1, T.FLAME, 0, 0, 0.03 * k, F_STILL);
    // and a wisp of smoke (thin: right in front of the camera when it's yours)
    for (let j = 0; j < (o.big ? 3 : 1); j++) this.soft.emit(pos.x + dir.x * 0.8, pos.y + dir.y * 0.8, pos.z + dir.z * 0.8, dir.x * 6 + (R() - 0.5), dir.y * 6 + 1 + R(), dir.z * 6 + (R() - 0.5), 0.7 + R() * 0.5, 0.25 * k, 1.1 * k, 0.75, 0.74, 0.72, o.mine ? 0.12 : 0.22, T.PUFF, -1.5, 2.5, 0, F_LIT | F_SMOKE);
    if (o.light !== false) {
      // (a little ahead of the barrel: it lights the street more than your own face)
      this.muzzleL.position.set(pos.x + dir.x * 1.6, pos.y + dir.y * 1.6 + 0.3, pos.z + dir.z * 1.6);
      this.muzzleL.intensity = (o.mine ? 260 : 420) * k;
      this.muzzleT = 0.05;
    }
  }
  /** A bright streak racing from a to b. o: { color, width, speed, len } */
  tracer(a, b, o = {}) {
    const c = o.color || [9, 6.2, 2.6];
    this.tracers.add(a, b, o.speed ?? 950, o.len ?? 20, o.width ?? 0.07, c[0], c[1], c[2]);
  }
  /** A spent case flicked out to the right of a gun pointing along dir. */
  brass(pos, dir, shell = false) {
    if (!this._near(pos, 160)) return;
    const rx = -dir.z, rz = dir.x, rl = Math.hypot(rx, rz) || 1;
    const sp = 7 + R() * 4;
    const idx = this.soft.emit(pos.x, pos.y, pos.z, rx / rl * sp - dir.x * 2, 6 + R() * 4, rz / rl * sp - dir.z * 2, 0.9 + R() * 0.4, shell ? 0.2 : 0.13, shell ? 0.2 : 0.13, shell ? 0.7 : 0.95, shell ? 0.08 : 0.7, shell ? 0.06 : 0.25, 1, T.CHUNK, 70, 0.3, 0.008, F_LIT | F_BOUNCE);
    this.soft.land[idx] = this._ground(pos.x, pos.y, pos.z);
  }

  // ---- explosions and fire ----
  explosion(pos, size = 1, o = {}) {
    const s = Math.max(0.3, size);
    const x = pos.x, y = pos.y, z = pos.z;
    const g = this._ground(x, y + 2, z);
    const onGround = y - g < 7;
    const water = V.ground?.waterAt?.(x, z) === 0 && g < 0.5;
    // the flash
    this._light(x, y + 5 * s, z, 4200 * s, 0.7, 1, 0.55, 0.22, null);
    this.glow.emit(x, y + 2 * s, z, 0, 0, 0, 0.12, 11 * s, 19 * s, 3.4, 2.4, 1.2, 1, T.FLASH, 0, 0, 0, F_STILL);
    this.glow.emit(x, y + 2.5 * s, z, 0, 0, 0, 0.22, 7 * s, 14 * s, 2.2, 1.1, 0.35, 1, T.GLOW, 0, 0, 0, F_STILL);
    // the fireball: hot tongues flung out and up (additive), and glowing puffs rolling into soot
    for (let i = 0; i < 20 * s; i++) {
      const a = R() * 6.283, e = R() * 1.25, sp = (9 + R() * 24) * s;
      this.glow.emit(x + (R() - 0.5) * 2 * s, y + 1.5 * s, z + (R() - 0.5) * 2 * s, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 8, Math.sin(a) * Math.cos(e) * sp, 0.4 + R() * 0.45, (6 + R() * 4) * s, (3 + R() * 2) * s, 2.6, 1.05, 0.25, 1, T.FLAME, -8, 2.8, 0, F_COOL);
    }
    // the body: orange billows (not additive, so they don't burn out to white) rolling into soot
    for (let i = 0; i < 26 * s; i++) {
      const a = R() * 6.283, e = R() * 1.3, sp = (6 + R() * 16) * s, k = R();
      this.soft.emit(x + (R() - 0.5) * 4 * s, y + 1.5 * s, z + (R() - 0.5) * 4 * s, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 9, Math.sin(a) * Math.cos(e) * sp, 1.6 + R() * 1.8, (5 + R() * 4) * s, (14 + R() * 10) * s, 2.3 + k * 0.9, 0.85 + k * 0.45, 0.16, 0.97, T.PUFF, -6, 1.6, 0, F_HOT | F_SMOKE);
    }
    // sparks and burning bits
    for (let i = 0; i < 34 * s; i++) { const a = R() * 6.283, sp = (25 + R() * 55) * s; this.glow.emit(x, y + 2, z, Math.cos(a) * sp, (15 + R() * 45) * s, Math.sin(a) * sp, 0.6 + R() * 1.1, 0.25 + R() * 0.25, 0.1, 8, 4.5, 1.5, 1, T.GLOW, 55, 0.4, 0.02, 0); }
    // debris: chunks of road and metal
    const land = g;
    for (let i = 0; i < 18 * s; i++) {
      const a = R() * 6.283, sp = (12 + R() * 34) * s;
      const c = R() < 0.5 ? 0.12 : 0.3 + R() * 0.15;
      const idx = this.soft.emit(x, y + 1.5, z, Math.cos(a) * sp, (20 + R() * 40) * s, Math.sin(a) * sp, 2.2 + R() * 1.6, 0.35 + R() * 0.55, 0.35, c, c * 0.95, c * 0.9, 1, T.CHUNK, 80, 0.2, 0, F_LIT | F_BOUNCE);
      this.soft.land[idx] = land;
    }
    if (water) {
      this.splash({ x, y: 0, z }, 3 * s);
    } else if (onGround) {
      // a ring of dust rolling out along the ground, and the shockwave
      for (let i = 0; i < 16 * s; i++) { const a = (i / (16 * s)) * 6.283 + R() * 0.3, sp = (24 + R() * 14) * s; this.soft.emit(x + Math.cos(a) * 2, g + 1, z + Math.sin(a) * 2, Math.cos(a) * sp, 1 + R() * 3, Math.sin(a) * sp, 2.2 + R() * 1.4, 3 * s, 10 * s, 0.55, 0.5, 0.44, 0.65, T.PUFF, -0.5, 1.8, 0, F_LIT | F_SMOKE); }
      this.rings.add(x, g + 0.4, z, 2 * s, 30 * s, 0.45, 1.3, 0.85, 0.45);
      this.scorch.add(x, g + 0.05, z, 0, 1, 0, (11 + R() * 5) * s, 0, null, 1, 0.92);
    }
    // smoke that hangs around
    this.smoke({ x, y: Math.max(y, g) + 2, z }, { secs: 7 + 4 * s, size: 5 * s, rate: 5, dark: true });
    // the camera feels it
    const c = this._cam(), d = Math.hypot(c.x - x, c.y - y, c.z - z);
    V.cam?.shake?.(Math.max(0, 2.8 * s * (1 - d / (240 * s))));
    if (d < 40 * s) V.post?.hit?.(0.15 * (1 - d / (40 * s)), 0xff9040);
  }
  /** Flames and smoke at pos for `secs` (Infinity: until stop()). */
  fire(pos, size = 1, secs = 8) {
    const h = { kind: 'fire', pos: { x: pos.x, y: pos.y, z: pos.z }, size, t: 0, secs, acc: 0, sacc: 0, alive: true, stop() { this.alive = false; } };
    this.emitters.push(h);
    return h;
  }
  /** A column of smoke. o: { secs, size, rate, dark, color } */
  smoke(pos, o = {}) {
    const h = { kind: 'smoke', pos: { x: pos.x, y: pos.y, z: pos.z }, size: o.size ?? 4, t: 0, secs: o.secs ?? 10, rate: o.rate ?? 5, dark: !!o.dark, color: o.color || null, acc: 0, alive: true, stop() { this.alive = false; } };
    this.emitters.push(h);
    return h;
  }
  /** Borrow a pooled light for a flash (explosions win over fires). */
  _light(x, y, z, peak, life, r, g, b, owner) {
    let best = null;
    for (const L of this.lights) if (!L.owner && L.t >= L.life) { best = L; break; }
    if (!best && !owner) best = this.lights.reduce((a, L) => (a.owner && !L.owner ? L : !a.owner && L.owner ? a : (a.life - a.t < L.life - L.t ? a : L)));
    if (!best) return null;
    if (best.owner && !owner) best.owner.light = null;
    best.owner = owner; best.t = 0; best.life = life; best.peak = peak;
    best.l.position.set(x, y, z); best.l.color.setRGB(r, g, b);
    return best;
  }

  // ---- vehicles and the world ----
  /** Sparks off scraping metal: pos, the velocity they fly with, how many. */
  sparks(pos, vel, n = 6) {
    if (!this._near(pos, 500)) return;
    const vx = vel?.x || 0, vy = vel?.y || 0, vz = vel?.z || 0;
    for (let i = 0; i < n; i++) this.glow.emit(pos.x, pos.y, pos.z, vx * 0.4 + (R() - 0.5) * 16, Math.abs(vy) * 0.3 + 3 + R() * 10, vz * 0.4 + (R() - 0.5) * 16, 0.2 + R() * 0.35, 0.16, 0.06, 8, 4.6, 1.5, 1, T.GLOW, 70, 0.4, 0.03, 0);
  }
  /** A tyre mark under a skidding wheel (called every frame per wheel); strength 0..1. */
  skid(x, z, heading, y = null, strength = 1) {
    const now = this.t;
    if (y == null) y = this._ground(x, K.GROUND + 4, z);
    // continue the nearest open mark if it's close and recent, else start one
    let best = null, bd = 9;
    for (const s of this.strips) {
      if (now - s.t > 0.2) continue;
      const d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d < bd && Math.abs(Math.sin(s.h - heading)) < 0.7) { bd = d; best = s; }
    }
    if (best) {
      const d = Math.sqrt(bd);
      if (d < 0.6) { best.t = now; return; } // not far enough for a new piece yet
      this.skids.strip(best.x, best.y, best.z, x, y, z, 1.05, Math.min(0.85, 0.3 + strength * 0.5));
      best.x = x; best.y = y; best.z = z; best.h = heading; best.t = now;
    } else {
      if (this.strips.length > 24) this.strips.sort((a, b) => b.t - a.t).length = 16;
      this.strips.push({ x, y, z, h: heading, t: now });
    }
  }
  /** Glass shattering (car windows, shop windows). */
  glass(pos, dir = null, k = 1) {
    if (!this._near(pos, 500)) return;
    const land = this._ground(pos.x, pos.y, pos.z);
    for (let i = 0; i < 22 * k; i++) {
      const sp = 4 + R() * 12;
      const dx = (dir?.x || 0) * 0.6 + (R() - 0.5) * 1.6, dy = 0.3 + R() * 0.9, dz = (dir?.z || 0) * 0.6 + (R() - 0.5) * 1.6;
      const idx = this.soft.emit(pos.x, pos.y, pos.z, dx * sp, dy * sp, dz * sp, 1.4 + R(), 0.12 + R() * 0.16, 0.12, 0.75, 0.88, 0.95, 0.8, T.SHARD, 60, 0.5, 0, F_LIT | F_BOUNCE);
      this.soft.land[idx] = land;
    }
    for (let i = 0; i < 8 * k; i++) { const sp = 3 + R() * 9; this.glow.emit(pos.x, pos.y, pos.z, (R() - 0.5) * sp, R() * sp, (R() - 0.5) * sp, 0.3 + R() * 0.4, 0.22, 0.1, 3, 3.2, 3.6, 1, T.GLOW, 40, 0.5, 0, 0); }
    if (k >= 1) V.audio?.glass?.(pos);
  }
  /** Something hitting water. */
  splash(pos, size = 1) {
    if (!this._near(pos, 700)) return;
    const s = Math.max(0.2, size), y = pos.y ?? 0;
    for (let i = 0; i < 14 * s; i++) { const a = R() * 6.283, sp = (2 + R() * 5) * s; this.soft.emit(pos.x, y, pos.z, Math.cos(a) * sp, (10 + R() * 14) * Math.sqrt(s), Math.sin(a) * sp, 0.9 + R() * 0.5, 0.18 * Math.sqrt(s), 0.25, 0.92, 0.95, 1, 0.9, T.DROP, 40, 0.4, 0.01, F_LIT); }
    for (let i = 0; i < 7 * s; i++) { const a = R() * 6.283, sp = (2 + R() * 4) * s; this.soft.emit(pos.x, y + 0.6, pos.z, Math.cos(a) * sp, 2 + R() * 4, Math.sin(a) * sp, 1.4 + R(), 1.2 * s, 4 * s, 0.95, 0.97, 1, 0.55, T.PUFF, 2, 1.5, 0, F_LIT | F_SMOKE); }
    this.rings.add(pos.x, Math.max(0.15, y + 0.1), pos.z, 0.6 * s, 8 * s, 1.1, 0.7, 0.75, 0.8);
  }
  /** Foam behind a boat (or a swimmer). */
  wake(pos, heading, speed = 10) {
    if (!this._near(pos, 600)) return;
    const fx = Math.sin(heading), fz = Math.cos(heading), rx = fz, rz = -fx;
    const k = Math.min(1.6, 0.4 + Math.abs(speed) / 40);
    for (const side of [-1, 1]) {
      const sp = 2 + Math.abs(speed) * 0.12;
      this.soft.emit(pos.x + rx * side * 0.8, 0.25, pos.z + rz * side * 0.8, rx * side * sp - fx * 2, 0, rz * side * sp - fz * 2, 2.6 + R(), 1.4 * k, 5 * k, 0.95, 0.97, 1, 0.55, T.PUFF, 0, 1.2, 0, F_LIT | F_SMOKE);
    }
  }
  /** A cloud of dust (landings, crashes, bullets in the sand). */
  dust(pos, size = 1) {
    this.burst(pos, Math.round(6 * size), { color: [0.62, 0.57, 0.48], speed: 6 * size, up: 0.5, life: 1.6, size: 1 * size, grow: 3, grav: 0, drag: 2.2, alpha: 0.5, fl: F_SMOKE });
  }
  /** A rocket's exhaust (once a frame per rocket). */
  trail(pos, dir) {
    this.glow.emit(pos.x, pos.y, pos.z, -dir.x * 20 + (R() - 0.5) * 3, -dir.y * 20 + (R() - 0.5) * 3, -dir.z * 20 + (R() - 0.5) * 3, 0.08 + R() * 0.06, 1.2, 0.5, 8, 4.4, 1.6, 1, T.FLAME, 0, 4, 0, F_COOL);
    this.soft.emit(pos.x, pos.y, pos.z, (R() - 0.5) * 2, 0.5 + R(), (R() - 0.5) * 2, 2.4 + R() * 1.4, 0.8, 4.5, 0.72, 0.71, 0.7, 0.55, T.PUFF, -0.6, 1.2, 0, F_LIT | F_SMOKE);
  }

  // ---- every frame ----
  update(dt) {
    this.t += dt;
    const st = V.sky?.state;
    // the sky's light for things that are lit (smoke is dark at night); fire and sparks glow regardless
    this.L = st ? 0.18 + 0.82 * Math.min(1, st.light ?? (1 - (st.night ?? 0))) : 1;
    // fires and smoke columns
    const cam = this._cam();
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.t += dt;
      if (!e.alive || e.t > e.secs) { if (e.light) { e.light.owner = null; e.light.t = e.light.life; e.light = null; } this.emitters.splice(i, 1); continue; }
      if (dt <= 0) continue;
      const far = Math.abs(cam.x - e.pos.x) + Math.abs(cam.z - e.pos.z) > 1600;
      if (far) continue;
      const end = Math.min(1, (e.secs - e.t) / 2); // die down at the end
      const p = e.pos;
      if (e.kind === 'fire') {
        const s = e.size;
        e.acc += dt * 22 * s * end;
        while (e.acc > 1) {
          e.acc -= 1;
          const ox = (R() - 0.5) * 2.4 * s, oz = (R() - 0.5) * 2.4 * s;
          this.glow.emit(p.x + ox, p.y + 0.3, p.z + oz, (R() - 0.5) * 1.5, 5 + R() * 6 * s, (R() - 0.5) * 1.5, 0.5 + R() * 0.45, (1.6 + R() * 1.6) * s, 0.5 * s, 6.5, 2.8, 0.7, 1, T.FLAME, -5, 1.5, 0, F_COOL);
        }
        e.sacc += dt * 4 * s * end;
        while (e.sacc > 1) {
          e.sacc -= 1;
          this.soft.emit(p.x + (R() - 0.5) * s, p.y + 3 * s, p.z + (R() - 0.5) * s, 1 + R(), 5 + R() * 4, 0.6 + R(), 4 + R() * 3, 1.5 * s, 7 * s, 0.14, 0.13, 0.12, 0.6, T.PUFF, -1.5, 0.5, 0, F_LIT | F_SMOKE);
          if (R() < 0.4) this.glow.emit(p.x, p.y + 1, p.z, (R() - 0.5) * 4, 8 + R() * 8, (R() - 0.5) * 4, 1 + R(), 0.16, 0.08, 6, 3, 1, 1, T.GLOW, -2, 0.8, 0, 0);
        }
        // a flickering light while one is free (the nearest fires get them)
        if (!e.light && (this.t * 7 + i) % 1 < 0.2) {
          const d = Math.abs(cam.x - p.x) + Math.abs(cam.z - p.z);
          if (d < 300) e.light = this._light(p.x, p.y + 3, p.z, 0, 1e9, 1, 0.55, 0.2, e);
        }
        if (e.light) { e.light.l.position.set(p.x, p.y + 3 * s, p.z); e.light.peak = (900 + Math.sin(this.t * 23 + i) * 220 + Math.sin(this.t * 7.3) * 180) * s * end; }
      } else {
        e.acc += dt * e.rate * end;
        while (e.acc > 1) {
          e.acc -= 1;
          const c = e.color || (e.dark ? [0.12, 0.115, 0.11] : [0.5, 0.5, 0.5]);
          this.soft.emit(p.x + (R() - 0.5) * e.size * 0.6, p.y, p.z + (R() - 0.5) * e.size * 0.6, 1.5 + R() * 1.5, 6 + R() * 5, 0.5 + R(), 5 + R() * 4, e.size * 0.6, e.size * 2.6, c[0], c[1], c[2], 0.55, T.PUFF, -1.2, 0.45, 0, F_LIT | F_SMOKE);
        }
      }
    }
    this.soft.update(dt, this.L, this);
    this.glow.update(dt, this.L, this);
    this.tracers.update(dt);
    this.rings.update(dt);
    // pools spread out (fast at first, then slowly)
    const D = this.bloodD;
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const q = this.pools[i]; q.t += dt;
      if (D.stamp[q.i] !== q.stamp) { this.pools.splice(i, 1); continue; } // (its slot went to a newer stain)
      const k = Math.min(1, q.t / q.dur);
      D._write(q.i, 0.12 + 0.88 * (1 - (1 - k) * (1 - k)));
      if (k >= 1) this.pools.splice(i, 1);
    }
    // holes in cars move with the cars
    const CH = this.carHoles;
    for (let i = 0; i < CH.used; i++) {
      const a = this.carAtt[i];
      if (!a || !a.veh || a.stamp !== CH.stamp[i]) continue;
      const v = a.veh;
      if (v.removed || (v.sleeping && a.slept)) continue;
      a.slept = !!v.sleeping;
      if (!V.vehicles?.list?.includes?.(v) && (this.t % 2) < dt) { a.veh = null; _m4.makeScale(0, 0, 0); CH.setMatrix(i, _m4); continue; }
      _mv.compose(_p.set(v.pos.x, v.pos.y, v.pos.z), _mq.copy(v.quat), _s1);
      _m4.multiplyMatrices(_mv, a.l);
      CH.setMatrix(i, _m4);
    }
    // lights
    if (this.muzzleT > 0) { this.muzzleT -= dt; if (this.muzzleT <= 0) { this.muzzleL.intensity = 0; } }
    for (const L of this.lights) {
      if (L.owner) { L.l.intensity = L.peak; continue; }
      if (L.t < L.life) { L.t += dt; const k = Math.max(0, 1 - L.t / L.life); L.l.intensity = L.peak * k * k; } else if (L.l.intensity) L.l.intensity = 0;
    }
  }

  clear() {
    this.soft.clear(); this.glow.clear(); this.holes.clear(); this.carHoles.clear(); this.bloodD.clear(); this.scorch.clear(); this.skids.clear();
    this.pools.length = 0; this.emitters.length = 0; this.strips.length = 0; this.carAtt.fill(null);
  }
  stats() { return { soft: this.soft.n, glow: this.glow.n, tracers: this.tracers.used, holes: this.holes.used, blood: this.bloodD.used, skids: this.skids.used, emitters: this.emitters.length, rings: this.rings.list.length }; }
}
