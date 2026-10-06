// What the disasters look like: the sea (it rises and falls), the weather
// (storm skies, rain, acid rain, snow, ash), flames and smoke, lightning
// bolts, the tornado's funnel, the tsunami's wave and the volcano. Particles
// come from Desert Strike's effect system.
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

// --- textures ---------------------------------------------------------------------------------------------
const TX = {};
export function tex() {
  if (TX.flame) return TX;
  TX.flame = canvasTex(64, 128, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h * 0.72, 2, w / 2, h * 0.62, h * 0.55);
    g.addColorStop(0, 'rgba(255,250,210,1)'); g.addColorStop(0.25, 'rgba(255,200,60,0.95)'); g.addColorStop(0.55, 'rgba(255,90,10,0.6)'); g.addColorStop(1, 'rgba(120,10,0,0)');
    x.fillStyle = g; x.beginPath(); x.moveTo(w / 2, 0); x.quadraticCurveTo(w * 1.05, h * 0.6, w / 2, h); x.quadraticCurveTo(-w * 0.05, h * 0.6, w / 2, 0); x.fill();
  });
  TX.soft = canvasTex(64, 64, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); });
  TX.puff = canvasTex(128, 128, (x, w) => {
    for (let i = 0; i < 14; i++) { const cx = w / 2 + rnd(-24, 24), cy = w / 2 + rnd(-24, 24), r = rnd(18, 36); const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); }
  });
  TX.water = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#2d6fa8'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) { x.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '10,40,80'},${rnd(0.05, 0.18)})`; x.lineWidth = rnd(1, 3); x.beginPath(); const px = Math.random() * w, py = Math.random() * h; x.moveTo(px, py); x.quadraticCurveTo(px + 15, py - 6, px + 30, py); x.stroke(); }
  }, true);
  TX.funnel = canvasTex(256, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const px = Math.random() * w, a = rnd(0.08, 0.35), lw = rnd(4, 18);
      x.strokeStyle = `rgba(${rnd(60, 120) | 0},${rnd(62, 115) | 0},${rnd(55, 100) | 0},${a})`; x.lineWidth = lw;
      x.beginPath(); x.moveTo(px, 0); x.bezierCurveTo(px + 40, h * 0.3, px - 40, h * 0.6, px + 20, h); x.stroke();
    }
  }, true);
  TX.storm = canvasTex(1024, 512, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a2e32'); g.addColorStop(0.45, '#4a5258'); g.addColorStop(0.5, '#5a6264'); g.addColorStop(1, '#3a3e40');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { const cx = Math.random() * w, cy = Math.random() * h * 0.5, r = rnd(30, 120); const gg = x.createRadialGradient(cx, cy, 0, cx, cy, r); gg.addColorStop(0, `rgba(${Math.random() < 0.5 ? '20,22,26' : '120,128,134'},0.35)`); gg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gg; x.fillRect(cx - r, cy - r, r * 2, r * 2); }
  });
  TX.lava = canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#2a1008'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(255,${rnd(80, 200) | 0},20,${rnd(0.5, 1)})`; x.lineWidth = rnd(1, 4); x.beginPath(); x.moveTo(Math.random() * w, Math.random() * h); for (let k = 0; k < 4; k++) x.lineTo(Math.random() * w, Math.random() * h); x.stroke(); }
  }, true);
  TX.rock = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#3a3230'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { const v = rnd(30, 90) | 0; x.fillStyle = `rgb(${v},${v * 0.85 | 0},${v * 0.8 | 0})`; x.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
  }, true);
  TX.streaks = canvasTex(128, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    for (let i = 0; i < 12; i++) { const px = Math.random() * w; const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,150,30,0)'); g.addColorStop(0.3, 'rgba(255,170,40,0.9)'); g.addColorStop(1, 'rgba(255,90,10,0.8)'); x.strokeStyle = g; x.lineWidth = rnd(3, 9); x.beginPath(); x.moveTo(px, 0); x.bezierCurveTo(px + 10, h * 0.4, px - 10, h * 0.7, px + rnd(-10, 10), h); x.stroke(); }
  }, true);
  TX.crack = canvasTex(256, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h); x.strokeStyle = 'rgba(20,14,8,0.95)'; x.lineCap = 'round';
    const branch = (px, py, a, len, lw) => { if (lw < 0.6 || len < 6) return; x.lineWidth = lw; x.beginPath(); x.moveTo(px, py); const nx = px + Math.cos(a) * len, ny = py + Math.sin(a) * len; x.lineTo(nx, ny); x.stroke(); branch(nx, ny, a + rnd(-0.5, 0.5), len * 0.85, lw * 0.8); if (Math.random() < 0.35) branch(nx, ny, a + rnd(-1.4, 1.4), len * 0.6, lw * 0.6); };
    branch(w / 2, h / 2, 0, 22, 7); branch(w / 2, h / 2, Math.PI, 22, 7);
  });
  TX.scorch = canvasTex(128, 128, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(10,8,6,0.95)'); g.addColorStop(0.6, 'rgba(25,18,12,0.7)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); });
  return TX;
}

