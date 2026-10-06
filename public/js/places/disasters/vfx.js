// Shared effects for the big disasters (Gojo vs Sukuna, Total Chaos): glowing
// blades and streaks, flashes, shockwave rings, jagged bolts and energy orbs,
// all from a few shared meshes and materials (made at the start of a disaster
// with resources(), freed at the end); plus helpers for knocking people
// around and breaking buildings. A disaster's state S holds them:
//   S.R (resources), S.layer (a Group in the scene), S.fx (running effects), S.D.
import * as THREE from 'three';
import { tex } from './effects.js';
import { GROUP } from '../../engine/Part.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let BT = null;
export function baseTex() {
  if (BT) return BT;
  BT = {};
  // a blade of light: a bright core and a soft glow, tapered at both ends
  BT.slash = canvasTex(256, 64, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.34, 'rgba(255,255,255,0.3)'); g.addColorStop(0.47, 'rgba(255,255,255,1)');
    g.addColorStop(0.53, 'rgba(255,255,255,1)'); g.addColorStop(0.66, 'rgba(255,255,255,0.3)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'destination-in';
    const m = x.createLinearGradient(0, 0, w, 0);
    m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(0.22, 'rgba(0,0,0,1)'); m.addColorStop(0.7, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = m; x.fillRect(0, 0, w, h);
  });
  BT.ring = canvasTex(128, 128, (x, w) => {
    const g = x.createRadialGradient(w / 2, w / 2, w * 0.2, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.12)'); g.addColorStop(0.9, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, w);
  });
  return BT;
}

export function resources() {
  const T = baseTex();
  const glow = (o) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, ...o });
  const sprite = (color, opacity = 1) => new THREE.SpriteMaterial({ map: tex().soft, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity });
  return {
    plane: new THREE.PlaneGeometry(1, 1),
    sphere: new THREE.SphereGeometry(1, 32, 20),
    ring: new THREE.RingGeometry(0.75, 1, 64).rotateX(-Math.PI / 2),
    torus: new THREE.TorusGeometry(1, 0.05, 6, 64),
    tube: new THREE.CylinderGeometry(1, 1, 1, 18, 1, true),
    seg: new THREE.CylinderGeometry(1, 1, 1, 5, 1, true),
    mats: {
      slashW: glow({ map: T.slash, color: 0xffffff }), slashR: glow({ map: T.slash, color: 0xff2a14 }), slashB: glow({ map: T.slash, color: 0x5ab0ff }),
      streakB: glow({ map: T.slash, color: 0x8fd0ff, opacity: 0.85 }), streakR: glow({ map: T.slash, color: 0xff3a24, opacity: 0.85 }), streakP: glow({ map: T.slash, color: 0xc070ff, opacity: 0.9 }),
      boltCore: new THREE.MeshBasicMaterial({ color: 0x060006, fog: false }), boltRed: glow({ color: 0xff1a10, opacity: 0.7 }), boltPurple: glow({ color: 0xd8a0ff, opacity: 0.9 }),
      flashW: sprite(0xffffff), flashB: sprite(0x6ab8ff), flashR: sprite(0xff3a20), flashP: sprite(0xb060ff), flashO: sprite(0xffa040),
      auraB: sprite(0x9ad0ff, 0.28), auraR: sprite(0xff3020, 0.3),
    },
  };
}

export function groundAt(D, x, z) {
  const hit = D.world.raycast(V(x, 160, z), V(x, -30, z), { mask: GROUP.WORLD });
  return Math.max(hit ? hit.point.y : 0, D.water.level);
}

/** How close the camera is to something (1 near, 0 far): for shaking and loudness. */
export function near(D, p, r = 160) { return clamp(1 - D.world.camera.position.distanceTo(p) / r, 0, 1); }

export function knock(D, ch, from, power, up = 30) {
  const d = ch.rootPosition.clone().sub(from).setY(0);
  if (d.lengthSq() < 0.01) d.set(rnd(-1, 1), 0, rnd(-1, 1));
  d.normalize();
  ch.platformStand = true; ch.inTornado = D.world.time;
  ch.body.velocity.set(d.x * power, up, d.z * power);
}

export function blastPeople(D, at, r, dmg, cause, power = 50) {
  for (const ch of D.chars()) {
    const d = ch.rootPosition.distanceTo(at);
    if (d > r) continue;
    D.hurt(ch, dmg * (1 - d / r) + 4, cause);
    if (ch.alive) knock(D, ch, at, power * (1 - d / r) + 12, 22 + power * 0.3 * (1 - d / r));
  }
}

export function wreck(D, at, r, speed, chance = 1) {
  for (const p of D.st.near(at, r)) {
    if (Math.random() > chance) continue;
    const dir = p.mesh.position.clone().sub(at); const l = dir.length() || 1;
    D.collapse(p, dir.multiplyScalar(speed / l).add(V(rnd(-5, 5), speed * 0.3, rnd(-5, 5))), 2);
  }
}

export function chat(D, lines, n = 1) {
  const bots = D.chars().map((c) => c.player).filter((p) => p?.brain);
  for (let i = 0; i < n && bots.length; i++) { const p = bots.splice(Math.floor(Math.random() * bots.length), 1)[0]; D.world.delay(rnd(0.2, 1.4), () => p.brain?.say(pick(lines))); }
}

export function light(D, pos, color, intensity, dist, t = 0.12) {
  const L = D.fx.lights[1];
  L.l.color.set(color); L.l.position.copy(pos); L.l.intensity = intensity; L.l.distance = dist; L.t = t;
}

/** Run step(k 0..1, dt) for `life` seconds, then end(). */
export function timed(S, life, step, end) {
  const e = { t: 0, update(dt) { e.t += dt; if (e.t >= life) { end?.(); return false; } step(e.t / life, dt); return true; } };
  step(0, 0);
  S.fx.push(e);
  return e;
}

