// Lit, instanced surface decals (bullet holes, blood splats & pools, scorch
// marks, bile). Ring-buffer capacity keeps memory/perf bounded; blood pools
// can grow over time for persistent-but-cheap environmental gore.
import * as THREE from 'three';

export const DF = {
  HOLE_CONCRETE: 0, HOLE_METAL: 1, HOLE_WOOD: 2, HOLE_GLASS: 3,
  BLOOD1: 4, BLOOD2: 5, BLOOD3: 6, BLOOD4: 7,
  POOL: 8, DRIP: 9, SCORCH: 10, BILE: 11,
  SMEAR: 12, SPLAT_BIG: 13, HAND: 14, CRACK: 15,
};

function makeAtlas() {
  const S = 256, N = 4;
  const c = document.createElement('canvas');
  c.width = c.height = S * N;
  const g = c.getContext('2d');
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cell = (i) => [(i % N) * S, Math.floor(i / N) * S];
  const hole = (i, inner, outer, ring) => {
    const [x, y] = cell(i);
    const cx = x + S / 2, cy = y + S / 2;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, S * 0.3);
    gr.addColorStop(0, outer);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x, y, S, S);
    g.fillStyle = ring;
    g.beginPath();
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * 6.283, r = S * (0.07 + rnd() * 0.04);
      k ? g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.fill();
    g.fillStyle = inner;
    g.beginPath();
    g.arc(cx, cy, S * 0.045, 0, 7);
    g.fill();
  };
  hole(DF.HOLE_CONCRETE, 'rgba(10,10,10,1)', 'rgba(40,38,34,0.55)', 'rgba(70,66,60,0.9)');
  hole(DF.HOLE_METAL, 'rgba(5,5,5,1)', 'rgba(60,60,62,0.35)', 'rgba(170,170,175,0.9)');
  hole(DF.HOLE_WOOD, 'rgba(15,8,4,1)', 'rgba(50,30,15,0.5)', 'rgba(120,80,45,0.9)');
  {
    // glass crack
    const [x, y] = cell(DF.HOLE_GLASS);
    const cx = x + S / 2, cy = y + S / 2;
    g.strokeStyle = 'rgba(230,240,240,0.8)';
    g.lineWidth = 2;
    for (let k = 0; k < 12; k++) {
      const a = rnd() * 6.283;
      g.beginPath();
      g.moveTo(cx, cy);
      let px = cx, py = cy;
      for (let s = 0; s < 5; s++) {
        px += Math.cos(a + (rnd() - 0.5) * 0.5) * S * 0.08;
        py += Math.sin(a + (rnd() - 0.5) * 0.5) * S * 0.08;
        g.lineTo(px, py);
      }
      g.stroke();
    }
    g.fillStyle = 'rgba(20,20,20,0.9)';
    g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.fill();
  }
  const splat = (i, big, drips) => {
    const [x, y] = cell(i);
    const cx = x + S / 2, cy = y + S / 2;
    g.save();
    g.beginPath(); g.rect(x, y, S, S); g.clip();
    const col = () => `rgba(${38 + rnd() * 26 | 0},${4 + rnd() * 5 | 0},${3 + rnd() * 3 | 0},${0.8 + rnd() * 0.15})`; // dark, slightly brown
    g.fillStyle = col();
    g.beginPath();
    const n = 20;
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * 6.283, r = S * (big ? 0.18 : 0.1) * (0.6 + rnd() * 0.8);
      k ? g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.fill();
    for (let k = 0; k < (big ? 40 : 22); k++) {
      const a = rnd() * 6.283, d = S * (0.08 + rnd() * 0.38);
      const r = (1 - d / (S * 0.5)) * S * 0.035 * rnd() + 1.5;
      g.fillStyle = col();
      g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, 0, 7); g.fill();
      // streak toward
      if (rnd() < 0.4) {
        g.strokeStyle = col(); g.lineWidth = r * 0.8;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * d * 0.4, cy + Math.sin(a) * d * 0.4); g.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); g.stroke();
      }
    }
    if (drips) {
      for (let k = 0; k < 6; k++) {
        const dx = cx + (rnd() - 0.5) * S * 0.3;
        const len = S * (0.15 + rnd() * 0.3);
        g.strokeStyle = col(); g.lineWidth = 2 + rnd() * 4; g.lineCap = 'round';
        g.beginPath(); g.moveTo(dx, cy); g.lineTo(dx + (rnd() - 0.5) * 4, cy + len); g.stroke();
      }
    }
    g.restore();
  };
  splat(DF.BLOOD1, false, false);
  splat(DF.BLOOD2, false, true);
  splat(DF.BLOOD3, true, false);
  splat(DF.BLOOD4, true, true);
  {
    // pool: smooth dark
    const [x, y] = cell(DF.POOL);
    const cx = x + S / 2, cy = y + S / 2;
    g.fillStyle = 'rgba(45,3,2,0.95)';
    g.beginPath();
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * 6.283, r = S * 0.4 * (0.75 + rnd() * 0.25);
      k ? g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.fill();
  }
  splat(DF.DRIP, false, true);
  {
    const [x, y] = cell(DF.SCORCH);
    const cx = x + S / 2, cy = y + S / 2;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, S * 0.48);
    gr.addColorStop(0, 'rgba(5,5,5,0.95)');
    gr.addColorStop(0.6, 'rgba(15,12,10,0.7)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x, y, S, S);
  }
  {
    const [x, y] = cell(DF.BILE);
    const cx = x + S / 2, cy = y + S / 2;
    for (let k = 0; k < 30; k++) {
      g.fillStyle = `rgba(${90 + rnd() * 40 | 0},${110 + rnd() * 40 | 0},20,${0.5 + rnd() * 0.4})`;
      g.beginPath(); g.arc(cx + (rnd() - 0.5) * S * 0.6, cy + (rnd() - 0.5) * S * 0.6, 4 + rnd() * 22, 0, 7); g.fill();
    }
  }
  {
    // smear
    const [x, y] = cell(DF.SMEAR);
    for (let k = 0; k < 14; k++) {
      g.strokeStyle = `rgba(${55 + rnd() * 30 | 0},3,2,${0.3 + rnd() * 0.5})`;
      g.lineWidth = 6 + rnd() * 16;
      g.lineCap = 'round';
      g.beginPath();
      const sy = y + S * (0.3 + rnd() * 0.4);
      g.moveTo(x + S * 0.1, sy);
      g.bezierCurveTo(x + S * 0.4, sy + (rnd() - 0.5) * 30, x + S * 0.6, sy + (rnd() - 0.5) * 30, x + S * 0.9, sy + (rnd() - 0.5) * 20);
      g.stroke();
    }
  }
  splat(DF.SPLAT_BIG, true, true);
  {
    // bloody hand print
    const [x, y] = cell(DF.HAND);
    const cx = x + S / 2, cy = y + S * 0.6;
    g.fillStyle = 'rgba(70,4,3,0.9)';
    g.beginPath(); g.ellipse(cx, cy, S * 0.12, S * 0.14, 0, 0, 7); g.fill();
    for (let f = 0; f < 5; f++) {
      const a = -2.5 + f * 0.42 + (f === 0 ? -0.35 : 0);
      g.save(); g.translate(cx + Math.cos(a) * S * 0.12, cy + Math.sin(a) * S * 0.14); g.rotate(a + Math.PI / 2);
      g.beginPath(); g.ellipse(0, -S * 0.08, S * 0.028, S * (f === 0 ? 0.07 : 0.1), 0, 0, 7); g.fill();
      g.restore();
    }
  }
  {
    const [x, y] = cell(DF.CRACK);
    const cx = x + S / 2, cy = y + S / 2;
    g.strokeStyle = 'rgba(15,14,12,0.8)';
    for (let k = 0; k < 9; k++) {
      g.lineWidth = 1 + rnd() * 3;
      g.beginPath(); g.moveTo(cx, cy);
      let px = cx, py = cy, a = rnd() * 6.283;
      for (let s = 0; s < 6; s++) { a += (rnd() - 0.5) * 0.8; px += Math.cos(a) * 18; py += Math.sin(a) * 18; g.lineTo(px, py); }
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Decals {
  constructor(scene, cap = 700) {
    this.cap = cap;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aFrame = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aFrame', this.aFrame);
    const mat = new THREE.MeshStandardMaterial({
      map: makeAtlas(), transparent: true, depthWrite: false, roughness: 0.55, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aFrame; varying float vAlpha; varying float vFr;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>
          float fr = aFrame.x;
          vMapUv = (vec2(mod(fr, 4.0), 3.0 - floor(fr / 4.0)) + uv) / 4.0;
          vAlpha = aFrame.y; vFr = fr;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vAlpha; varying float vFr;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          diffuseColor.a *= vAlpha;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          if (vFr >= 4.0 && vFr <= 9.0 || vFr == 12.0 || vFr == 13.0) roughnessFactor = 0.18;`);
    };
    mat.customProgramCacheKey = () => 'decals';
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 5;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.next = 0;
    this.used = 0;
    this.growing = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._z = new THREE.Vector3(0, 0, 1);
    this.info = new Array(cap);
  }
  clear() {
    this.next = 0; this.used = 0; this.mesh.count = 0; this.growing.length = 0;
  }
  add(x, y, z, nx, ny, nz, size, frame, opts = {}) {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    this.used = Math.min(this.cap, this.used + 1);
    this._n.set(nx, ny, nz).normalize();
    this._q.setFromUnitVectors(this._z, this._n);
    // random roll around normal (except drips which must point down)
    if (!opts.noRoll) {
      const roll = new THREE.Quaternion().setFromAxisAngle(this._n, opts.roll ?? Math.random() * Math.PI * 2);
      this._q.premultiply(roll);
    } else if (Math.abs(ny) < 0.7) {
      // orient so texture "down" points to world down on walls
      const up = new THREE.Vector3(0, 1, 0);
      const m = new THREE.Matrix4();
      const xAxis = new THREE.Vector3().crossVectors(up, this._n).normalize();
      const yAxis = new THREE.Vector3().crossVectors(this._n, xAxis).normalize();
      m.makeBasis(xAxis, yAxis, this._n);
      this._q.setFromRotationMatrix(m);
    }
    const off = opts.offset ?? 0.004;
    this._p.set(x + nx * off, y + ny * off, z + nz * off);
    const s0 = opts.grow ? size * 0.2 : size;
    this._s.set(s0 * (opts.sx ?? 1), s0, 1);
    this._m.compose(this._p, this._q, this._s);
    this.mesh.setMatrixAt(i, this._m);
    this.aFrame.setXY(i, frame, opts.alpha ?? 1);
    this.aFrame.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.count = this.used;
    this.info[i] = { x, y, z };
    if (opts.grow) {
      this.growing = this.growing.filter((g) => g.i !== i);
      this.growing.push({ i, t: 0, dur: opts.grow, size, p: this._p.clone(), q: this._q.clone(), sx: opts.sx ?? 1 });
      if (this.growing.length > 24) this.growing.shift();
    }
    return i;
  }
  update(dt) {
    for (let k = this.growing.length - 1; k >= 0; k--) {
      const g = this.growing[k];
      g.t += dt;
      const f = Math.min(1, g.t / g.dur);
      const s = g.size * (0.2 + 0.8 * Math.sqrt(f));
      this._s.set(s * g.sx, s, 1);
      this._m.compose(g.p, g.q, this._s);
      this.mesh.setMatrixAt(g.i, this._m);
      this.mesh.instanceMatrix.needsUpdate = true;
      if (f >= 1) this.growing.splice(k, 1);
    }
  }
}
