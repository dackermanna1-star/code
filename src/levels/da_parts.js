// Dead Air shared building blocks (used by the da*_ chapter builders).
// Convention: only ADD exports here (several chapters import from this file);
// never change the behaviour/signature of an existing export.
import * as THREE from 'three';
import { boxMesh } from './ch4_parts.js';

// Collects visual-only boxes (no collision, stays out of the nav bounds) and
// emits one mesh per material, instead of the level's 28 m sector buckets
// (far fewer draw calls for skylines). Same box() signature as Level.
export class VisualBatch {
  constructor(L) { this.L = L; this.list = []; }
  box(x0, y0, z0, x1, y1, z1, mat, o = {}) {
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    this.list.push([x0, y0, z0, x1, y1, z1, mat, o.tint, o.ao ?? 0.72]);
  }
  build(L = this.L, o = {}) {
    const g = boxMesh(this.list);
    g.userData.noCull = true;
    g.traverse((m) => { if (m.isMesh) { m.castShadow = !!o.shadows; m.matrixAutoUpdate = false; m.updateMatrix(); } });
    L.addObject(g);
    return g;
  }
}

// ===================================================================
// Sky, landmarks, traffic and signage (added for chapter 1, The Greenhouse)
// ===================================================================
import { materials as daMaterials } from '../render/materials.js';
import { sign as daSign, P as daP } from './kit.js';
import { F_SOLID as DA_SOLID, F_NONAV as DA_NONAV, F_SHOOT as DA_SHOOT } from '../world/collision.js';

// Register a flat emissive material under `name` (level geometry can then use
// the name like any built-in material). Colour cannot be tinted per box.
export function emissiveMat(name, color, intensity = 3) {
  if (!daMaterials.cache.has(name)) {
    const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, vertexColors: true });
    m.name = name;
    daMaterials.cache.set(name, m);
  }
  return name;
}
// Unlit, unfogged vertex-colour material (distant silhouettes that must read
// through the fog, e.g. the airport tower). Tint boxes to colour them.
export function unfoggedMat(name = 'daUnfogged') {
  if (!daMaterials.cache.has(name)) {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, fog: false });
    m.name = name;
    daMaterials.cache.set(name, m);
  }
  return name;
}

// ---------------------------------------------------------------- sky lights --
// Screen-space glowing dots (aircraft nav lights, beacons, runway lights,
// tracers). One Points draw call for everything; unfogged so they read at any
// distance. Slots: add() -> index, set(i, x, y, z, [r,g,b], size).
export class SkyLights {
  constructor(L, game, cap = 320) {
    this.game = game;
    this.cap = cap;
    this.n = 0;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setDrawRange(0, 0);
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 1 } },
      vertexShader: 'attribute float size; attribute vec3 color; varying vec3 vC; uniform float scale;\n' +
        'void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size * scale; }',
      fragmentShader: 'varying vec3 vC;\n' +
        'void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; float core = smoothstep(0.35, 0.0, r); float halo = smoothstep(1.0, 0.0, r); float a = core + halo * halo * 0.45; gl_FragColor = vec4(vC * a, a); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.mat = mat;
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 4;
    pts.userData.noCull = true;
    this.points = pts;
    L.addObject(pts);
    this.objs = [];
    L.dynamics.push(this);
  }
  add(x = 0, y = -1000, z = 0, color = [1, 1, 1], size = 4) {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    this.set(i, x, y, z, color, size);
    this.geo.setDrawRange(0, this.n);
    return i;
  }
  set(i, x, y, z, c, size) {
    if (i < 0) return;
    const p = this.pos, k = i * 3;
    p[k] = x; p[k + 1] = y; p[k + 2] = z;
    if (c) { this.col[k] = c[0]; this.col[k + 1] = c[1]; this.col[k + 2] = c[2]; }
    if (size != null) this.size[i] = size;
  }
  hide(i) { if (i >= 0) this.size[i] = 0; }
  // an object with update(t, dt, lights) is advanced every frame
  track(o) { this.objs.push(o); return o; }
  update(dt) {
    const g = this.game;
    const h = g.renderer?.r?.domElement?.height || 540;
    this.mat.uniforms.scale.value = h / 540;
    const t = g.time;
    for (const o of this.objs) o.update(t, dt, this);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}

// Aircraft light rig moving along a function path(t) -> {x,y,z}.
// kind: 'airliner' | 'jet' ; landing: landing lights on.
export function skyAircraft(sky, path, o = {}) {
  const kind = o.kind ?? 'airliner';
  const s = o.scale ?? 1;
  const ids = {
    red: sky.add(0, -1e3, 0, [2.2, 0.15, 0.1], 3.5 * s), green: sky.add(0, -1e3, 0, [0.2, 2.2, 0.4], 3.5 * s),
    strobe: sky.add(0, -1e3, 0, [3, 3, 3], 0), beacon: sky.add(0, -1e3, 0, [2.5, 0.2, 0.1], 0),
    land: o.landing ? sky.add(0, -1e3, 0, [3, 2.9, 2.6], 0) : -1,
    burn: kind === 'jet' ? sky.add(0, -1e3, 0, [3, 1.3, 0.4], 0) : -1,
  };
  const p = new THREE.Vector3(), q = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
  const span = kind === 'jet' ? 5 : 17;
  const obj = {
    phase: o.phase ?? 0, pos: p, vel: new THREE.Vector3(), visible: true,
    update(t, dt, S) {
      const tt = t + this.phase;
      const a = path(tt);
      if (!a) { for (const k in ids) S.hide(ids[k]); this.visible = false; return; }
      this.visible = true;
      const b = path(tt + 0.1) || a;
      p.set(a.x, a.y, a.z);
      q.set(b.x, b.y, b.z);
      fwd.subVectors(q, p);
      this.vel.copy(fwd).multiplyScalar(10);
      fwd.y = 0;
      if (fwd.lengthSq() < 1e-6) fwd.set(1, 0, 0);
      fwd.normalize();
      right.set(-fwd.z, 0, fwd.x);
      S.set(ids.red, p.x - right.x * span, p.y, p.z - right.z * span, null, 3.5 * s);
      S.set(ids.green, p.x + right.x * span, p.y, p.z + right.z * span, null, 3.5 * s);
      const st = (tt * 1.1) % 1.2;
      S.set(ids.strobe, p.x - fwd.x * span * 0.9, p.y + 1, p.z - fwd.z * span * 0.9, null, (st < 0.05 || (st > 0.18 && st < 0.23)) ? 7 * s : 0);
      S.set(ids.beacon, p.x, p.y - 1.5, p.z, null, (tt % 1.4) < 0.25 ? 6 * s : 0);
      if (ids.land >= 0) S.set(ids.land, p.x + fwd.x * span * 0.6, p.y - 1, p.z + fwd.z * span * 0.6, null, 11 * s);
      if (ids.burn >= 0) S.set(ids.burn, p.x - fwd.x * 6, p.y, p.z - fwd.z * 6, null, (6 + Math.sin(tt * 40) * 1.5) * s);
    },
  };
  return sky.track(obj);
}

