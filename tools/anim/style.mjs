// Zombie styling of the retargeted human clips: per-frame pose edits on top of the motion capture
// (before the joint-limit clamp). u is the cycle phase 0..1 of the frame; steps happen twice a cycle.
import { SK, getQ, poseFK, at } from './target.mjs';
import { rotJoint, aimLimb, boneDir, axisAngle } from './edit.mjs';
import { qrot, qmul, vnorm, vsub, vcross, vscale, vadd } from './rig.mjs';
import { setQ } from './target.mjs';

const I = SK.index;
const TAU = Math.PI * 2;

/** Direction in the chest's frame -> world. */
function chestDir(pose, d) {
  return vnorm(qrot(getQ(pose, I.chest), d));
}

/** Bend the elbow: rotate the forearm (and hand) about the elbow's flexion axis by `ang` (+ = flex). */
function bendElbow(pose, side, ang) {
  const fkr = poseFK(pose);
  const u = vnorm(vsub(at(fkr.J, I['forearm' + side]), at(fkr.J, I['upperArm' + side])));
  // flexion axis of the upper arm: R_upper * cross(bind upper dir, FWD)
  const S = SK.J.subarray(I['upperArm' + side] * 3, I['upperArm' + side] * 3 + 3), E = SK.J.subarray(I['forearm' + side] * 3, I['forearm' + side] * 3 + 3);
  const u0 = vnorm([E[0] - S[0], E[1] - S[1], E[2] - S[2]]);
  const h = vnorm(qrot(getQ(pose, I['upperArm' + side]), vnorm(vcross(u0, [0, 0, 1]))));
  void u;
  const q = axisAngle(h, ang);
  for (const n of ['forearm' + side, 'hand' + side]) setQ(pose, I[n], qmul(q, getQ(pose, I[n])));
}

/** Arms up and reaching: blend each upper arm toward a chest-frame direction, bend the elbows. */
function reach(pose, { dirL, dirR, w = 0.8, elbow = 0.35, droop = 0.5 }) {
  for (const [side, d] of [['L', dirL], ['R', dirR]]) {
    aimLimb(pose, 'upperArm' + side, chestDir(pose, d), w);
    // the forearm follows the upper arm's new direction with a little elbow bend
    const fkr = poseFK(pose);
    const ud = vnorm(vsub(at(fkr.J, I['forearm' + side]), at(fkr.J, I['upperArm' + side])));
    const fd = boneDir(pose, 'forearm' + side, fkr);
    // straighten the forearm toward the upper arm (keeps only `elbow` of bend)
    const cur = Math.acos(Math.max(-1, Math.min(1, ud[0] * fd[0] + ud[1] * fd[1] + ud[2] * fd[2])));
    bendElbow(pose, side, (elbow - cur) * w);
    // hands droop at the wrist (palm down, fingers hanging)
    rotJoint(pose, 'hand' + side, [1, 0, 0], droop * w);
  }
}

function hunch(pose, lumbar, thoracic, neck = 0, head = 0) {
  if (lumbar) rotJoint(pose, 'abdomen', [1, 0, 0], lumbar);
  if (thoracic) rotJoint(pose, 'chest', [1, 0, 0], thoracic);
  if (neck) rotJoint(pose, 'neck', [1, 0, 0], neck);
  if (head) rotJoint(pose, 'head', [1, 0, 0], head);
}

export const STYLES = {
  /** The UAL2 zombie walk is already a zombie: only a little more hang of the head. */
  zombieWalk(pose, u) {
    rotJoint(pose, 'neck', [0, 0, 1], 0.06 * Math.sin(u * TAU * 2));
  },

  /** A normal human walk turned into a shamble: hunched, arms up and reaching, head lolling. */
  shamble(pose, u) {
    const step = Math.sin(u * TAU * 2);
    hunch(pose, 0.14, 0.2, 0.18, -0.12);
    rotJoint(pose, 'chest', [0, 0, 1], 0.07 * Math.sin(u * TAU)); // lurch over the stance leg
    rotJoint(pose, 'neck', [0, 0, 1], 0.16 + 0.08 * step);
    rotJoint(pose, 'head', [0, 0, 1], 0.1 + 0.06 * step);
    const sw = 0.12 * Math.sin(u * TAU);
    reach(pose, {
      dirL: vnorm([0.16, -0.26 + sw, 0.95]), dirR: vnorm([-0.1, -0.42 - sw, 0.9]),
      w: 0.85, elbow: 0.4, droop: 0.6,
    });
  },

  /** Jog -> feral lope: leaning into it, head thrust forward, arms clawing ahead instead of pumping. */
  feralJog(pose, u) {
    hunch(pose, 0.12, 0.2, 0.05, -0.25);
    rotJoint(pose, 'neck', [0, 0, 1], 0.1 * Math.sin(u * TAU));
    const sw = 0.25 * Math.sin(u * TAU);
    reach(pose, {
      dirL: vnorm([0.2, -0.45 + sw, 0.85]), dirR: vnorm([-0.2, -0.45 - sw, 0.85]),
      w: 0.5, elbow: 0.7, droop: -0.3,
    });
  },

  /** Sprint -> berserk charge: low, leaning hard, arms thrown forward and flailing. */
  feralSprint(pose, u) {
    hunch(pose, 0.14, 0.24, 0.0, -0.3);
    rotJoint(pose, 'head', [0, 0, 1], 0.15 * Math.sin(u * TAU));
    const sw = 0.35 * Math.sin(u * TAU);
    reach(pose, {
      dirL: vnorm([0.25, -0.2 + sw, 0.95]), dirR: vnorm([-0.25, -0.2 - sw, 0.95]),
      w: 0.55, elbow: 0.5, droop: -0.4,
    });
  },

  /** Pushing on the gate: head down between the arms. */
  push(pose, u) {
    rotJoint(pose, 'neck', [1, 0, 0], 0.25);
    rotJoint(pose, 'head', [0, 0, 1], 0.12 + 0.05 * Math.sin(u * TAU * 2));
  },
};

export { vscale, vadd };