// --- the sea -----------------------------------------------------------------------------------------------
export class Water {
  constructor(world) {
    this.world = world;
    this.level = 0; this.target = 0; this.speed = 1;
    this.current = null;
    const t = tex().water; t.repeat.set(300, 300);
    this.mat = new THREE.MeshPhongMaterial({ color: 0x4a90c8, map: t, transparent: true, opacity: 0.84, shininess: 90, specular: 0x88aacc, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), this.mat);
    this.mesh.renderOrder = 1;
    world.scene.add(this.mesh);
    this.baseColor = new THREE.Color(0x4a90c8);
    this.tint = new THREE.Color(0x4a90c8);
  }
  setTint(hex) { this.tint.set(hex); }
  update(dt) {
    const d = this.target - this.level;
    this.level += Math.sign(d) * Math.min(Math.abs(d), this.speed * dt);
    this.mesh.position.y = this.level + Math.sin(this.world.time * 0.8) * 0.12;
    this.mat.map.offset.x = (this.world.time * 0.004) % 1; this.mat.map.offset.y = (this.world.time * 0.0025) % 1;
    this.mat.color.lerp(this.tint, Math.min(1, dt));
  }
}

// --- precipitation: rain, acid rain, snow, ash ---------------------------------------------------------------------
export class Weather {
  constructor(world) {
    this.world = world;
    this.kind = null; this.amount = 0; this.target = 0;
    this.wind = new THREE.Vector3();
    const N = 3600;
    this.N = N;
    // rain: line streaks
    const rp = new Float32Array(N * 6);
    this.rainGeo = new THREE.BufferGeometry(); this.rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rainMat = new THREE.LineBasicMaterial({ color: 0xaab8cc, transparent: true, opacity: 0.55, depthWrite: false });
    this.rain = new THREE.LineSegments(this.rainGeo, this.rainMat); this.rain.frustumCulled = false; this.rain.visible = false;
    world.scene.add(this.rain);
    // snow and ash: points
    const sp = new Float32Array(N * 3);
    this.flakeGeo = new THREE.BufferGeometry(); this.flakeGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.flakeMat = new THREE.PointsMaterial({ map: tex().soft, color: 0xffffff, size: 0.9, transparent: true, depthWrite: false, opacity: 0.9 });
    this.flakes = new THREE.Points(this.flakeGeo, this.flakeMat); this.flakes.frustumCulled = false; this.flakes.visible = false;
    world.scene.add(this.flakes);
    this.p = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { this.p[i * 3] = rnd(-70, 70); this.p[i * 3 + 1] = rnd(-30, 70); this.p[i * 3 + 2] = rnd(-70, 70); }
  }
  /** kind: 'rain' | 'acid' | 'snow' | 'ash' | 'sand' | null */
  set(kind, amount = 1) {
    this.kind = kind; this.target = kind ? amount : 0;
    if (kind === 'acid') this.rainMat.color.set(0x9aff4a);
    if (kind === 'rain') this.rainMat.color.set(0xaab8cc);
    if (kind === 'snow') { this.flakeMat.color.set(0xffffff); this.flakeMat.size = 0.9; }
    if (kind === 'ash') { this.flakeMat.color.set(0x5a5450); this.flakeMat.size = 0.7; }
    if (kind === 'sand') { this.flakeMat.color.set(0xd8b878); this.flakeMat.size = 0.5; }
  }
  update(dt) {
    this.amount += (this.target - this.amount) * Math.min(1, dt * 0.8);
    const cam = this.world.camera.position;
    const lines = this.kind === 'rain' || this.kind === 'acid';
    this.rain.visible = lines && this.amount > 0.02;
    this.flakes.visible = !lines && !!this.kind && this.amount > 0.02;
    if (!this.rain.visible && !this.flakes.visible) return;
    const n = Math.floor(this.N * Math.min(1, this.amount));
    const fall = lines ? 120 : this.kind === 'snow' ? 9 : this.kind === 'sand' ? 4 : 6;
    const w = this.wind, p = this.p, t = this.world.time;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      p[k] += (w.x + (lines ? 0 : Math.sin(t * 1.3 + i) * 2)) * dt; p[k + 1] -= fall * dt * (0.8 + (i % 7) * 0.06); p[k + 2] += (w.z + (lines ? 0 : Math.cos(t * 1.1 + i) * 2)) * dt;
      if (p[k + 1] < -30) p[k + 1] += 100;
      if (p[k] > 70) p[k] -= 140; else if (p[k] < -70) p[k] += 140;
      if (p[k + 2] > 70) p[k + 2] -= 140; else if (p[k + 2] < -70) p[k + 2] += 140;
    }
    const ox = Math.floor(cam.x / 140) * 140, oz = Math.floor(cam.z / 140) * 140;
    if (lines) {
      const a = this.rainGeo.attributes.position.array;
      const sx = w.x * 0.03, sz = w.z * 0.03;
      for (let i = 0; i < n; i++) {
        let x = p[i * 3] + ox, z = p[i * 3 + 2] + oz;
        if (x - cam.x > 70) x -= 140; else if (x - cam.x < -70) x += 140;
        if (z - cam.z > 70) z -= 140; else if (z - cam.z < -70) z += 140;
        const y = p[i * 3 + 1] + cam.y;
        a[i * 6] = x; a[i * 6 + 1] = y; a[i * 6 + 2] = z; a[i * 6 + 3] = x - sx * 3; a[i * 6 + 4] = y + 2.4; a[i * 6 + 5] = z - sz * 3;
      }
      this.rainGeo.setDrawRange(0, n * 2);
      this.rainGeo.attributes.position.needsUpdate = true;
      this.rainMat.opacity = 0.55 * Math.min(1, this.amount);
    } else {
      const a = this.flakeGeo.attributes.position.array;
      for (let i = 0; i < n; i++) {
        let x = p[i * 3] + ox, z = p[i * 3 + 2] + oz;
        if (x - cam.x > 70) x -= 140; else if (x - cam.x < -70) x += 140;
        if (z - cam.z > 70) z -= 140; else if (z - cam.z < -70) z += 140;
        a[i * 3] = x; a[i * 3 + 1] = p[i * 3 + 1] + cam.y; a[i * 3 + 2] = z;
      }
      this.flakeGeo.setDrawRange(0, n);
      this.flakeGeo.attributes.position.needsUpdate = true;
    }
  }
}

