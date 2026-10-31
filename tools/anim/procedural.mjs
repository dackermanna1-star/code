// Procedural clips, authored on the ragdoll skeleton: crawl (prone, arms pull, legs drag - also
// what a zombie with broken legs falls back to), climb (up a tower leg / ladder: facing it, hands and
// feet alternating), limpR / limpL (a walk with a stiff, dragged leg). Each returns root-relative
// poses at 30 fps like the retargeted clips; extract.mjs clamps, analyses and bakes them.
import { SK, N, newPose, clonePose, getQ, setQ, poseFK, at, clampPose } from './target.mjs';
import { qmul, qconj, qrot, vnorm, vsub, vadd, vscale, vcross, vdot } from './rig.mjs';
import { axisAngle, armIK, legIK, rotJoint, aimLimb, slerpQ } from './edit.mjs';
import { boneRot } from './retarget.mjs';
import { liftOutOfGround, sole, equalizeStance } from './analyze.mjs';

const I = SK.index;
const TAU = Math.PI * 2;
const rx = (a) => axisAngle([1, 0, 0], a);
const ry = (a) => axisAngle([0, 1, 0], a);
const rz = (a) => axisAngle([0, 0, 1], a);
const mul = (...qs) => qs.reduce((a, b) => qmul(a, b));
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Pose from a pelvis transform and local (parent-relative) rotations: R_child = R_parent * L_child.
 * local: { segName: quat }, missing segments keep their parent's rotation (bind-relative identity).
 */
function localPose(pelvisPos, pelvisRot, local = {}) {
  const pose = newPose();
  for (let i = 0; i < N; i++) {
    const p = SK.parent[i];
    const L = local[SK.names[i]] || [0, 0, 0, 1];
    setQ(pose, i, p < 0 ? pelvisRot.slice() : qmul(getQ(pose, p), L));
  }
  pose.pelvis = pelvisPos.slice();
  return pose;
}

/** Mirror a pose across the sagittal plane (left <-> right). */
export function mirrorPose(pose) {
  const out = clonePose(pose);
  for (let i = 0; i < N; i++) {
    const q = getQ(pose, SK.mirror[i]);
    setQ(out, i, [q[0], -q[1], -q[2], q[3]]);
  }
  out.pelvis = [-pose.pelvis[0], pose.pelvis[1], pose.pelvis[2]];
  return out;
}

/** Hand world rotation with its fingers along `dir` and the thumb toward `thumb`. */
function handRot(side, dir, thumb) {
  const W = SK.J.subarray(I['hand' + side] * 3, I['hand' + side] * 3 + 3);
  const E = SK.J.subarray(I['forearm' + side] * 3, I['forearm' + side] * 3 + 3);
  const f0 = vnorm([W[0] - E[0], W[1] - E[1], W[2] - E[2]]);
  const t0 = vsub([0, 0, 1], vscale(f0, f0[2]));
  return boneRot(f0, t0, vnorm(dir), vnorm(thumb));
}

/** Foot world rotation: toes along `fwd`, sole facing -`up`. */
function footRot(fwd, up) {
  // bind: toes +Z, sole normal +Y -> basis(Y = up, Z = fwd)
  return boneRot([0, 1, 0], [0, 0, 1], vnorm(up), vnorm(fwd));
}

// ------------------------------------------------------------------------------------------------
/** Prone crawl: alternate arm pulls, legs dragging. Speed SPEED m/s at rate 1. */
function crawl() {
  const T = 1.6, F = Math.round(T * 30), SPEED = 0.42;
  const poses = [];
  const zFront = 0.84, stanceFrac = 0.62;
  const reachLen = SPEED * T * stanceFrac;
  for (let f = 0; f < F; f++) {
    const u = f / F;
    const pull = Math.sin(u * TAU * 2); // + while a pull is on
    const lr = Math.sin(u * TAU); // which side pulls (+ left)
    const pelvisRot = mul(ry(0.07 * lr), rz(-0.1 * lr), rx(Math.PI / 2 - 0.04));
    const local = {
      abdomen: mul(rx(-0.14), ry(-0.06 * lr)),
      chest: mul(rx(-0.2), ry(-0.1 * lr), rz(0.05 * lr)),
      neck: rx(-0.42),
      head: mul(rx(-0.32 + 0.06 * pull), rz(0.12 + 0.05 * lr)),
      // legs dragging: apart, turned out, knees soft, toes pointed; the left one pushes weakly
      thighL: mul(ry(-0.3), rz(0.16), rx(0.06)),
      thighR: mul(ry(0.32), rz(-0.2), rx(-0.05)),
      shinL: rx(0.3 + 0.22 * Math.max(0, Math.sin(u * TAU + 1.2))),
      shinR: rx(0.42 + 0.08 * Math.sin(u * TAU)),
      footL: rx(0.55),
      footR: rx(0.45),
    };
    const pose = localPose([0.03 * lr, 0.122 + 0.012 * Math.max(0, pull), 0.035 * Math.sin(u * TAU * 2 - 0.6)], pelvisRot, local);
    // arms: each hand plants ahead and pulls back at the crawl speed, then reaches again
    for (const [side, off] of [['L', 0], ['R', 0.5]]) {
      const ph = (u + off) % 1;
      const sx = side === 'L' ? 1 : -1;
      let z, y;
      if (ph < stanceFrac) {
        z = zFront - reachLen * (ph / stanceFrac);
        y = 0.07;
      } else {
        const s = (ph - stanceFrac) / (1 - stanceFrac);
        z = lerp(zFront - reachLen, zFront, smooth(s));
        y = 0.07 + 0.15 * Math.sin(Math.PI * s);
      }
      const x = sx * (0.25 - 0.03 * Math.sin(Math.PI * Math.min(1, ph / stanceFrac)));
      // hand flat on the ground while it pulls, clawing forward while it reaches: blended across
      // the plant and the lift so the wrist never snaps
      const flat = handRot(side, [0.0, -0.25, 1], [-sx, 0, 0]), claw = handRot(side, [0, -0.6, 1], [-sx, 0.3, 0]);
      const k = ph < stanceFrac ? smooth(1 - Math.min(ph / 0.12, 1)) * 0.5 + smooth((ph - (stanceFrac - 0.1)) / 0.1) * 0.5
        : 0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, (ph - stanceFrac) / (1 - stanceFrac)));
      const hand = slerpQ(flat, claw, Math.min(1, k));
      armIK(pose, side, [x, y, z], [sx * 0.9, 0.55, -0.2], hand);
    }
    poses.push(pose);
  }
  // keep it resting on the ground, not in it
  for (const p of poses) clampPose(p);
  liftOutOfGround(poses, 0.004, 2);
  return { poses, loop: true, ground: false, speed: SPEED, info: { extra: { prone: true } } };
}

