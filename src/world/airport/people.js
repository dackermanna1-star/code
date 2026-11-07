// =============================================================================
// Ramp crew: low-poly people (hi-vis vests with reflective bands, ear
// defenders) rendered as a handful of InstancedMeshes (torso, head, legs, arms,
// marshalling wands) for all people of an airport.  Simple procedural poses:
// idle, walk cycle, work (handling bags), marshal ('come ahead' / 'stop'),
// wing walker (wand raised).
// =============================================================================
import * as THREE from 'three';
import { GeoBuilder, PRIM, mat, mulberry } from './util.js';

const VESTS = [0xe8f02a, 0xff7c14, 0xe8f02a, 0xd9ec2c];
const TROUSERS = [0x1d2533, 0x2b2d31, 0x22324a, 0x3a3a36];
const SKINS = [0xc58c6a, 0x8d5a3c, 0xe0b090, 0x5c3a28, 0xb07850];

function partGeometries() {
  const torso = new GeoBuilder();
  torso.add(PRIM.cyl12, mat(0, 1.2, 0, 0, 0, 0, 0.42, 0.56, 0.26), 0xffffff);         // vest
  torso.add(PRIM.cyl12, mat(0, 1.08, 0, 0, 0, 0, 0.44, 0.05, 0.28), 0xb8b8b8);        // reflective bands
  torso.add(PRIM.cyl12, mat(0, 1.26, 0, 0, 0, 0, 0.44, 0.05, 0.28), 0xb8b8b8);
  torso.add(PRIM.cyl12, mat(0, 0.96, 0, 0, 0, 0, 0.38, 0.14, 0.24), 0x2a2d33);        // belt / hips
  torso.add(PRIM.cyl8, mat(0, 1.51, 0, 0, 0, 0, 0.12, 0.08, 0.12), 0x9a7058);         // neck
  const head = new GeoBuilder();
  head.add(PRIM.sphere, mat(0, 1.64, 0, 0, 0, 0, 0.2, 0.24, 0.22), 0xffffff);
  for (const s of [-1, 1]) head.add(PRIM.cyl8, mat(s * 0.115, 1.64, 0, 0, 0, Math.PI / 2, 0.11, 0.06, 0.11), 0x1c1c1c);
  head.add(PRIM.box, mat(0, 1.77, 0, 0, 0, 0, 0.24, 0.025, 0.035), 0x1c1c1c);
  const leg = new GeoBuilder();     // pivot at the hip, hanging down
  leg.add(PRIM.cyl8, mat(0, -0.42, 0, 0, 0, 0, 0.15, 0.84, 0.16), 0xffffff);
  leg.add(PRIM.box, mat(0, -0.87, -0.04, 0, 0, 0, 0.12, 0.08, 0.27), 0x161616);
  leg.add(PRIM.box, mat(0, -0.62, 0, 0, 0, 0, 0.16, 0.04, 0.17), 0xc8c8c8);           // reflective trouser band
  const arm = new GeoBuilder();     // pivot at the shoulder
  arm.add(PRIM.cyl8, mat(0, -0.3, 0, 0, 0, 0, 0.1, 0.6, 0.1), 0xffffff);
  arm.add(PRIM.sphere, mat(0, -0.63, 0, 0, 0, 0, 0.09, 0.11, 0.09), 0x404040);      // glove
  const wand = new GeoBuilder();    // relative to the arm pivot: held in the hand
  wand.add(PRIM.cyl8, mat(0, -0.86, 0, 0, 0, 0, 0.05, 0.42, 0.05), 0xffffff);
  return { torso: torso.build(), head: head.build(), leg: leg.build(), arm: arm.build(), wand: wand.build() };
}

const _m = new THREE.Matrix4(), _b = new THREE.Matrix4(), _p = new THREE.Matrix4(), _r = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