// ---------------------------------------------------------------- jet audio --
// Procedural positional jet roar on the engine's sfx bus (no-op without Web
// Audio). Returns {set(pos, vol, vel), stop(fade)}.
export function jetAudio(game, o = {}) {
  try {
    const a = game.audio;
    const ctx = a && a.ctx;
    const bus = a && (a.sfxBus || a.buses?.sfx);
    if (!ctx || !bus || typeof ctx.createPanner !== 'function') return null;
    const sr = ctx.sampleRate, len = Math.floor(sr * 2.5);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    let last = 0, seed = 12345;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * rnd()) / 1.02; d[i] = last * 3.2 + rnd() * 0.04; }
    // crossfade the loop seam
    const xf = Math.floor(sr * 0.1);
    for (let i = 0; i < xf; i++) { const k = i / xf; d[i] = d[i] * k + d[len - xf + i] * (1 - k); }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 0.5;
    const hiss = ctx.createBufferSource(); hiss.buffer = buf; hiss.loop = true; hiss.playbackRate.value = 3.7;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.8;
    const hg = ctx.createGain(); hg.gain.value = o.hiss ?? 0.25;
    const whine = ctx.createOscillator(); whine.type = 'sawtooth'; whine.frequency.value = o.whine ?? 210;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 1400; wf.Q.value = 4;
    const wg = ctx.createGain(); wg.gain.value = o.whineVol ?? 0.035;
    const g = ctx.createGain(); g.gain.value = 0;
    const pan = ctx.createPanner();
    pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse';
    pan.refDistance = o.ref ?? 35; pan.maxDistance = 6000; pan.rolloffFactor = o.rolloff ?? 1.0;
    src.connect(lp); lp.connect(g);
    hiss.connect(bp); bp.connect(hg); hg.connect(g);
    whine.connect(wf); wf.connect(wg); wg.connect(g);
    g.connect(pan); pan.connect(bus);
    src.start(); hiss.start(); whine.start();
    let stopped = false;
    const lpos = new THREE.Vector3();
    return {
      set(pos, vol = 1, vel = null) {
        if (stopped) return;
        const t = ctx.currentTime;
        if (pan.positionX) { pan.positionX.setTargetAtTime(pos.x, t, 0.03); pan.positionY.setTargetAtTime(pos.y, t, 0.03); pan.positionZ.setTargetAtTime(pos.z, t, 0.03); } else pan.setPosition(pos.x, pos.y, pos.z);
        g.gain.setTargetAtTime(vol * (o.vol ?? 2.2), t, 0.08);
        // doppler + brightness from the listener distance
        const cam = game.camPos || lpos;
        const dist = Math.hypot(pos.x - cam.x, pos.y - cam.y, pos.z - cam.z);
        let rate = 1;
        if (vel) {
          const vr = ((pos.x - cam.x) * vel.x + (pos.y - cam.y) * vel.y + (pos.z - cam.z) * vel.z) / Math.max(1, dist);
          rate = Math.min(1.35, Math.max(0.7, 1 - vr / 340));
        }
        src.playbackRate.setTargetAtTime(rate, t, 0.1);
        hiss.playbackRate.setTargetAtTime(3.7 * rate, t, 0.1);
        whine.frequency.setTargetAtTime((o.whine ?? 210) * rate, t, 0.1);
        lp.frequency.setTargetAtTime(Math.max(250, Math.min(2600, 90000 / Math.max(30, dist))), t, 0.1);
      },
      stop(fade = 1) {
        if (stopped) return;
        stopped = true;
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(0, t, fade / 3);
        setTimeout(() => { try { src.stop(); hiss.stop(); whine.stop(); g.disconnect(); } catch (e) { /* ignore */ } }, fade * 1000 + 200);
      },
    };
  } catch (e) {
    return null;
  }
}

