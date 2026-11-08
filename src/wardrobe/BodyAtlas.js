import * as THREE from 'three';

/**
 * A welded, analysed copy of the body's rest geometry.  Garments are cut out of
 * this surface (so they fit perfectly and inherit correct skin weights), and the
 * body uses it to hide skin that is fully covered by opaque clothing.
 */
export class BodyAtlas {
  constructor(character) {
    this.character = character;
    const g = character.body.geometry;
    const pos = g.attributes.position, nrm = g.attributes.normal;
    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const weld = g.attributes._weld;
    const n = pos.count;

    // ---- weld render vertices that share a position (UV seams) ----
    const map = new Int32Array(n);
    const ids = new Map();
    let nw = 0;
    for (let i = 0; i < n; i++) {
      const key = weld ? weld.getX(i) : i;
      let w = ids.get(key);
      if (w === undefined) { w = nw++; ids.set(key, w); }
      map[i] = w;
    }
    this.renderToWeld = map;
    this.count = nw;
    const P = new Float32Array(nw * 3), N = new Float32Array(nw * 3);
    const SI = new Uint16Array(nw * 4), SW = new Float32Array(nw * 4);
    for (let i = 0; i < n; i++) {
      const w = map[i];
      P[w * 3] = pos.getX(i); P[w * 3 + 1] = pos.getY(i); P[w * 3 + 2] = pos.getZ(i);
      N[w * 3] += nrm.getX(i); N[w * 3 + 1] += nrm.getY(i); N[w * 3 + 2] += nrm.getZ(i);
      for (let k = 0; k < 4; k++) { SI[w * 4 + k] = si.getComponent(i, k); SW[w * 4 + k] = sw.getComponent(i, k); }
    }
    for (let w = 0; w < nw; w++) {
      const l = Math.hypot(N[w * 3], N[w * 3 + 1], N[w * 3 + 2]) || 1;
      N[w * 3] /= l; N[w * 3 + 1] /= l; N[w * 3 + 2] /= l;
    }
    this.P = P; this.N = N; this.SI = SI; this.SW = SW;

    const idx = g.index.array;
    this.renderIndex = idx.slice();
    this.triCount = idx.length / 3;
    const T = new Uint32Array(idx.length);
    for (let i = 0; i < idx.length; i++) T[i] = map[idx[i]];
    this.T = T;

    // ---- per-vertex anatomical features ----
    const bones = character.skeleton.bones.map((b) => b.name);
    const group = (re) => bones.map((nm) => re.test(nm));
    const isArmL = group(/^(upperarm|lowerarm|hand|thumb|index|middle|ring|pinky).*_l$/);
    const isArmR = group(/^(upperarm|lowerarm|hand|thumb|index|middle|ring|pinky).*_r$/);
    const isForearm = group(/^(lowerarm|hand|thumb|index|middle|ring|pinky)/);
    const isHand = group(/^(hand|thumb|index|middle|ring|pinky)/);
    const isLegL = group(/^(thigh|calf|foot|ball)_l$/);
    const isLegR = group(/^(thigh|calf|foot|ball)_r$/);
    const isFoot = group(/^(foot|ball)_/);
    const isHead = group(/^(head|neck_01)$/);
    const isNeck = group(/^neck_01$/);
    const isBreastL = group(/^breast_l$/), isBreastR = group(/^breast_r$/);
    const feats = ['arm', 'armL', 'armR', 'forearm', 'hand', 'leg', 'legL', 'legR', 'foot', 'head', 'neck', 'breast', 'breastL', 'breastR'];
    for (const f of feats) this[f] = new Float32Array(nw);
    for (let w = 0; w < nw; w++) {
      for (let k = 0; k < 4; k++) {
        const b = SI[w * 4 + k], wt = SW[w * 4 + k];
        if (!wt) continue;
        if (isArmL[b]) { this.armL[w] += wt; this.arm[w] += wt; }
        if (isArmR[b]) { this.armR[w] += wt; this.arm[w] += wt; }
        if (isForearm[b]) this.forearm[w] += wt;
        if (isHand[b]) this.hand[w] += wt;
        if (isLegL[b]) { this.legL[w] += wt; this.leg[w] += wt; }
        if (isLegR[b]) { this.legR[w] += wt; this.leg[w] += wt; }
        if (isFoot[b]) this.foot[w] += wt;
        if (isHead[b]) this.head[w] += wt;
        if (isNeck[b]) this.neck[w] += wt;
        if (isBreastL[b]) { this.breastL[w] += wt; this.breast[w] += wt; }
        if (isBreastR[b]) { this.breastR[w] += wt; this.breast[w] += wt; }
      }
    }

    // vertex adjacency (for smoothing)
    const adj = Array.from({ length: nw }, () => new Set());
    for (let t = 0; t < T.length; t += 3) {
      const a = T[t], b = T[t + 1], c = T[t + 2];
      adj[a].add(b); adj[a].add(c); adj[b].add(a); adj[b].add(c); adj[c].add(a); adj[c].add(b);
    }
    this.adjStart = new Uint32Array(nw + 1);
    let total = 0;
    for (let w = 0; w < nw; w++) { this.adjStart[w] = total; total += adj[w].size; }
    this.adjStart[nw] = total;
    this.adj = new Uint32Array(total);
    for (let w = 0, o = 0; w < nw; w++) for (const j of adj[w]) this.adj[o++] = j;

    // landmarks (rest pose, metres)
    const R = character.restModel;
    const L = {};
    L.neckBase = R.neck_01.clone();
    L.headJ = R.head.clone();
    L.chest = R.spine_03.clone();
    L.waist = R.spine_01.clone();
    L.pelvis = R.pelvis.clone();
    L.hipL = R.thigh_l.clone(); L.hipR = R.thigh_r.clone();
    L.kneeL = R.calf_l.clone(); L.kneeR = R.calf_r.clone();
    L.ankleL = R.foot_l.clone(); L.ankleR = R.foot_r.clone();
    L.shoulderL = R.upperarm_l.clone(); L.shoulderR = R.upperarm_r.clone();
    L.elbowL = R.lowerarm_l.clone(); L.elbowR = R.lowerarm_r.clone();
    L.wristL = R.hand_l.clone(); L.wristR = R.hand_r.clone();
    L.breastTipL = character.tailModel.breast_l.clone();
    L.breastTipR = character.tailModel.breast_r.clone();
    // crotch height: lowest torso vertex near the centre line
    let crotch = 1e9, waistMinR = 1e9;
    for (let w = 0; w < nw; w++) {
      const x = P[w * 3], y = P[w * 3 + 1], z = P[w * 3 + 2];
      if (Math.abs(x) < 0.012 && y > 0.6 && y < 0.95 && Math.abs(z) < 0.06) crotch = Math.min(crotch, y);
    }
    L.crotchY = crotch;
    // natural waist: narrowest torso section between pelvis and chest
    let best = 0, bestW = 1e9;
    for (let y = L.pelvis.y + 0.02; y < L.chest.y - 0.04; y += 0.005) {
      let mx = 0;
      for (let w = 0; w < nw; w++) {
        const py = P[w * 3 + 1];
        if (Math.abs(py - y) < 0.004 && this.arm[w] < 0.1) mx = Math.max(mx, Math.abs(P[w * 3]));
      }
      if (mx > 0 && mx < bestW) { bestW = mx; best = y; }
    }
    L.naturalWaistY = best;
    L.waistHalfWidth = bestW;
    void waistMinR;
    this.L = L;
    this.armAxis = {
      l: [L.shoulderL, L.elbowL, L.wristL],
      r: [L.shoulderR, L.elbowR, L.wristR],
    };
  }