export class Crowd {
  constructor(max = 40, seed = 1) {
    this.max = max;
    this.group = new THREE.Group();
    this.group.name = 'ramp-crew';
    const G = partGeometries();
    const mk = (geo, count, material) => {
      const m = new THREE.InstancedMesh(geo, material, count);
      m.count = 0; m.castShadow = true; m.receiveShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
      return m;
    };
    const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    this.wandMat = new THREE.MeshStandardMaterial({ color: 0x401000, emissive: 0xff5a0a, emissiveIntensity: 3, roughness: 0.4 });
    this.torso = mk(G.torso, max, cloth);
    this.head = mk(G.head, max, cloth);
    this.leg = mk(G.leg, max * 2, cloth);
    this.arm = mk(G.arm, max * 2, cloth);
    this.wand = mk(G.wand, 8, this.wandMat);
    this.people = [];
    this.rnd = mulberry(seed);
    // instance colours
    for (const m of [this.torso, this.head, this.leg, this.arm]) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(m.instanceMatrix.count * 3).fill(1), 3);
    this.wandTips = [];        // world-ish (airport-local) wand tip positions for light sprites
  }

  add({ x = 0, z = 0, yaw = 0, mode = 'idle', vest = null } = {}) {
    if (this.people.length >= this.max) return null;
    const r = this.rnd;
    const p = {
      x, z, yaw, mode, visible: true, phase: r() * 10, speed: 0, wands: false,
      vest: new THREE.Color(vest ?? VESTS[Math.floor(r() * VESTS.length)]),
      trousers: new THREE.Color(TROUSERS[Math.floor(r() * TROUSERS.length)]),
      skin: new THREE.Color(SKINS[Math.floor(r() * SKINS.length)]),
      sleeve: new THREE.Color(r() < 0.5 ? 0x26344a : 0x3a3f46),
      scale: 0.94 + r() * 0.12,
      walker: null,
    };
    this.people.push(p);
    return p;
  }

  /** Walk a person along a polyline at ~1.4 m/s (sets mode 'walk' until done). */
  walk(p, pts, speed = 1.35, then = 'idle') {
    p.walker = { pts, i: 0, speed, then };
    p.mode = 'walk';
  }

  update(dt, t) {
    let n = 0, nl = 0, na = 0, nw = 0;
    this.wandTips.length = 0;
    for (const p of this.people) {
      if (p.walker) {
        const w = p.walker;
        const tgt = w.pts[w.i];
        const dx = tgt[0] - p.x, dz = tgt[1] - p.z, d = Math.hypot(dx, dz);
        if (d < 0.15) { w.i++; if (w.i >= w.pts.length) { p.walker = null; p.mode = w.then; if (w.onDone) w.onDone(); } }
        else {
          const st = Math.min(d, w.speed * dt);
          p.x += dx / d * st; p.z += dz / d * st;
          const yt = Math.atan2(-dx, -dz);
          let dy = yt - p.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
          p.yaw += dy * Math.min(1, dt * 6);
        }
      }
      if (!p.visible) continue;
      p.phase += dt;
      const ph = p.phase;
      let legA = 0, armL = [0, 0], armR = [0, 0], bob = 0, lean = 0;
      switch (p.mode) {
        case 'walk': {
          const c = Math.sin(ph * 6.2);
          legA = c * 0.42; armL = [-c * 0.35, -0.05]; armR = [c * 0.35, 0.05]; bob = Math.abs(Math.cos(ph * 6.2)) * 0.035;
          break;
        }
        case 'work': {
          const c = Math.sin(ph * 2.2);
          lean = 0.35 + 0.15 * c; armL = [0.9 + 0.4 * c, -0.1]; armR = [0.9 + 0.4 * c, 0.1];
          break;
        }
        case 'marshal': {
          // 'come ahead': arms up, forearms waving towards the head
          const c = Math.sin(ph * 4.2);
          armL = [0.15, -2.45 - 0.4 * c]; armR = [0.15, 2.45 + 0.4 * c];
          break;
        }
        case 'stop': armL = [0.1, 2.75]; armR = [0.1, -2.75]; break;
        case 'wingwalk': armR = [0, 2.3]; armL = [0, -0.12]; break;
        case 'headset': armL = [0.6, -0.1]; armR = [1.9, 0.15]; break;
        default: { const c = Math.sin(ph * 0.9); armL = [0.05 * c, -0.08]; armR = [-0.05 * c, 0.08]; }
      }
      _q.setFromEuler(_e.set(0, p.yaw, 0));
      _b.compose(_v.set(p.x, bob, p.z), _q, _s.set(p.scale, p.scale, p.scale));
      // torso (lean forward around the hips)
      _p.multiplyMatrices(_b, _r.makeTranslation(0, 0.92, 0)).multiply(_m.makeRotationX(-lean)).multiply(_r.makeTranslation(0, -0.92, 0));
      this.torso.setMatrixAt(n, _p); this.torso.setColorAt(n, p.vest);
      this.head.setMatrixAt(n, _p); this.head.setColorAt(n, p.skin);
      for (const s of [-1, 1]) {
        _m.multiplyMatrices(_b, _r.makeTranslation(s * 0.11, 0.92, 0)).multiply(_r.makeRotationX(s * legA));
        this.leg.setMatrixAt(nl, _m); this.leg.setColorAt(nl, p.trousers); nl++;
        const a = s < 0 ? armL : armR;
        _m.multiplyMatrices(_p, _r.makeTranslation(s * 0.25, 1.45, 0)).multiply(_r.makeRotationFromEuler(_e.set(a[0], 0, a[1], 'XYZ')));
        this.arm.setMatrixAt(na, _m); this.arm.setColorAt(na, p.sleeve); na++;
        if (p.wands && nw < 8) {
          this.wand.setMatrixAt(nw++, _m);
          _v.set(0, -1.05, 0).applyMatrix4(_m);
          this.wandTips.push(_v.x, _v.y, _v.z);
        }
      }
      n++;
    }
    this.torso.count = this.head.count = n;
    this.leg.count = this.arm.count = nl;
    this.wand.count = nw;
    for (const m of [this.torso, this.head, this.leg, this.arm, this.wand]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