// --- the sky's mood: a storm dome over the normal sky, fog and light --------------------------------------------------
export class Sky {
  constructor(world) {
    this.world = world;
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(2200, 32, 16), new THREE.MeshBasicMaterial({ map: tex().storm, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.dome.renderOrder = -0.5;
    world.scene.add(this.dome);
    this.base = { fog: new THREE.Color(0xc8d8e8), near: 300, far: 1800, amb: world.ambient.intensity, sun: world.sun.intensity, tint: new THREE.Color(0xffffff) };
    world.scene.fog = new THREE.Fog(this.base.fog.clone(), this.base.near, this.base.far);
    this.cur = { dome: 0, fog: this.base.fog.clone(), near: 300, far: 1800, amb: 1, sun: 1, tint: new THREE.Color(0xffffff) };
    this.goal = { ...this.cur, fog: this.cur.fog.clone(), tint: this.cur.tint.clone() };
    this.flash = 0;
  }
  /** Change the mood: {dome 0..1, fog colour, near, far, amb, sun (multipliers), tint (dome colour)} */
  set(m) {
    this.goal = {
      dome: m.dome ?? 0, fog: new THREE.Color(m.fog ?? 0xc8d8e8), near: m.near ?? 300, far: m.far ?? 1800,
      amb: m.amb ?? 1, sun: m.sun ?? 1, tint: new THREE.Color(m.tint ?? 0xffffff),
    };
  }
  clear() { this.set({}); }
  update(dt) {
    const k = Math.min(1, dt * 0.6), c = this.cur, g = this.goal;
    c.dome += (g.dome - c.dome) * k; c.near += (g.near - c.near) * k; c.far += (g.far - c.far) * k;
    c.amb += (g.amb - c.amb) * k; c.sun += (g.sun - c.sun) * k;
    c.fog.lerp(g.fog, k); c.tint.lerp(g.tint, k);
    this.flash = Math.max(0, this.flash - dt * 5);
    const w = this.world;
    this.dome.material.opacity = c.dome; this.dome.visible = c.dome > 0.01; this.dome.material.color.copy(c.tint);
    this.dome.position.copy(w.camera.position);
    w.scene.fog.color.copy(c.fog); w.scene.fog.near = c.near; w.scene.fog.far = c.far;
    w.ambient.intensity = this.base.amb * c.amb + this.flash * 2.5;
    w.sun.intensity = this.base.sun * c.sun + this.flash * 1.5;
  }
}

// --- fire on things ---------------------------------------------------------------------------------------------------
export class Flames {
  constructor(world) {
    this.world = world;
    this.list = [];
    this.mat = new THREE.SpriteMaterial({ map: tex().flame, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, color: 0xffffff });
    this.smokeMat = new THREE.SpriteMaterial({ map: tex().puff, color: 0x2a2624, transparent: true, depthWrite: false, opacity: 0.6 });
    this.smoke = [];
  }
  /** Flames that follow get() (a function giving the position) with a size; returns a handle with stop(). */
  add(get, size = 3, life = Infinity) {
    const n = Math.max(1, Math.min(4, Math.round(size / 2.5)));
    const sprites = [];
    for (let i = 0; i < n; i++) { const s = new THREE.Sprite(this.mat); s.userData.off = new THREE.Vector3(rnd(-0.4, 0.4) * size, rnd(0, 0.3) * size, rnd(-0.4, 0.4) * size); s.userData.ph = Math.random() * 10; this.world.scene.add(s); sprites.push(s); }
    const h = { get, size, sprites, life, age: 0, dead: false, stop: () => { h.dead = true; } };
    this.list.push(h);
    return h;
  }
  puff(pos, size = 4, dark = true) {
    if (this.smoke.length > 220) return;
    const s = new THREE.Sprite(dark ? this.smokeMat : this.smokeMat); s.material = this.smokeMat.clone(); if (!dark) s.material.color.set(0xb0aca8);
    s.position.copy(pos); s.scale.setScalar(size); this.world.scene.add(s);
    this.smoke.push({ s, v: new THREE.Vector3(rnd(-1, 1), rnd(4, 8), rnd(-1, 1)), age: 0, life: rnd(2.5, 4.5), size });
  }
  update(dt) {
    const t = this.world.time;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i];
      h.age += dt;
      const pos = h.dead || h.age > h.life ? null : h.get();
      if (!pos) { for (const s of h.sprites) this.world.scene.remove(s); this.list.splice(i, 1); continue; }
      for (const s of h.sprites) {
        const f = 0.85 + Math.sin(t * 13 + s.userData.ph) * 0.12 + Math.sin(t * 29 + s.userData.ph * 2) * 0.06;
        s.position.copy(pos).add(s.userData.off); s.position.y += h.size * 0.5 * f;
        s.scale.set(h.size * 0.9 * f, h.size * 1.6 * f, 1);
      }
      if (Math.random() < dt * 2.5) this.puff(pos.clone().add(new THREE.Vector3(0, h.size, 0)), h.size * 1.4);
    }
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const p = this.smoke[i]; p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) { this.world.scene.remove(p.s); p.s.material.dispose(); this.smoke.splice(i, 1); continue; }
      p.s.position.addScaledVector(p.v, dt); p.s.scale.setScalar(p.size * (1 + k * 2.5));
      p.s.material.opacity = 0.55 * (1 - k);
    }
  }
  clear() { for (const h of this.list) h.dead = true; }
}