  /**
   * Distance along the arm (metres from the shoulder joint, following the
   * shoulder→elbow→wrist polyline) of vertex w.  Only meaningful when arm>0.
   */
  armCoord(w, side) {
    const [s, e, h] = this.armAxis[side];
    const p = new THREE.Vector3(this.P[w * 3], this.P[w * 3 + 1], this.P[w * 3 + 2]);
    const d1 = new THREE.Vector3().subVectors(e, s); const l1 = d1.length(); d1.divideScalar(l1);
    const t1 = new THREE.Vector3().subVectors(p, s).dot(d1);
    if (t1 < l1) return t1;
    const d2 = new THREE.Vector3().subVectors(h, e); const l2 = d2.length(); d2.divideScalar(l2);
    return l1 + new THREE.Vector3().subVectors(p, e).dot(d2);
  }

  sample(w) {
    return {
      w,
      x: this.P[w * 3], y: this.P[w * 3 + 1], z: this.P[w * 3 + 2],
      nx: this.N[w * 3], ny: this.N[w * 3 + 1], nz: this.N[w * 3 + 2],
      arm: this.arm[w], armL: this.armL[w], armR: this.armR[w], forearm: this.forearm[w], hand: this.hand[w],
      leg: this.leg[w], legL: this.legL[w], legR: this.legR[w], foot: this.foot[w],
      head: this.head[w], neck: this.neck[w], breast: this.breast[w], breastL: this.breastL[w], breastR: this.breastR[w],
    };
  }
}
