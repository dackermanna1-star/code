// Verlet particle ragdoll for zombie bodies.
// 16 particles (head, neck, chest, back, shoulders, elbows, hands, hips, knees, feet), rigid torso,
// distance constraints for limbs, hinge limits (knees / elbows bend one way), cone limits for the head and
// thighs, keep-out-of-torso tests, voxel collisions via isSolid(x,y,z) (integer block coords), friction,
// settle detection → freeze. Body bones are rebuilt from particle pairs every frame.
import * as THREE from 'three';
import { PX, BONE } from './layout.js';

const P = {
  head: 0, neck: 1, chest: 2, back: 3, shR: 4, shL: 5, elR: 6, elL: 7, haR: 8, haL: 9,
  hipR: 10, hipL: 11, knR: 12, knL: 13, ftR: 14, ftL: 15,
};
const NP = 16;
const TORSO_IDS = [P.neck, P.chest, P.back, P.shR, P.shL, P.hipR, P.hipL];
const GRAV = -9.81 * 1.25;
const SUB = 1 / 120;

export class Ragdoll {
  /**
   * @param body ZombieBody (bones Float32Array root-space, rig info, dims)
   * @param rootMatrix world matrix of the visual root (Matrix4)
   * @param opts {impulse:{x,y,z}, hitPart, isSolid, velocity:{x,y,z}, rng, flat?}
   */
  constructor(body, rootMatrix, opts) {
    this.body = body;
    this.isSolid = opts.isSolid || ((x, y, z) => y < 0);
    this.rng = opts.rng;
    const s = body.dims.scale;
    this.s = s;
    const d = body.dims;
    const [tw, th, td] = d.torso;
    this.tw = tw * PX * s; this.th = th * PX * s; this.td = td * PX * s;
    this.pos = new Float32Array(NP * 3);
    this.prev = new Float32Array(NP * 3);
    this.rad = new Float32Array(NP);
    this.active = new Uint8Array(NP).fill(1);
    this.time = 0;
    this.quiet = 0;
    this.settled = false;
    this.acc = 0;
    this.grounded = new Uint8Array(NP);
    this.headTwist = (this.rng.next() - 0.5) * 1.2;
    this.jawOpen = 0.2 + this.rng.next() * 0.35;

    // particle definitions: [bone, local x,y,z (px), radius px]
    const J = body.joints;
    const aw = d.arm[0], lw = d.leg[0];
    const defs = [];
    defs[P.head] = [BONE.head, 0, 4.6, 0.2, 3.7];
    defs[P.neck] = [BONE.torso, 0, th, 0, 1.6];
    defs[P.chest] = [BONE.torso, 0, th * 0.55, td / 2, 1.2];
    defs[P.back] = [BONE.torso, 0, th * 0.55, -td / 2, 1.2];
    defs[P.shR] = [BONE.armUR, 0, 0, 0, aw / 2];
    defs[P.shL] = [BONE.armUL, 0, 0, 0, aw / 2];
    defs[P.elR] = [BONE.armLR, 0, 0, 0, aw / 2];
    defs[P.elL] = [BONE.armLL, 0, 0, 0, aw / 2];
    defs[P.haR] = [BONE.armLR, 0, -6, 0, aw / 2];
    defs[P.haL] = [BONE.armLL, 0, -6, 0, aw / 2];
    defs[P.hipR] = [BONE.legUR, 0, 0, 0, lw / 2];
    defs[P.hipL] = [BONE.legUL, 0, 0, 0, lw / 2];
    defs[P.knR] = [BONE.legLR, 0, 0, 0, lw / 2];
    defs[P.knL] = [BONE.legLL, 0, 0, 0, lw / 2];
    defs[P.ftR] = [BONE.legLR, 0, -6, 0, lw / 2];
    defs[P.ftL] = [BONE.legLL, 0, -6, 0, lw / 2];
    const m = new THREE.Matrix4(), v = new THREE.Vector3();
    const bones = body.bones;
    for (let i = 0; i < NP; i++) {
      const [b, x, y, z, r] = defs[i];
      m.fromArray(bones, b * 16).premultiply(rootMatrix);
      v.set(x * PX, y * PX, z * PX).applyMatrix4(m);
      this.pos[i * 3] = v.x; this.pos[i * 3 + 1] = v.y; this.pos[i * 3 + 2] = v.z;
      this.rad[i] = r * PX * s;
    }
    // inactive particles for missing parts
    const miss = body.missing;
    if (miss.head) this.active[P.head] = 0;
    if (miss.armR === 'upper') { this.active[P.elR] = 0; this.active[P.haR] = 0; } else if (miss.armR === 'lower') this.active[P.haR] = 0;
    if (miss.armL === 'upper') { this.active[P.elL] = 0; this.active[P.haL] = 0; } else if (miss.armL === 'lower') this.active[P.haL] = 0;
    if (miss.legR === 'upper') { this.active[P.knR] = 0; this.active[P.ftR] = 0; } else if (miss.legR === 'lower') this.active[P.ftR] = 0;
    if (miss.legL === 'upper') { this.active[P.knL] = 0; this.active[P.ftL] = 0; } else if (miss.legL === 'lower') this.active[P.ftL] = 0;

    // constraints: [a, b, restLength, stiffness, mode(0 = equal, 1 = min distance)]
    this.cons = [];
    const dist = (a, b) => Math.hypot(this.pos[a * 3] - this.pos[b * 3], this.pos[a * 3 + 1] - this.pos[b * 3 + 1], this.pos[a * 3 + 2] - this.pos[b * 3 + 2]);
    const add = (a, b, k = 1, mode = 0, len = null) => {
      if (!this.active[a] || !this.active[b]) return;
      this.cons.push([a, b, len ?? dist(a, b), k, mode]);
    };
    const torso = [P.neck, P.chest, P.back, P.shR, P.shL, P.hipR, P.hipL];
    for (let i = 0; i < torso.length; i++) for (let j = i + 1; j < torso.length; j++) add(torso[i], torso[j], 1);
    add(P.head, P.neck, 1);
    add(P.head, P.shR, 0.15); add(P.head, P.shL, 0.15);
    add(P.shR, P.elR, 1); add(P.elR, P.haR, 1); add(P.shL, P.elL, 1); add(P.elL, P.haL, 1);
    add(P.hipR, P.knR, 1); add(P.knR, P.ftR, 1); add(P.hipL, P.knL, 1); add(P.knL, P.ftL, 1);
    // minimum distances (no full folding / limbs through each other)
    const U = PX * s;
    add(P.shR, P.haR, 1, 1, 4.5 * U); add(P.shL, P.haL, 1, 1, 4.5 * U);
    add(P.hipR, P.ftR, 1, 1, 5.5 * U); add(P.hipL, P.ftL, 1, 1, 5.5 * U);
    add(P.knR, P.knL, 1, 1, lw * 0.95 * U); add(P.ftR, P.ftL, 1, 1, lw * 0.9 * U);
    add(P.haR, P.haL, 1, 1, aw * U); add(P.elR, P.elL, 1, 1, aw * U);
    add(P.head, P.chest, 1, 1, 5 * U); add(P.head, P.back, 1, 1, 5 * U);

    // initial velocity: body velocity + impulse distributed around the hit part + collapse perturbation
    const vel = opts.velocity || { x: 0, y: 0, z: 0 };
    const imp = opts.impulse || { x: 0, y: 0, z: 0 };
    const w = impulseWeights(opts.hitPart || 'torso');
    // torso forward (for knee buckling)
    const fx = this.pos[P.chest * 3] - this.pos[P.back * 3], fz = this.pos[P.chest * 3 + 2] - this.pos[P.back * 3 + 2];
    const fl = Math.hypot(fx, fz) || 1;
    for (let i = 0; i < NP; i++) {
      const k = w[i];
      let vx = vel.x + imp.x * k, vy = vel.y + imp.y * k, vz = vel.z + imp.z * k;
      if (i === P.knR || i === P.knL) { vx += fx / fl * 0.9; vz += fz / fl * 0.9; }
      if (i === P.hipR || i === P.hipL) vy -= 0.4;
      vx += (this.rng.next() - 0.5) * 0.3; vz += (this.rng.next() - 0.5) * 0.3;
      this.prev[i * 3] = this.pos[i * 3] - vx * SUB;
      this.prev[i * 3 + 1] = this.pos[i * 3 + 1] - vy * SUB;
      this.prev[i * 3 + 2] = this.pos[i * 3 + 2] - vz * SUB;
    }
    // scratch
    this._m = new THREE.Matrix4();
    this._inv = new THREE.Matrix4();
    this.basis = new Float32Array(16 * 11);
  }

