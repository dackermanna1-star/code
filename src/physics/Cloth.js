import * as THREE from 'three';

/**
 * Position-based-dynamics cloth on a rows × cols grid (row 0 = waistband).
 *
 * - Verlet integration in world space (so the fabric has inertia: it lags,
 *   swings and settles as she walks, turns and stops)
 * - structural / shear / bending distance constraints with per-type stiffness
 * - tethers (long-range attachments) to the waistband prevent stretching
 * - capsule collisions against the legs and hips with friction
 * - pinned / soft-pinned top rows follow the skinned body exactly
 */
export class Cloth {
  constructor({ rows, cols, wrap, wrapRows = Infinity, rest, pinRows = 1, softRows = 2, gatherH = 1, stiffness = {}, mass = 1, damping = 0.012, thickness = 0.008 }) {
    this.R = rows; this.C = cols; this.wrap = wrap;
    const n = rows * cols;
    this.n = n;
    this.x = new Float32Array(n * 3);
    this.p = new Float32Array(n * 3);   // previous
    this.pin = new Float32Array(n * 3); // pin targets (world)
    this.pinW = new Float32Array(n);    // 1 = hard pinned
    this.x.set(rest); this.p.set(rest);
    this.damping = damping;
    this.mass = mass;
    this.thickness = thickness;
    this.gravity = new THREE.Vector3(0, -9.81, 0);
    const k = { struct: 1.0, shear: 0.6, bend: 0.12, ...stiffness };
    const C = [];        // [i, j, rest, stiffness]
    const idx = (r, c) => r * cols + ((c % cols) + cols) % cols;
    const dist = (a, b) => Math.hypot(rest[a * 3] - rest[b * 3], rest[a * 3 + 1] - rest[b * 3 + 1], rest[a * 3 + 2] - rest[b * 3 + 2]);
    const addC = (a, b, s, scale = 1) => C.push(a, b, dist(a, b) * scale, s);
    const wr = (r) => wrap && r < wrapRows;
    for (let r = 0; r < rows; r++) {
      const cmax = wr(r) ? cols : cols - 1;
      for (let c = 0; c < cmax; c++) addC(idx(r, c), idx(r, c + 1), k.struct, r === 0 ? 1 : gatherH);
      for (let c = 0; c < (wr(r) ? cols : cols - 2); c++) addC(idx(r, c), idx(r, c + 2), k.bend, r === 0 ? 1 : gatherH);
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        addC(idx(r, c), idx(r + 1, c), k.struct);
        if (wr(r + 1) || c < cols - 1) {
          addC(idx(r, c), idx(r + 1, c + 1), k.shear, gatherH > 1 ? 1.02 : 1);
          addC(idx(r, c + 1), idx(r + 1, c), k.shear, gatherH > 1 ? 1.02 : 1);
        }
        if (r < rows - 2) addC(idx(r, c), idx(r + 2, c), k.bend);
      }
    }
    this.cons = new Float32Array(C);
    this.nc = C.length / 4;
    // tethers: each particle to its column's top (max length = rest path length)
    this.tether = new Float32Array(n);
    for (let c = 0; c < cols; c++) {
      let acc = 0;
      for (let r = 1; r < rows; r++) { acc += dist(idx(r - 1, c), idx(r, c)); this.tether[idx(r, c)] = acc * 1.03; }
    }
    this.pinRows = pinRows; this.softRows = softRows;
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const i = idx(r, c);
      this.pinW[i] = r < pinRows ? 1 : r < pinRows + softRows ? 0.35 / (r - pinRows + 1) : 0;
    }
    this.capsules = [];   // {a: Vector3, b: Vector3, ra, rb}
    this.spheres = [];
    this.idx = idx;
  }

  setPins(targets) { this.pin.set(targets); }

  /** Snap the whole cloth to a configuration (e.g. on first frame / teleport). */
  reset(pos) { this.x.set(pos); this.p.set(pos); }

  step(dt, iterations = 6) {
    const x = this.x, p = this.p, n = this.n;
    const g = this.gravity;
    const damp = 1 - this.damping;
    const dt2 = dt * dt;
    // integrate
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      if (this.pinW[i] >= 1) {
        p[i3] = x[i3]; p[i3 + 1] = x[i3 + 1]; p[i3 + 2] = x[i3 + 2];
        x[i3] = this.pin[i3]; x[i3 + 1] = this.pin[i3 + 1]; x[i3 + 2] = this.pin[i3 + 2];
        continue;
      }
      let vx = (x[i3] - p[i3]) * damp, vy = (x[i3 + 1] - p[i3 + 1]) * damp, vz = (x[i3 + 2] - p[i3 + 2]) * damp;
      // clamp crazy velocities (teleports, frame hitches)
      const vmax = 6 * dt;
      const vl = Math.hypot(vx, vy, vz);
      if (vl > vmax) { const s = vmax / vl; vx *= s; vy *= s; vz *= s; }
      p[i3] = x[i3]; p[i3 + 1] = x[i3 + 1]; p[i3 + 2] = x[i3 + 2];
      x[i3] += vx + g.x * dt2; x[i3 + 1] += vy + g.y * dt2; x[i3 + 2] += vz + g.z * dt2;
    }
    for (let it = 0; it < iterations; it++) {
      this._solveDistances();
      this._solvePins();
      this._solveTethers();
      if (it % 2 === 1 || it === iterations - 1) this._collide();
    }
  }

  _solveDistances() {
    const x = this.x, c = this.cons, w = this.pinW;
    for (let k = 0; k < this.nc; k++) {
      const k4 = k * 4;
      const a = c[k4], b = c[k4 + 1], rest = c[k4 + 2], s = c[k4 + 3];
      const a3 = a * 3, b3 = b * 3;
      const dx = x[b3] - x[a3], dy = x[b3 + 1] - x[a3 + 1], dz = x[b3 + 2] - x[a3 + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
      const wa = w[a] >= 1 ? 0 : 1, wb = w[b] >= 1 ? 0 : 1;
      const ws = wa + wb;
      if (!ws) continue;
      const diff = ((d - rest) / d) * s / ws;
      x[a3] += dx * diff * wa; x[a3 + 1] += dy * diff * wa; x[a3 + 2] += dz * diff * wa;
      x[b3] -= dx * diff * wb; x[b3 + 1] -= dy * diff * wb; x[b3 + 2] -= dz * diff * wb;
    }
  }

  _solvePins() {
    const x = this.x, w = this.pinW, t = this.pin;
    for (let i = 0; i < this.n; i++) {
      const k = w[i];
      if (k <= 0 || k >= 1) continue;
      const i3 = i * 3;
      x[i3] += (t[i3] - x[i3]) * k; x[i3 + 1] += (t[i3 + 1] - x[i3 + 1]) * k; x[i3 + 2] += (t[i3 + 2] - x[i3 + 2]) * k;
    }
  }

  _solveTethers() {
    const x = this.x, C = this.C;
    for (let r = 1; r < this.R; r++) for (let c = 0; c < C; c++) {
      const i = r * C + c, a = c;
      const i3 = i * 3, a3 = a * 3;
      const dx = x[i3] - x[a3], dy = x[i3 + 1] - x[a3 + 1], dz = x[i3 + 2] - x[a3 + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const L = this.tether[i];
      if (d > L) {
        const s = L / d;
        x[i3] = x[a3] + dx * s; x[i3 + 1] = x[a3 + 1] + dy * s; x[i3 + 2] = x[a3 + 2] + dz * s;
      }
    }
  }

  _collide() {
    const x = this.x, p = this.p, n = this.n, th = this.thickness;
    for (const cap of this.capsules) {
      const ax = cap.a.x, ay = cap.a.y, az = cap.a.z;
      const bx = cap.b.x - ax, by = cap.b.y - ay, bz = cap.b.z - az;
      const bl2 = bx * bx + by * by + bz * bz;
      for (let i = 0; i < n; i++) {
        if (this.pinW[i] >= 1) continue;
        const i3 = i * 3;
        const px = x[i3] - ax, py = x[i3 + 1] - ay, pz = x[i3 + 2] - az;
        let t = (px * bx + py * by + pz * bz) / bl2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = bx * t, cy = by * t, cz = bz * t;
        const dx = px - cx, dy = py - cy, dz = pz - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        const r = cap.ra + (cap.rb - cap.ra) * t + th;
        if (d2 < r * r) {
          const d = Math.sqrt(d2) || 1e-6;
          const push = (r - d) / d;
          x[i3] += dx * push; x[i3 + 1] += dy * push; x[i3 + 2] += dz * push;
          // friction: damp tangential motion relative to previous position
          const f = 0.35;
          p[i3] += (x[i3] - p[i3]) * f * 0.5; p[i3 + 1] += (x[i3 + 1] - p[i3 + 1]) * f * 0.5; p[i3 + 2] += (x[i3 + 2] - p[i3 + 2]) * f * 0.5;
        }
      }
    }
    // floor
    for (let i = 0; i < n; i++) if (x[i * 3 + 1] < 0.004) x[i * 3 + 1] = 0.004;
  }
}
