// Parametric voxel human (6.25 cm voxels) in winter clothing, posed for a 4-frame walk cycle.
//
// Body space: x = person's left (+) / right (−), y up from the soles, z forward (the model's
// front is local +Z). drawPerson() rasterizes a person whose ground centre sits at `o` (model
// voxel coordinates) and returns the joint positions so callers can hang bags, leashes, ropes.
//
// Gait (4 frames): frame 0 left heel strike / right toe-off, 1 passing (left stance, right
// swing), 2 right heel strike, 3 passing. Hips rise and fall with the legs (feet stay on y = 0).
// Frame 4 is a standing pose (waiting at a door, pausing).

import { M } from '../../core/materials.js'
import { capsule, ellip, rowEllipse } from './vox.js'

const TAU = Math.PI * 2
const lerp = (a, b, t) => a + (b - a) * t

/** Piecewise-linear lookup in [t0..1] tables of 4 values at t = 0, .35, .75, 1. */
function shape(arr, t) {
  const ks = [0, 0.35, 0.75, 1]
  if (t <= 0) return arr[0]
  for (let i = 1; i < 4; i++) if (t <= ks[i]) return lerp(arr[i - 1], arr[i], (t - ks[i - 1]) / (ks[i] - ks[i - 1]))
  return arr[3]
}

export const DEFAULT_BODY = {
  L1: 6.6, L2: 6.2, hipHalf: 1.0, thighR: 1.12, shinR: 1.0, bootR: 1.02,
  torsoLen: 9.0, lean: 0.03, stride: 0.42, kneeLift: 1.0, armSwing: 0.36,
  U: 4.7, Fa: 4.1, armR: 1.0, armX: 3.0,
  rx: [2.55, 2.5, 2.6, 2.55], rz: [1.8, 1.75, 1.95, 1.7],
  headRx: 1.25, headRy: 2.05, headRz: 1.3, headX: 0.5, headFwd: 0.35,
}

/** Leg pose for a gait phase (quarters). */
function legPose(spec, ph) {
  const A = spec.stride
  const q = ((Math.round(ph * 4) % 4) + 4) % 4
  if (q === 0) return { q, th: A, kn: 0.08 }
  if (q === 1) return { q, th: 0.03, kn: 0.14 }
  if (q === 2) return { q, th: -A * 0.85, kn: 0.32 }
  return { q, th: A * 0.3, kn: 1.0 * spec.kneeLift }
}

/** Compute joints (body space, before translation into the model). */
export function poseJoints(spec, frame) {
  const legs = []
  let lowest = 0
  const stand = frame >= 4
  for (const side of [1, -1]) {
    const ph = stand ? 0.25 : (frame / 4 + (side > 0 ? 0 : 0.5)) % 1
    const { q, th, kn } = stand ? { q: 4, th: side > 0 ? 0.06 : -0.03, kn: 0.05 } : legPose(spec, ph)
    const hip = [side * spec.hipHalf, 0, 0]
    const knee = [side * spec.hipHalf, -spec.L1 * Math.cos(th), spec.L1 * Math.sin(th)]
    const s = th - kn
    const ankle = [side * spec.hipHalf * 1.05, knee[1] - spec.L2 * Math.cos(s), knee[2] + spec.L2 * Math.sin(s)]
    // foot perpendicular to the shin, pointing forward
    const fy = Math.sin(s), fz = Math.cos(s)
    const dy = -Math.cos(s), dz = Math.sin(s)
    const sole = [ankle[0], ankle[1] + dy * 0.55, ankle[2] + dz * 0.55]
    const heel = [sole[0], sole[1] - fy * 0.7, sole[2] - fz * 0.7]
    const toe = [sole[0], sole[1] + fy * 2.1, sole[2] + fz * 2.1]
    lowest = Math.min(lowest, heel[1] - spec.bootR, toe[1] - spec.bootR)
    legs.push({ side, ph, q, th, kn, hip, knee, ankle, heel, toe })
  }
  const hipY = -lowest
  for (const L of legs) for (const k of ['hip', 'knee', 'ankle', 'heel', 'toe']) L[k][1] += hipY
  const shoulder = [0, hipY + spec.torsoLen * Math.cos(spec.lean), spec.torsoLen * Math.sin(spec.lean)]
  return { legs, hipY, shoulder }
}

