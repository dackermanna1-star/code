// Clip analysis for the baker: foot soles, ground alignment, stance detection, ground speed,
// footstep events, contact cleanup (stance soles onto the ground), body-ground penetration, seams.
import { RD, SK, N, poseFK, at, getQ, setQ } from './target.mjs';
import { qrot, qmul } from './rig.mjs';
import { legIK, axisAngle } from './edit.mjs';

const I = SK.index;

/** Sole of a foot (world): lowest corner and centre of the four bottom corners. */
export function sole(pose, fkr, side) {
  const leg = SK.legs[side];
  const fi = leg.foot;
  const q = getQ(pose, fi);
  const Pf = at(fkr.P, fi);
  const B = [SK.bind[fi * 3], SK.bind[fi * 3 + 1], SK.bind[fi * 3 + 2]];
  let low = null;
  const c = [0, 0, 0];
  for (const k of leg.sole) {
    const w = qrot(q, [k[0] - B[0], k[1] - B[1], k[2] - B[2]]);
    const p = [Pf[0] + w[0], Pf[1] + w[1], Pf[2] + w[2]];
    c[0] += p[0] / 4;
    c[1] += p[1] / 4;
    c[2] += p[2] / 4;
    if (!low || p[1] < low[1]) low = p;
  }
  return { low, c, h: low[1] };
}

/** Lowest point of every segment's collision shapes for a pose. */
export function segmentLows(pose, fkr) {
  const out = [];
  for (let i = 0; i < N; i++) {
    const b = RD.segList[i].body;
    b.pos.set(fkr.P[i * 3], fkr.P[i * 3 + 1], fkr.P[i * 3 + 2]);
    b.rot.set(pose.rot[i * 4], pose.rot[i * 4 + 1], pose.rot[i * 4 + 2], pose.rot[i * 4 + 3]);
    let y = Infinity;
    for (const s of b.shapes) {
      s.updateWorld(b.pos, b.rot);
      y = Math.min(y, s.aabbMin.y);
    }
    out.push(y);
  }
  return out;
}

export const pct = (arr, p) => {
  const a = arr.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))))];
};

function soles(poses) {
  return poses.map((p) => {
    const f = poseFK(p);
    return { L: sole(p, f, 'L'), R: sole(p, f, 'R') };
  });
}

/**
 * Ground analysis of a clip (array of our poses at `fps`): shift it so stance soles touch y = 0,
 * measure the ground speed from the stance feet (in-place clips), detect contacts, pull stance
 * soles onto the ground with leg IK (plantarflexing a foot that cannot reach), and list footsteps.
 */
export function analyzeGround(poses, fps, opts = {}) {
  const F = poses.length;
  const loop = opts.loop !== false;
  let S = soles(poses);
  const mins = S.map((s) => Math.min(s.L.h, s.R.h));
  const dy = opts.noShift ? 0 : -pct(mins, opts.groundPct ?? 0.2);
  for (const p of poses) p.pelvis[1] += dy;
  S = soles(poses);
  const vel = (side, i) => {
    let i0 = i - 1, i1 = i + 1;
    if (loop) {
      i0 = (i0 + F) % F;
      i1 = i1 % F;
    } else {
      i0 = Math.max(0, i0);
      i1 = Math.min(F - 1, i1);
    }
    const a = S[i0][side].c, b = S[i1][side].c;
    const n = loop ? 2 : Math.max(1, i1 - i0);
    return [(b[0] - a[0]) * fps / n, (b[2] - a[2]) * fps / n];
  };
  const hmin = { L: Math.min(...S.map((s) => s.L.h)), R: Math.min(...S.map((s) => s.R.h)) };
  // stance: the sole moving back under the body (in-place locomotion) or still (standing clips)
  let speed = opts.speed;
  if (speed === undefined) {
    let sum = 0, n = 0;
    for (const side of ['L', 'R']) {
      for (let i = 0; i < F; i++) {
        const vz = vel(side, i)[1];
        if (vz < -0.1 && S[i][side].h < 0.09) {
          sum += -vz;
          n++;
        }
      }
    }
    speed = n ? sum / n : 0;
    if (speed < 0.05) speed = 0;
  }
  const contactH = opts.contactH ?? 0.035;
  const contact = { L: new Float64Array(F), R: new Float64Array(F) };
  for (const side of ['L', 'R']) {
    const raw = new Uint8Array(F);
    for (let i = 0; i < F; i++) {
      const h = S[i][side].h;
      const v = vel(side, i);
      const slip = Math.hypot(v[0], v[1] + speed);
      const low = speed > 0 ? h < 0.09 : h < Math.max(contactH, hmin[side] + 0.03);
      // runs: stance is short and fast, take the foot being down
      if (opts.byHeight) raw[i] = h < hmin[side] + 0.03 ? 1 : 0;
      else raw[i] = low && slip < Math.max(0.3, 0.5 * speed) ? 1 : 0;
    }
    const at2 = (i) => (loop ? raw[((i % F) + F) % F] : raw[Math.min(F - 1, Math.max(0, i))]);
    for (let i = 0; i < F; i++) {
      let c = raw[i];
      if (!raw[i] && at2(i - 1) && at2(i + 1)) c = 1;
      if (raw[i] && !at2(i - 1) && !at2(i + 1)) c = 0;
      contact[side][i] = c;
    }
  }
  // stance soles onto the ground; swing soles out of it
  if (!opts.noCleanup) {
    for (let i = 0; i < F; i++) {
      for (const side of ['L', 'R']) {
        const h = soles([poses[i]])[0][side].h;
        if (contact[side][i] ? Math.abs(h) > 0.004 : h < -0.004) plantSole(poses[i], side, -h);
      }
    }
    S = soles(poses);
  }
  // footstep events at touchdown
  const events = [];
  for (const side of ['L', 'R']) {
    for (let i = 0; i < F; i++) {
      const prev = loop ? contact[side][(i - 1 + F) % F] : i > 0 ? contact[side][i - 1] : 1;
      if (contact[side][i] && !prev) events.push({ t: i / fps, type: 'footstep', foot: side });
    }
  }
  events.sort((a, b) => a.t - b.t);
  return { dy, speed, contact, events, soles: S, hmin };
}

