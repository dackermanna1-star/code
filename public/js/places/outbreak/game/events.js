// Things that happen in South Karevia whether you're there or not. Helicopters
// come down: you hear one labouring overhead, trailing smoke, and see it go in
// behind a hill. What's left burns for a long time, the smoke is visible for
// miles, and there are military weapons in the wreck and dead soldiers still
// walking around it. A cargo plane drones over and drops a crate on a
// parachute, red smoke marking where it landed. Road flares burn red and hiss,
// and every infected who sees or hears one comes over.
import * as THREE from 'three';
import { O } from '../state.js';
import { PLACES, HALF } from '../world/layout.js';
import { ZOMBIE_OUTFITS, zombieKind } from './humanoid.js';
import { sounds } from '../../../engine/Sound.js';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);

// --- materials and models ----------------------------------------------------------------------------------------------------
const M = {};
function mats() {
  if (M.olive) return M;
  const grime = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) { const v = 200 + Math.random() * 55; g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 4, 1 + Math.random() * 3); }
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(120,120,120,0.25)'; g.fillRect(0, Math.random() * 128, 128, 1); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  M.olive = new THREE.MeshStandardMaterial({ color: 0x4e5638, roughness: 0.75, metalness: 0.25, map: grime });
  M.burnt = new THREE.MeshStandardMaterial({ color: 0x2a2a24, roughness: 0.95, metalness: 0.2, map: grime });
  M.dark = new THREE.MeshStandardMaterial({ color: 0x1e1f1c, roughness: 0.6, metalness: 0.5 });
  M.glass = new THREE.MeshStandardMaterial({ color: 0x1a2228, roughness: 0.15, metalness: 0.6, transparent: true, opacity: 0.85 });
  M.rotor = new THREE.MeshStandardMaterial({ color: 0x24261f, roughness: 0.6, metalness: 0.3 });
  M.red = new THREE.MeshStandardMaterial({ color: 0xa02820, roughness: 0.6 });
  M.crate = new THREE.MeshStandardMaterial({ color: 0x5a5a3a, roughness: 0.85, metalness: 0.1, map: grime });
  M.strap = new THREE.MeshStandardMaterial({ color: 0x2a2a20, roughness: 0.9 });
  M.chute = new THREE.MeshStandardMaterial({ color: 0xd8d0b0, roughness: 0.9, side: THREE.DoubleSide });
  M.chute2 = new THREE.MeshStandardMaterial({ color: 0x5a6a40, roughness: 0.9, side: THREE.DoubleSide });
  M.line = new THREE.LineBasicMaterial({ color: 0x302a20 });
  M.plane = new THREE.MeshStandardMaterial({ color: 0x6a7060, roughness: 0.7, metalness: 0.3 });
  M.scorch = new THREE.MeshStandardMaterial({ color: 0x0c0b0a, roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, map: (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); return t;
  })() });
  M.flare = new THREE.MeshStandardMaterial({ color: 0xc82a20, roughness: 0.5, emissive: 0xff3010, emissiveIntensity: 0 });
  return M;
}
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
const cyl = (r0, r1, h, m, seg = 12) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m);