  /** Step the simulation by dt (fixed sub-steps). Returns false once settled (frozen). */
  step(dt) {
    if (this.settled) return false;
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= SUB && n < 12) {
      this._sub();
      this.acc -= SUB;
      n++;
      if (this.settled) break;
    }
    return !this.settled;
  }

  _sub() {
    const p = this.pos, q = this.prev;
    this.time += SUB;
    // damping ramps up late so bodies come to rest smoothly
    let damp = 0.996;
    if (this.time > 1.6) damp = 0.996 - Math.min(1, (this.time - 1.6) / 1.4) * 0.1;
    let maxMove = 0;
    for (let i = 0; i < NP; i++) {
      if (!this.active[i]) continue;
      const o = i * 3;
      const x = p[o], y = p[o + 1], z = p[o + 2];
      let vx = (x - q[o]) * damp, vy = (y - q[o + 1]) * damp, vz = (z - q[o + 2]) * damp;
      if (this.grounded[i]) { vx *= 0.82; vz *= 0.82; }
      q[o] = x; q[o + 1] = y; q[o + 2] = z;
      p[o] = x + vx; p[o + 1] = y + vy + GRAV * SUB * SUB; p[o + 2] = z + vz;
    }
    for (let it = 0; it < 6; it++) {
      this._constraints();
      if (it & 1) this._limits();
      this._collide(it === 5);
    }
    for (let i = 0; i < NP; i++) {
      if (!this.active[i]) continue;
      const o = i * 3;
      const m = Math.abs(p[o] - q[o]) + Math.abs(p[o + 1] - q[o + 1]) + Math.abs(p[o + 2] - q[o + 2]);
      if (m > maxMove) maxMove = m;
    }
    if (maxMove < 0.0009) this.quiet += SUB; else this.quiet = 0;
    // settling phase: once motion is small, bleed velocity so it comes to rest without jitter
    if (this.time > 0.8 && maxMove < 0.006) this.calm = Math.min(1, (this.calm || 0) + SUB * 1.5);
    else if (maxMove > 0.02) this.calm = Math.max(0, (this.calm || 0) - SUB * 4);
    if (this.calm > 0) {
      const k = 0.35 * this.calm;
      for (let i = 0; i < NP * 3; i++) q[i] += (p[i] - q[i]) * k;
    }
    if ((this.quiet > 0.3 && this.time > 0.6) || this.time > 4.0) {
      this.settled = true;
      // remove residual velocity
      q.set(p);
    }
  }

  _constraints() {
    const p = this.pos;
    for (const c of this.cons) {
      const a = c[0] * 3, b = c[1] * 3;
      const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      if (c[4] === 1 && d >= c[2]) continue;
      const k = (d - c[2]) / d * 0.5 * c[3];
      p[a] += dx * k; p[a + 1] += dy * k; p[a + 2] += dz * k;
      p[b] -= dx * k; p[b + 1] -= dy * k; p[b + 2] -= dz * k;
    }
  }

  /** Torso frame (into this._T*): origin pelvis, X left, Y up the spine, Z forward. */
  _torsoFrame() {
    const p = this.pos;
    const ox = (p[P.hipR * 3] + p[P.hipL * 3]) * 0.5, oy = (p[P.hipR * 3 + 1] + p[P.hipL * 3 + 1]) * 0.5, oz = (p[P.hipR * 3 + 2] + p[P.hipL * 3 + 2]) * 0.5;
    let yx = p[P.neck * 3] - ox, yy = p[P.neck * 3 + 1] - oy, yz = p[P.neck * 3 + 2] - oz;
    let l = Math.hypot(yx, yy, yz) || 1; yx /= l; yy /= l; yz /= l;
    let xx = p[P.shL * 3] - p[P.shR * 3] + p[P.hipL * 3] - p[P.hipR * 3];
    let xy = p[P.shL * 3 + 1] - p[P.shR * 3 + 1] + p[P.hipL * 3 + 1] - p[P.hipR * 3 + 1];
    let xz = p[P.shL * 3 + 2] - p[P.shR * 3 + 2] + p[P.hipL * 3 + 2] - p[P.hipR * 3 + 2];
    const dd = xx * yx + xy * yy + xz * yz;
    xx -= yx * dd; xy -= yy * dd; xz -= yz * dd;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    // z = x × y
    const zx = xy * yz - xz * yy, zy = xz * yx - xx * yz, zz = xx * yy - xy * yx;
    const T = this._T || (this._T = new Float32Array(12));
    T[0] = ox; T[1] = oy; T[2] = oz; T[3] = xx; T[4] = xy; T[5] = xz; T[6] = yx; T[7] = yy; T[8] = yz; T[9] = zx; T[10] = zy; T[11] = zz;
    return T;
  }

  _limits() {
    const p = this.pos;
    const T = this._torsoFrame();
    const X = [T[3], T[4], T[5]], Y = [T[6], T[7], T[8]], Z = [T[9], T[10], T[11]];
    // hinge: knees bend backwards only
    this._hinge(P.hipR, P.knR, P.ftR, X, -1);
    this._hinge(P.hipL, P.knL, P.ftL, X, -1);
    // (no elbow hinge: arms rotate freely at the shoulder; the min-distance constraint stops full folding)
    // head cone (max ~65° from the spine)
    this._cone(P.neck, P.head, Y, 0.42, null);
    // thighs: not far behind the body, limited spreading
    this._thigh(P.hipR, P.knR, X, Y, Z);
    this._thigh(P.hipL, P.knL, X, Y, Z);
    // keep limbs out of the torso box
    for (const i of [P.elR, P.elL, P.haR, P.haL, P.knR, P.knL, P.ftR, P.ftL, P.head]) this._outOfTorso(i, T);
  }

  // All limit corrections are applied equal-and-opposite (equal masses) so they never add net momentum.
  _hinge(a, b, c, X, sign, k = 0.5) {
    if (!this.active[b] || !this.active[c]) return;
    const p = this.pos;
    const ao = a * 3, bo = b * 3, co = c * 3;
    let tx = p[bo] - p[ao], ty = p[bo + 1] - p[ao + 1], tz = p[bo + 2] - p[ao + 2];
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    // allowed bending direction: sign * cross(t, X)
    let fx = (ty * X[2] - tz * X[1]) * sign, fy = (tz * X[0] - tx * X[2]) * sign, fz = (tx * X[1] - ty * X[0]) * sign;
    const fl = Math.hypot(fx, fy, fz);
    if (fl < 0.3) return; // limb roughly along the hinge axis: undefined, skip
    fx /= fl; fy /= fl; fz /= fl;
    const sx = p[co] - p[bo], sy = p[co + 1] - p[bo + 1], sz = p[co + 2] - p[bo + 2];
    const along = sx * fx + sy * fy + sz * fz;
    if (along < 0) {
      const m = -along * k * 0.5;
      p[co] += fx * m; p[co + 1] += fy * m; p[co + 2] += fz * m;
      p[bo] -= fx * m; p[bo + 1] -= fy * m; p[bo + 2] -= fz * m;
    }
  }

  _cone(a, b, axis, cosLim) {
    if (!this.active[b]) return;
    const p = this.pos;
    const ao = a * 3, bo = b * 3;
    let hx = p[bo] - p[ao], hy = p[bo + 1] - p[ao + 1], hz = p[bo + 2] - p[ao + 2];
    const l = Math.hypot(hx, hy, hz) || 1e-6;
    hx /= l; hy /= l; hz /= l;
    const c = hx * axis[0] + hy * axis[1] + hz * axis[2];
    if (c >= cosLim) return;
    let px = hx - axis[0] * c, py = hy - axis[1] * c, pz = hz - axis[2] * c;
    const pl = Math.hypot(px, py, pz) || 1e-6; px /= pl; py /= pl; pz /= pl;
    const sinLim = Math.sqrt(1 - cosLim * cosLim);
    const nx = axis[0] * cosLim + px * sinLim, ny = axis[1] * cosLim + py * sinLim, nz = axis[2] * cosLim + pz * sinLim;
    const k = 0.25;
    const dx = (p[ao] + nx * l - p[bo]) * k, dy = (p[ao + 1] + ny * l - p[bo + 1]) * k, dz = (p[ao + 2] + nz * l - p[bo + 2]) * k;
    p[bo] += dx; p[bo + 1] += dy; p[bo + 2] += dz;
    p[ao] -= dx; p[ao + 1] -= dy; p[ao + 2] -= dz;
  }

  _thigh(hip, knee, X, Y, Z) {
    if (!this.active[knee]) return;
    const p = this.pos;
    const ho = hip * 3, ko = knee * 3;
    let tx = p[ko] - p[ho], ty = p[ko + 1] - p[ho + 1], tz = p[ko + 2] - p[ho + 2];
    const l = Math.hypot(tx, ty, tz) || 1e-6;
    tx /= l; ty /= l; tz /= l;
    const back = -(tx * Z[0] + ty * Z[1] + tz * Z[2]); // > 0 = behind the body
    const up = tx * Y[0] + ty * Y[1] + tz * Y[2]; // > 0 = raised towards the chest
    let cx = 0, cy = 0, cz = 0;
    if (back > 0.5) { const e = back - 0.5; cx += Z[0] * e; cy += Z[1] * e; cz += Z[2] * e; }
    if (up > 0.6) { const e = up - 0.6; cx -= Y[0] * e; cy -= Y[1] * e; cz -= Y[2] * e; }
    const sd = tx * X[0] + ty * X[1] + tz * X[2];
    if (Math.abs(sd) > 0.65) { const e = sd - Math.sign(sd) * 0.65; cx -= X[0] * e; cy -= X[1] * e; cz -= X[2] * e; }
    if (cx || cy || cz) {
      const k = l * 0.2;
      p[ko] += cx * k; p[ko + 1] += cy * k; p[ko + 2] += cz * k;
      p[ho] -= cx * k; p[ho + 1] -= cy * k; p[ho + 2] -= cz * k;
    }
  }

  _outOfTorso(i, T) {
    if (!this.active[i] || this.grounded[i]) return; // limbs trapped under the body stay there (no fighting the floor)
    const p = this.pos, o = i * 3;
    const dx = p[o] - T[0], dy = p[o + 1] - T[1], dz = p[o + 2] - T[2];
    const lx = dx * T[3] + dy * T[4] + dz * T[5];
    const ly = dx * T[6] + dy * T[7] + dz * T[8];
    const lz = dx * T[9] + dy * T[10] + dz * T[11];
    const r = this.rad[i] * 0.7;
    const hx = this.tw / 2 + r, hz = this.td / 2 + r;
    if (ly < 0.03 || ly > this.th - 0.03 || Math.abs(lx) > hx || Math.abs(lz) > hz) return;
    // push out along the smallest penetration (x or z); the torso (7 rigid particles) takes the reaction
    const px = hx - Math.abs(lx), pz = hz - Math.abs(lz);
    let mx, my, mz;
    if (px < pz) { const m = Math.sign(lx || 1) * px * 0.5; mx = T[3] * m; my = T[4] * m; mz = T[5] * m; }
    else { const m = Math.sign(lz || 1) * pz * 0.5; mx = T[9] * m; my = T[10] * m; mz = T[11] * m; }
    p[o] += mx * 0.875; p[o + 1] += my * 0.875; p[o + 2] += mz * 0.875;
    const tor = TORSO_IDS;
    for (let k = 0; k < 7; k++) {
      const t = tor[k] * 3;
      p[t] -= mx * 0.125; p[t + 1] -= my * 0.125; p[t + 2] -= mz * 0.125;
    }
  }

  _collide(final) {
    const p = this.pos, q = this.prev, solid = this.isSolid;
    const fl = Math.floor;
    const E = 0.12; // restitution
    for (let i = 0; i < NP; i++) {
      if (!this.active[i]) continue;
      const o = i * 3, r = this.rad[i];
      let x = p[o], y = p[o + 1], z = p[o + 2];
      let g = 0;
      // centre inside a solid block (tunnelled): go back to the previous position
      if (solid(fl(x), fl(y), fl(z)) && !solid(fl(q[o]), fl(q[o + 1]), fl(q[o + 2]))) {
        x = q[o]; y = q[o + 1]; z = q[o + 2];
      }
      const cx = fl(x), cz = fl(z);
      // floor
      const fy = fl(y - r);
      if (solid(cx, fy, cz) && !solid(cx, fy + 1, cz)) {
        const top = fy + 1 + r;
        if (y < top) {
          const vin = y - q[o + 1];
          y = top; g = 1;
          q[o + 1] = vin < 0 ? y + vin * E : y - vin;
        }
      }
      // ceiling
      const cyy = fl(y + r);
      if (solid(cx, cyy, cz) && !solid(cx, cyy - 1, cz)) {
        const bot = cyy - r;
        if (y > bot) { const vin = y - q[o + 1]; y = bot; q[o + 1] = vin > 0 ? y + vin * E : y - vin; }
      }
      const cy = fl(y);
      // walls
      let w = fl(x - r);
      if (solid(w, cy, cz) && !solid(w + 1, cy, cz) && x < w + 1 + r) { const vin = x - q[o]; x = w + 1 + r; q[o] = vin < 0 ? x + vin * E : x - vin; g = g || 2; }
      w = fl(x + r);
      if (solid(w, cy, cz) && !solid(w - 1, cy, cz) && x > w - r) { const vin = x - q[o]; x = w - r; q[o] = vin > 0 ? x + vin * E : x - vin; g = g || 2; }
      const cx2 = fl(x);
      w = fl(z - r);
      if (solid(cx2, cy, w) && !solid(cx2, cy, w + 1) && z < w + 1 + r) { const vin = z - q[o + 2]; z = w + 1 + r; q[o + 2] = vin < 0 ? z + vin * E : z - vin; g = g || 2; }
      w = fl(z + r);
      if (solid(cx2, cy, w) && !solid(cx2, cy, w - 1) && z > w - r) { const vin = z - q[o + 2]; z = w - r; q[o + 2] = vin > 0 ? z + vin * E : z - vin; g = g || 2; }
      p[o] = x; p[o + 1] = y; p[o + 2] = z;
      if (final) this.grounded[i] = g;
    }
  }

  /** Rebuild root-space bone matrices into body.bones from the particles. */
  writeBones(rootMatrix) {
    const p = this.pos, s = this.s;
    const inv = this._inv.copy(rootMatrix).invert();
    const T = this._torsoFrame();
    const bones = this.body.bones;
    const m = this._m;
    const X = [T[3], T[4], T[5]], Y = [T[6], T[7], T[8]], Z = [T[9], T[10], T[11]];
    const setBone = (bi, ox, oy, oz, xx, xy, xz, yx, yy, yz, zx, zy, zz) => {
      const e = m.elements;
      e[0] = xx * s; e[1] = xy * s; e[2] = xz * s; e[3] = 0;
      e[4] = yx * s; e[5] = yy * s; e[6] = yz * s; e[7] = 0;
      e[8] = zx * s; e[9] = zy * s; e[10] = zz * s; e[11] = 0;
      e[12] = ox; e[13] = oy; e[14] = oz; e[15] = 1;
      m.premultiply(inv);
      m.toArray(bones, bi * 16);
    };
    // torso
    setBone(BONE.torso, T[0], T[1], T[2], X[0], X[1], X[2], Y[0], Y[1], Y[2], Z[0], Z[1], Z[2]);
    // head: from neck to head particle, twist around its axis
    const limb = (bi, a, b, refX, refZ, offY = 0, twist = 0) => {
      const ao = a * 3, bo = b * 3;
      // y axis points from b to a for limbs (limb hangs along -Y), from a to b for the head
      let yx = p[ao] - p[bo], yy = p[ao + 1] - p[bo + 1], yz = p[ao + 2] - p[bo + 2];
      let l = Math.hypot(yx, yy, yz) || 1e-6; yx /= l; yy /= l; yz /= l;
      let xx = refX[0], xy = refX[1], xz = refX[2];
      let dd = xx * yx + xy * yy + xz * yz;
      if (Math.abs(dd) > 0.95) { xx = refZ[0]; xy = refZ[1]; xz = refZ[2]; dd = xx * yx + xy * yy + xz * yz; }
      xx -= yx * dd; xy -= yy * dd; xz -= yz * dd;
      l = Math.hypot(xx, xy, xz) || 1e-6; xx /= l; xy /= l; xz /= l;
      let zx = xy * yz - xz * yy, zy = xz * yx - xx * yz, zz = xx * yy - xy * yx;
      if (twist) {
        const c = Math.cos(twist), sn = Math.sin(twist);
        const nxx = xx * c - zx * sn, nxy = xy * c - zy * sn, nxz = xz * c - zz * sn;
        const nzx = xx * sn + zx * c, nzy = xy * sn + zy * c, nzz = xz * sn + zz * c;
        xx = nxx; xy = nxy; xz = nxz; zx = nzx; zy = nzy; zz = nzz;
      }
      const ox = (offY ? p[bo] : p[ao]), oy = (offY ? p[bo + 1] : p[ao + 1]), oz = (offY ? p[bo + 2] : p[ao + 2]);
      setBone(bi, ox, oy, oz, xx, xy, xz, yx, yy, yz, zx, zy, zz);
      return [xx, xy, xz, yx, yy, yz, zx, zy, zz];
    };
    // head: y from neck to head; origin at neck
    if (this.active[P.head]) {
      const hb = limb(BONE.head, P.head, P.neck, X, Z, 1, this.headTwist);
      // jaw: hinge offset in head space + rotation
      const J = this.body.joints.jaw;
      const jo = [p[P.neck * 3], p[P.neck * 3 + 1], p[P.neck * 3 + 2]];
      const sc = PX * s;
      const ox = jo[0] + (hb[0] * J[0] + hb[3] * J[1] + hb[6] * J[2]) * sc;
      const oy = jo[1] + (hb[1] * J[0] + hb[4] * J[1] + hb[7] * J[2]) * sc;
      const oz = jo[2] + (hb[2] * J[0] + hb[5] * J[1] + hb[8] * J[2]) * sc;
      const c = Math.cos(this.jawOpen), sn = Math.sin(this.jawOpen);
      // rotate head basis around its X by jawOpen
      const yx = hb[3] * c + hb[6] * sn, yy = hb[4] * c + hb[7] * sn, yz = hb[5] * c + hb[8] * sn;
      const zx = -hb[3] * sn + hb[6] * c, zy = -hb[4] * sn + hb[7] * c, zz = -hb[5] * sn + hb[8] * c;
      setBone(BONE.jaw, ox, oy, oz, hb[0], hb[1], hb[2], yx, yy, yz, zx, zy, zz);
    }
    const arm = (sh, el, ha, bu, bl) => {
      if (!this.active[el]) { // whole arm gone: keep the stump following the torso
        setBone(bu, p[sh * 3], p[sh * 3 + 1], p[sh * 3 + 2], X[0], X[1], X[2], Y[0], Y[1], Y[2], Z[0], Z[1], Z[2]);
        return;
      }
      const ub = limb(bu, sh, el, X, Z);
      if (this.active[ha]) limb(bl, el, ha, [ub[0], ub[1], ub[2]], [ub[6], ub[7], ub[8]]);
    };
    arm(P.shR, P.elR, P.haR, BONE.armUR, BONE.armLR);
    arm(P.shL, P.elL, P.haL, BONE.armUL, BONE.armLL);
    arm(P.hipR, P.knR, P.ftR, BONE.legUR, BONE.legLR);
    arm(P.hipL, P.knL, P.ftL, BONE.legUL, BONE.legLL);
  }

  /** world position of the pelvis */
  pelvis(out) {
    const p = this.pos;
    return out.set((p[P.hipR * 3] + p[P.hipL * 3]) / 2, (p[P.hipR * 3 + 1] + p[P.hipL * 3 + 1]) / 2, (p[P.hipR * 3 + 2] + p[P.hipL * 3 + 2]) / 2);
  }
}

