/**
 * Palm trees for the tropical island (worker-safe, pure functions of the seed).
 *
 * A coconut palm: a slender trunk that leans away from its base along a smooth curve (the offset
 * grows with height^1.8, so the base is upright and the top swings out), kept 6-connected so it
 * never looks broken, topped by a crown of 7..9 fronds that arch up and droop at the tips, plus a
 * short tuft above the crown. Young palms are shorter, straighter and have a small crown.
 *
 * Max reach from the base column: lean 4 + frond 6 = 10 blocks (< 15, see ChunkWriter culling).
 */
import type { ChunkWriter } from '../common/writer';
import { ST as ST_ } from '../common/states';
import { Rng } from '../../../core/rng';
import { S } from '../../blocks/registry';

const ST = ST_;
export const PALM_REACH = 11;

export function palm(w: ChunkWriter, x: number, y: number, z: number, seed: number, young = false): void {
  const r = new Rng(seed);
  const h = young ? 3 + r.int(3) : 7 + r.int(6);
  const lean = young ? r.float(0, 1.2) : r.float(1.2, 4.2);
  const ang = r.float(0, Math.PI * 2);
  const lx = Math.cos(ang), lz = Math.sin(ang);
  const log = ST.jungleLog;
  // trunk: base block below the ground stays dirt/sand; logs from y .. y+h-1
  let px = x, pz = z;
  for (let i = 0; i < h; i++) {
    const t = h > 1 ? i / (h - 1) : 0;
    const off = lean * Math.pow(t, 1.8);
    const cx = x + Math.round(lx * off), cz = z + Math.round(lz * off);
    if (cx !== px || cz !== pz) {
      // keep the trunk connected: a step sideways gets a joint log at the previous height
      if (cx !== px && cz !== pz) w.log(cx, y + i - 1, pz, log);
      w.log(cx, y + i - 1, cz, log);
    }
    w.log(cx, y + i, cz, log);
    px = cx;
    pz = cz;
  }
  const tx = px, ty = y + h - 1, tz = pz;
  const leaf = S('palm_leaves');
  // crown core and tuft
  w.leaf(tx, ty + 1, tz, leaf);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) w.leaf(tx + dx, ty + 1, tz + dz, leaf);
  if (!young) w.leaf(tx, ty + 2, tz, leaf);
  // fronds
  const n = young ? 5 + r.int(2) : 7 + r.int(3);
  const a0 = r.float(0, Math.PI * 2);
  for (let f = 0; f < n; f++) {
    const a = a0 + (f / n) * Math.PI * 2 + r.float(-0.25, 0.25);
    const len = young ? 2 + r.int(2) : 4 + r.int(3);
    const ca = Math.cos(a), sa = Math.sin(a);
    // arch: up near the crown, drooping at the tip (droop scales with frond length)
    const k = (young ? 0.6 : 0.95) / len;
    let prevX = tx, prevY = ty + 1, prevZ = tz;
    for (let s = 1; s <= len; s++) {
      const fy = ty + 1 + Math.round(0.9 * s - k * s * s * 1.1);
      const fx = tx + Math.round(ca * s), fz = tz + Math.round(sa * s);
      // fill vertical gaps so the frond reads as one leaf
      if (fy < prevY - 1) w.leaf(fx, prevY - 1, fz, leaf);
      if (fy > prevY + 1) w.leaf(prevX, prevY + 1, prevZ, leaf);
      w.leaf(fx, fy, fz, leaf);
      // a hanging leaflet under the outer part
      if (s >= len - 1 && !young) w.leaf(fx, fy - 1, fz, leaf);
      prevX = fx;
      prevY = fy;
      prevZ = fz;
    }
  }
}