/** A big transport helicopter (nose to +z). wreck: burnt, broken, the tail torn off. */
function heliModel(wreck) {
  const m = mats(), skin = wreck ? m.burnt : m.olive;
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  // the cabin: a long rounded tube, a glazed nose, the engines on top
  const cab = new THREE.Mesh(new THREE.CapsuleGeometry(4.2, 17, 6, 16), skin);
  cab.rotation.x = Math.PI / 2; cab.scale.set(1, 1, 1.12); cab.position.set(0, 5.4, 0); body.add(cab);
  const belly = box(7.4, 1.4, 20, skin, 0, 1.6, 0); body.add(belly);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(3.9, 16, 10, 0, TAU, 0, Math.PI * 0.55), wreck ? m.dark : m.glass);
  nose.rotation.x = Math.PI / 2.6; nose.position.set(0, 6.4, 10.4); nose.scale.set(1, 0.85, 0.75); body.add(nose);
  body.add(box(5.2, 3, 13, skin, 0, 10.2, 0.5));
  for (const sx of [-1, 1]) {
    const intake = cyl(1.2, 1.2, 1.6, m.dark); intake.rotation.x = Math.PI / 2; intake.position.set(sx * 1.4, 10.4, 7.6); body.add(intake);
    const exh = cyl(0.9, 1.1, 2.4, m.dark); exh.rotation.z = Math.PI / 2; exh.position.set(sx * 3.2, 10, -3.6); body.add(exh);
    // fuel tanks along the sides
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(1.25, 6, 4, 10), skin); tank.rotation.x = Math.PI / 2; tank.position.set(sx * 4.8, 3.2, 1.5); body.add(tank);
    // round windows
    for (let k = 0; k < 5; k++) { const w = cyl(0.65, 0.65, 0.3, wreck ? m.dark : m.glass, 10); w.rotation.z = Math.PI / 2; w.position.set(sx * 4.15, 6.6, -5.5 + k * 2.6); body.add(w); }
    // wheels
    if (!wreck || sx > 0) { const wh = cyl(1, 1, 0.8, m.dark, 12); wh.rotation.z = Math.PI / 2; wh.position.set(sx * 3.4, 0.9, 4 - (sx > 0 ? 0 : 0)); body.add(wh); body.add(box(0.4, 2.2, 0.4, m.dark, sx * 3.1, 2, 4)); }
  }
  const nw = cyl(0.8, 0.8, 0.6, m.dark, 10); nw.rotation.z = Math.PI / 2; nw.position.set(0, 0.8, 11); body.add(nw);
  // the sliding door, open
  body.add(box(0.2, 5, 4.5, m.dark, 4.1, 5, 6.5));
  // a red star on the tail boom
  // the tail boom
  const tail = new THREE.Group();
  const boom = cyl(1.0, 2.3, 24, skin, 12); boom.rotation.x = -Math.PI / 2; boom.position.set(0, 0, -12); tail.add(boom);
  const fin = box(0.6, 7.5, 4.2, skin, 0, 3, -24.2); fin.rotation.x = -0.35; tail.add(fin);
  tail.add(box(9, 0.4, 2.6, skin, 0, -0.2, -20));
  const star = box(0.1, 1.6, 1.6, m.red, 1.6, 0.6, -8); star.rotation.x = Math.PI / 4; tail.add(star);
  const star2 = star.clone(); star2.position.x = -1.6; tail.add(star2);
  const tr = new THREE.Group(); tr.position.set(1.0, 5.6, -25.4);
  for (let k = 0; k < 3; k++) { const b = box(0.15, 5.2, 0.6, m.rotor); b.position.y = 0; const piv = new THREE.Group(); piv.rotation.x = k * TAU / 3; b.position.y = 2.4; piv.add(b); tr.add(piv); }
  tail.add(tr);
  tail.position.set(0, 6.4, -10);
  // the main rotor: five long blades
  const rotor = new THREE.Group(); rotor.position.set(0, 12.6, 0.5);
  rotor.add(cyl(0.6, 0.6, 2, m.dark)); const hub = cyl(1.3, 1.3, 0.9, m.dark); hub.position.y = 1.1; rotor.add(hub);
  for (let k = 0; k < 5; k++) {
    const piv = new THREE.Group(); piv.rotation.y = k * TAU / 5; piv.position.y = 1.2;
    let len = 30, bend = 0;
    if (wreck) { len = [6, 30, 11, 22, 4][k]; bend = [0, -0.35, 0.1, -0.5, 0][k]; }
    const b = box(1.5, 0.22, len, m.rotor, 0, 0, len / 2 + 1); piv.add(b); piv.rotation.x = bend;
    rotor.add(piv);
  }
  g.add(rotor);
  if (wreck) {
    // the boom torn off and lying behind, twisted
    tail.position.set(-3.5, 2.6, -16); tail.rotation.set(-0.05, 0.55, 0.4);
    g.add(tail);
    body.rotation.set(-0.05, 0, 0.32); body.position.y = -0.6;
    rotor.rotation.set(0.1, 0.4, 0.32); rotor.position.set(-3.6, 11.4, 0.5);
    // bits everywhere
    for (let i = 0; i < 14; i++) {
      const s = rnd(0.6, 2.4);
      const d = box(s * rnd(0.5, 2), s * rnd(0.15, 0.5), s * rnd(0.5, 1.6), Math.random() < 0.7 ? m.burnt : m.dark);
      const a = Math.random() * TAU, r = rnd(10, 26);
      d.position.set(Math.cos(a) * r, 0.2, Math.sin(a) * r); d.rotation.set(rnd(-0.4, 0.4), Math.random() * TAU, rnd(-0.4, 0.4));
      d.userData.debris = true; g.add(d);
    }
  } else body.add(tail);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData = { rotor, tailRotor: tr, body, tail };
  return g;
}

/** A four-engine transport plane, seen from the ground (nose to +z). */
function planeModel() {
  const m = mats(), g = new THREE.Group();
  const f = new THREE.Mesh(new THREE.CapsuleGeometry(5, 70, 6, 14), m.plane); f.rotation.x = Math.PI / 2; g.add(f);
  g.add(box(130, 1.2, 12, m.plane, 0, 3.5, 4));
  const tf = box(1, 18, 10, m.plane, 0, 11, -36); tf.rotation.x = -0.3; g.add(tf);
  g.add(box(44, 0.8, 8, m.plane, 0, 4, -36));
  for (const x of [-42, -22, 22, 42]) { const e = cyl(2.2, 2, 9, m.dark); e.rotation.x = Math.PI / 2; e.position.set(x, 2.2, 8); g.add(e); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return g;
}

/** A military crate on a parachute. */
function crateModel() {
  const m = mats(), g = new THREE.Group();
  const crate = new THREE.Group();
  crate.add(box(6, 4.4, 4.2, m.crate, 0, 2.2, 0));
  for (const x of [-2.1, 2.1]) crate.add(box(0.3, 4.5, 4.3, m.strap, x, 2.2, 0));
  crate.add(box(6.2, 0.6, 4.4, m.strap, 0, 0.3, 0));
  // white stencil
  const st = box(2.6, 1, 0.05, new THREE.MeshStandardMaterial({ color: 0xd8d4c4, roughness: 0.9 }), 0, 2.8, 2.13); crate.add(st);
  g.add(crate);
  const chute = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 8, 0, TAU, 0, Math.PI * 0.42), m.chute);
  canopy.scale.y = 0.6; canopy.position.y = 26; chute.add(canopy);
  for (let k = 0; k < 8; k += 2) { const p = new THREE.Mesh(new THREE.SphereGeometry(14.05, 4, 8, k * TAU / 8, TAU / 8, 0, Math.PI * 0.42), m.chute2); p.scale.y = 0.6; p.position.y = 26; chute.add(p); }
  const pts = [];
  for (let k = 0; k < 12; k++) { const a = k * TAU / 12; pts.push(new THREE.Vector3(Math.cos(a) * 13, 28.2 - 0.6 * 14 * Math.cos(Math.PI * 0.42) - 5.5, Math.sin(a) * 13), new THREE.Vector3(0, 4.6, 0)); }
  chute.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), m.line));
  g.add(chute);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData = { chute, crate };
  return g;
}

