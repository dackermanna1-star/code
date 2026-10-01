// Skeletal rig: pose description -> joint positions (2-bone IK for limbs),
// pose interpolation/animation sampling, secondary motion (hair/cloth springs)
// and a facing-space -> screen-space transform used by the character painters.
//
// Pose conventions (facing space): +x = toward the opponent, +y = up,
// origin = point on the ground under the fighter.
//   hip:[x,y]   hip joint position
//   lean        torso lean (deg, + forward), bend: chest bend relative to abdomen
//   head        head tilt (deg, + = chin down / looking forward-down)
//   nh, fh      near/far hand target relative to its shoulder
//   nf, ff      near/far ankle target (y = 0 means planted on the ground)
//   ne, fe      elbow direction (+1 natural, -1 inverted)
//   nk, fk      knee direction (+1 forward, -1 backward)
//   nhs, fhs    hand shape: fist | open | claw | point | sign | chop | grip
//   nfa, ffa    explicit foot angle (deg, 0 = toes forward, -90 = pointed down)
//   rot         whole body rotation (deg, + = forward roll), sx/sy squash
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const U = JJK.U;
  const D2R = Math.PI / 180;

  const Rig = (JJK.Rig = {});

  Rig.DIMS = {
    abd: 20, chest: 25, neck: 6, headR: 10.5,
    ua: 24, fa: 21,
    thigh: 34, shin: 33, ankle: 5,
    shN: -5, shF: 5, shDrop: 3,
    hipN: -3, hipF: 3,
    foot: 12,
  };

  const NUM_FIELDS = ['lean', 'bend', 'head', 'rot', 'sx', 'sy', 'nha', 'fha', 'nfa', 'ffa', 'ne', 'fe', 'nk', 'fk', 'jaw', 'spread'];
  const VEC_FIELDS = ['hip', 'nh', 'fh', 'nf', 'ff'];
  const STR_FIELDS = ['nhs', 'fhs', 'face', 'eyes'];
  const DEFAULTS = {
    hip: [0, 68], lean: 0, bend: 0, head: 0, rot: 0, sx: 1, sy: 1,
    nh: [0, -40], fh: [0, -40], nf: [-12, 0], ff: [12, 0],
    ne: 1, fe: 1, nk: 1, fk: 1, nha: 0, fha: 0, nfa: NaN, ffa: NaN, jaw: 0, spread: 0,
    nhs: 'fist', fhs: 'fist', face: 'calm', eyes: 'band',
  };
  Rig.DEFAULTS = DEFAULTS;

  Rig.full = function (p) {
    const o = {};
    for (const k in DEFAULTS) o[k] = p[k] !== undefined ? p[k] : DEFAULTS[k];
    return o;
  };

  Rig.lerpPose = function (a, b, t, out) {
    out = out || {};
    for (let i = 0; i < VEC_FIELDS.length; i++) {
      const k = VEC_FIELDS[i];
      const va = a[k] !== undefined ? a[k] : DEFAULTS[k];
      const vb = b[k] !== undefined ? b[k] : DEFAULTS[k];
      out[k] = [va[0] + (vb[0] - va[0]) * t, va[1] + (vb[1] - va[1]) * t];
    }
    for (let i = 0; i < NUM_FIELDS.length; i++) {
      const k = NUM_FIELDS[i];
      let va = a[k] !== undefined ? a[k] : DEFAULTS[k];
      let vb = b[k] !== undefined ? b[k] : DEFAULTS[k];
      if (Number.isNaN(va) && Number.isNaN(vb)) out[k] = NaN;
      else if (Number.isNaN(va)) out[k] = t < 0.5 ? NaN : vb;
      else if (Number.isNaN(vb)) out[k] = t < 0.5 ? va : NaN;
      else out[k] = va + (vb - va) * t;
    }
    for (let i = 0; i < STR_FIELDS.length; i++) {
      const k = STR_FIELDS[i];
      const va = a[k] !== undefined ? a[k] : DEFAULTS[k];
      const vb = b[k] !== undefined ? b[k] : DEFAULTS[k];
      out[k] = t < 0.5 ? va : vb;
    }
    // pass-through extras (non-interpolated flags)
    if (b.fx !== undefined || a.fx !== undefined) out.fx = t < 0.5 ? a.fx : b.fx;
    return out;
  };

  // anim: { keys: [[frame, pose, ease?], ...], loop?: bool }
  // ease applies to the segment arriving at that key.
  Rig.sample = function (anim, frame, lib) {
    const keys = anim.keys;
    const resolve = (p) => (typeof p === 'string' ? lib[p] : p);
    if (keys.length === 1) return Rig.full(resolve(keys[0][1]));
    let f = frame;
    const len = anim.len || keys[keys.length - 1][0];
    if (anim.loop) f = U.wrap(frame, len);
    if (f <= keys[0][0]) return Rig.full(resolve(keys[0][1]));
    for (let i = 0; i < keys.length - 1; i++) {
      const k0 = keys[i], k1 = keys[i + 1];
      if (f >= k0[0] && f < k1[0]) {
        let t = (f - k0[0]) / (k1[0] - k0[0]);
        const e = U.ease[k1[2] || 'inOut'] || U.ease.inOut;
        return Rig.lerpPose(resolve(k0[1]), resolve(k1[1]), e(t));
      }
    }
    // after last key: loop back to first if looping
    if (anim.loop) {
      const k0 = keys[keys.length - 1];
      const k1 = keys[0];
      const t = (f - k0[0]) / Math.max(1, len - k0[0]);
      return Rig.lerpPose(resolve(k0[1]), resolve(k1[1]), U.ease[k1[2] || 'inOut'](U.clamp(t, 0, 1)));
    }
    return Rig.full(resolve(keys[keys.length - 1][1]));
  };

  // 2-bone IK in a y-up plane. bend: +1 => rotate root angle clockwise (elbows down/back),
  // -1 => counter-clockwise (knees forward use +1 via caller convention).
  function ik(sx, sy, tx, ty, l1, l2, bend, out) {
    let dx = tx - sx, dy = ty - sy;
    let d = Math.hypot(dx, dy);
    const maxR = l1 + l2 - 0.01;
    const minR = Math.abs(l1 - l2) + 0.5;
    if (d < 0.0001) { dx = 0; dy = -1; d = minR; }
    const dc = U.clamp(d, minR, maxR);
    const base = Math.atan2(dy, dx);
    const cosA = U.clamp((l1 * l1 + dc * dc - l2 * l2) / (2 * l1 * dc), -1, 1);
    const a = Math.acos(cosA);
    const ang = base - a * bend;
    const ex = sx + Math.cos(ang) * l1, ey = sy + Math.sin(ang) * l1;
    // end point: along the line from elbow toward target, at l2
    const fx = tx - ex, fy = ty - ey;
    const fl = Math.hypot(fx, fy) || 1;
    out[0] = ex; out[1] = ey;
    out[2] = ex + (fx / fl) * l2; out[3] = ey + (fy / fl) * l2;
    return out;
  }
  Rig.ik = ik;

  // Solve joints in facing space. Returns object with [x,y] points and angles.
  Rig.solve = function (p, d, extra) {
    d = d || Rig.DIMS;
    const J = {};
    const lean = (p.lean || 0) * D2R;
    const bend = (p.bend || 0) * D2R;
    const hx = p.hip[0], hy = p.hip[1];
    const sl = Math.sin(lean), cl = Math.cos(lean);
    J.hip = [hx, hy];
    J.waist = [hx + sl * d.abd, hy + cl * d.abd];
    const ca = lean + bend;
    const sc = Math.sin(ca), cc = Math.cos(ca);
    J.chestAng = ca;
    J.chest = [J.waist[0] + sc * d.chest, J.waist[1] + cc * d.chest];
    // forward axis of the chest (perpendicular to spine)
    const fx = cc, fy = -sc;
    J.fwd = [fx, fy];
    const headTilt = (p.head || 0) * D2R;
    const ha = ca * 0.6 + headTilt * 0.35;
    J.neck = [J.chest[0] + sc * 2, J.chest[1] + cc * 2];
    J.headAng = ca + headTilt;
    J.head = [J.neck[0] + Math.sin(ha) * (d.neck + d.headR * 0.75), J.neck[1] + Math.cos(ha) * (d.neck + d.headR * 0.75)];
    // shoulders
    J.shN = [J.chest[0] + fx * d.shN - sc * d.shDrop, J.chest[1] + fy * d.shN - cc * d.shDrop];
    J.shF = [J.chest[0] + fx * d.shF - sc * d.shDrop, J.chest[1] + fy * d.shF - cc * d.shDrop];
    const tmp = [0, 0, 0, 0];
    // arms (targets relative to shoulders)
    ik(J.shN[0], J.shN[1], J.shN[0] + p.nh[0], J.shN[1] + p.nh[1], d.ua, d.fa, p.ne || 1, tmp);
    J.elN = [tmp[0], tmp[1]];
    J.haN = [tmp[2], tmp[3]];
    ik(J.shF[0], J.shF[1], J.shF[0] + p.fh[0], J.shF[1] + p.fh[1], d.ua, d.fa, p.fe || 1, tmp);
    J.elF = [tmp[0], tmp[1]];
    J.haF = [tmp[2], tmp[3]];
    // hips
    const hfx = cl, hfy = -sl;
    J.hpN = [hx + hfx * d.hipN, hy + hfy * d.hipN];
    J.hpF = [hx + hfx * d.hipF, hy + hfy * d.hipF];
    // legs (knee forward => counter-clockwise => bend -1 in ik convention)
    ik(J.hpN[0], J.hpN[1], p.nf[0], p.nf[1] + d.ankle, d.thigh, d.shin, -(p.nk || 1), tmp);
    J.knN = [tmp[0], tmp[1]];
    J.anN = [tmp[2], tmp[3]];
    ik(J.hpF[0], J.hpF[1], p.ff[0], p.ff[1] + d.ankle, d.thigh, d.shin, -(p.fk || 1), tmp);
    J.knF = [tmp[0], tmp[1]];
    J.anF = [tmp[2], tmp[3]];
    // feet
    const footAng = (an, kn, fy, override) => {
      if (!Number.isNaN(override) && override !== undefined) return override * D2R;
      if (an[1] - d.ankle < 3) return 0; // planted
      const sa = Math.atan2(an[1] - kn[1], an[0] - kn[0]); // shin direction
      return sa + Math.PI / 2 + 0.55; // pointed toes
    };
    J.ftNA = footAng(J.anN, J.knN, p.nf[1], p.nfa);
    J.ftFA = footAng(J.anF, J.knF, p.ff[1], p.ffa);
    J.toeN = [J.anN[0] + Math.cos(J.ftNA) * d.foot, J.anN[1] + Math.sin(J.ftNA) * d.foot - (J.ftNA === 0 ? d.ankle * 0.9 : 0)];
    J.toeF = [J.anF[0] + Math.cos(J.ftFA) * d.foot, J.anF[1] + Math.sin(J.ftFA) * d.foot - (J.ftFA === 0 ? d.ankle * 0.9 : 0)];
    // hand angles: along forearm + offset
    J.hnA = Math.atan2(J.haN[1] - J.elN[1], J.haN[0] - J.elN[0]) + (p.nha || 0) * D2R;
    J.hfA = Math.atan2(J.haF[1] - J.elF[1], J.haF[0] - J.elF[0]) + (p.fha || 0) * D2R;
    return J;
  };

  // Body-local transform: facing space (y up) -> screen space (y down).
  class Xform {
    constructor() {
      this.ox = 0; this.oy = 0; this.f = 1; this.z = 1;
      this.rot = 0; this.px = 0; this.py = 60; // rotation pivot in facing space
      this.sx = 1; this.sy = 1;
      this.cr = 1; this.sr = 0;
    }
    set(ox, oy, f, z, rotDeg, pivot, sx, sy) {
      this.ox = ox; this.oy = oy; this.f = f; this.z = z;
      this.rot = rotDeg * D2R;
      this.cr = Math.cos(-this.rot); this.sr = Math.sin(-this.rot);
      if (pivot) { this.px = pivot[0]; this.py = pivot[1]; }
      this.sx = sx; this.sy = sy;
      return this;
    }
    // facing-space point -> screen
    x(px, py) {
      let x = px * this.sx, y = py * this.sy;
      if (this.rot) {
        const dx = x - this.px, dy = y - this.py;
        x = this.px + dx * this.cr - dy * this.sr;
        y = this.py + dx * this.sr + dy * this.cr;
      }
      return this.ox + this.f * x * this.z;
    }
    y(px, py) {
      let x = px * this.sx, y = py * this.sy;
      if (this.rot) {
        const dx = x - this.px, dy = y - this.py;
        y = this.py + dx * this.sr + dy * this.cr;
      }
      return this.oy - y * this.z;
    }
    p(pt) { return [this.x(pt[0], pt[1]), this.y(pt[0], pt[1])]; }
    // local offset (u forward, v up) from a facing-space base point rotated by angle (rad, facing space, ccw from +x)
    lp(base, ang, u, v) {
      const c = Math.cos(ang), s = Math.sin(ang);
      return this.p([base[0] + u * c - v * s, base[1] + u * s + v * c]);
    }
    // facing-space angle -> screen-space angle
    ang(a) { return this.f > 0 ? -(a - this.rot) : -(Math.PI - a + this.rot); }
  }
  Rig.Xform = Xform;

  // Painter helpers that map facing-space geometry through a transform.
  Rig.painter = function (r, xf) {
    const z = xf.z;
    return {
      r, xf, z,
      limb(A, B, prof, mat, g, sideSign = 1, capA = true, capB = true) {
        const a = xf.p(A), b = xf.p(B);
        const sp = prof.map((q) => [q[0], q[1] * z * Math.abs(xf.sx), q[2] * z * Math.abs(xf.sx)]);
        r.limb(a[0], a[1], b[0], b[1], sp, mat, g, xf.f * sideSign, capA, capB);
      },
      ell(C, rx, ry, ang, mat, g) {
        const c = xf.p(C);
        r.ellipse(c[0], c[1], rx * z, ry * z, xf.ang(ang), mat, g);
      },
      // polygon from facing-space points (flat array or array of pairs)
      poly(pts, mat, g, shading) {
        const out = [];
        for (let i = 0; i < pts.length; i++) {
          const q = pts[i];
          out.push(xf.x(q[0], q[1]), xf.y(q[0], q[1]));
        }
        if (shading && shading.sphere) {
          const c = xf.p(shading.sphere);
          shading = { sphere: [c[0], c[1], shading.sphere[2] * z] };
        }
        r.poly(out, mat, g, shading);
      },
      line(A, B, col, g, w = 1, onlyOver = false) {
        const a = xf.p(A), b = xf.p(B);
        r.line(a[0], a[1], b[0], b[1], col, g, Math.max(1, Math.round(w * z * 0.6)), onlyOver);
      },
      dot(A, col, g, onlyOver = false) {
        const a = xf.p(A);
        const s = Math.max(1, Math.round(z * 0.6));
        for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) r.dot(a[0] + i, a[1] + j, col, g, onlyOver);
      },
      // head-local helper: point at (u,v) around a center with rotation (facing-space rad)
      loc(C, ang, u, v) {
        const c = Math.cos(ang), s = Math.sin(ang);
        return [C[0] + u * c - v * s, C[1] + u * s + v * c];
      },
    };
  };

  // Secondary motion: spring-driven offsets for hair and cloth.
  class Secondary {
    constructor() {
      this.hx = 0; this.hy = 0; this.hvx = 0; this.hvy = 0; // hair offset
      this.prevHead = null;
      this.cloth = [[0, 0], [0, 0], [0, 0]]; // tail chain offsets
      this.clothV = [[0, 0], [0, 0], [0, 0]];
      this.prevWaist = null;
      this.t = 0;
      this.wind = [0, 0];
    }
    update(J, worldX, worldY, facing) {
      this.t++;
      const head = [worldX + J.head[0] * facing, worldY + J.head[1]];
      if (this.prevHead) {
        const vx = (head[0] - this.prevHead[0]) * facing, vy = head[1] - this.prevHead[1];
        // target offset opposite to velocity + wind (facing space)
        const tx = U.clamp(-vx * 0.9, -7, 7) + this.wind[0];
        const ty = U.clamp(-vy * 0.7, -6, 6) + this.wind[1];
        this.hvx += (tx - this.hx) * 0.22; this.hvy += (ty - this.hy) * 0.22;
        this.hvx *= 0.72; this.hvy *= 0.72;
        this.hx += this.hvx; this.hy += this.hvy;
      }
      this.prevHead = head;
      const waist = [worldX + J.waist[0] * facing, worldY + J.waist[1]];
      if (this.prevWaist) {
        const vx = (waist[0] - this.prevWaist[0]) * facing, vy = waist[1] - this.prevWaist[1];
        for (let i = 0; i < 3; i++) {
          const k = (i + 1) / 3;
          const tx = U.clamp(-vx * 2.2 * k, -16, 16) + this.wind[0] * k + Math.sin(this.t * 0.11 + i) * 0.8 * k;
          const ty = U.clamp(-vy * 1.6 * k, -12, 12) + this.wind[1] * k;
          const c = this.cloth[i], v = this.clothV[i];
          v[0] += (tx - c[0]) * (0.18 - i * 0.03); v[1] += (ty - c[1]) * (0.18 - i * 0.03);
          v[0] *= 0.78; v[1] *= 0.78;
          c[0] += v[0]; c[1] += v[1];
        }
      }
      this.prevWaist = waist;
    }
    reset() {
      this.hx = this.hy = this.hvx = this.hvy = 0;
      this.prevHead = this.prevWaist = null;
      for (let i = 0; i < 3; i++) { this.cloth[i][0] = this.cloth[i][1] = 0; this.clothV[i][0] = this.clothV[i][1] = 0; }
    }
  }
  Rig.Secondary = Secondary;
})();