// ------------------------------------------------------------ airliner model --
function mergeByMaterial(parts) {
  // parts: [{geo, mat}] with geometry already transformed -> Group of merged meshes
  const byMat = new Map();
  for (const p of parts) { if (!byMat.has(p.mat)) byMat.set(p.mat, []); byMat.get(p.mat).push(p.geo.index ? p.geo.toNonIndexed() : p.geo); }
  const g = new THREE.Group();
  for (const [mat, list] of byMat) {
    let n = 0;
    for (const geo of list) n += geo.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    let o = 0;
    for (const geo of list) {
      pos.set(geo.attributes.position.array, o * 3);
      nor.set(geo.attributes.normal.array, o * 3);
      o += geo.attributes.position.count;
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    const m = new THREE.Mesh(mg, mat);
    m.castShadow = false;
    g.add(m);
  }
  return g;
}
// Twin-engine airliner (~38 m) built along -Z (nose) for use with Flyer.
export function airlinerModel(o = {}) {
  const body = new THREE.MeshStandardMaterial({ color: o.color ?? 0xd8dadc, roughness: 0.45, metalness: 0.35 });
  const livery = new THREE.MeshStandardMaterial({ color: o.livery ?? 0x1a3a8a, roughness: 0.5, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.6, metalness: 0.4 });
  const win = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.35, 0.9) });
  const parts = [];
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    const gg = geo.clone(); gg.applyMatrix4(m); parts.push({ geo: gg, mat });
  };
  const L = 36, R = 2.0;
  add(new THREE.CylinderGeometry(R, R, L - 8, 18, 1, true), body, 0, 0, 0, Math.PI / 2);
  add(new THREE.SphereGeometry(R, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), body, 0, 0, -(L - 8) / 2, -Math.PI / 2, 0, 0, 1, 2.0, 1);
  add(new THREE.ConeGeometry(R, 7, 18, 1, true), body, 0, 0.6, (L - 8) / 2 + 3.5, Math.PI / 2, 0, 0, 1, 1, 0.75);
  add(new THREE.CylinderGeometry(R * 1.005, R * 1.005, L - 9, 18, 1, true, Math.PI * 0.62, Math.PI * 0.76), livery, 0, 0, 0.5, Math.PI / 2);
  // cockpit + cabin windows
  add(new THREE.BoxGeometry(1.8, 0.35, 0.8), dark, 0, 0.9, -(L - 8) / 2 - 1.6, 0.35);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.25, L - 14), win, sx * R * 0.98, 0.55, 0.5);
  // wings (swept), engines, stabilisers, fin
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(15, 0.35, 4.2), body, sx * 8.6, -0.9, 1.6, 0, sx * 0.42, sx * -0.05);
    add(new THREE.CylinderGeometry(1.05, 0.9, 4.2, 14), dark, sx * 5.8, -2.0, -0.6, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.75, 0.75, 0.05, 14), win, sx * 5.8, -2.0, -2.72, Math.PI / 2);
    add(new THREE.BoxGeometry(6, 0.22, 2.4), body, sx * 3.6, 0.8, L / 2 - 2.2, 0, sx * 0.45);
  }
  add(new THREE.BoxGeometry(0.35, 6.5, 4.4), livery, 0, 4.2, L / 2 - 3.2, -0.5);
  // landing gear (down)
  if (o.gear !== false) {
    for (const [x, z] of [[0, -(L - 8) / 2 + 1.5], [-2.6, 2.4], [2.6, 2.4]]) {
      add(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6), dark, x, -2.9, z);
      add(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 10), dark, x, -4.2, z, 0, 0, Math.PI / 2);
    }
  }
  return mergeByMaterial(parts);
}

// Scripted flyer: moves an Object3D along keyframes [{x,y,z,t}] (Catmull-Rom),
// faces the direction of travel with bank, drives lights / audio / shake.
export class Flyer {
  constructor(L, game, obj, o = {}) {
    this.L = L; this.game = game; this.obj = obj; this.o = o;
    obj.visible = false;
    obj.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
    obj.userData.noCull = true;
    L.addObject(obj);
    this.t = 0; this.path = null; this.curve = null;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.light = o.light ? L.light(0, -500, 0, o.light.color ?? 0xfff4e0, o.light.intensity ?? 40, o.light.range ?? 60, { priority: 3, dynamic: true }) : null;
    if (this.light) this.light.on = false;
    this.sky = o.sky || null;
    this.lids = this.sky ? {
      l: this.sky.add(0, -1e3, 0, [3, 2.9, 2.5], 0), r: this.sky.add(0, -1e3, 0, [3, 2.9, 2.5], 0),
      red: this.sky.add(0, -1e3, 0, [2.4, 0.15, 0.1], 0), green: this.sky.add(0, -1e3, 0, [0.2, 2.4, 0.4], 0), strobe: this.sky.add(0, -1e3, 0, [3, 3, 3], 0),
    } : null;
    L.dynamics.push(this);
  }
  fly(keys, o = {}) {
    this.keys = keys;
    this.curve = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(k.x, k.y, k.z)), false, 'centripetal');
    this.dur = keys[keys.length - 1].t;
    this.t = 0;
    this.path = true;
    this.onEnd = o.onEnd;
    this.obj.visible = true;
    if (this.o.audio && !this.snd) this.snd = jetAudio(this.game, this.o.audio);
    if (this.light) this.light.on = true;
  }
  // map time -> curve parameter using the keyframe times
  u(t) {
    const K = this.keys;
    let i = 0;
    while (i < K.length - 2 && t > K[i + 1].t) i++;
    const k = Math.min(1, Math.max(0, (t - K[i].t) / Math.max(1e-3, K[i + 1].t - K[i].t)));
    return (i + k) / (K.length - 1);
  }
  update(dt) {
    if (!this.path) return;
    this.t += dt;
    const g = this.game;
    const u0 = this.u(this.t), u1 = this.u(this.t + 0.05);
    const p = this.curve.getPoint(u0), q = this.curve.getPoint(Math.min(1, u1 + 1e-4));
    this.vel.subVectors(q, p).divideScalar(0.05);
    this.pos.copy(p);
    const o = this.obj;
    o.position.copy(p);
    const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
    const hl = Math.hypot(dx, dz);
    if (hl > 1e-4) {
      const yaw = Math.atan2(-dx, -dz);
      let dyaw = yaw - (this.yaw ?? yaw);
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      this.yaw = yaw;
      this.bank = (this.bank ?? 0) * 0.95 + Math.max(-0.5, Math.min(0.5, -dyaw / Math.max(dt, 1e-3) * 0.6)) * 0.05;
      o.rotation.set(Math.atan2(dy, hl), yaw, this.bank, 'YXZ');
    }
    // lights
    if (this.light) { this.light.x = p.x; this.light.y = p.y - 3; this.light.z = p.z; }
    if (this.lids) {
      const S = this.sky, m = o.matrixWorld;
      o.updateMatrixWorld(true);
      const w = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(m);
      const a = w(-1.2, -2.2, -8), b = w(1.2, -2.2, -8), r = w(-17.3, -0.6, 4.4), gr = w(17.3, -0.6, 4.4), st = w(0, 2, 18);
      S.set(this.lids.l, a.x, a.y, a.z, null, 16);
      S.set(this.lids.r, b.x, b.y, b.z, null, 16);
      S.set(this.lids.red, r.x, r.y, r.z, null, 5);
      S.set(this.lids.green, gr.x, gr.y, gr.z, null, 5);
      const ph = this.t % 1.1;
      S.set(this.lids.strobe, st.x, st.y, st.z, null, ph < 0.06 ? 9 : 0);
    }
    if (this.snd) this.snd.set(p, 1, this.vel);
    // rumble when it passes close
    const cam = g.camPos;
    const d = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
    if (this.o.shake && d < this.o.shake) g.shake?.((1 - d / this.o.shake) * 0.08);
    this.o.onUpdate?.(this.t, d);
    if (this.t >= this.dur) {
      this.path = null;
      this.obj.visible = false;
      if (this.light) this.light.on = false;
      if (this.lids) for (const k in this.lids) this.sky.hide(this.lids[k]);
      if (this.snd) { this.snd.stop(2); this.snd = null; }
      this.onEnd?.();
    }
  }
}