export function basis(X, nrm) {
  let Z = nrm.clone().addScaledVector(X, -nrm.dot(X));
  if (Z.lengthSq() < 1e-5) Z = Math.abs(X.y) < 0.9 ? V(0, 1, 0).addScaledVector(X, -X.y) : V(1, 0, 0).addScaledVector(X, -X.x);
  Z.normalize();
  const Y = Z.clone().cross(X);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
}

/** A glowing blade from a to b, lying flat in the plane with normal nrm. */
export function slash(S, a, b, nrm, width = 1, life = 0.22, color = 'slashR') {
  const X = b.clone().sub(a); const len = X.length(); if (len < 0.01) return; X.normalize();
  const q = basis(X, nrm), mid = a.clone().add(b).multiplyScalar(0.5);
  const glow = new THREE.Mesh(S.R.plane, S.R.mats[color]), core = new THREE.Mesh(S.R.plane, S.R.mats.slashW);
  for (const m of [glow, core]) { m.position.copy(mid); m.quaternion.copy(q); S.layer.add(m); }
  timed(S, life, (k) => { const w = width * (1 - k * k); glow.scale.set(len * (1 + 0.15 * k), w * 3.2, 1); core.scale.set(len, w * 0.9, 1); }, () => S.layer.remove(glow, core));
}

/** A streak of light from a to b, turned to face the camera. */
export function streak(S, a, b, color, width = 1.4, life = 0.28) {
  const X = b.clone().sub(a); const len = X.length(); if (len < 0.01) return; X.normalize();
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const m = new THREE.Mesh(S.R.plane, S.R.mats[color]);
  m.position.copy(mid); m.quaternion.copy(basis(X, S.D.world.camera.position.clone().sub(mid).normalize()));
  S.layer.add(m);
  timed(S, life, (k) => m.scale.set(len * 1.25, width * (1 - k), 1), () => S.layer.remove(m));
}

/** A quick flash of light. */
export function popAt(S, pos, color, size, life = 0.22) {
  const s = new THREE.Sprite(S.R.mats[color]); s.position.copy(pos); S.layer.add(s);
  timed(S, life, (k) => s.scale.setScalar(size * (0.4 + 0.6 * Math.sqrt(k)) * (1 - k * 0.6)), () => S.layer.remove(s));
}

/** A shockwave ring. */
export function ring(S, pos, nrm, color, r, life = 0.4) {
  const mat = new THREE.MeshBasicMaterial({ map: baseTex().ring, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const m = new THREE.Mesh(S.R.ring, mat); m.position.copy(pos); m.quaternion.setFromUnitVectors(UP, nrm.clone().normalize()); S.layer.add(m);
  timed(S, life, (k) => { m.scale.setScalar(r * (0.15 + 0.85 * Math.sqrt(k))); mat.opacity = 1 - k; }, () => { S.layer.remove(m); mat.dispose(); });
}

/** A jagged bolt: Black Flash (black with a red glow) or Purple's crackle. */
export function bolt(S, a, b, kind = 'black', life = 0.3) {
  const g = new THREE.Group(); S.layer.add(g);
  const glowMat = S.R.mats[kind === 'black' ? 'boltRed' : 'boltPurple'];
  let prev = a.clone(); const n = 6, len = a.distanceTo(b);
  for (let i = 1; i <= n; i++) {
    const p = a.clone().lerp(b, i / n);
    if (i < n) p.add(V(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(len / n * 0.7));
    const l = prev.distanceTo(p), mid = prev.clone().add(p).multiplyScalar(0.5), q = new THREE.Quaternion().setFromUnitVectors(UP, p.clone().sub(prev).normalize());
    for (const [mat, r] of [[kind === 'black' ? S.R.mats.boltCore : S.R.mats.boltPurple, 0.16], [glowMat, 0.55]]) { const c = new THREE.Mesh(S.R.seg, mat); c.position.copy(mid); c.quaternion.copy(q); c.scale.set(r, l, r); g.add(c); }
    prev = p;
  }
  timed(S, life, (k) => { g.visible = k < 0.3 || (k > 0.45 && k < 0.7) || k > 0.85; }, () => S.layer.remove(g));
}

/** An orb of cursed energy (Blue, Red, Purple): returns {group, set(r)}. */
export function orb(S, color, coreColor = 0xffffff) {
  const g = new THREE.Group(); S.layer.add(g);
  const shellMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const coreMat = new THREE.MeshBasicMaterial({ color: coreColor, fog: false });
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const glowMat = new THREE.SpriteMaterial({ map: tex().soft, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
  const shell = new THREE.Mesh(S.R.sphere, shellMat), core = new THREE.Mesh(S.R.sphere, coreMat), glow = new THREE.Sprite(glowMat);
  const r1 = new THREE.Mesh(S.R.torus, ringMat), r2 = new THREE.Mesh(S.R.torus, ringMat);
  g.add(shell, core, glow, r1, r2);
  const o = {
    group: g, r: 0, shellMat, glowMat,
    set(r) { o.r = r; shell.scale.setScalar(r); core.scale.setScalar(r * 0.55); glow.scale.setScalar(r * 5); r1.scale.setScalar(r * 1.5); r2.scale.setScalar(r * 1.8); g.visible = r > 0.01; },
    spin(dt) { r1.rotation.x += dt * 4; r1.rotation.y += dt * 3; r2.rotation.z += dt * 5; r2.rotation.x -= dt * 2; shellMat.opacity = 0.65 + Math.random() * 0.2; },
    dispose() { S.layer.remove(g); shellMat.dispose(); coreMat.dispose(); ringMat.dispose(); glowMat.dispose(); },
  };
  o.set(0);
  return o;
}