// --- sound that moves ------------------------------------------------------------------------------------------------------------
/** A looping sound whose position can be updated each frame (pan, distance, muffling). */
function loop3d(build) {
  return sounds.customLoop((c, out, t, K) => {
    const pan = c.createStereoPanner(), g = c.createGain(), lp = K.filt(c, 'lowpass', 18000);
    g.gain.value = 0; pan.connect(g); g.connect(lp); lp.connect(out);
    const h = build(c, pan, t, K) || {};
    return { ...h, pan, g, lp };
  }, 1);
}
function place3d(h, pos, o = {}) {
  if (!h || h.dead || !h.pan) return;
  const cam = O.world.camera, c = h.ctx;
  const dx = pos.x - cam.position.x, dy = pos.y - cam.position.y, dz = pos.z - cam.position.z, d = Math.hypot(dx, dy, dz);
  const yaw = Math.atan2(-dx, -dz) - (O.player?.yaw ?? 0);
  const ref = o.ref ?? 40, max = o.max ?? 2500;
  const v = (d < ref ? 1 : (ref / d) ** (o.roll ?? 0.8)) * Math.max(0, 1 - d / max) * (o.vol ?? 1) * (O.player?.indoors ? 0.6 : 1);
  h.pan.pan.setTargetAtTime(Math.max(-0.85, Math.min(0.85, -Math.sin(yaw) * Math.min(1, d / 30))), c.currentTime, 0.1);
  h.g.gain.setTargetAtTime(v, c.currentTime, 0.1);
  h.lp.frequency.setTargetAtTime(Math.max(500, 16000 - d * 9), c.currentTime, 0.2);
}
const ROTOR = (c, out, t, K) => {
  // the slap of the blades, the whine of the turbines
  const n = K.noise(c, 'brown', true); const f = K.filt(c, 'lowpass', 380); const am = c.createGain(); am.gain.value = 0.35;
  const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 12.5; const lg = c.createGain(); lg.gain.value = 0.32; lfo.connect(lg); lg.connect(am.gain);
  K.chain(n, f, am, out);
  const w = c.createOscillator(); w.frequency.value = 2650; const wg = c.createGain(); wg.gain.value = 0.012; w.connect(wg); wg.connect(out);
  const n2 = K.noise(c, 'pink', true); const f2 = K.filt(c, 'bandpass', 900, 0.8); const g2 = c.createGain(); g2.gain.value = 0.12; K.chain(n2, f2, g2, out);
  n.start(t); lfo.start(t); w.start(t); n2.start(t);
  return { lfo, w, stop: (tt) => { n.stop(tt); lfo.stop(tt); w.stop(tt); n2.stop(tt); } };
};
const DRONE = (c, out, t, K) => {
  const parts = [];
  for (const [f, v] of [[68, 0.22], [69.3, 0.2], [136, 0.08], [205, 0.04]]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const g = c.createGain(); g.gain.value = v; K.chain(o, K.filt(c, 'lowpass', 500), g, out); o.start(t); parts.push(o); }
  const n = K.noise(c, 'brown', true); const g = c.createGain(); g.gain.value = 0.4; K.chain(n, K.filt(c, 'lowpass', 300), g, out); n.start(t); parts.push(n);
  return { stop: (tt) => parts.forEach((p) => p.stop(tt)) };
};
const HISS = (c, out, t, K) => {
  const n = K.noise(c, 'white', true); const f = K.filt(c, 'bandpass', 3800, 0.9); const g = c.createGain(); g.gain.value = 0.5;
  const lfo = c.createOscillator(); lfo.frequency.value = 7; const lg = c.createGain(); lg.gain.value = 0.15; lfo.connect(lg); lg.connect(g.gain);
  K.chain(n, f, g, out); n.start(t); lfo.start(t);
  return { stop: (tt) => { n.stop(tt); lfo.stop(tt); } };
};
const FIRE = (c, out, t, K) => {
  const n = K.noise(c, 'brown', true); const f = K.filt(c, 'lowpass', 700); const g = c.createGain(); g.gain.value = 0.6;
  const n2 = K.noise(c, 'white', true); const f2 = K.filt(c, 'highpass', 4000); const g2 = c.createGain(); g2.gain.value = 0.05;
  const lfo = c.createOscillator(); lfo.frequency.value = 3.3; const lg = c.createGain(); lg.gain.value = 0.04; lfo.connect(lg); lg.connect(g2.gain);
  K.chain(n, f, g, out); K.chain(n2, f2, g2, out); n.start(t); n2.start(t); lfo.start(t);
  return { stop: (tt) => { n.stop(tt); n2.stop(tt); lfo.stop(tt); } };
};