// --- lightning ------------------------------------------------------------------------------------------------------------
export function lightningBolt(world, to, from = null) {
  const top = from || to.clone().add(new THREE.Vector3(rnd(-30, 30), 260, rnd(-30, 30)));
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x8aa8ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const seg = (a, b, r) => {
    const len = a.distanceTo(b);
    for (const [m, rr] of [[mat, r], [glowMat, r * 4]]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, len, 5, 1, true), m);
      c.position.copy(a).add(b).multiplyScalar(0.5);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      g.add(c);
    }
  };
  const path = (a, b, n, r, depth) => {
    let prev = a.clone();
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      const p = a.clone().lerp(b, k);
      if (i < n) { const j = a.distanceTo(b) / n * 0.6; p.x += rnd(-j, j); p.z += rnd(-j, j); }
      seg(prev, p, r);
      if (depth < 2 && Math.random() < 0.18) { const end = p.clone().add(new THREE.Vector3(rnd(-30, 30), -rnd(20, 60), rnd(-30, 30))); path(p, end, 5, r * 0.5, depth + 1); }
      prev = p;
    }
  };
  path(top, to, 16, 0.45, 0);
  world.scene.add(g);
  let t = 0;
  const off = world.onUpdate((dt) => {
    t += dt;
    const on = t < 0.08 || (t > 0.13 && t < 0.2) || (t > 0.26 && t < 0.32);
    g.visible = on;
    if (t > 0.4) { off(); world.scene.remove(g); g.traverse((o) => o.geometry?.dispose()); mat.dispose(); glowMat.dispose(); }
  });
}