// ------------------------------------------------------ distant airport tower --
// Metro International's control tower (the campaign landmark): an unfogged
// silhouette with a lit cab, red obstruction lights and a slow red beacon,
// terminal and hangar blocks, runway lights with a sequenced approach strobe,
// and two sweeping searchlights. (x, z) = tower base; y0 = ground height.
export function airportLandmark(L, game, sky, x, z, o = {}) {
  const y0 = o.y ?? 0, H = o.h ?? 62;
  const um = unfoggedMat();
  const B = new VisualBatch(L);
  const dark = o.tint ?? 0x1c1d24, mid = 0x2a2830;
  // shaft (stepped), cab, roof, mast
  B.box(x - 3, y0, z - 3, x + 3, y0 + H * 0.55, z + 3, um, { tint: dark, ao: 0.6 });
  B.box(x - 2.4, y0 + H * 0.55, z - 2.4, x + 2.4, y0 + H - 6, z + 2.4, um, { tint: dark, ao: 1 });
  B.box(x - 5.5, y0 + H - 7, z - 5.5, x + 5.5, y0 + H - 6, z + 5.5, um, { tint: mid, ao: 1 });
  B.box(x - 6, y0 + H - 6, z - 6, x + 6, y0 + H - 5.6, z + 6, um, { tint: dark, ao: 1 });
  // glazed cab (lit teal-white)
  B.box(x - 5.8, y0 + H - 5.6, z - 5.8, x + 5.8, y0 + H - 2.2, z + 5.8, um, { tint: 0x7fa8a0, ao: 1 });
  for (let k = -2; k <= 2; k++) {
    B.box(x + k * 2.3 - 0.12, y0 + H - 5.6, z - 5.85, x + k * 2.3 + 0.12, y0 + H - 2.2, z + 5.85, um, { tint: dark, ao: 1 });
    B.box(x - 5.85, y0 + H - 5.6, z + k * 2.3 - 0.12, x + 5.85, y0 + H - 2.2, z + k * 2.3 + 0.12, um, { tint: dark, ao: 1 });
  }
  B.box(x - 6.6, y0 + H - 2.2, z - 6.6, x + 6.6, y0 + H - 1.4, z + 6.6, um, { tint: dark, ao: 1 });
  B.box(x - 3, y0 + H - 1.4, z - 3, x + 3, y0 + H, z + 3, um, { tint: dark, ao: 1 });
  B.box(x - 0.25, y0 + H, z - 0.25, x + 0.25, y0 + H + 9, z + 0.25, um, { tint: dark, ao: 1 });
  B.box(x - 1.2, y0 + H + 2, z - 0.08, x + 1.2, y0 + H + 2.15, z + 0.08, um, { tint: dark, ao: 1 });
  // shaft window slits (a few lit)
  for (let yy = y0 + 6; yy < y0 + H * 0.5; yy += 4.2) B.box(x - 0.5, yy, z - 3.05, x + 0.5, yy + 1.6, z - 3.0, um, { tint: (yy | 0) % 3 ? 0x2a3038 : 0x9a8a60, ao: 1 });
  // terminal, hangars, glow of the apron
  const tx = o.terminal ?? [x - 140, z + 40, x + 90, z + 75];
  B.box(tx[0], y0, tx[1], tx[2], y0 + 16, tx[3], um, { tint: 0x17181e, ao: 0.7 });
  for (let xx = tx[0] + 4; xx < tx[2] - 4; xx += 9) B.box(xx, y0 + 6, tx[1] - 0.1, xx + 6, y0 + 11, tx[1], um, { tint: (xx | 0) % 4 === 0 ? 0x3a3a32 : 0xb89a60, ao: 1 });
  for (let i = 0; i < 3; i++) { const hx = x + 60 + i * 55; B.box(hx, y0, z - 60, hx + 42, y0 + 20, z - 25, um, { tint: 0x15161c, ao: 0.7 }); B.box(hx + 4, y0 + 2, z - 25, hx + 38, y0 + 14, z - 24.9, um, { tint: 0x6a6040, ao: 1 }); }
  const grp = B.build(L);
  grp.renderOrder = 1;
  // lights
  const R = [2.6, 0.12, 0.08];
  const beacon = sky.add(x, y0 + H + 9.4, z, R, 12);
  const obs = [sky.add(x - 6.2, y0 + H - 1.8, z - 6.2, R, 5), sky.add(x + 6.2, y0 + H - 1.8, z + 6.2, R, 5), sky.add(x + 6.2, y0 + H - 1.8, z - 6.2, R, 5), sky.add(x - 6.2, y0 + H - 1.8, z + 6.2, R, 5), sky.add(x, y0 + H * 0.55, z - 3.2, R, 4)];
  // runway: two rows of white edge lights + green threshold, sequenced approach strobes
  const rw = o.runway ?? { x0: x - 260, x1: x + 220, z: z + 120 };
  const edge = [];
  for (let xx = rw.x0; xx <= rw.x1; xx += 22) { edge.push(sky.add(xx, y0 + 0.5, rw.z - 22, [2.2, 2.0, 1.6], 2.6)); edge.push(sky.add(xx, y0 + 0.5, rw.z + 22, [2.2, 2.0, 1.6], 2.6)); }
  for (let k = -3; k <= 3; k++) sky.add(rw.x0 - 4, y0 + 0.5, rw.z + k * 6, [0.3, 2.4, 0.6], 3);
  const rabbit = [];
  for (let k = 1; k <= 10; k++) rabbit.push(sky.add(rw.x0 - k * 26, y0 + 1, rw.z, [3, 3, 3], 0));
  // blue taxiway dots near the terminal
  for (let xx = tx[0] + 10; xx < tx[2]; xx += 16) sky.add(xx, y0 + 0.3, tx[1] - 18, [0.3, 0.6, 2.4], 2.2);
  sky.track({
    update(t) {
      const k = (t % 2.0) / 2.0;
      sky.set(beacon, x, y0 + H + 9.4, z, null, k < 0.45 ? 16 * (0.6 + 0.4 * Math.sin(k / 0.45 * Math.PI)) : 3);
      for (const i of obs) sky.size[i] = 5;
      const r = Math.floor((t * 2.2 % 1) * 14);
      for (let j = 0; j < rabbit.length; j++) sky.size[rabbit[j]] = (rabbit.length - 1 - j) === r ? 9 : 0;
    },
  });
  // searchlights
  const beams = [];
  if (o.searchlights !== false) {
    for (const [bx, bz, ph] of [[x + 70, z + 60, 0], [x - 120, z + 20, 2.1]]) {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 14, 420, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x8a96a8, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      beam.geometry.translate(0, 210, 0);
      beam.position.set(bx, y0, bz);
      beam.frustumCulled = false;
      beam.userData.noCull = true;
      L.addObject(beam);
      beams.push({ beam, ph });
    }
    L.dynamics.push({ update() { const t = game.time; for (const b of beams) b.beam.rotation.set(0.45 + Math.sin(t * 0.21 + b.ph) * 0.22, 0, Math.cos(t * 0.17 + b.ph) * 0.5); } });
  }
  return { beacon, grp, beams };
}