/** z of a leg's centreline at height y (body space). */
function legZAt(L, y) {
  const seg = (a, b) => {
    if ((y <= a[1] && y >= b[1]) || (y >= a[1] && y <= b[1])) {
      const t = Math.abs(b[1] - a[1]) < 1e-6 ? 0 : (y - a[1]) / (b[1] - a[1])
      return a[2] + (b[2] - a[2]) * t
    }
    return null
  }
  return seg(L.hip, L.knee) ?? seg(L.knee, L.ankle) ?? (y > L.hip[1] ? L.hip[2] : L.ankle[2])
}

/**
 * Arm pose → { shoulder, elbow, wrist, hand } in body space.
 * mode: 'swing' | 'carry' | 'pull' | 'leash' | 'pocket' | 'strap' | 'smoke'
 */
function armJoints(spec, J, side, mode, frame) {
  const legPh = (frame / 4 + (side > 0 ? 0 : 0.5)) % 1
  // +1 when the same-side leg is forward; standing (frame 4): arms at rest
  const fwd = frame >= 4 ? 0 : Math.cos(TAU * legPh)
  let a, eb, out = 0.1
  switch (mode) {
    case 'carry': a = -spec.armSwing * 0.3 * fwd; eb = 0.08; out = 0.25; break
    case 'pull': a = -0.62 - 0.04 * fwd; eb = 0.06; out = 0.12; break
    case 'leash': a = 0.32 - 0.05 * fwd; eb = 0.55; out = 0.22; break
    case 'pocket': a = -0.12; eb = 0.95; out = 0.05; break
    case 'strap': a = 0.08; eb = 1.25; out = 0.0; break
    case 'smoke': a = -spec.armSwing * 0.7 * fwd; eb = 0.35 + 0.25 * Math.max(0, -fwd); break
    default: a = -spec.armSwing * fwd; eb = 0.18 + 0.28 * Math.max(0, -fwd)
  }
  const sh = J.shoulder
  const S = [side * spec.armX, sh[1] - 0.9, sh[2]]
  const d1 = [side * out, -Math.cos(a), Math.sin(a)]
  const n1 = Math.hypot(...d1)
  const E = [S[0] + d1[0] / n1 * spec.U, S[1] + d1[1] / n1 * spec.U, S[2] + d1[2] / n1 * spec.U]
  const a2 = a + eb
  const d2 = [side * out * 0.4, -Math.cos(a2), Math.sin(a2)]
  const n2 = Math.hypot(...d2)
  const W = [E[0] + d2[0] / n2 * spec.Fa, E[1] + d2[1] / n2 * spec.Fa, E[2] + d2[2] / n2 * spec.Fa]
  const H = [W[0] + d2[0] / n2 * 0.75, W[1] + d2[1] / n2 * 0.75, W[2] + d2[2] / n2 * 0.75]
  return { S, E, W, H, dir: [d2[0] / n2, d2[1] / n2, d2[2] / n2], mode }
}

/**
 * Draw a person. o = [ox, oy, oz] model coordinates of the ground centre.
 * c = clothing: {
 *   coat: 'long'|'short'|'puffer'|'jacket', hem (voxels above ground), flare, coatMat,
 *   collar (mat|null), trousers, boots, bootTop (voxels of visible shaft), hands (mat),
 *   hat: 'ushanka'|'ushanka_down'|'knit'|'furhat'|'shawl'|'cap'|'none', hatMat, pompom (mat),
 *   scarf (mat), scarfTail (bool), hair (mat), armL, armR (arm modes) }
 * Returns joints in MODEL coordinates: { hipY, shoulder, head, arms: {L, R} }.
 */
