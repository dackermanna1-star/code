// Assembles a full skeleton pose from locomotion targets using two-bone IK (left-handed frame,
// character faces +z). Produces local quaternions per bone plus the hips translation offset.
import { B } from './poses.js';
import { qMul, qConj, qCopy, qFromBasis, qRotate, vSub, vAdd, vNorm, vCross, vDot, vLen } from '../core/quat.js';

const tmpA = [0, 0, 0], tmpB = [0, 0, 0], tmpC = [0, 0, 0], tmpD = [0, 0, 0];
const qa = [0, 0, 0, 1], qb = [0, 0, 0, 1], qc = [0, 0, 0, 1];

/**
 * Solve a two-bone chain. root: joint position; target: end position; pole: bend direction
 * (where the middle joint should go); a/b: segment lengths; bendSign: +1 if the middle joint's
 * local +z points along the pole (knees), -1 if it points away (elbows).
 * Writes world rotations of the upper and lower segment (rest direction -y).
 */
export function solveTwoBone(root, target, pole, a, b, bendSign, outUpper, outLower, outMid) {
  const dir = vSub(tmpA, target, root);
  let dist = vLen(dir);
  const maxD = (a + b) * 0.9995, minD = Math.abs(a - b) + 1e-4;
  const clampedD = Math.min(maxD, Math.max(minD, dist));
  vNorm(dir);
  // Pole projected onto the plane perpendicular to the chain direction.
  const pd = vDot(pole, dir);
  let px = pole[0] - dir[0] * pd, py = pole[1] - dir[1] * pd, pz = pole[2] - dir[2] * pd;
  let pl = Math.hypot(px, py, pz);
  if (pl < 1e-5) { // pole parallel to the chain: pick any perpendicular
    const alt = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
    vCross(tmpD, dir, alt); px = tmpD[0]; py = tmpD[1]; pz = tmpD[2]; pl = Math.hypot(px, py, pz);
  }
  px /= pl; py /= pl; pz /= pl;
  const along = (a * a - b * b + clampedD * clampedD) / (2 * clampedD);
  const h = Math.sqrt(Math.max(0, a * a - along * along));
  const mid = outMid || tmpB;
  mid[0] = root[0] + dir[0] * along + px * h; mid[1] = root[1] + dir[1] * along + py * h; mid[2] = root[2] + dir[2] * along + pz * h;
  const end = [root[0] + dir[0] * clampedD, root[1] + dir[1] * clampedD, root[2] + dir[2] * clampedD];
  segmentRotation(outUpper, root, mid, [px * bendSign, py * bendSign, pz * bendSign]);
  segmentRotation(outLower, mid, end, [px * bendSign, py * bendSign, pz * bendSign]);
  return dist;
}

/** World rotation whose -y axis points from p0 to p1, with +z as close as possible to `fwd`. */
export function segmentRotation(out, p0, p1, fwd) {
  const y = vSub(tmpC, p0, p1); vNorm(y);           // bone +y points back toward the parent joint
  const fd = vDot(fwd, y);
  const z = [fwd[0] - y[0] * fd, fwd[1] - y[1] * fd, fwd[2] - y[2] * fd];
  if (vLen(z) < 1e-6) { z[0] = 0; z[1] = 0; z[2] = 1; }
  vNorm(z);
  const x = vCross([0, 0, 0], y, z);
  return qFromBasis(out, x, y, z);
}

/**
 * Build the base pose. loco: Locomotion output; d: rigDims; q: Float32Array(17*4) local quats;
 * hips: Float32Array(3) translation offset from rest; world: optional cache of world rotations.
 */