// ------------------------------------------------------- distant smoke plumes --
// Billboarded smoke columns (one instanced draw call). plumes: [{x,y,z,h,r}]
function smokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  let s = 77;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const x = 64 + (r() - 0.5) * 50, y = 64 + (r() - 0.5) * 50, rad = 18 + r() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(255,255,255,${0.16 + r() * 0.12})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}
export function smokePlumes(L, game, plumes, o = {}) {
  const per = o.per ?? 9;
  const N = plumes.length * per;
  const geo = new THREE.InstancedBufferGeometry();
  const base = new THREE.PlaneGeometry(1, 1);
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const inst = new Float32Array(N * 4), inst2 = new Float32Array(N * 3);
  geo.setAttribute('inst', new THREE.InstancedBufferAttribute(inst, 4));
  geo.setAttribute('inst2', new THREE.InstancedBufferAttribute(inst2, 3));
  geo.instanceCount = N;
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: smokeTexture() }, lo: { value: new THREE.Color(o.lo ?? 0x6a3a22) }, hi: { value: new THREE.Color(o.hi ?? 0x1c1a1c) } },
    vertexShader: 'attribute vec4 inst; attribute vec3 inst2; varying vec2 vUv; varying float vA; varying float vH;\n' +
      'void main(){ vUv = uv; vA = inst2.x; vH = inst2.z;\n' +
      ' vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); vec3 U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);\n' +
      ' float c = cos(inst2.y), s = sin(inst2.y); vec2 p = vec2(c*position.x - s*position.y, s*position.x + c*position.y) * inst.w;\n' +
      ' vec3 wp = inst.xyz + R * p.x + U * p.y; gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0); }',
    fragmentShader: 'uniform sampler2D map; uniform vec3 lo; uniform vec3 hi; varying vec2 vUv; varying float vA; varying float vH;\n' +
      'void main(){ float a = texture2D(map, vUv).a * vA; vec3 col = mix(lo, hi, smoothstep(0.0, 0.45, vH)); gl_FragColor = vec4(col, a); }',
    transparent: true, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.userData.noCull = true;
  L.addObject(mesh);
  const wind = o.wind ?? [1, 0.25];
  const upd = {
    update() {
      const t = game.time;
      let k = 0;
      for (let pi = 0; pi < plumes.length; pi++) {
        const P = plumes[pi];
        const H = P.h ?? 120, R = P.r ?? 14, sp = P.speed ?? 0.018;
        for (let i = 0; i < per; i++, k++) {
          const ph = (t * sp + i / per + pi * 0.137) % 1;
          const y = P.y + ph * H;
          const drift = ph * ph * H * 0.6;
          inst[k * 4] = P.x + wind[0] * drift + Math.sin(i * 2.1 + pi) * R * 0.2;
          inst[k * 4 + 1] = y;
          inst[k * 4 + 2] = P.z + wind[1] * drift;
          inst[k * 4 + 3] = R * (1 + ph * 2.6);
          inst2[k * 3] = Math.min(1, ph * 6) * (1 - ph) * (P.alpha ?? 0.85);
          inst2[k * 3 + 1] = i * 1.7 + t * 0.03 * (i % 2 ? 1 : -1);
          inst2[k * 3 + 2] = ph;
        }
      }
      geo.attributes.inst.needsUpdate = true;
      geo.attributes.inst2.needsUpdate = true;
    },
  };
  upd.update();
  L.dynamics.push(upd);
  return mesh;
}