export function drawPerson(m, spec, c, frame, o) {
  const J = poseJoints(spec, frame)
  const T = p => [o[0] + p[0], o[1] + p[1], o[2] + p[2]]
  const coatMat = c.coatMat ?? M('paint_matte')
  const trousers = c.trousers ?? M('plastic_dark')
  const boots = c.boots ?? M('rubber')
  const sh = J.shoulder
  const hipY = J.hipY

  // ---- legs: trousers, then boots
  for (const L of J.legs) {
    capsule(m, T(L.hip), T(L.knee), spec.thighR, spec.thighR * 0.95, trousers)
    capsule(m, T(L.knee), T(L.ankle), spec.shinR, spec.shinR * 0.92, trousers)
    // boot: foot plus a shaft up the shin
    capsule(m, T(L.heel), T(L.toe), spec.bootR, spec.bootR * 0.9, boots)
    const top = c.bootTop ?? 2.2
    const sd = [L.knee[0] - L.ankle[0], L.knee[1] - L.ankle[1], L.knee[2] - L.ankle[2]]
    const sl = Math.hypot(...sd)
    const bt = [L.ankle[0] + sd[0] / sl * top, L.ankle[1] + sd[1] / sl * top, L.ankle[2] + sd[2] / sl * top]
    capsule(m, T(L.ankle), T(bt), spec.shinR * 1.06, spec.shinR * 1.04, boots)
  }

  // ---- torso / coat rows
  const kind = c.coat ?? 'long'
  const hem = c.hem ?? (kind === 'long' ? 8 : hipY - 1.2)
  const flare = c.flare ?? 0.5
  const puff = kind === 'puffer' ? 0.35 : 0
  const legPad = kind === 'long' ? 0.9 : 0.7
  const yTop = sh[1] + 0.2
  for (let y = Math.max(0, Math.floor(hem)); y + 0.5 <= yTop; y++) {
    const yc = y + 0.5
    let cz, rx, rz
    if (yc >= hipY) {
      const t = (yc - hipY) / (sh[1] - hipY)
      cz = (yc - hipY) * Math.tan(spec.lean)
      rx = shape(spec.rx, t) + puff
      rz = shape(spec.rz, t) + puff * 0.6
      // sloping shoulders: the top rows draw in toward the neck
      if (yc > sh[1] - 0.7) { rx *= 0.8; rz *= 0.92 }
    } else {
      // skirt of the coat: drape around the legs
      let zmin = Infinity, zmax = -Infinity
      for (const L of J.legs) {
        const z = legZAt(L, yc)
        zmin = Math.min(zmin, z); zmax = Math.max(zmax, z)
      }
      const r = spec.thighR + legPad
      zmin -= r; zmax += r
      const minD = spec.rz[0] * 2
      if (zmax - zmin < minD) { const mid = (zmax + zmin) / 2; zmin = mid - minD / 2; zmax = mid + minD / 2 }
      cz = (zmin + zmax) / 2
      rz = (zmax - zmin) / 2 + puff * 0.4
      rx = spec.rx[0] + flare * (hipY - yc) / Math.max(1, hipY - hem) + puff
    }
    // quilted puffer: inset seams every third row
    if (kind === 'puffer' && ((y - Math.floor(hem)) % 3) === 2) { rx -= 0.45; rz -= 0.35 }
    rowEllipse(m, y + o[1], o[0], o[2] + cz, rx, rz, coatMat)
  }
  // a belt line on short jackets
  if (kind === 'jacket') rowEllipse(m, Math.floor(hem) + o[1], o[0], o[2], spec.rx[0] + 0.15, spec.rz[0] + 0.15, c.trim ?? M('rubber'))

  // ---- arms (sleeves in the coat material)
  const arms = {}
  for (const side of [1, -1]) {
    const mode = side > 0 ? (c.armL ?? 'swing') : (c.armR ?? 'swing')
    const A = armJoints(spec, J, side, mode, frame)
    const r = spec.armR + puff * 0.3
    capsule(m, T(A.S), T(A.E), r * 1.05, r, coatMat)
    capsule(m, T(A.E), T(A.W), r, r * 0.9, coatMat)
    if (mode !== 'pocket') ellip(m, ...T(A.H), 0.8, 0.85, 0.8, c.hands ?? M('rubber'))
    arms[side > 0 ? 'L' : 'R'] = { S: T(A.S), E: T(A.E), W: T(A.W), H: T(A.H), dir: A.dir }
  }

  // ---- neck, head
  const neckTop = [sh[0], sh[1] + 1.1, sh[2] + 0.25]
  capsule(m, T(sh), T(neckTop), 0.85, 0.8, M('life_skin'))
  const hc = [spec.headX, neckTop[1] + spec.headRy - 0.25, sh[2] + spec.headFwd]
  const H = T(hc)
  const skin = M('life_skin')
  const hair = c.hair ?? M('branch')
  ellip(m, H[0], H[1], H[2], spec.headRx, spec.headRy, spec.headRz, skin)
  // hair on the back of the head and the crown
  ellip(m, H[0], H[1] + 0.2, H[2] - 0.2, spec.headRx + 0.1, spec.headRy + 0.05, spec.headRz + 0.1, hair,
    (x, y, z) => z + 0.5 < H[2] + 0.25 || y + 0.5 > H[1] + spec.headRy - 0.8)
  const top = H[1] + spec.headRy

  // ---- collar / scarf
  if (c.collar) {
    for (let y = Math.floor(T(sh)[1] - 0.6); y + 0.5 <= T(sh)[1] + 1.2; y++) rowEllipse(m, y, o[0], T(sh)[2] - 0.1, 2.15, 1.95, c.collar)
  }
  if (c.scarf) {
    for (let y = Math.floor(T(sh)[1] - 0.2); y + 0.5 <= T(sh)[1] + 1.5; y++) rowEllipse(m, y, o[0] + 0.25, T(sh)[2] + 0.15, 1.75, 1.6, c.scarf)
    if (c.scarfTail) {
      const fz = T(sh)[2] + spec.rz[3] + 0.55
      capsule(m, [o[0] + 1.0, T(sh)[1] + 0.3, fz], [o[0] + 1.3, T(sh)[1] - 4.2, fz + 0.2], 0.6, 0.55, c.scarf)
    }
  }

  // ---- hats
  const hatMat = c.hatMat ?? M('life_fur')
  const hat = c.hat ?? 'none'
  if (hat === 'ushanka' || hat === 'ushanka_down') {
    ellip(m, H[0], top - 0.35, H[2] - 0.15, 2.0, 1.55, 1.95, hatMat, (x, y, z) => y + 0.5 > H[1] + 0.35)
    // front brim folded up
    for (let y = Math.floor(top - 1.7); y + 0.5 <= top - 0.2; y++) rowEllipse(m, y, H[0], H[2] + 0.1, 2.05, 1.9, hatMat)
    if (hat === 'ushanka_down') {
      for (const sx of [-1, 1]) capsule(m, [H[0] + sx * 1.55, H[1] + 0.9, H[2] - 0.2], [H[0] + sx * 1.6, H[1] - 1.3, H[2] - 0.1], 0.75, 0.7, hatMat)
    } else {
      // flaps tied up over the crown
      for (const sx of [-1, 1]) ellip(m, H[0] + sx * 1.6, top - 0.6, H[2] - 0.3, 0.7, 0.7, 0.9, hatMat)
    }
  } else if (hat === 'knit') {
    ellip(m, H[0], H[1] + 0.55, H[2] - 0.1, spec.headRx + 0.45, spec.headRy + 0.05, spec.headRz + 0.4, hatMat,
      (x, y, z) => y + 0.5 > H[1] + 0.25 || (z + 0.5 < H[2] - 0.5 && y + 0.5 > H[1] - 1.2))
    rowEllipse(m, Math.floor(H[1] + 0.3), H[0], H[2] - 0.05, spec.headRx + 0.6, spec.headRz + 0.55, hatMat)
    if (c.pompom) ellip(m, H[0], top + 0.9, H[2] - 0.2, 0.85, 0.85, 0.85, c.pompom)
  } else if (hat === 'furhat') {
    // round fur hat sitting low on the head
    ellip(m, H[0], top + 0.05, H[2] - 0.15, 2.05, 1.6, 2.0, hatMat, (x, y, z) => y + 0.5 > H[1] + 0.5)
  } else if (hat === 'cap') {
    // кепка: flat crown with a short peak
    for (let y = Math.floor(top - 0.9); y + 0.5 <= top + 0.5; y++) rowEllipse(m, y, H[0], H[2] - 0.05, 1.7, 1.7, hatMat)
    rowEllipse(m, Math.floor(top - 0.9), H[0], H[2] + 1.6, 1.4, 0.8, hatMat)
  } else if (hat === 'shawl') {
    // платок over a hat: covers the head and ties under the chin, a fold down the back
    ellip(m, H[0], H[1] + 0.3, H[2] - 0.15, spec.headRx + 0.55, spec.headRy + 0.4, spec.headRz + 0.5, hatMat,
      (x, y, z) => !(z + 0.5 > H[2] + 0.2 && y + 0.5 < H[1] + 1.1 && Math.abs(x + 0.5 - H[0]) < 1.2))
    capsule(m, [H[0], H[1] - 0.6, H[2] - 1.3], [H[0], H[1] - 3.2, H[2] - 1.8], 1.3, 0.5, hatMat)
    ellip(m, H[0], H[1] - 2.2, H[2] + 0.7, 0.7, 0.6, 0.6, hatMat)
  }

  return {
    hipY: hipY + o[1],
    shoulder: T(sh),
    head: H,
    top,
    arms,
    legs: J.legs.map(L => ({ side: L.side, q: L.q, ankle: T(L.ankle), toe: T(L.toe) })),
  }
}