// ------------------------------------------------------------------------------------------------
/**
 * Climbing a tower leg / ladder, facing it (+Z). Root = the point on the leg's near face at the
 * feet's height; hands and feet grip at z ~ 0; the body hangs ~0.3 m back. Vertical SPEED at rate 1.
 */
function climb() {
  const T = 1.4, F = Math.round(T * 30), SPEED = 0.55;
  const stanceFrac = 0.6;
  const step = SPEED * T * stanceFrac; // how far a gripping hand / foot travels down per stance
  const poses = [];
  for (let f = 0; f < F; f++) {
    const u = f / F;
    const lr = Math.sin(u * TAU);
    const pelvisRot = mul(ry(0.06 * lr), rz(0.05 * lr), rx(0.22));
    const local = {
      abdomen: rx(0.1),
      chest: mul(rx(0.06), rz(-0.06 * lr)),
      neck: rx(-0.3),
      head: mul(rx(-0.28), rz(0.1 * lr)),
      // knees out to the sides (frog legs round the leg)
      thighL: mul(rz(0.35), ry(-0.45)),
      thighR: mul(rz(-0.35), ry(0.45)),
    };
    const pose = localPose([0.025 * lr, 0.82 + 0.03 * Math.cos(u * TAU * 2), -0.33], pelvisRot, local);
    // diagonal pairs: right hand with left foot, left hand with right foot
    const limb = (ph) => {
      if (ph < stanceFrac) return { k: ph / stanceFrac, planted: true };
      return { k: (ph - stanceFrac) / (1 - stanceFrac), planted: false };
    };
    for (const [side, off] of [['L', 0], ['R', 0.5]]) {
      const sx = side === 'L' ? 1 : -1;
      // hand
      const h = limb((u + off) % 1);
      let hy, hz = -0.04;
      if (h.planted) hy = 1.78 - step * h.k;
      else {
        hy = lerp(1.78 - step, 1.78, smooth(h.k));
        hz -= 0.12 * Math.sin(Math.PI * h.k);
      }
      const hand = handRot(side, [0, 1, 0.15], [-sx, 0, 0]);
      armIK(pose, side, [sx * 0.15, hy, hz], [sx * 0.8, -0.5, -0.4], hand);
      // foot of the other side, half a cycle later
      const fo = limb((u + off + 0.5) % 1);
      const fs = side === 'L' ? 'R' : 'L';
      const fx = fs === 'L' ? 0.14 : -0.14;
      let fy, fz = -0.11;
      if (fo.planted) fy = 0.42 - step * fo.k;
      else {
        fy = lerp(0.42 - step, 0.42, smooth(fo.k));
        fz -= 0.1 * Math.sin(Math.PI * fo.k);
      }
      // knee out to the side and forward; the sole on the brace
      legIK(pose, fs, [fx + 0.0, fy + 0.085, fz], footRot([0, -0.1, 1], [0, 1, 0.08]));
    }
    poses.push(pose);
  }
  for (const p of poses) clampPose(p);
  return { poses, loop: true, ground: false, speed: SPEED, info: { extra: { vertical: true } } };
}

// ------------------------------------------------------------------------------------------------
/**
 * Limp on a stiff, dragged right leg, from the human walk: the bad leg's stance is cut short, its
 * knee barely bends, it swings out round the hip with the toes scraping; the pelvis hikes on that
 * side and the trunk lurches over the good leg. limpL is the mirror image.
 */