// --- the events ------------------------------------------------------------------------------------------------------------------
let SEQ = 0;
export class Events {
  constructor(world) {
    this.world = world;
    this.sites = []; // heli wrecks: { x, y, z, yaw, group, boxes, spots, smoke, light, guards, sound }
    this.flights = []; // things in the air: { kind, group, ... }
    this.drops = []; // crates: { x, y, z, group, spot, smoke, t }
    this.flares = []; // { x, y, z, mesh, light, t, sound }
    this.booms = []; // explosion lights fading
    this.reset();
  }
  /** Quiet: every event loop stopped (paused, the title); they start again when the world goes on. */
  silence() {
    for (const o of [...this.flights, ...this.sites, ...this.flares]) if (o.sound && !o.sound.dead) { o.sound.stop(); o.sound = null; }
  }
  /** Give a model's geometry and own materials back to the graphics card. */
  _dispose(g) {
    const shared = new Set(Object.values(M));
    g.traverse((m) => { m.geometry?.dispose(); if (m.material && !shared.has(m.material)) m.material.dispose(); });
  }
  /** A new life: two wrecks somewhere out there already, the first live events a while off. */
  reset() {
    for (const s of this.sites.slice()) this._removeSite(s);
    for (const f of this.flights) { this.world.scene.remove(f.group); this._dispose(f.group); f.sound?.stop(); }
    for (const d of this.drops.slice()) this._removeDrop(d);
    for (const f of this.flares.slice()) this._removeFlare(f);
    this.flights = [];
    this.crashT = rnd(420, 900);
    this.dropT = rnd(900, 1500);
    this._initial = 2;
  }