// --- the tornado ------------------------------------------------------------------------------------------------------------
export function buildFunnel(world) {
  const g = new THREE.Group();
  const T = tex().funnel;
  const layers = [];
  const H = 200, n = 14;
  for (let i = 0; i < n; i++) {
    const y0 = (i / n) * H, y1 = ((i + 1) / n) * H;
    const r0 = 5 + Math.pow(i / n, 1.8) * 70, r1 = 5 + Math.pow((i + 1) / n, 1.8) * 70;
    for (const [rs, op] of [[1, 0.85], [1.15, 0.4]]) {
      const t = T.clone(); t.needsUpdate = true; t.repeat.set(3, 1);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1 * rs, r0 * rs, y1 - y0 + 1, 28, 1, true), new THREE.MeshLambertMaterial({ map: t, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false, color: 0x8a8880 }));
      m.position.y = (y0 + y1) / 2;
      m.userData = { i, spin: rnd(2.2, 3.4) * (rs > 1 ? 0.7 : 1), t };
      g.add(m); layers.push(m);
    }
  }
  // the wall cloud at the top
  const cloud = [];
  for (let i = 0; i < 26; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex().puff, color: 0x3a3c3e, transparent: true, depthWrite: false, opacity: 0.9 })); const a = Math.random() * Math.PI * 2, r = rnd(20, 140); s.position.set(Math.cos(a) * r, H + rnd(-8, 10), Math.sin(a) * r); s.scale.setScalar(rnd(60, 110)); g.add(s); cloud.push(s); }
  // debris whirling round it
  const bits = [];
  const bm = new THREE.MeshLambertMaterial({ color: 0x4a3e34 });
  for (let i = 0; i < 70; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(rnd(0.4, 1.6), rnd(0.2, 0.8), rnd(0.4, 1.6)), bm); m.userData = { a: Math.random() * 6.3, h: Math.pow(Math.random(), 1.6) * H * 0.7, r: 0, sp: rnd(1.5, 3) }; g.add(m); bits.push(m); }
  // dust at the bottom
  const dust = [];
  for (let i = 0; i < 18; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex().puff, color: 0x8a7a68, transparent: true, depthWrite: false, opacity: 0.7 })); s.userData = { a: (i / 18) * Math.PI * 2, r: rnd(8, 20) }; s.scale.setScalar(rnd(14, 26)); g.add(s); dust.push(s); }
  world.scene.add(g);
  return {
    group: g, H,
    update(dt, t, scale = 1) {
      g.scale.setScalar(scale);
      for (const m of layers) {
        m.userData.t.offset.x -= dt * 0.25 * m.userData.spin;
        const k = m.userData.i / n;
        m.position.x = Math.sin(t * 0.7 + k * 3) * 10 * k; m.position.z = Math.cos(t * 0.5 + k * 2.4) * 8 * k;
      }
      for (const b of bits) { const d = b.userData; d.a += dt * d.sp * (1.5 - d.h / H); const r = 6 + Math.pow(d.h / H, 1.6) * 70 + 4; b.position.set(Math.cos(d.a) * r, d.h, Math.sin(d.a) * r); b.rotation.x += dt * 4; b.rotation.y += dt * 3; }
      for (const s of dust) { s.userData.a += dt * 1.8; s.position.set(Math.cos(s.userData.a) * s.userData.r, 4, Math.sin(s.userData.a) * s.userData.r); }
      for (const s of cloud) s.material.rotation += dt * 0.05;
    },
    dispose() { world.scene.remove(g); g.traverse((o) => { o.geometry?.dispose(); }); },
  };
}