function limpR({ clips }) {
  const src = clips.walk2.raw; // retargeted, unstyled human walk (left heel strike at 0)
  const Fs = src.length;
  const T = 1.5, F = Math.round(T * 30);
  // time warp: the good (left) stance half takes 62% of the cycle, the bad one 38%
  const warp = (u) => (u < 0.62 ? (u / 0.62) * 0.5 : 0.5 + ((u - 0.62) / 0.38) * 0.5);
  const sample = (s) => {
    const x = s * Fs;
    const i0 = Math.floor(x) % Fs, i1 = (i0 + 1) % Fs, t = x - Math.floor(x);
    const a = src[i0], b = src[i1];
    const p = clonePose(a);
    for (let i = 0; i < N; i++) setQ(p, i, slerpQ(getQ(a, i), getQ(b, i), t));
    p.pelvis = a.pelvis.map((v, c) => v + (b.pelvis[c] - v) * t);
    return p;
  };
  const poses = [];
  for (let f = 0; f < F; f++) {
    const u = f / F;
    const s = warp(u);
    const pose = sample(s);
    // right leg phase: stance roughly s in [0.5, 1.0), swing s in [0.05, 0.5)
    const swing = s > 0.06 && s < 0.48 ? Math.sin(Math.PI * (s - 0.06) / 0.42) : 0;
    const stanceR = s >= 0.5 ? Math.sin(Math.PI * (s - 0.5) / 0.5) : 0;
    // stiff knee: keep only a little of the flexion
    const fkr = poseFK(pose);
    const th = getQ(pose, I.thighR), sh = getQ(pose, I.shinR);
    const rel = qmul(qconj(th), sh);
    const kAx = SK.legs.R.kAxis;
    const flex = 2 * Math.atan2(rel[0] * kAx[0] + rel[1] * kAx[1] + rel[2] * kAx[2], rel[3]);
    const keep = 0.06 + 0.45 * swing;
    if (flex > keep) {
      const ax = qrot(th, kAx);
      const q = axisAngle(ax, keep - flex);
      for (const n of ['shinR', 'footR']) setQ(pose, I[n], qmul(q, getQ(pose, I[n])));
    }
    void fkr;
    // circumduction: the stiff leg swings out round the hip; toes pointed down to scrape
    rotJoint(pose, 'thighR', [0, 0, 1], -0.22 * swing);
    rotJoint(pose, 'footR', [1, 0, 0], 0.15 * swing);
    // pelvis hikes on the bad side while it swings (the pelvis alone: legs and trunk keep their
    // orientation), the trunk lurches over the good leg
    setQ(pose, I.pelvis, qmul(rz(-0.14 * swing), getQ(pose, I.pelvis)));
    rotJoint(pose, 'abdomen', [0, 0, 1], -0.1 * swing + 0.08 * stanceR);
    rotJoint(pose, 'chest', [0, 0, 1], -0.06 * swing + 0.06 * stanceR);
    rotJoint(pose, 'abdomen', [1, 0, 0], 0.16);
    rotJoint(pose, 'chest', [1, 0, 0], 0.14);
    // zombie: head hanging to the bad side, the good arm reaching, the bad-side arm limp
    rotJoint(pose, 'neck', [1, 0, 0], 0.2);
    rotJoint(pose, 'neck', [0, 0, 1], -0.22 + 0.06 * Math.sin(u * TAU * 2));
    const chest = getQ(pose, I.chest);
    aimLimb(pose, 'upperArmL', qrot(chest, vnorm([0.15, -0.45, 0.88])), 0.75);
    aimLimb(pose, 'upperArmR', qrot(chest, vnorm([-0.12, -0.97, 0.15 + 0.1 * Math.sin(u * TAU)])), 0.7);
    rotJoint(pose, 'handL', [1, 0, 0], 0.5);
    rotJoint(pose, 'handR', [1, 0, 0], 0.3);
    poses.push(pose);
  }
  // ground clearance for the dragged leg while it swings: raise the pelvis where it would dig in
  for (const p of poses) clampPose(p);
  const need = poses.map((p, f) => {
    const s = warp(f / F);
    return s > 0.06 && s < 0.48 ? Math.max(0, 0.012 - sole(p, poseFK(p), 'R').h) : 0;
  });
  const sm = need.map((_, i) => {
    let m = 0;
    for (let k = -3; k <= 3; k++) m = Math.max(m, need[(i + k + F) % F] * (1 - Math.abs(k) / 4));
    return m;
  });
  poses.forEach((p, i) => (p.pelvis[1] += sm[i]));
  // the warp gives the two stances different speeds: one ground speed for both
  equalizeStance(poses, 30, (i) => {
    const s = warp(i / F);
    return s <= 0.06 || (s >= 0.5 && s < 0.6) ? 'LR' : s < 0.5 ? 'L' : 'R';
  });
  return { poses, loop: true, ground: true };
}

export const PROCEDURAL = {
  crawl,
  climb,
  limpR,
  limpL: (ctx) => {
    const r = limpR(ctx);
    return { ...r, poses: r.poses.map(mirrorPose) };
  },
};

export { vadd, vcross, vdot, at };