/**
 * Move a foot vertically by dh with leg IK; if the leg cannot reach that far down, point the toes
 * down (plantarflex about the ankle) for the rest.
 */
export function plantSole(pose, side, dh) {
  const leg = SK.legs[side];
  const fkr = poseFK(pose);
  const ank = at(fkr.J, leg.foot), hip = at(fkr.J, leg.thigh);
  const target = [ank[0], ank[1] + dh, ank[2]];
  const reach = leg.L1 + leg.L2 - 0.004;
  const d = Math.hypot(target[0] - hip[0], target[1] - hip[1], target[2] - hip[2]);
  if (d <= reach) {
    legIK(pose, side, target);
    return;
  }
  // as far as the leg goes, then the toes
  const s = reach / d;
  const t2 = [hip[0] + (target[0] - hip[0]) * s, hip[1] + (target[1] - hip[1]) * s, hip[2] + (target[2] - hip[2]) * s];
  legIK(pose, side, t2);
  for (let k = 0; k < 30; k++) {
    const f = poseFK(pose);
    const h = sole(pose, f, side).h;
    if (h <= 0.003) break;
    const lat = qrot(getQ(pose, leg.foot), [1, 0, 0]);
    setQ(pose, leg.foot, qmul(axisAngle(lat, 0.03), getQ(pose, leg.foot)));
  }
}

/** Raise frames whose body pokes into the ground, smoothly over time. Returns the largest lift. */
export function liftOutOfGround(poses, minY = 0.0, smoothFrames = 4) {
  const F = poses.length;
  const need = poses.map((p) => {
    const lows = segmentLows(p, poseFK(p));
    return Math.max(0, minY - Math.min(...lows));
  });
  const mx = need.map((_, i) => {
    let m = 0;
    for (let k = -smoothFrames; k <= smoothFrames; k++) m = Math.max(m, need[Math.min(F - 1, Math.max(0, i + k))]);
    return m;
  });
  const sm = mx.map((_, i) => {
    let s = 0, c = 0;
    for (let k = -smoothFrames; k <= smoothFrames; k++) {
      s += mx[Math.min(F - 1, Math.max(0, i + k))];
      c++;
    }
    return s / c;
  });
  poses.forEach((p, i) => (p.pelvis[1] += Math.max(sm[i], need[i])));
  return Math.max(...need);
}

/**
 * Loop seam quality: the rotation step across the seam (last -> first frame) compared with the
 * largest step elsewhere. Returns { seam, maxStep } in radians (max over segments).
 */
export function seamError(poses) {
  const F = poses.length;
  const step = (a, b) => {
    let m = 0;
    for (let i = 0; i < N; i++) {
      let d = 0;
      for (let c = 0; c < 4; c++) d += a.rot[i * 4 + c] * b.rot[i * 4 + c];
      m = Math.max(m, 2 * Math.acos(Math.min(1, Math.abs(d))));
    }
    return m;
  };
  let maxStep = 0;
  for (let i = 0; i + 1 < F; i++) maxStep = Math.max(maxStep, step(poses[i], poses[i + 1]));
  return { seam: step(poses[F - 1], poses[0]), maxStep };
}

export { I };

/**
 * Make an in-place locomotion loop consistent with one ground speed: shift the whole body back and
 * forth (pelvis z) so that whichever foot is down moves back at the same constant speed. Used on
 * time-warped clips (the limps), whose two stances would otherwise want different root speeds.
 * Returns that speed.
 */
export function equalizeStance(poses, fps, stanceOf = null) {
  const F = poses.length;
  const S = soles(poses);
  const vf = new Float64Array(F);
  for (let i = 0; i < F; i++) {
    const a = (i - 1 + F) % F, b = (i + 1) % F;
    const dl = S[i].L.h, dr = S[i].R.h;
    const vL = (S[b].L.c[2] - S[a].L.c[2]) * fps / 2, vR = (S[b].R.c[2] - S[a].R.c[2]) * fps / 2;
    const st = stanceOf ? stanceOf(i) : Math.abs(dl - dr) < 0.01 ? 'LR' : dl < dr ? 'L' : 'R';
    vf[i] = st === 'LR' ? (vL + vR) / 2 : st === 'L' ? vL : vR;
  }
  let mean = 0;
  for (let i = 0; i < F; i++) mean += vf[i] / F;
  const v = -mean;
  const acc = new Float64Array(F);
  for (let i = 0; i < F; i++) {
    let s = 0;
    for (let k = -1; k <= 1; k++) s += -v - vf[(i + k + F) % F];
    acc[i] = s / 3;
  }
  const dz = new Float64Array(F);
  for (let i = 1; i < F; i++) dz[i] = dz[i - 1] + (acc[i - 1] + acc[i]) / 2 / fps;
  const drift = (dz[F - 1] + (acc[F - 1] + acc[0]) / 2 / fps) / F;
  let m = 0;
  for (let i = 0; i < F; i++) {
    dz[i] -= drift * i;
    m += dz[i] / F;
  }
  poses.forEach((p, i) => (p.pelvis[2] += dz[i] - m));
  return v;
}