// --- the tsunami's wave -------------------------------------------------------------------------------------------------------
export function buildWave(world, width = 700, height = 46) {
  const g = new THREE.Group();
  const nz = 40, nx = 60;
  const geo = new THREE.PlaneGeometry(width, 1, nx, nz);
  const pos = geo.attributes.position;
  // profile across the wave (local z from -60 behind to +12 in front of the crest)
  for (let i = 0; i < pos.count; i++) {
    const v = pos.getY(i) + 0.5; // 0..1
    const zz = -70 + v * 82;
    let y;
    if (zz < 0) y = height * Math.exp(-((zz / 34) ** 2)) * (0.85 + 0.15 * Math.sin(pos.getX(i) * 0.05));
    else y = height * (1 - zz / 12) ** 0.45;
    const curl = zz > -6 ? (zz + 6) * 0.9 : 0;
    pos.setXYZ(i, pos.getX(i), Math.max(0, y) - Math.max(0, curl - 8) * 0.3, zz + (zz > 0 ? -curl * 0.3 : 0));
  }
  geo.computeVertexNormals();
  const t = tex().water.clone(); t.needsUpdate = true; t.repeat.set(20, 3);
  const mat = new THREE.MeshPhongMaterial({ color: 0x2a6a98, map: t, transparent: true, opacity: 0.9, shininess: 80, specular: 0x99bbdd, side: THREE.DoubleSide, depthWrite: false });
  const wave = new THREE.Mesh(geo, mat); g.add(wave);
  // a strip of foam along the crest
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(width, 10, 40, 1).rotateX(-Math.PI / 2.4), new THREE.MeshLambertMaterial({ color: 0xf4f8ff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  foam.position.set(0, height - 1, 2); g.add(foam);
  world.scene.add(g);
  return { group: g, mat, height, dispose() { world.scene.remove(g); geo.dispose(); mat.dispose(); } };
}

// --- the volcano ---------------------------------------------------------------------------------------------------------------
export function buildVolcano(world) {
  const g = new THREE.Group();
  const H = 120, R = 150;
  const geo = new THREE.CylinderGeometry(20, R, H, 48, 10, true);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x), k = (y + H / 2) / H;
    const n = 1 + Math.sin(a * 7 + y * 0.05) * 0.06 + Math.sin(a * 13) * 0.04 + (Math.random() - 0.5) * 0.03 * (1 - k);
    p.setXYZ(i, x * n, y, z * n);
  }
  geo.computeVertexNormals();
  const rock = tex().rock.clone(); rock.needsUpdate = true; rock.repeat.set(8, 3);
  const mountain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: rock, color: 0x6a5a52 }));
  mountain.position.y = H / 2; g.add(mountain);
  // lava running down the sides
  const st = tex().streaks.clone(); st.needsUpdate = true; st.repeat.set(5, 1);
  const lavaGeo = geo.clone();
  const lava = new THREE.Mesh(lavaGeo, new THREE.MeshBasicMaterial({ map: st, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  lava.scale.set(1.01, 1, 1.01); lava.position.y = H / 2; g.add(lava);
  const crater = new THREE.Mesh(new THREE.CircleGeometry(19, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff6010, fog: false }));
  crater.position.y = H - 3; g.add(crater);
  world.scene.add(g);
  return {
    group: g, H, lava, crater, st,
    update(dt, heat) {
      st.offset.y -= dt * 0.05;
      lava.material.opacity = Math.min(0.9, heat);
      crater.material.color.setRGB(1, 0.35 + Math.sin(world.time * 6) * 0.08, 0.05);
    },
    dispose() { world.scene.remove(g); geo.dispose(); lavaGeo.dispose(); },
  };
}

/** A flat mark on the ground (craters, cracks, lava, puddles). */
export function groundMark(world, texture, x, y, z, size, opts = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, color: opts.color ?? 0xffffff, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: opts.opacity ?? 1 }));
  m.position.set(x, y + 0.05, z); m.rotation.y = opts.rot ?? Math.random() * 6.28;
  world.scene.add(m);
  return m;
}