export function assemblePose(loco, d, q, hips, cache) {
  const rest = d.rest;
  const W = cache || (cache = { rot: Array.from({ length: 17 }, () => [0, 0, 0, 1]), pos: Array.from({ length: 17 }, () => [0, 0, 0]) });
  const setLocal = (bone, quat) => { const o = bone * 4; q[o] = quat[0]; q[o + 1] = quat[1]; q[o + 2] = quat[2]; q[o + 3] = quat[3]; };
  // Hip drop: lower the pelvis if a foot target is out of reach.
  const hp = [loco.hipsPos[0], loco.hipsPos[1], loco.hipsPos[2]];
  let drop = 0;
  for (let r = 0; r < 2; r++) {
    const th = qRotate([0, 0, 0], loco.hipsRot, rest[r === 0 ? B.thighL : B.thighR]);
    const fp = loco.feet[r].pos;
    const dx = fp[0] - (hp[0] + th[0]), dz = fp[2] - (hp[2] + th[2]), dy = fp[1] - (hp[1] + th[1]);
    const reach = (d.thigh + d.shin) * 0.985;
    const k = reach * reach - dx * dx - dz * dz;
    const need = k > 0 ? dy + Math.sqrt(k) : -0.3 * d.H;
    if (need < drop) drop = need;
  }
  hp[1] += Math.max(drop, -0.2 * d.H);
  hips[0] = hp[0] - rest[B.hips][0]; hips[1] = hp[1] - rest[B.hips][1]; hips[2] = hp[2] - rest[B.hips][2];
  // Spine chain (world rotations / positions in root space)
  qCopy(W.rot[B.hips], loco.hipsRot); W.pos[B.hips] = hp;
  setLocal(B.hips, loco.hipsRot);
  const chain = [[B.spine, B.hips, loco.spine], [B.chest, B.spine, loco.chest], [B.neck, B.chest, loco.neck], [B.head, B.neck, loco.head]];
  for (const [b, parent, local] of chain) {
    setLocal(b, local);
    qMul(W.rot[b], W.rot[parent], local);
    vAdd(W.pos[b], W.pos[parent], qRotate([0, 0, 0], W.rot[parent], rest[b]));
  }
  // Legs
  for (let r = 0; r < 2; r++) {
    const th = r === 0 ? B.thighL : B.thighR, sh = r === 0 ? B.shinL : B.shinR, ft = r === 0 ? B.footL : B.footR;
    const foot = loco.feet[r];
    const root = vAdd([0, 0, 0], hp, qRotate([0, 0, 0], W.rot[B.hips], rest[th]));
    solveTwoBone(root, foot.pos, foot.pole, d.thigh, d.shin, 1, qa, qb);
    setLocal(th, qMul(qc, qConj([0, 0, 0, 1], W.rot[B.hips]), qa));
    setLocal(sh, qMul(qc, qConj([0, 0, 0, 1], qa), qb));
    setLocal(ft, qMul(qc, qConj([0, 0, 0, 1], qb), foot.rot));
    qCopy(W.rot[th], qa); qCopy(W.rot[sh], qb);
  }
  // Arms: hand targets are in chest space.
  const chestRot = W.rot[B.chest], chestPos = W.pos[B.chest];
  for (let i = 0; i < 2; i++) {
    const ua = i === 0 ? B.armL : B.armR, fa = i === 0 ? B.foreL : B.foreR, hd = i === 0 ? B.handL : B.handR;
    const hand = loco.hands[i];
    const root = vAdd([0, 0, 0], chestPos, qRotate([0, 0, 0], chestRot, rest[ua]));
    const target = vAdd([0, 0, 0], chestPos, qRotate([0, 0, 0], chestRot, hand.pos));
    const pole = qRotate([0, 0, 0], chestRot, hand.pole);
    solveTwoBone(root, target, pole, d.upperArm, d.foreArm, -1, qa, qb);
    setLocal(ua, qMul(qc, qConj([0, 0, 0, 1], chestRot), qa));
    setLocal(fa, qMul(qc, qConj([0, 0, 0, 1], qa), qb));
    setLocal(hd, [0, 0, 0, 1]);
    qCopy(W.rot[ua], qa); qCopy(W.rot[fa], qb);
  }
  return W;
}