function impulseWeights(part) {
  const w = new Float32Array(NP).fill(0.1);
  const set = (ids, v) => { for (const i of ids) w[i] = v; };
  switch (part) {
    case 'head':
      w[P.head] = 1; w[P.neck] = 0.55; set([P.chest, P.back, P.shR, P.shL], 0.3); set([P.elR, P.elL], 0.2);
      break;
    case 'armR': w[P.haR] = 1; w[P.elR] = 0.9; w[P.shR] = 0.5; set([P.chest, P.back, P.neck], 0.3); break;
    case 'armL': w[P.haL] = 1; w[P.elL] = 0.9; w[P.shL] = 0.5; set([P.chest, P.back, P.neck], 0.3); break;
    case 'legR': w[P.ftR] = 1; w[P.knR] = 1; w[P.hipR] = 0.5; set([P.hipL], 0.3); break;
    case 'legL': w[P.ftL] = 1; w[P.knL] = 1; w[P.hipL] = 0.5; set([P.hipR], 0.3); break;
    default:
      set([P.chest, P.back, P.neck, P.shR, P.shL], 0.9); set([P.hipR, P.hipL], 0.6); w[P.head] = 0.6;
      set([P.elR, P.elL], 0.45); set([P.haR, P.haL], 0.3); set([P.knR, P.knL], 0.25); set([P.ftR, P.ftL], 0.12);
  }
  return w;
}