  /** Somewhere a helicopter could have come down: open, level ground, away from towns and from p. */
  _findSpot(near, dmin, dmax, apart = true) {
    const T = O.terrain;
    for (let tries = 0; tries < 40; tries++) {
      let x, z;
      if (near) { const a = Math.random() * TAU, r = rnd(dmin, dmax); x = near.x + Math.cos(a) * r; z = near.z + Math.sin(a) * r; }
      else { x = rnd(-HALF + 400, HALF - 400); z = rnd(-HALF + 400, HALF - 600); }
      if (Math.abs(x) > HALF - 300 || Math.abs(z) > HALF - 300) continue;
      const y = T.heightAt(x, z);
      if (y < 6 || T.waterAt(x, z) > y - 2) continue;
      let ok = true;
      for (const [ox, oz] of [[24, 0], [-24, 0], [0, 24], [0, -24], [18, 18], [-18, -18]]) {
        const h = T.heightAt(x + ox, z + oz);
        if (Math.abs(h - y) > 5 || T.waterAt(x + ox, z + oz) > h - 1) { ok = false; break; }
      }
      if (!ok) continue;
      // in the open: not in a wood (the trees would stand through it)
      if ([[0, 0], [20, 0], [-20, 0], [0, 20], [0, -20]].some(([ox, oz]) => T.sample(T.forest, x + ox, z + oz) > 0.12)) continue;
      if (O.veg?.items && O.veg.items.some((t) => Math.abs(t.x - x) < 26 && Math.abs(t.z - z) < 26)) continue;
      if (PLACES.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 60)) continue;
      if (O.plan?.sites.some((s) => Math.hypot(s.x - x, s.z - z) < 70)) continue;
      if (this.sites.some((s) => Math.hypot(s.x - x, s.z - z) < (apart ? 500 : 60))) continue;
      if (this.drops.some((d) => Math.hypot(d.x - x, d.z - z) < 60)) continue;
      if (O.player && !near && Math.hypot(O.player.pos.x - x, O.player.pos.z - z) < 600) continue;
      // not on a road
      if (T.roadW && T.sample(T.roadW, x, z) > 0.2) continue;
      return { x, z, y };
    }
    return null;
  }

  // --- heli crash -------------------------------------------------------------------------------------------------------------------
  /** Lay a wreck at (x, z). */
  _wreck(x, z, yaw = Math.random() * TAU) {
    const T = O.terrain, y = T.heightAt(x, z);
    const g = heliModel(true);
    g.position.set(x, y - 0.2, z); g.rotation.y = yaw;
    // debris follows the ground
    g.updateMatrixWorld(true);
    for (const d of g.children) if (d.userData.debris) { const wp = d.getWorldPosition(new THREE.Vector3()); d.position.y += T.heightAt(wp.x, wp.z) - y + 0.15; }
    this.world.scene.add(g);
    const c = Math.cos(yaw), s = Math.sin(yaw), W = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const boxes = [];
    const add = (lx, lz, hx, hy, hz, by = 0, yo = 0) => { const [wx, wz] = W(lx, lz); boxes.push(O.phys.add(wx, y + hy + by, wz, hx, hy, hz, yaw + yo, 'metal')); };
    add(0, 0, 4.3, 4.6, 12.6, 0.4); // the cabin
    add(-3.5, -26, 2, 2, 10, 0, 0.55); // the boom
    // scorched ground
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mats().scorch);
    sc.rotation.x = -Math.PI / 2; sc.position.set(x, y + 0.08, z); sc.scale.set(46, 52, 1); sc.rotation.z = yaw; sc.receiveShadow = true;
    this.world.scene.add(sc);
    // it burns: fire at the engines, smoke you can see from far off
    const [fx, fz] = W(-1.5, 2);
    const smoke = O.fx.smoke(fx, y + 11, fz, { color: [0.16, 0.15, 0.14], rate: 4.5, size: 7 });
    const site = { id: ++SEQ, x, y, z, yaw, group: g, scorch: sc, boxes, smoke, light: null, fire: { x: fx, y: y + 10.5, z: fz }, spots: [], guards: [], guardT: 0, t: 0, sound: null };
    // the loot: in the cabin and spilled around it
    const key = 'heli' + Date.now().toString(36) + site.id;
    const places = [[3.2, 6, 1.5], [-2, -4, 1.2], [6.5, -3, 1.5], [-7, 8, 1.5], [4, 14, 1.5], [-5, -14, 1.5], [8, 8, 1.5]];
    places.forEach(([lx, lz, sp], i) => {
      const [wx, wz] = W(lx, lz);
      const gy = O.phys.groundAt(wx, y + 3, wz, 0.3, 4);
      const spot = { key: key + ':' + i, x: wx, y: gy, z: wz, cat: 'crash', spread: sp, n: i < 3 ? 2 : 1, event: true };
      O.loot.addSpot(spot); site.spots.push(spot);
    });
    this.sites.push(site);
    // no more than four out there; the oldest one you're not near goes
    if (this.sites.length > 4) {
      const P = O.player.pos;
      const old = this.sites.find((s) => Math.hypot(s.x - P.x, s.z - P.z) > 500);
      if (old) this._removeSite(old);
    }
    return site;
  }
  _removeSite(s) {
    this.world.scene.remove(s.group); this.world.scene.remove(s.scorch); O.fx.freeLight(s.light);
    this._dispose(s.group); s.scorch.geometry.dispose();
    for (const b of s.boxes) O.phys.remove(b);
    for (const sp of s.spots) O.loot.removeSpot(sp);
    const i = O.fx.smokes.indexOf(s.smoke); if (i >= 0) O.fx.smokes.splice(i, 1);
    for (const z of s.guards) if (!z.dead) O.zombies._remove(z);
    s.sound?.stop();
    this.sites.splice(this.sites.indexOf(s), 1);
  }
  /** A helicopter in trouble, coming in over you to crash at a spot 500-900 studs away. */
  startCrash() {
    const P = O.player.pos;
    const spot = this._findSpot(P, 550, 950);
    if (!spot) return false;
    // it comes from beyond you, passing to one side
    const toSite = new THREE.Vector3(spot.x - P.x, 0, spot.z - P.z).normalize();
    const side = new THREE.Vector3(-toSite.z, 0, toSite.x).multiplyScalar(rnd(-220, 220));
    const start = new THREE.Vector3(P.x - toSite.x * 1100 + side.x, 0, P.z - toSite.z * 1100 + side.z);
    start.y = Math.max(O.terrain.heightAt(start.x, start.z), O.terrain.heightAt(P.x, P.z)) + 170;
    const end = new THREE.Vector3(spot.x, spot.y, spot.z);
    const g = heliModel(false);
    this.world.scene.add(g);
    const len = start.distanceTo(end);
    const f = { kind: 'heli', group: g, start, end, t: 0, dur: len / 105, spin: 0, spot, sound: loop3d(ROTOR), smokeT: 0 };
    this.flights.push(f);
    return true;
  }
  _fly(f, dt) {
    f.t += dt;
    const k = Math.min(1, f.t / f.dur);
    const g = f.group, p = g.position, ud = g.userData;
    // level until three quarters of the way, then losing it: a spin and a dive
    const fall = Math.max(0, (k - 0.7) / 0.3);
    p.lerpVectors(f.start, f.end, k);
    const ground = O.terrain.heightAt(p.x, p.z);
    const alt = f.start.y + (f.end.y - f.start.y) * (k * 0.25 + fall * fall * 0.75);
    p.y = Math.max(ground + 1, alt + Math.sin(f.t * 1.3) * 3 * (1 - fall));
    f.spin += dt * fall * fall * 4.5;
    const head = Math.atan2(f.end.x - f.start.x, f.end.z - f.start.z);
    g.rotation.set(0.12 + fall * 0.25, head + f.spin, Math.sin(f.t * 0.9) * 0.08 + fall * 0.3, 'YXZ');
    ud.rotor.rotation.y += dt * 24; ud.tailRotor.rotation.x += dt * (fall > 0.2 ? 6 : 40);
    // smoke streaming from the engine, thicker as it goes
    f.smokeT -= dt;
    if (f.smokeT <= 0) {
      f.smokeT = 0.05;
      const e = new THREE.Vector3(-3, 10.4, -3.6).applyMatrix4(g.matrixWorld);
      O.fx.burst(e.x, e.y, e.z, 1, { color: [0.12, 0.12, 0.11], speed: 1, life: 6 + fall * 6, size: 3 + fall * 2, grow: 2.2, grav: -0.8, drag: 0.5, alpha: 0.6 });
      if (fall > 0.3 && Math.random() < 0.5) O.fx.burst(e.x, e.y, e.z, 1, { color: [1, 0.55, 0.2], speed: 2, life: 0.4, size: 1.6, grow: 1, grav: -2, alpha: 0.9 });
    }
    if (!f.sound || f.sound.dead) f.sound = loop3d(ROTOR);
    place3d(f.sound, p, { ref: 60, max: 3200, roll: 0.75 });
    if (f.sound?.lfo) f.sound.lfo.frequency.setTargetAtTime(12.5 - fall * 3, f.sound.ctx.currentTime, 0.2);
    if (k >= 1 || p.y <= ground + 1.5 && k > 0.8) { this._impact(f); return false; }
    return true;
  }
  _impact(f) {
    this.world.scene.remove(f.group); this._dispose(f.group); f.sound?.stop();
    const { x, z } = f.spot, y = O.terrain.heightAt(x, z);
    const site = this._wreck(x, z, f.group.rotation.y);
    this.explode(x, y + 5, z, 1.4);
    site.burnT = 0;
    O.hud?.note('A helicopter went down. Look for the smoke.', 5);
  }
  /** A fireball: light, flame, smoke, a boom that rolls over the hills, everything nearby hears it. */
  explode(x, y, z, size = 1) {
    O.fx.burst(x, y, z, 40, { color: [1, 0.6, 0.22], speed: 22 * size, up: 1.2, life: 0.9, size: 3 * size, grow: 6, grav: -3, drag: 2.5, alpha: 1 });
    O.fx.burst(x, y, z, 30, { color: [0.18, 0.17, 0.16], speed: 14 * size, up: 1.5, life: 5, size: 5 * size, grow: 4, grav: -2, drag: 1.2, alpha: 0.8 });
    O.fx.burst(x, y, z, 26, { color: [0.3, 0.28, 0.25], speed: 30 * size, up: 2, life: 2.2, size: 0.6, grow: 0, grav: 30, drag: 0.3, alpha: 1 });
    const L = O.fx.getLight('boom', 0xffa050, 260, 1.4);
    if (L) { L.position.set(x, y + 4, z); this.booms.push({ L, k: 1, size }); }
    const cam = O.world.camera.position, d = Math.hypot(x - cam.x, z - cam.z);
    if (d < 1500 && O.phys.sees(cam.x, cam.y, cam.z, x, y + 10, z, { terrain: true })) O.post.hit(Math.max(0.05, 0.5 - d / 3000), 0xffc890);
    if (d < 160 && O.player) O.player.shake = Math.max(O.player.shake || 0, 1.2 - d / 160);
    O.audio?.explosion({ x, y, z }, size);
    O.zombies?.hear(x, y, z, 380, null);
    // the dead nearby are thrown about
    for (const r of O.ragdolls?.list || []) {
      const c = r.center, dx = c.x - x, dz = c.z - z, d = Math.hypot(dx, dz);
      if (d < 45) r.push({ x: dx / (d || 1), y: 0.5, z: dz / (d || 1) }, 16 * (1 - d / 45), 'torso');
    }
    O.bandits?.hear(x, y, z, 500, { pos: new THREE.Vector3(x, y, z) });
  }
  _site(s, dt) {
    s.t += dt;
    const P = O.player.pos, d = Math.hypot(s.x - P.x, s.z - P.z);
    // the fire: flickering light and flames while it burns (twenty minutes, then just smoulders)
    const burning = s.t < 1200;
    if (d < 900 && burning) {
      if (!s.light) { s.light = O.fx.getLight(s, 0xff7a30, 70, 1.5); s.light?.position.set(s.fire.x, s.fire.y + 1.5, s.fire.z); }
      if (s.light) s.light.intensity = 45 + Math.sin(s.t * 13) * 9 + Math.sin(s.t * 31) * 7 + Math.random() * 6;
      if (burning && d < 400) {
        s.flameT = (s.flameT || 0) - dt;
        if (s.flameT <= 0) {
          s.flameT = 0.04;
          const f = s.fire;
          O.fx.burst(f.x + rnd(-2.5, 2.5), f.y + rnd(-1, 1), f.z + rnd(-2.5, 2.5), 1, { color: [1, rnd(0.45, 0.65), 0.18], speed: 3, dir: { x: 0, y: 1, z: 0 }, spread: 0.4, life: 0.7, size: rnd(1.2, 2.2), grow: -0.8, grav: -6, drag: 1, alpha: 0.95 });
        }
      }
    } else if (s.light) { O.fx.freeLight(s.light); s.light = null; }
    if (!burning && s.smoke.rate > 1.5) { s.smoke.rate = 1.5; s.smoke.color = [0.3, 0.29, 0.28]; }
    // the crackle of it
    if (burning && d < 120) { if (!s.sound || s.sound.dead) s.sound = loop3d(FIRE); place3d(s.sound, { x: s.fire.x, y: s.fire.y, z: s.fire.z }, { ref: 10, max: 120, roll: 1.1, vol: 0.7 }); }
    else if (s.sound) { s.sound.stop(); s.sound = null; }
    // the crew, still walking around it
    s.guardT -= dt;
    if (d < 230 && s.guardT <= 0 && !s.guards.length) {
      s.guardT = 900;
      const soldier = ZOMBIE_OUTFITS().filter((o) => zombieKind(o) === 'soldier');
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, r = rnd(10, 30), x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
        const zb = O.zombies.add(x, O.phys.groundAt(x, O.terrain.heightAt(x, z) + 3, z, 0.6, 6), z, soldier[Math.floor(Math.random() * soldier.length)]);
        if (zb) { zb.home = { x: s.x, z: s.z }; s.guards.push(zb); }
      }
    }
    if (d > 420) s.guards = s.guards.filter((z) => !z.dead && O.zombies.list.includes(z));
    if (s.guards.length && s.guards.every((z) => z.dead || !O.zombies.list.includes(z))) s.guards = [];
  }

  // --- supply drop --------------------------------------------------------------------------------------------------------------------
  startDrop() {
    const P = O.player.pos;
    const spot = this._findSpot(P, 260, 520, false);
    if (!spot) return false;
    const dir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    const alt = Math.max(spot.y, O.terrain.heightAt(P.x, P.z)) + 300;
    const start = new THREE.Vector3(spot.x - dir.x * 2600, alt, spot.z - dir.z * 2600), end = new THREE.Vector3(spot.x + dir.x * 2600, alt, spot.z + dir.z * 2600);
    const g = planeModel(); g.position.copy(start); g.rotation.y = Math.atan2(dir.x, dir.z);
    this.world.scene.add(g);
    this.flights.push({ kind: 'plane', group: g, start, end, t: 0, dur: 5200 / 190, spot, dropped: false, sound: loop3d(DRONE) });
    return true;
  }
  _planeFly(f, dt) {
    f.t += dt;
    const k = Math.min(1, f.t / f.dur);
    f.group.position.lerpVectors(f.start, f.end, k);
    if (!f.dropped && k >= 0.5) { f.dropped = true; this._release(f.spot, f.group.position.y - 12); }
    if (!f.sound || f.sound.dead) f.sound = loop3d(DRONE);
    place3d(f.sound, f.group.position, { ref: 120, max: 4200, roll: 0.6, vol: 1.2 });
    if (k >= 1) { this.world.scene.remove(f.group); this._dispose(f.group); f.sound?.stop(); return false; }
    return true;
  }
  _release(spot, y) {
    const g = crateModel();
    const fall = (y - spot.y) / 9; // seconds in the air
    g.position.set(spot.x, y, spot.z - (O.sky.w.wind || 0.3) * 3 * fall);
    this.world.scene.add(g);
    this.drops.push({ x: spot.x, z: spot.z, y, ground: spot.y, group: g, vy: -9, landed: false, t: 0 });
  }
  _drop(d, dt) {
    d.t += dt;
    const g = d.group, ud = g.userData;
    if (!d.landed) {
      // drifting down, swinging a little
      g.position.y += d.vy * dt;
      g.position.x += Math.sin(d.t * 0.3) * dt * 2.5; g.position.z += (O.sky.w.wind || 0.3) * dt * 3;
      g.rotation.z = Math.sin(d.t * 0.9) * 0.08; g.rotation.x = Math.cos(d.t * 0.7) * 0.06; g.rotation.y += dt * 0.15;
      const gy = O.phys.groundAt(g.position.x, g.position.y + 2, g.position.z, 2, 6);
      if (g.position.y <= gy) {
        d.landed = true; d.landT = 0;
        g.position.y = gy; g.rotation.x = g.rotation.z = 0;
        d.x = g.position.x; d.z = g.position.z; d.y = gy;
        O.audio?.land(30, { x: d.x, y: gy, z: d.z });
        O.fx.burst(d.x, gy + 0.5, d.z, 18, { color: [0.45, 0.4, 0.32], speed: 8, up: 0.4, life: 1.4, size: 1.6, grow: 2, grav: 2 });
        // the crate: solid, its smoke red, its contents beside it
        d.box = O.phys.add(d.x, gy + 2.2, d.z, 3, 2.2, 2.1, g.rotation.y, 'wood');
        d.smoke = O.fx.smoke(d.x, gy + 4.6, d.z, { color: [0.75, 0.16, 0.12], rate: 5, size: 2.6, life: 420 });
        const c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y);
        d.spots = [];
        for (const [lx, lz] of [[0, 4.2], [0, -4.2], [5, 0]]) {
          const x = d.x + lx * c + lz * s, z = d.z - lx * s + lz * c;
          const spot = { key: 'drop' + Date.now().toString(36) + ':' + d.spots.length, x, y: O.phys.groundAt(x, gy + 3, z, 0.3, 4), z, cat: 'supply', spread: 1.4, n: 2, event: true };
          O.loot.addSpot(spot); d.spots.push(spot);
        }
        O.zombies?.hear(d.x, gy, d.z, 260, null);
        O.bandits?.hear(d.x, gy, d.z, 600, { pos: new THREE.Vector3(d.x, gy, d.z) });
      }
    } else {
      // the chute settles over to one side
      d.landT += dt;
      const k = Math.min(1, d.landT / 3);
      // collapsed: the canopy sinks down beside the crate and lies flat on the ground
      ud.chute.position.set(k * 13, -k * 2.7, 0); ud.chute.scale.set(1, 1 - k * 0.89, 1);
      ud.chute.children.forEach((c) => { if (c.isLineSegments) c.visible = k < 0.4; });
    }
    // gone after an hour, if you're not near
    const P = O.player.pos;
    if (d.t > 3600 && Math.hypot(d.x - P.x, d.z - P.z) > 600) { this._removeDrop(d); return false; }
    return true;
  }
  _removeDrop(d) {
    this.world.scene.remove(d.group); this._dispose(d.group);
    if (d.box) O.phys.remove(d.box);
    for (const sp of d.spots || []) O.loot.removeSpot(sp);
    const i = O.fx.smokes.indexOf(d.smoke); if (i >= 0) O.fx.smokes.splice(i, 1);
    const j = this.drops.indexOf(d); if (j >= 0) this.drops.splice(j, 1);
  }

  // --- road flares -------------------------------------------------------------------------------------------------------------------
  /** Light a flare and toss it down in front of p. */
  flare(p) {
    const P = O.player, f = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    let x = p.x + f.x * 4, z = p.z + f.z * 4;
    // not through a wall
    const h = O.phys.ray(p.x, p.y + 2, p.z, f.x, 0, f.z, 4.5, { terrain: false });
    if (h) { x = p.x + f.x * Math.max(0.5, h.d - 0.8); z = p.z + f.z * Math.max(0.5, h.d - 0.8); }
    const y = O.phys.groundAt(x, p.y + 3, z, 0.2, 5);
    const m = mats();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.5, 8), m.flare.clone());
    mesh.rotation.z = Math.PI / 2; mesh.rotation.y = Math.random() * TAU; mesh.position.set(x, y + 0.16, z);
    mesh.material.emissiveIntensity = 2;
    this.world.scene.add(mesh);
    const light = O.fx.getLight('flare', 0xff3018, 70, 1.6); light?.position.set(x, y + 1.2, z);
    const smoke = O.fx.smoke(x, y + 0.5, z, { color: [0.6, 0.3, 0.28], rate: 3, size: 1.2, life: 160 });
    this.flares.push({ x, y, z, mesh, light, smoke, t: 0, life: 160, hearT: 0, sound: null });
    O.hud?.note('The flare will draw the infected', 2.5);
  }
  _flare(f, dt) {
    f.t += dt;
    const left = f.life - f.t;
    const k = left < 10 ? Math.max(0, left / 10) : 1;
    if (f.light) f.light.intensity = (34 + Math.sin(f.t * 23) * 8 + Math.random() * 10) * k;
    f.mesh.material.emissiveIntensity = 2 * k;
    if (Math.random() < 0.6 * k) O.fx.burst(f.x, f.y + 0.3, f.z, 1, { color: [1, 0.35, 0.2], speed: 3, up: 1.5, life: 0.35, size: 0.18, grow: 0, grav: 12, alpha: 1 });
    f.hearT -= dt;
    if (f.hearT <= 0 && k > 0) { f.hearT = 2.5; O.zombies?.hear(f.x, f.y, f.z, 170, f); }
    const cam = O.world.camera.position, d = Math.hypot(f.x - cam.x, f.z - cam.z);
    if (d < 60 && k > 0) { if (!f.sound || f.sound.dead) f.sound = loop3d(HISS); place3d(f.sound, f, { ref: 4, max: 60, roll: 1.2, vol: 0.4 * k }); }
    else if (f.sound) { f.sound.stop(); f.sound = null; }
    if (left <= 0) { this._removeFlare(f); return false; }
    return true;
  }
  _removeFlare(f) {
    this.world.scene.remove(f.mesh); f.mesh.geometry.dispose(); f.mesh.material.dispose(); O.fx.freeLight(f.light); f.sound?.stop();
    const i = O.fx.smokes.indexOf(f.smoke); if (i >= 0) O.fx.smokes.splice(i, 1);
    const j = this.flares.indexOf(f); if (j >= 0) this.flares.splice(j, 1);
  }

  update(dt) {
    const P = O.player;
    if (!P) return;
    // the wrecks that were already there
    if (this._initial > 0) { this._initial--; const s = this._findSpot(null); if (s) this._wreck(s.x, s.z); }
    if (P.alive) {
      this.crashT -= dt; this.dropT -= dt;
      if (this.crashT <= 0) { this.crashT = this.startCrash() ? rnd(1800, 3000) : 60; }
      if (this.dropT <= 0) { this.dropT = this.startDrop() ? rnd(2000, 3200) : 60; }
    }
    this.flights = this.flights.filter((f) => (f.kind === 'heli' ? this._fly(f, dt) : this._planeFly(f, dt)));
    for (const s of this.sites.slice()) this._site(s, dt);
    for (const d of this.drops.slice()) this._drop(d, dt);
    for (const f of this.flares.slice()) this._flare(f, dt);
    for (const b of this.booms.slice()) { b.k *= Math.exp(-dt * 9); b.L.intensity = 400 * b.size * b.k; if (b.k < 0.02) { O.fx.freeLight(b.L); this.booms.splice(this.booms.indexOf(b), 1); } }
  }
}