// -------------------------------------------------------------- cloud deck --
// Low overcast lit orange from below by the burning city. Unfogged disc with a
// radial fade (reads when looking up; aircraft pass above/below it).
export function cloudDeck(L, game, o = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  let s = 91;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = 'rgba(0,0,0,0)';
  for (let i = 0; i < 180; i++) {
    const x = r() * 256, y = r() * 256, rad = 12 + r() * 46;
    for (const [ox, oy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      gr.addColorStop(0, `rgba(255,255,255,${0.1 + r() * 0.12})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const R = o.r ?? 560;
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, t: { value: 0 }, R: { value: R }, glow: { value: new THREE.Color(o.glow ?? 0x7a4a30) }, dark: { value: new THREE.Color(o.dark ?? 0x221c22) } },
    vertexShader: 'varying vec2 vW; void main(){ vW = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D map; uniform float t; uniform float R; uniform vec3 glow; uniform vec3 dark; varying vec2 vW;\n' +
      'void main(){ float r = length(vW) / R; vec2 uv = vW / 190.0 + vec2(t * 0.004, t * 0.0015); float a = texture2D(map, uv).a * 1.6 + texture2D(map, uv * 2.3 + 0.37).a * 0.8;\n' +
      ' a = clamp(a, 0.0, 1.0) * (1.0 - smoothstep(0.55, 1.0, r)); vec3 col = mix(dark, glow, clamp(a * 0.9 + r * 0.35, 0.0, 1.0)); gl_FragColor = vec4(col, a * 0.75); }',
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(R, 48), mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(o.x ?? 0, o.y ?? 190, o.z ?? 0);
  mesh.renderOrder = -5;
  mesh.frustumCulled = false;
  mesh.userData.noCull = true;
  L.addObject(mesh);
  L.dynamics.push({ update() { mat.uniforms.t.value = game.time; const cp = game.camPos; mesh.position.x = (o.x ?? 0) * 0.3 + cp.x * 0.7; mesh.position.z = (o.z ?? 0) * 0.3 + cp.z * 0.7; } });
  return mesh;
}

// ---------------------------------------------------------- canvas signage --
function glowCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
// Neon tube lettering (transparent quad, HDR colour so it blooms).
export function neonSign(L, text, x, y, z, ry, w, h, color = '#ff3a8a', o = {}) {
  const lines = String(text).split('\n');
  const [c, g] = glowCanvas(512, Math.round(512 * h / w));
  const H = c.height;
  let size = Math.floor(H * 0.7 / lines.length);
  const font = o.font ?? 'Georgia, "Times New Roman", serif';
  const setF = () => { g.font = `${o.italic ? 'italic ' : ''}bold ${size}px ${font}`; };
  setF();
  for (const l of lines) while (g.measureText(l).width > 470 && size > 8) { size -= 2; setF(); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round';
  lines.forEach((l, i) => {
    const yy = H / 2 + (i - (lines.length - 1) / 2) * size * 1.1;
    g.shadowColor = color; g.shadowBlur = 22; g.strokeStyle = color; g.lineWidth = size * 0.14; g.strokeText(l, 256, yy);
    g.shadowBlur = 8; g.lineWidth = size * 0.07; g.strokeStyle = '#ffffff'; g.globalAlpha = 0.85; g.strokeText(l, 256, yy); g.globalAlpha = 1;
  });
  if (o.border) { g.shadowColor = color; g.shadowBlur = 16; g.strokeStyle = color; g.lineWidth = 5; g.strokeRect(10, 10, 492, H - 20); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const k = o.bright ?? 2.4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(k, k, k), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, fog: o.fog !== false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.renderOrder = 3;
  L.addObject(m);
  let lt = null;
  if (o.light !== false) {
    const nx = Math.sin(ry), nz = Math.cos(ry), side = o.side ?? 1;
    lt = L.light(x + nx * 0.8 * side, y - (o.lightDrop ?? 0.3), z + nz * 0.8 * side, o.lightColor ?? new THREE.Color(color).getHex(), o.lightIntensity ?? 4, o.lightRange ?? 8, { flicker: o.flicker ?? 0 });
  }
  if (o.flicker) {
    // buzzing neon: random dropouts
    const game = L.game;
    let dropT = 0;
    L.dynamics.push({ update(dt) {
      dropT -= dt;
      if (dropT <= 0) { dropT = 0.05 + Math.random() * (Math.random() < 0.1 ? 0.3 : 2.5); const on = Math.random() > o.flicker * 0.35; mat.color.setScalar(on ? k : k * 0.08); if (lt) lt.on = on; }
      if (game.camPos && Math.abs(game.camPos.x - x) > 90) dropT = Math.max(dropT, 0.5);
    } });
  }
  return { mesh: m, light: lt, mat };
}

// Painted billboard advert. draw(g, W, H) paints the canvas (512 x 256).
export function adTexture(draw, W = 512, H = 256) {
  const [c, g] = glowCanvas(W, H);
  draw(g, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// Ready-made airline ads (original brands).
export const ADS = {
  flyNewburg(g, W, H) {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#0b2a5a'); gr.addColorStop(0.65, '#3a78b8'); gr.addColorStop(1, '#f0b060');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(60 + i * 110, 60 + (i % 2) * 30, 50, 12, 0, 0, 7); g.fill(); }
    // plane silhouette
    g.save(); g.translate(370, 120); g.rotate(-0.18); g.fillStyle = '#f4f4f0';
    g.beginPath(); g.ellipse(0, 0, 95, 13, 0, 0, 7); g.fill();
    g.beginPath(); g.moveTo(-10, 0); g.lineTo(-45, 70); g.lineTo(-20, 70); g.lineTo(30, 4); g.fill();
    g.beginPath(); g.moveTo(-10, 0); g.lineTo(-35, -50); g.lineTo(-18, -50); g.lineTo(25, -4); g.fill();
    g.beginPath(); g.moveTo(-80, -4); g.lineTo(-98, -40); g.lineTo(-86, -40); g.lineTo(-62, -6); g.fill();
    g.restore();
    g.fillStyle = '#ffffff'; g.font = 'bold 64px Arial Black, Impact, sans-serif'; g.textAlign = 'left';
    g.fillText('FLY', 26, 150); g.fillText('NEWBURG', 26, 212);
    g.fillStyle = '#ffd060'; g.font = 'bold 20px Arial, sans-serif'; g.fillText('METRO INTERNATIONAL  ·  40 DESTINATIONS DAILY', 26, 244);
  },
  skylineAir(g, W, H) {
    g.fillStyle = '#e8e2d4'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#b01e28'; g.fillRect(0, H - 70, W, 70);
    g.beginPath(); g.moveTo(W - 180, 0); g.lineTo(W, 0); g.lineTo(W, H - 70); g.lineTo(W - 60, H - 70); g.fill();
    g.fillStyle = '#1a1a22'; g.font = 'italic bold 58px Georgia, serif'; g.textAlign = 'left'; g.fillText('SkyLine Air', 24, 84);
    g.font = 'bold 26px Arial, sans-serif'; g.fillStyle = '#3a3a44'; g.fillText('Leave it all behind.', 28, 128);
    g.fillStyle = '#ffffff'; g.font = 'bold 30px Arial Black, Impact, sans-serif'; g.fillText('NOW BOARDING  ·  GATE C', 24, H - 24);
    // tail fin logo
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(W - 120, 40); g.lineTo(W - 60, 40); g.lineTo(W - 90, 150); g.lineTo(W - 150, 150); g.fill();
  },
  harborview(g, W, H) {
    const gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, '#1a2a3a'); gr.addColorStop(1, '#0a1420');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#c8a860'; g.lineWidth = 6; g.strokeRect(12, 12, W - 24, H - 24);
    g.fillStyle = '#e8d8a8'; g.font = 'bold 54px Georgia, serif'; g.textAlign = 'center'; g.fillText('THE HARBORVIEW', W / 2, 108);
    g.font = 'italic 28px Georgia, serif'; g.fillText('Waterfront luxury since 1928', W / 2, 160);
    g.font = 'bold 22px Arial, sans-serif'; g.fillStyle = '#c8a860'; g.fillText('ROOFTOP LOUNGE  ·  HARBOR ST', W / 2, 212);
  },
};

// Billboard on steel legs: face centred at (x, z) at height y (bottom of the
// panel), facing ry (front normal = (sin ry, cos ry)); w x h panel.
export function billboard(L, x, y, z, ry, w, h, tex, o = {}) {
  const p = daP.prop(L, x, y, z, ry);
  const legH = o.legs ?? 2.2;
  // panel frame & back structure (local: front faces +Z)
  p.box(0, legH + h / 2, -0.2, w + 0.3, h + 0.3, 0.3, 'metalDark');
  for (const sx of [-w / 3, 0, w / 3]) {
    p.box(sx, legH / 2 + 0.2, -0.6, 0.25, legH + h * 0.6, 0.25, 'metalDark');
    p.box(sx, legH * 0.6, -1.6, 0.18, 0.18, 2.4, 'metalDark', null, [0.9, 0, 0]);
  }
  p.box(0, legH - 0.05, 0.4, w, 0.08, 0.8, 'diamond'); // catwalk
  for (let k = 0; k < 7; k++) p.box(-w / 2 + k * w / 6, legH + 0.5, 0.78, 0.04, 1.0, 0.04, 'metalDark');
  p.box(0, legH + 0.95, 0.78, w, 0.04, 0.04, 'metalDark');
  p.col(0, legH / 2 + h / 2, -0.3, w + 0.3, legH + h, 0.8, 'metal');
  // advert face
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: o.glow ?? 0.55 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const nx = Math.sin(ry), nz = Math.cos(ry);
  // the frame's front face is at local z = -0.05; the advert sits just proud of it
  m.position.set(x + nx * -0.04, y + legH + h / 2, z + nz * -0.04);
  m.rotation.y = ry;
  m.receiveShadow = true;
  L.addObject(m);
  // lamps on arms over the top, pointing back at the face
  const lamps = [];
  for (const sx of [-w / 3, w / 3]) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const lx = x + c * sx + nx * 1.2, lz = z - s * sx + nz * 1.2;
    p.box(sx, legH + h + 0.3, 0.6, 0.08, 0.08, 1.4, 'metalDark');
    p.box(sx, legH + h + 0.25, 1.25, 0.45, 0.2, 0.3, 'emissiveWarm');
    if (o.lights !== false) lamps.push(L.light(lx, y + legH + h - 0.4, lz, 0xfff0d0, o.lightIntensity ?? 9, o.lightRange ?? (h + 6), { flicker: o.flicker ?? 0 }));
  }
  return { mesh: m, lamps };
}

// Animated emergency-broadcast TV screen. Redraws only when the camera is
// near. Returns {mesh, light, on}.
export function ebsScreen(L, game, x, y, z, ry, w = 0.9, h = 0.55, o = {}) {
  const [c, g] = glowCanvas(256, 160);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const msgs = o.messages ?? [
    'CIVIL DANGER WARNING FOR THE NEWBURG METRO AREA',
    'REMAIN INDOORS. LOCK ALL DOORS. DO NOT APPROACH INFECTED PERSONS',
    'EVACUATION FLIGHTS ARE OPERATING FROM METRO INTERNATIONAL AIRPORT',
    'MILITARY CHECKPOINT: ROUTE 9 / TERMINAL C',
    'THIS IS NOT A TEST',
  ];
  const ticker = msgs.join('   •••   ') + '   •••   ';
  let t = 0, last = -1, bars = 0;
  const draw = () => {
    g.fillStyle = '#0a1030'; g.fillRect(0, 0, 256, 160);
    if (bars > 0) {
      const cols = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
      cols.forEach((col, i) => { g.fillStyle = col; g.fillRect(i * 256 / 7, 0, 256 / 7 + 1, 112); });
      g.fillStyle = '#101010'; g.fillRect(0, 112, 256, 48);
    } else {
      g.fillStyle = '#b8101a'; g.fillRect(0, 0, 256, 34);
      g.fillStyle = '#ffffff'; g.font = 'bold 17px Arial, sans-serif'; g.textAlign = 'center';
      g.fillText('EMERGENCY ALERT SYSTEM', 128, 23);
      g.fillStyle = '#ffd040'; g.font = 'bold 15px Arial, sans-serif';
      g.fillText('CIVIL EMERGENCY MESSAGE', 128, 58);
      g.fillStyle = '#e8e8f0'; g.font = '12px Arial, sans-serif';
      const k = Math.floor(t / 4) % msgs.length;
      const words = msgs[k].split(' ');
      let line = '', yy = 80;
      for (const wd of words) { if (g.measureText(line + wd).width > 230) { g.fillText(line, 128, yy); line = ''; yy += 15; } line += wd + ' '; }
      g.fillText(line, 128, yy);
    }
    g.fillStyle = '#000000'; g.fillRect(0, 136, 256, 24);
    g.fillStyle = '#ffffff'; g.font = 'bold 14px Arial, sans-serif'; g.textAlign = 'left';
    const off = (t * 60) % (g.measureText(ticker).width);
    g.fillText(ticker + ticker, 256 - off - 256, 153);
    // scanlines / noise
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let yy = 0; yy < 160; yy += 3) g.fillRect(0, yy, 256, 1);
    if (Math.random() < 0.15) { g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, Math.random() * 160, 256, 2 + Math.random() * 8); }
    tex.needsUpdate = true;
  };
  draw();
  const k = o.bright ?? 1.5;
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(k, k, k) });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const nx = Math.sin(ry), nz = Math.cos(ry);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  L.addObject(m);
  const light = L.light(x + nx * 0.7, y, z + nz * 0.7, o.color ?? 0x6a7cff, o.intensity ?? 5, o.range ?? 7, { flicker: 0.25 });
  let sndT = 1 + Math.random() * 2;
  const api = {
    mesh: m, light, on: true,
    update(dt) {
      if (!api.on) return;
      const cp = game.camPos;
      const d = Math.hypot(cp.x - x, cp.y - y, cp.z - z);
      t += dt;
      if (d > 30) return;
      bars = Math.max(0, bars - dt);
      if (Math.random() < dt * 0.05) bars = 1.2;
      if (Math.floor(t * 8) !== last) { last = Math.floor(t * 8); draw(); }
      light.intensity = (o.intensity ?? 5) * (bars > 0 ? 1.3 : 0.8 + Math.random() * 0.3);
      sndT -= dt;
      if (sndT <= 0 && d < 16) {
        sndT = 2.2 + Math.random() * 2;
        game.audio.play(Math.random() < 0.15 ? 'amb_alarmBeeps' : 'amb_tvStatic', { pos: m.position, vol: o.vol ?? 0.7 });
      }
    },
  };
  L.dynamics.push(api);
  return api;
}

// --------------------------------------------------------------- roof edges --
// Parapet ring on a roof: segments minus gaps, coping, and an invisible
// player clip above the coping (so nobody hops up and walks off the edge).
// sides: {n,s,e,w}: false to skip, or {gaps:[[a,b]], h, mat}
export function parapet(L, x0, z0, x1, z1, y, o = {}) {
  const t = o.t ?? 0.35, h0 = o.h ?? 1.1, mat0 = o.mat ?? 'brick';
  const side = (key, axis, fixedA, fixedB, a0, a1) => {
    const sp = o[key] === undefined ? {} : o[key];
    if (sp === false) return;
    const h = sp.h ?? h0, mat = sp.mat ?? mat0;
    const gaps = (sp.gaps || []).slice().sort((p, q) => p[0] - q[0]);
    let cur = a0;
    const segs = [];
    for (const [ga, gb] of gaps) { if (ga > cur) segs.push([cur, ga]); cur = Math.max(cur, gb); }
    if (cur < a1) segs.push([cur, a1]);
    for (const [a, b] of segs) {
      if (b - a < 0.01) continue;
      if (axis === 'x') {
        L.box(a, y, fixedA, b, y + h, fixedB, mat, { tint: o.tint });
        L.box(a - 0.02, y + h, fixedA - 0.06, b + 0.02, y + h + 0.1, fixedB + 0.06, o.coping ?? 'concrete', { collide: false, tint: o.copingTint });
        if (o.clip !== false) L.box(a, y + h, fixedA, b, y + h + 1.7, fixedB, 'concrete', { visible: false, flags: DA_SOLID | DA_NONAV });
      } else {
        L.box(fixedA, y, a, fixedB, y + h, b, mat, { tint: o.tint });
        L.box(fixedA - 0.06, y + h, a - 0.02, fixedB + 0.06, y + h + 0.1, b + 0.02, o.coping ?? 'concrete', { collide: false, tint: o.copingTint });
        if (o.clip !== false) L.box(fixedA, y + h, a, fixedB, y + h + 1.7, b, 'concrete', { visible: false, flags: DA_SOLID | DA_NONAV });
      }
    }
  };
  side('n', 'x', z0, z0 + t, x0, x1);
  side('s', 'x', z1 - t, z1, x0, x1);
  side('w', 'z', x0, x0 + t, z0 + t, z1 - t);
  side('e', 'z', x1 - t, x1, z0 + t, z1 - t);
}

// Makeshift plank bridge along X (x0 -> x1) centred on zc at deck height y:
// boards, cross battens, rope handrails on posts and invisible side clips.
export function plankBridge(L, x0, x1, zc, y, o = {}) {
  const w = o.width ?? 1.6, n = o.boards ?? 3;
  const bw = w / n;
  for (let i = 0; i < n; i++) {
    const za = zc - w / 2 + i * bw + 0.015, zb = za + bw - 0.03;
    const sag = i === 1 ? -0.01 : 0;
    L.box(x0, y + sag, za, x1, y + 0.09 + sag, zb, 'woodPale', { tint: [0x9a8a70, 0x8a7a60, 0xa89878][i % 3], surf: 'wood' });
  }
  for (let x = x0 + 0.4; x < x1; x += 1.3) L.box(x, y - 0.06, zc - w / 2 - 0.05, x + 0.12, y, zc + w / 2 + 0.05, 'woodDark', { collide: false });
  if (o.rails !== false) {
    for (const s of [-1, 1]) {
      const zz = zc + s * (w / 2 + 0.05);
      for (const x of [x0 + 0.1, x1 - 0.1]) L.box(x - 0.05, y, zz - 0.05, x + 0.05, y + 1.1, zz + 0.05, 'woodDark', { collide: false });
      daP.pipe(L, x0 + 0.1, y + 1.05, zz, (x0 + x1) / 2, y + 0.9, zz, 0.018, 'fabric', 0x8a7a5a);
      daP.pipe(L, (x0 + x1) / 2, y + 0.9, zz, x1 - 0.1, y + 1.05, zz, 0.018, 'fabric', 0x8a7a5a);
      L.box(x0, y + 0.1, zz - 0.04, x1, y + 1.4, zz + 0.04, 'concrete', { visible: false, flags: DA_SOLID | DA_NONAV });
    }
  }
}

// Wall clock / small decal helpers could go here; keep additions below.
