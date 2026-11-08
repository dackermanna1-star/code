import * as THREE from 'three';

const assetUrl = (base, name) => (window.__ASSETS && window.__ASSETS[name]) || base + name;

/**
 * Retargeted motion-capture database (see tools/build_mocap.py).
 * Per frame: model-space bone rotations relative to the character's root
 * frame, pelvis position, root velocity / turn rate, foot contacts and the
 * normalised motion-matching feature vector.
 */
export class MocapDB {
  static async load(base = './assets/') {
    const [info, buf] = await Promise.all([
      fetch(assetUrl(base, 'mocap.json')).then((r) => r.json()),
      fetch(assetUrl(base, 'mocap.bin')).then((r) => r.arrayBuffer()),
    ]);
    return new MocapDB(info, buf);
  }

  constructor(info, buf) {
    this.info = info;
    this.fps = info.fps;
    this.N = info.frames;
    this.bones = info.bones;
    this.B = this.bones.length;
    const N = this.N, B = this.B;
    let o = 0;
    const take = (Ctor, count) => {
      const bytes = count * Ctor.BYTES_PER_ELEMENT;
      const arr = new Ctor(buf.slice(o, o + bytes));
      o += bytes;
      return arr;
    };
    const qi = take(Int16Array, N * B * 4);
    this.quats = new Float32Array(qi.length);
    for (let i = 0; i < qi.length; i++) this.quats[i] = qi[i] / 32767;
    this.pelvis = take(Float32Array, N * 3);
    this.vel = take(Float32Array, N * 3);
    this.angvel = take(Float32Array, N);
    this.contacts = take(Uint8Array, N * 2);
    this.features = take(Float32Array, N * 27);
    this.D = 27;
    // frame -> take bounds
    this.takeStart = new Int32Array(N);
    this.takeEnd = new Int32Array(N);
    for (const t of info.takes) {
      for (let i = t.start; i < t.start + t.frames; i++) { this.takeStart[i] = t.start; this.takeEnd[i] = t.start + t.frames - 1; }
    }
    this.mean = info.featureMean;
    this.std = info.featureStd;
    this._qa = new THREE.Quaternion();
    this._qb = new THREE.Quaternion();
  }

  /** Clamp a (fractional) frame inside its take. */
  clamp(t, take) {
    return Math.max(this.takeStart[take], Math.min(this.takeEnd[take] - 1e-3, t));
  }

  /**
   * Sample the pose at fractional frame t (within the take containing `anchor`).
   * outQ: array of B quaternions; outP: Vector3 pelvis position.
   */
  sample(t, anchor, outQ, outP) {
    const lo = this.takeStart[anchor], hi = this.takeEnd[anchor];
    t = Math.max(lo, Math.min(hi, t));
    const f0 = Math.floor(t), f1 = Math.min(hi, f0 + 1), a = t - f0;
    const B = this.B, q = this.quats;
    for (let b = 0; b < B; b++) {
      const i0 = (f0 * B + b) * 4, i1 = (f1 * B + b) * 4;
      this._qa.set(q[i0], q[i0 + 1], q[i0 + 2], q[i0 + 3]);
      this._qb.set(q[i1], q[i1 + 1], q[i1 + 2], q[i1 + 3]);
      outQ[b].copy(this._qa).slerp(this._qb, a).normalize();
    }
    const p = this.pelvis;
    outP.set(
      p[f0 * 3] + (p[f1 * 3] - p[f0 * 3]) * a,
      p[f0 * 3 + 1] + (p[f1 * 3 + 1] - p[f0 * 3 + 1]) * a,
      p[f0 * 3 + 2] + (p[f1 * 3 + 2] - p[f0 * 3 + 2]) * a,
    );
  }

  velocity(t, out) {
    const f = Math.round(t);
    return out.set(this.vel[f * 3], this.vel[f * 3 + 1], this.vel[f * 3 + 2]);
  }

  contact(t, side) { return this.contacts[Math.round(t) * 2 + (side === 'l' ? 0 : 1)]; }

  /** Brute-force nearest neighbour over normalised features with weights. */
  search(query, weights, exclude) {
    const F = this.features, D = this.D, N = this.N;
    let best = -1, bestCost = Infinity;
    for (let i = 0; i < N; i++) {
      if (exclude && exclude(i)) continue;
      let c = 0;
      const o = i * D;
      for (let k = 0; k < D; k++) {
        const d = F[o + k] - query[k];
        c += d * d * weights[k];
        if (c >= bestCost) break;
      }
      if (c < bestCost) { bestCost = c; best = i; }
    }
    return { frame: best, cost: bestCost };
  }

  normalise(raw, out) {
    for (let k = 0; k < this.D; k++) out[k] = (raw[k] - this.mean[k]) / this.std[k];
    return out;
  }

  /** Raw (un-normalised) feature vector of frame i. */
  rawFeature(i, out) {
    for (let k = 0; k < this.D; k++) out[k] = this.features[i * this.D + k] * this.std[k] + this.mean[k];
    return out;
  }
}
