// Lightning arcs (the tesla gun): jagged ribbons of additive light, a bright core in a
// wide blue glow, with a fork or two, that flicker out in a fraction of a second.
// GoldSrc space (children of renderer.world); the ribbons face the camera.
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);

/** Points from a to b, kinked sideways (jitter: fraction of the length). */
function jag(a, b, jitter) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  const n = Math.max(4, Math.min(24, Math.round(len / 22)));
  const pts = [a.slice()];
  for (let i = 1; i < n; i++) {
    const k = i / n, amp = len * jitter * Math.sin(Math.PI * k);
    pts.push([a[0] + d[0] * k + rnd(-1, 1) * amp, a[1] + d[1] * k + rnd(-1, 1) * amp, a[2] + d[2] * k + rnd(-1, 1) * amp]);
  }
  pts.push(b.slice());
  return pts;
}

/** Camera-facing ribbon through pts (width in units). */
function ribbon(pts, width, cam) {
  const P = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const s = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [(a[0] + b[0]) / 2 - cam[0], (a[1] + b[1]) / 2 - cam[1], (a[2] + b[2]) / 2 - cam[2]];
    let w = [s[1] * v[2] - s[2] * v[1], s[2] * v[0] - s[0] * v[2], s[0] * v[1] - s[1] * v[0]];
    const l = Math.hypot(w[0], w[1], w[2]) || 1;
    w = [w[0] / l * width / 2, w[1] / l * width / 2, w[2] / l * width / 2];
    const q = [[a[0] - w[0], a[1] - w[1], a[2] - w[2]], [a[0] + w[0], a[1] + w[1], a[2] + w[2]], [b[0] + w[0], b[1] + w[1], b[2] + w[2]], [b[0] - w[0], b[1] - w[1], b[2] - w[2]]];
    for (const k of [0, 1, 2, 0, 2, 3]) P.push(q[k][0], q[k][1], q[k][2]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  return g;
}

export class Arcs {
  constructor(parent) {
    this.group = new THREE.Group();
    this.group.name = 'arcs';
    parent.add(this.group);
    this.list = [];
    this.mats = {
      glow: new THREE.MeshBasicMaterial({ color: 0x3c78ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      core: new THREE.MeshBasicMaterial({ color: 0xdceaff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    };
  }

  /** A bolt from a to b seen from cam (GS points). */
  bolt(a, b, cam, life = 0.16) {
    const meshes = [];
    const add = (pts, width, mat) => {
      const m = new THREE.Mesh(ribbon(pts, width, cam), mat.clone());
      m.frustumCulled = false;
      this.group.add(m);
      meshes.push(m);
    };
    const main = jag(a, b, 0.07);
    add(main, 7, this.mats.glow);
    add(main, 1.6, this.mats.core);
    // a fork or two off the main bolt
    for (let f = 0; f < 2; f++) {
      if (Math.random() < 0.4) continue;
      const i = 1 + Math.floor(Math.random() * (main.length - 2));
      const o = main[i], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * rnd(0.12, 0.25);
      const end = [o[0] + rnd(-1, 1) * L, o[1] + rnd(-1, 1) * L, o[2] + rnd(-1, 1) * L];
      add(jag(o, end, 0.12), 0.9, this.mats.core);
    }
    this.list.push({ meshes, life, age: 0 });
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.age += dt;
      const k = 1 - b.age / b.life;
      if (k <= 0) {
        for (const m of b.meshes) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); }
        this.list.splice(i, 1);
        continue;
      }
      const flick = 0.6 + 0.4 * Math.random();
      for (const m of b.meshes) m.material.opacity = (m.material.color.r > 0.8 ? 1 : 0.35) * k * flick;
    }
  }

  clear() { this.update(1e9); }
}
