// =============================================================================
// Small animated airport props: windsocks (state.windDir / windSpeed), the
// rotating surveillance radar antenna, apron floodlight spot lights that follow
// our aircraft (so vehicles / aircraft near us are lit at night).
// =============================================================================
import * as THREE from 'three';
import { AIRCRAFT } from '../../core/constants.js';
import { clamp01 } from './util.js';

const KT = 0.514444;

function sockGeometry() {
  // open frustum along +x, 5 alternating orange / white bands (vertex colours)
  const L = 3.6, r0 = 0.45, r1 = 0.17, seg = 14, bands = 5;
  const P = [], C = [], N = [], I = [];
  const orange = new THREE.Color(0.85, 0.2, 0.03), white = new THREE.Color(0.85, 0.85, 0.82);
  for (let b = 0; b <= bands * 2; b++) {
    const t = b / (bands * 2);
    const x = t * L, r = r0 + (r1 - r0) * t;
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      P.push(x, Math.cos(a) * r, Math.sin(a) * r);
      N.push(0.08, Math.cos(a), Math.sin(a));
      const band = Math.min(bands - 1, Math.floor(t * bands - 1e-6));
      const c = (b === bands * 2 ? band : Math.floor(b / 2)) % 2 === 0 ? orange : white;
      C.push(c.r, c.g, c.b);
    }
  }
  for (let b = 0; b < bands * 2; b++) for (let k = 0; k < seg; k++) {
    const a = b * (seg + 1) + k, d = a + seg + 1;
    I.push(a, d, a + 1, a + 1, d, d + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I);
  return g;
}

export class Windsocks {
  constructor(list) {
    this.group = new THREE.Group();
    this.group.name = 'windsocks';
    const geo = sockGeometry();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    const ringGeo = new THREE.TorusGeometry(0.45, 0.025, 6, 16).rotateY(Math.PI / 2);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xb0b0b0, metalness: 0.6, roughness: 0.4 });
    this.items = list.map((p, i) => {
      const pivot = new THREE.Group();
      pivot.position.set(p.x, p.y, p.z);
      const tilt = new THREE.Group();
      pivot.add(tilt);
      const sock = new THREE.Mesh(geo, m); sock.castShadow = true;
      sock.position.x = 0.1;
      const ring = new THREE.Mesh(ringGeo, ringMat); ring.position.x = 0.1;
      tilt.add(sock, ring);
      this.group.add(pivot);
      return { pivot, tilt, sock, ph: i * 1.7, yaw: 0, droop: 1.1 };
    });
  }
  update(dt, t, windDir, windSpeed) {
    const ws = Number.isFinite(windSpeed) ? windSpeed : 5;
    const f = clamp01(ws / (15 * KT));
    const targetDroop = (1 - f) * 1.25 + 0.04;
    const h = ((Number.isFinite(windDir) ? windDir : 250) + 180) * Math.PI / 180;
    const yawT = Math.atan2(Math.cos(h), Math.sin(h));
    for (const it of this.items) {
      const gust = Math.sin(t * 0.7 + it.ph) * 0.5 + Math.sin(t * 1.9 + it.ph * 2.1) * 0.3;
      let dy = yawT + gust * 0.12 * (0.3 + f) - it.yaw;
      while (dy > Math.PI) dy -= 2 * Math.PI;
      while (dy < -Math.PI) dy += 2 * Math.PI;
      it.yaw += dy * Math.min(1, dt * 1.5);
      it.droop += (targetDroop - gust * 0.08 * f - it.droop) * Math.min(1, dt * 1.2);
      it.pivot.rotation.y = it.yaw;
      it.tilt.rotation.z = -it.droop;
      it.sock.scale.set(1, 0.92 + 0.08 * f + 0.03 * Math.sin(t * 6 + it.ph), 1);
    }
  }
}

export class Radar {
  constructor(d, material) {
    this.mesh = new THREE.Mesh(d.geo, material);
    this.mesh.position.set(d.x, d.y, d.z);
    this.mesh.castShadow = true;
    this.speed = d.speed;
  }
  update(dt) { this.mesh.rotation.y -= this.speed * dt; }
}

/**
 * Two real spot lights on the floodlight masts nearest to our aircraft. The
 * analytic floodlight pools of those masts are switched off in the pavement
 * shader (no double lighting).
 */
export class FloodRig {
  constructor(airport) {
    this.airport = airport;
    this.lights = [];
    this.group = new THREE.Group();
    this.group.name = 'flood-rig';
    for (let i = 0; i < 2; i++) {
      const s = new THREE.SpotLight(0xffd7a8, 0, 160, 1.05, 0.65, 2);
      s.castShadow = false;
      this.group.add(s, s.target);
      this.lights.push({ light: s, mast: -1 });
    }
  }
  update(night, aircraftLocal, floods, masts, baseI) {
    // nearest two masts
    let best = [-1, -1], bd = [Infinity, Infinity];
    if (aircraftLocal) {
      masts.forEach((m, i) => {
        const d = Math.hypot(m.x - aircraftLocal.x, m.z - aircraftLocal.z);
        if (d < bd[0]) { bd[1] = bd[0]; best[1] = best[0]; bd[0] = d; best[0] = i; } else if (d < bd[1]) { bd[1] = d; best[1] = i; }
      });
    }
    for (let i = 0; i < masts.length; i++) floods[i].w = baseI;
    for (let k = 0; k < 2; k++) {
      const L = this.lights[k], i = best[k];
      const on = i >= 0 && bd[k] < 220;
      L.light.intensity = on ? baseI * night : 0;
      if (on) {
        const m = masts[i];
        L.light.position.set(m.x, m.h - 0.5, m.z);
        L.light.target.position.set(m.x + (aircraftLocal.x - m.x) * 0.4, 0, m.z + (aircraftLocal.z - m.z) * 0.4 + (m.z < -440 ? 22 : -22));
        L.light.target.updateMatrixWorld();
        floods[i].w = 0;
      }
    }
  }
}

export { AIRCRAFT };
