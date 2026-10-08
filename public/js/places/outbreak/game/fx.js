// Effects: particles (dust, sparks, blood, smoke, splinters, water), bullet
// holes and blood on surfaces, the muzzle-flash light, and smoke columns for
// crash sites. One instanced mesh of camera-facing quads for all particles
// (soft puffs, or hard little droplets); decals are instanced too, a ring of
// them per kind, so hundreds of bullet holes and bloodstains cost a draw call
// each kind.
//
// Blood: a hit throws a fine mist and a spray of droplets that fly, fall and
// stain where they land; a shot that goes through splashes the wall or the
// ground behind; heads make more of a mess. The dead bleed out into a pool
// that spreads under them.
import * as THREE from 'three';
import { O } from '../state.js';

function tex(draw, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const HOLE = () => tex((g, s) => { g.clearRect(0, 0, s, s); const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(10,8,6,1)'); gr.addColorStop(0.25, 'rgba(20,16,12,0.95)'); gr.addColorStop(0.45, 'rgba(60,50,40,0.5)'); gr.addColorStop(1, 'rgba(60,50,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
// particle sprites: a soft puff (left half) and a hard droplet with a highlight (right half)
const SPRITES = () => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const d = g.createRadialGradient(92, 28, 2, 96, 32, 26); d.addColorStop(0, 'rgba(255,255,255,1)'); d.addColorStop(0.75, 'rgba(255,255,255,0.95)'); d.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = d; g.beginPath(); g.arc(96, 32, 26, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};
// bloodstains: a splat, a spray (streaking off to +u), scattered drops, a pool
const BLOODTEX = () => {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S * 2; const g = c.getContext('2d');
  const red = (a, k = 1) => `rgba(${Math.round((95 + Math.random() * 45) * k)},${Math.round((4 + Math.random() * 8) * k)},${Math.round((4 + Math.random() * 6) * k)},${a})`;
  const blob = (x, y, r, a, k) => { g.fillStyle = red(a, k); g.beginPath(); g.ellipse(x, y, r * (0.8 + Math.random() * 0.4), r * (0.8 + Math.random() * 0.4), Math.random() * 3, 0, 7); g.fill(); };
  // 0: a splat - a body of blood, droplets thrown round it, a few streaks
  g.save(); g.translate(0, 0);
  for (let i = 0; i < 14; i++) blob(64 + (Math.random() - 0.5) * 30, 64 + (Math.random() - 0.5) * 30, 8 + Math.random() * 14, 0.85, 0.85);
  for (let i = 0; i < 30; i++) { const a = Math.random() * 6.28, r = 26 + Math.random() * 30; blob(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 1.5 + Math.random() * 4, 0.9, 1); }
  for (let i = 0; i < 8; i++) { const a = Math.random() * 6.28; g.strokeStyle = red(0.8); g.lineWidth = 2 + Math.random() * 3; g.beginPath(); g.moveTo(64 + Math.cos(a) * 20, 64 + Math.sin(a) * 20); g.lineTo(64 + Math.cos(a) * (40 + Math.random() * 20), 64 + Math.sin(a) * (40 + Math.random() * 20)); g.stroke(); }
  g.restore();
  // 1: a spray, fanning out to the right
  g.save(); g.translate(S, 0);
  for (let i = 0; i < 9; i++) blob(16 + Math.random() * 14, 64 + (Math.random() - 0.5) * 16, 6 + Math.random() * 8, 0.85, 0.85);
  for (let i = 0; i < 90; i++) { const t = Math.random(), a = (Math.random() - 0.5) * (0.35 + t * 0.6), r = 20 + t * 100; blob(10 + Math.cos(a) * r, 64 + Math.sin(a) * r, (1 - t) * 4.5 + 0.8, 0.9, 1); }
  for (let i = 0; i < 10; i++) { const a = (Math.random() - 0.5) * 0.6; g.strokeStyle = red(0.75); g.lineWidth = 1.5 + Math.random() * 2.5; g.beginPath(); g.moveTo(24, 64); g.lineTo(24 + Math.cos(a) * (50 + Math.random() * 50), 64 + Math.sin(a) * (50 + Math.random() * 50)); g.stroke(); }
  g.restore();
  // 2: drops
  g.save(); g.translate(0, S);
  for (let i = 0; i < 9; i++) blob(64 + (Math.random() - 0.5) * 70, 64 + (Math.random() - 0.5) * 70, 3 + Math.random() * 7, 0.92, 0.9);
  blob(64, 64, 14, 0.9, 0.8);
  g.restore();
  // 3: a pool - dark in the middle, a thicker rim, irregular
  g.save(); g.translate(S, S);
  for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, r = Math.random() * 30; blob(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 16 + Math.random() * 16, 0.95, 0.62); }
  for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28; blob(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44, 6 + Math.random() * 8, 0.9, 0.7); }
  g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
};

/** A kind of mark laid on surfaces: one instanced mesh, the oldest reused when it's full. cells: the texture's atlas size (1 or 2). */
class DecalSet {
  constructor(world, map, cells, max, o = {}) {
    this.max = max; this.cells = cells; this.next = 0; this.used = 0;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aCell = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);
    geo.setAttribute('aCell', this.aCell);
    const mat = new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: o.rough ?? 0.9, metalness: 0, color: o.color ?? 0xffffff });
    if (cells > 1) {
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCell;')
          .replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vMapUv / ${cells.toFixed(1)} + aCell;\n#endif`);
      };
      mat.customProgramCacheKey = () => 'ob-decal' + cells;
    }
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.receiveShadow = true; this.mesh.renderOrder = 1;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    world.scene.add(this.mesh);
    this.base = new Array(max); // per mark: { p, x, y, z (basis) } to rescale growing ones
  }
  /** A mark at (x,y,z) on a surface facing n, `size` across; dir: which way it streaks (else turned at random); cell: which picture; stretch: longer along dir. */
  add(x, y, z, n, size, o = {}) {
    const i = this.next; this.next = (this.next + 1) % this.max; this.used = Math.min(this.max, this.used + 1);
    const Z = new THREE.Vector3(n.x, n.y, n.z).normalize();
    let X;
    if (o.dir) { X = new THREE.Vector3(o.dir.x, o.dir.y, o.dir.z); X.addScaledVector(Z, -X.dot(Z)); }
    if (!X || X.lengthSq() < 1e-4) { X = Math.abs(Z.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0); X.addScaledVector(Z, -X.dot(Z)); X.applyAxisAngle(Z, Math.random() * 6.28); }
    X.normalize();
    const Y = new THREE.Vector3().crossVectors(Z, X);
    const p = new THREE.Vector3(x + Z.x * 0.02, y + Z.y * 0.02, z + Z.z * 0.02);
    this.base[i] = { p, X, Y, Z, sx: size * (o.stretch || 1), sy: size };
    this._write(i, 1);
    const c = o.cell || 0;
    this.aCell.setXY(i, (c % this.cells) / this.cells, (this.cells - 1 - Math.floor(c / this.cells)) / this.cells);
    this.aCell.needsUpdate = true;
    this.mesh.count = this.used;
    return i;
  }
  _write(i, k) {
    const b = this.base[i]; if (!b) return;
    _m4.makeBasis(_a.copy(b.X).multiplyScalar(b.sx * k), _b.copy(b.Y).multiplyScalar(b.sy * k), b.Z).setPosition(b.p);
    this.mesh.setMatrixAt(i, _m4); this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { this.used = 0; this.next = 0; this.mesh.count = 0; }
}
const _m4 = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class FX {
  constructor(world) {
    this.world = world;
    const N = this.N = 900;
    const geo = new THREE.InstancedBufferGeometry();
    const q = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute('position', q.attributes.position); geo.setAttribute('uv', q.attributes.uv); geo.setIndex(q.index);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage); // xyz, size
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage); // rgb, alpha
    geo.setAttribute('pPos', this.aPos); geo.setAttribute('pCol', this.aCol);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: SPRITES() }, ...THREE.UniformsLib.fog },
      // (a negative size means a droplet: the hard sprite)
      vertexShader: `attribute vec4 pPos; attribute vec4 pCol; varying vec4 vCol; varying vec2 vUv;
#include <fog_pars_vertex>
void main() { vUv = vec2(uv.x * 0.5 + (pPos.w < 0.0 ? 0.5 : 0.0), uv.y); vCol = pCol; vec4 mv = viewMatrix * vec4(pPos.xyz, 1.0); mv.xy += position.xy * abs(pPos.w); gl_Position = projectionMatrix * mv; vec4 mvPosition = mv;
#include <fog_vertex>
}`,
      fragmentShader: `uniform sampler2D map; varying vec4 vCol; varying vec2 vUv;
#include <fog_pars_fragment>
void main() { vec4 t = texture2D(map, vUv); gl_FragColor = vec4(vCol.rgb, t.a * vCol.a); if (gl_FragColor.a < 0.01) discard;
#include <fog_fragment>
}`,
      transparent: true, depthWrite: false, fog: true,
    });
    this.points = new THREE.Mesh(geo, mat); this.points.frustumCulled = false; this.points.renderOrder = 5;
    world.scene.add(this.points);
    this.geo = geo;
    this.ps = []; // { x,y,z, vx,vy,vz, life, max, size, grow, r,g,b, a, drag, grav }
    // decals: bullet holes, and blood (wet: it shines)
    this.holes = new DecalSet(world, HOLE(), 1, 220, { rough: 0.9 });
    this.bloodD = new DecalSet(world, BLOODTEX(), 2, 320, { rough: 0.22 });
    this.pools = []; // { i, t, max } growing under the dead
    // the muzzle flash light (one, reused)
    this.flashLight = new THREE.PointLight(0xffa050, 0, 30, 2);
    world.scene.add(this.flashLight);
    this.flashT = 0;
    // a few more for fires, flares and explosions, made now: adding lights later rebuilds every shader
    this.lightPool = Array.from({ length: 5 }, () => { const l = new THREE.PointLight(0xffffff, 0, 60, 1.6); l.user = null; world.scene.add(l); return l; });
    this.smokes = [];
  }

  /** Throw out n particles. o: { color [r,g,b], speed, up, spread, life, size, grow, grav, drag, alpha, dir {x,y,z} } */
  burst(x, y, z, n, o = {}) {
    for (let i = 0; i < n; i++) {
      if (this.ps.length >= this.N) this.ps.shift();
      const sp = (o.speed ?? 6) * (0.4 + Math.random() * 0.8);
      let dx = (Math.random() - 0.5) * 2, dy = Math.random() * (o.up ?? 1), dz = (Math.random() - 0.5) * 2;
      if (o.dir) { const k = o.spread ?? 0.6; dx = o.dir.x + dx * k; dy = o.dir.y + dy * k; dz = o.dir.z + dz * k; }
      const L = Math.hypot(dx, dy, dz) || 1;
      const c = o.color || [0.6, 0.55, 0.5];
      const life = (o.life ?? 0.8) * (0.6 + Math.random() * 0.8);
      this.ps.push({ x, y, z, vx: dx / L * sp, vy: dy / L * sp, vz: dz / L * sp, life, max: life, size: (o.size ?? 0.5) * (0.6 + Math.random() * 0.8), grow: o.grow ?? 1.5, r: c[0], g: c[1], b: c[2], a: o.alpha ?? 0.9, drag: o.drag ?? 2, grav: o.grav ?? 4, drop: !!o.drop, land: o.land ?? null });
    }
  }
  impact(x, y, z, nx, ny, nz, mat) {
    const dir = { x: nx, y: ny, z: nz };
    if (mat === 'metal') { this.burst(x, y, z, 7, { color: [1.0, 0.75, 0.35], speed: 14, dir, spread: 0.9, life: 0.25, size: 0.12, grow: 0, grav: 30, drag: 1, alpha: 1 }); this.burst(x, y, z, 2, { color: [0.5, 0.5, 0.5], speed: 2, dir, life: 0.6, size: 0.4 }); }
    else if (mat === 'wood') { this.burst(x, y, z, 6, { color: [0.45, 0.32, 0.2], speed: 8, dir, spread: 0.7, life: 0.6, size: 0.18, grow: 0, grav: 30, drag: 1 }); this.burst(x, y, z, 3, { color: [0.6, 0.5, 0.4], speed: 3, dir, life: 0.8, size: 0.5 }); }
    else if (mat === 'glass') this.burst(x, y, z, 10, { color: [0.8, 0.9, 0.95], speed: 9, dir, spread: 1, life: 0.6, size: 0.1, grow: 0, grav: 30, drag: 0.5 });
    else if (mat === 'water') this.burst(x, y, z, 10, { color: [0.85, 0.9, 0.95], speed: 7, dir: { x: 0, y: 1, z: 0 }, spread: 0.4, life: 0.7, size: 0.25, grow: 0.5, grav: 25, drag: 0.5 });
    else if (mat === 'dirt') this.burst(x, y, z, 8, { color: [0.42, 0.36, 0.28], speed: 7, dir, spread: 0.6, life: 0.9, size: 0.4, grow: 1.2, grav: 18 });
    else this.burst(x, y, z, 6, { color: [0.62, 0.6, 0.56], speed: 6, dir, spread: 0.6, life: 0.9, size: 0.45, grow: 1.4, grav: 8 });
  }
  /**
   * Someone hit at (x,y,z), the blow or bullet going along dir. o: { head, heavy, zombie (darker, thicker blood), through (a bullet that
   * carries on: splash what's behind), melee }
   */
  blood(x, y, z, dir, o = {}) {
    if (typeof o === 'boolean') o = { heavy: o };
    const L = Math.hypot(dir.x, dir.y, dir.z) || 1, d = { x: dir.x / L, y: dir.y / L, z: dir.z / L };
    const col = o.zombie ? [0.2, 0.03, 0.02] : [0.4, 0.015, 0.015];
    const big = o.head ? 1.7 : o.heavy ? 1.3 : 1;
    const ground = O.phys.groundAt(x, y + 0.5, z, 0.3, 40);
    // a fine mist, mostly out the far side, a little back toward the shooter
    this.burst(x, y, z, Math.round(10 * big), { color: col, speed: 5 * big, dir: d, spread: 0.55, life: 0.45, size: 0.28, grow: 1.6 * big, grav: 2, drag: 4, alpha: 0.55 });
    if (!o.melee) this.burst(x, y, z, 4, { color: col, speed: 2.5, dir: { x: -d.x, y: 0.2, z: -d.z }, spread: 0.6, life: 0.3, size: 0.2, grow: 1.2, grav: 2, drag: 5, alpha: 0.45 });
    // droplets: they fly, fall, and stain where they land
    const n = Math.round((o.melee ? 7 : 9) * big);
    for (let k = 0; k < n; k++) this.burst(x, y, z, 1, { color: [col[0] * 1.1, col[1], col[2]], speed: 6 + Math.random() * 7 * big, dir: { x: d.x, y: d.y + 0.25, z: d.z }, spread: 0.65, life: 1.6, size: 0.075 + Math.random() * 0.05, grow: 0, grav: 30, drag: 0.6, alpha: 1, drop: true, land: k < n * 0.6 ? ground : null });
    if (o.head) this.burst(x, y, z, 6, { color: [0.55, 0.12, 0.1], speed: 7, dir: d, spread: 0.8, life: 0.7, size: 0.16, grow: 0, grav: 26, drag: 0.8, alpha: 1, drop: true });
    // what's behind: a splash on the wall, or along the ground
    const reach = o.melee ? 3.5 : 7;
    const h = O.phys.ray(x, y, z, d.x, d.y, d.z, reach, { terrain: true });
    if (h && h.kind !== 'terrain' && Math.abs(h.ny) < 0.8) {
      this.bloodD.add(h.x, h.y, h.z, { x: h.nx, y: h.ny, z: h.nz }, (1.6 + Math.random() * 1.0) * big, { cell: 1, dir: { x: d.x, y: d.y - 0.6, z: d.z }, stretch: 1.25 });
    } else if (Math.random() < 0.85) {
      const t = h ? h.d : 1.5 + Math.random() * 2.5;
      const gx = x + d.x * t, gz = z + d.z * t, gy = O.phys.groundAt(gx, y + 0.5, gz, 0.3, 40);
      if (y - gy < 9) this.bloodD.add(gx, gy + 0.03, gz, { x: 0, y: 1, z: 0 }, (1.4 + Math.random() * 1.1) * big, { cell: Math.random() < 0.6 ? 1 : 0, dir: d, stretch: 1.3 });
    }
  }
  /** A pool spreading under a body (to `size` across, over half a minute). */
  pool(x, z, yHint, size = 3.4, grown = false) {
    const g = O.phys.groundAt(x, yHint + 1.5, z, 0.4, 6);
    const i = this.bloodD.add(x, g + 0.025, z, { x: 0, y: 1, z: 0 }, size, { cell: 3 });
    if (grown) return;
    this.bloodD._write(i, 0.12);
    this.pools.push({ i, b: this.bloodD.base[i], t: 0, dur: 25 + Math.random() * 15 });
  }
  /** A drop of your blood falling (when you're bleeding). */
  drip() {
    const P = O.player; if (!P) return;
    const x = P.pos.x + (Math.random() - 0.5) * 1.2, z = P.pos.z + (Math.random() - 0.5) * 1.2;
    this.burst(x, P.pos.y + 2.2, z, 1, { color: [0.42, 0.02, 0.02], speed: 0.5, dir: { x: 0, y: -1, z: 0 }, spread: 0.2, life: 1, size: 0.08, grow: 0, grav: 30, alpha: 1, drop: true, land: O.phys.groundAt(x, P.pos.y + 1, z, 0.2, 4) });
  }
  /** A bullet hole (or other small mark) on a surface. */
  decal(x, y, z, nx, ny, nz, size) { this.holes.add(x, y, z, { x: nx, y: ny, z: nz }, size); }
  /** Borrow a light from the pool (null if they're all in use); give it back with freeLight. */
  getLight(owner, color, dist = 60, decay = 1.6) {
    const l = this.lightPool.find((q) => !q.user);
    if (!l) return null;
    l.user = owner; l.color.set(color); l.distance = dist; l.decay = decay; l.intensity = 0;
    return l;
  }
  freeLight(l) { if (l) { l.user = null; l.intensity = 0; } }
  muzzle(x, y, z) { this.flashLight.position.set(x, y, z); this.flashLight.intensity = 14 / Math.max(1, O.exposure ?? 1); this.flashT = 0.04; }
  /** A column of smoke rising from (x, y, z) (crash sites, flares). */
  smoke(x, y, z, o = {}) { const s = { x, y, z, t: 0, life: o.life ?? 1e9, color: o.color || [0.35, 0.34, 0.33], rate: o.rate ?? 6, size: o.size ?? 6 }; this.smokes.push(s); return s; }

  update(dt) {
    // smoke columns: puffs that rise, spread and drift with the wind
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.t += dt; if (s.t > s.life) { this.smokes.splice(i, 1); continue; }
      const cam = O.world.camera.position;
      if (Math.abs(cam.x - s.x) + Math.abs(cam.z - s.z) > 3500) continue;
      s.acc = (s.acc || 0) + dt * s.rate;
      while (s.acc > 1) { s.acc -= 1; this.burst(s.x + (Math.random() - 0.5) * 3, s.y, s.z + (Math.random() - 0.5) * 3, 1, { color: s.color, speed: 1.5, dir: { x: 0.25, y: 1, z: 0.1 }, spread: 0.3, life: 14, size: s.size, grow: 1.3, grav: -1.5, drag: 0.05, alpha: 0.55 }); }
    }
    const P = this.ps, pos = this.aPos.array, col = this.aCol.array;
    const Lsky = (O.sky ? Math.min(1.1, 0.2 + (O.sky.state?.light ?? 1) * 0.9) : 1) / Math.max(1, O.exposure ?? 1) ** 1.3;
    let n = 0;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life -= dt;
      if (p.life <= 0) { P.splice(i, 1); continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.size += p.grow * dt;
      // a drop reaching the ground leaves a spot there
      if (p.land !== null && p.land !== undefined && p.vy < 0 && p.y <= p.land + 0.05) {
        const gy = Math.max(p.land, O.terrain.heightAt(p.x, p.z));
        if (p.y <= gy + 0.05) { this.bloodD.add(p.x, gy + 0.02, p.z, { x: 0, y: 1, z: 0 }, 0.3 + Math.random() * 0.45, { cell: 2 }); P.splice(i, 1); continue; }
      }
      const f = p.life / p.max;
      pos[n * 4] = p.x; pos[n * 4 + 1] = p.y; pos[n * 4 + 2] = p.z; pos[n * 4 + 3] = p.drop ? -p.size : p.size;
      // lit by the sky (dimmer seen from indoors, where the eye is adjusted up)
      const L = Lsky;
      col[n * 4] = p.r * L; col[n * 4 + 1] = p.g * L; col[n * 4 + 2] = p.b * L; col[n * 4 + 3] = p.a * Math.min(1, f * 2.5);
      n++;
    }
    this.geo.instanceCount = n;
    // pools under the dead spread out (fast at first, then slowly)
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const q = this.pools[i]; q.t += dt;
      if (this.bloodD.base[q.i] !== q.b) { this.pools.splice(i, 1); continue; } // (its place was taken by a newer stain)
      const k = Math.min(1, q.t / q.dur);
      this.bloodD._write(q.i, 0.12 + 0.88 * (1 - (1 - k) * (1 - k)));
      if (k >= 1) this.pools.splice(i, 1);
    }
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flashLight.intensity = 0; }
  }
}
