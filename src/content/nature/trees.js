// Procedural winter trees. Each species has a handful of seeded variant models (recursive
// branching rasterized into 0.25 m voxels); placements reuse them with rotation, so a whole
// park costs a few dozen meshes. Trunks are solid, every branch and twig is non-solid (the
// player never snags or climbs), thin lines of snow lie on near-horizontal wood.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { RNG, hash2 } from '../../core/rng.js'
import { VOXEL } from '../../core/constants.js'
import { MAT } from './materials.js'
import {
  Skeleton, rasterize, branchSnow, useThinLods, fineScale, splitSkeleton, deviate, fromVertical, add, mul, norm, lerp,
  PRIO,
} from './voxutil.js'

/** species → { variants: [{ name, height, idx, kind }] } (filled at import time). */
export const SPECIES = {}

const TAU = Math.PI * 2

function at(pts, t) {
  // interpolate a grown polyline at parameter t (0..1)
  if (t <= 0) return pts[0]
  if (t >= 1) return pts[pts.length - 1]
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].t >= t) {
      const a = pts[i - 1], b = pts[i]
      const k = (t - a.t) / Math.max(1e-6, b.t - a.t)
      return { p: [lerp(a.p[0], b.p[0], k), lerp(a.p[1], b.p[1], k), lerp(a.p[2], b.p[2], k)], dir: b.dir, t, r: lerp(a.r, b.r, k) }
    }
  }
  return pts[pts.length - 1]
}

/** Point on a polyline at height y (first crossing). */
function atY(pts, y) {
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].p[1] >= y) {
      const a = pts[i - 1], b = pts[i]
      const k = (y - a.p[1]) / Math.max(1e-6, b.p[1] - a.p[1])
      return { p: [lerp(a.p[0], b.p[0], k), y, lerp(a.p[2], b.p[2], k)], dir: b.dir, t: lerp(a.t, b.t, k), r: lerp(a.r, b.r, k) }
    }
  }
  return pts[pts.length - 1]
}

const DOWN = [0, -1, 0], UP = [0, 1, 0]

// ---- shared finishing: split, snow, perches, snow spots, LODs ------------------------------------
// Deciduous trees are two models placed together: `nature_<sp>_<i>` holds the stout parts in 25 cm
// voxels (trunk, thick limbs, pollard knuckles; solid trunk = collision) and `nature_<sp>_<i>_crown`
// holds every branch and twig in fine 12.5 cm voxels (non-solid), so a bare crown reads as a web of
// thin twigs instead of a heap of 25 cm blocks. Spruces (dense needle tiers) stay one 25 cm model.
const FINE_K = 2

function perchScan(m, horiz, mats, y0, air, minH, out) {
  for (let y = Math.max(0, y0); y < m.sy - air; y++)
    for (let z = 0; z < m.sz; z++)
      for (let x = 0; x < m.sx; x++) {
        const i = m.idx(x, y, z)
        const id = m.data[i]
        if (!id || !mats.has(id) || horiz[i] < minH) continue
        let free = true
        for (let k = 1; k <= air; k++) if (m.data[i + k * m.sx * m.sz]) { free = false; break }
        if (free) out.push([x, y + 1, z]) // feet on top of the wood voxel
      }
  return out
}

function finishTree(sk, o) {
  const parts = o.single ? { base: sk, fine: null } : splitSkeleton(sk, FINE_K)
  const rb = rasterize(parts.base)
  const fsk = parts.fine
  const rf = fsk && (fsk.segs.length || fsk.blobs.length || fsk.points.length) ? rasterize(fsk, { below: 4 }) : null
  const mb = rb.model, mf = rf?.model
  if (o.paint) { o.paint(mb, 1); if (mf) o.paint(mf, FINE_K) }
  if (mf) {
    // drop crown voxels hidden inside the trunk (no z-fighting, fewer triangles)
    for (let y = 0; y < mf.sy; y++)
      for (let z = 0; z < mf.sz; z++)
        for (let x = 0; x < mf.sx; x++) {
          const i = mf.idx(x, y, z)
          if (!mf.data[i]) continue
          const bx = Math.floor((x + 0.5 - mf.pivot.x) / FINE_K + mb.pivot.x)
          const by = Math.floor((y + 0.5 - mf.pivot.y) / FINE_K + mb.pivot.y)
          const bz = Math.floor((z + 0.5 - mf.pivot.z) / FINE_K + mb.pivot.z)
          if (mb.get(bx, by, bz)) mf.data[i] = 0
        }
  }
  const snowOpts = { mats: o.snowMats, minHoriz: o.minHoriz ?? 0.5, chance: o.snowChance ?? 0.55, shelter: o.shelter ?? 0.6, seed: o.seed }
  const spotsB = branchSnow(rb, { ...snowOpts, minY: mb.pivot.y + 2 })
  const spotsF = mf ? branchSnow(rf, { ...snowOpts, minY: mf.pivot.y + 4, seed: o.seed + 1 }) : []
  const vsB = VOXEL, vsF = VOXEL / FINE_K
  const loc = (m, vs) => v => [(v[0] + 0.5 - m.pivot.x) * vs, (v[1] - m.pivot.y) * vs, (v[2] + 0.5 - m.pivot.z) * vs]
  // size
  let height = (mb.sy - mb.pivot.y) * vsB, crownR = 0
  const ext = (m, vs) => {
    for (let y = 0; y < m.sy; y++)
      for (let z = 0; z < m.sz; z++)
        for (let x = 0; x < m.sx; x++)
          if (m.data[m.idx(x, y, z)]) crownR = Math.max(crownR, Math.hypot(x + 0.5 - m.pivot.x, z + 0.5 - m.pivot.z) * vs)
  }
  ext(mb, vsB)
  if (mf) { ext(mf, vsF); height = Math.max(height, (mf.sy - mf.pivot.y) * vsF) }
  // crow perches: wood with air above it, in the upper crown
  const perchY = height * (o.perchMinFrac ?? 0.45)
  const minH = o.perchHoriz ?? 140
  const cand = []
  perchScan(mb, rb.horiz, o.perchMats, Math.floor(perchY / vsB + mb.pivot.y), 2, minH, []).forEach(v => cand.push(loc(mb, vsB)(v)))
  if (mf) perchScan(mf, rf.horiz, o.perchMats, Math.floor(perchY / vsF + mf.pivot.y), 3, minH, []).forEach(v => cand.push(loc(mf, vsF)(v)))
  const rng = new RNG(o.seed * 31 + 7)
  rng.shuffle(cand)
  const perches = []
  for (const c of cand) {
    if (perches.length >= 18) break
    if (perches.some(q => Math.abs(q[0] - c[0]) + Math.abs(q[1] - c[1]) + Math.abs(q[2] - c[2]) < 1.5)) continue
    perches.push(c)
  }
  const spots = [...spotsB.map(loc(mb, vsB)), ...spotsF.map(loc(mf || mb, vsF))].filter(q => q[1] >= 3)
  rng.shuffle(spots)
  mb.nature = { height, crownR, perches, snowSpots: spots.slice(0, 32) }
  useThinLods(mb, o.thinMin, o.snowMin)
  if (mf) fineScale(mf, 1 / FINE_K, o.crownThin, o.crownSnow)
  return { base: mb, crown: mf || null }
}

/** Saplings: one model, entirely in fine voxels. */
function finishFine(r, o) {
  const m = r.model
  const vs = VOXEL * o.fine
  const spots = branchSnow(r, { mats: o.snowMats, minHoriz: o.minHoriz ?? 0.5, chance: o.snowChance ?? 0.55, shelter: o.shelter ?? 0.6, seed: o.seed, minY: m.pivot.y + 4 })
  const loc = v => [(v[0] + 0.5 - m.pivot.x) * vs, (v[1] - m.pivot.y) * vs, (v[2] + 0.5 - m.pivot.z) * vs]
  const height = (m.sy - m.pivot.y) * vs
  let crownR = 0
  for (let y = 0; y < m.sy; y++)
    for (let z = 0; z < m.sz; z++)
      for (let x = 0; x < m.sx; x++)
        if (m.data[m.idx(x, y, z)]) crownR = Math.max(crownR, Math.hypot(x + 0.5 - m.pivot.x, z + 0.5 - m.pivot.z) * vs)
  const perches = perchScan(m, r.horiz, o.perchMats, Math.floor(m.sy * (o.perchMinFrac ?? 0.45)), 3, o.perchHoriz ?? 140, []).slice(0, 6).map(loc)
  m.nature = { height, crownR, perches, snowSpots: spots.map(loc).filter(q => q[1] >= 1.2).slice(0, 8) }
  fineScale(m, o.fine)
  return { base: m, crown: null }
}

// ---- trunk helpers --------------------------------------------------------------------------------
function trunk(sk, rng, o) {
  return sk.grow({
    p: o.base ?? [0, -2, 0], dir: fromVertical(o.lean ?? 0, o.leanAz ?? 0), length: o.length,
    step: o.step ?? 4, r0: o.r0, r1: o.r1, gnarl: o.gnarl ?? 0.04, trop: UP, tropK: o.tropK ?? 0.03,
    rng, mat: o.mat, matFn: o.matFn, prio: PRIO.trunk, conn: 6,
  })
}

/**
 * Recolour birch bark (k = voxels per 25 cm): sparse dark lenticel dashes, dark marks under the
 * branch scars, a dark fissured foot. Kept sparse: a birch reads white from afar, not zebra.
 */
function birchBark(m, rng, baseH, junctions, k = 1) {
  const S = m.sx * m.sz
  for (let y = 0; y < m.sy; y++)
    for (let z = 0; z < m.sz; z++)
      for (let x = 0; x < m.sx; x++) {
        const i = x + m.sx * (z + m.sz * y)
        if (m.data[i] !== MAT.barkBirch) continue
        const yy = y - m.pivot.y
        if (yy < baseH) {
          const f = yy / Math.max(1, baseH)
          const r = rng.next()
          if (r < 0.8 - 0.55 * f) m.data[i] = r < 0.3 ? MAT.bark : MAT.barkBirchDark
          continue
        }
        // ragged transition above the dark foot
        if (yy < baseH * 1.5 && rng.next() < 0.25) { m.data[i] = MAT.barkBirchDark; continue }
        if (rng.next() < 0.045 && m.data[i - S] === MAT.barkBirch) {
          m.data[i] = MAT.barkBirchDark
          // a short horizontal dash
          const nx = rng.chance(0.5) ? 1 : -1
          if (rng.chance(0.4) && m.data[i + nx] === MAT.barkBirch) m.data[i + nx] = MAT.barkBirchDark
          else if (rng.chance(0.4) && m.data[i + nx * m.sx] === MAT.barkBirch) m.data[i + nx * m.sx] = MAT.barkBirchDark
        }
      }
  // dark marks just under the branch scars
  for (const j of junctions) {
    const x = Math.floor(j[0] * k + m.pivot.x), y = Math.floor(j[1] * k + m.pivot.y), z = Math.floor(j[2] * k + m.pivot.z)
    for (let dy = -k; dy < 0; dy++)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const id = m.get(x + dx, y + dy, z + dz)
          if (id === MAT.barkBirch && rng.chance(0.4)) m.set(x + dx, y + dy, z + dz, MAT.barkBirchDark)
        }
  }
}

function lowerTrunk(m, mat, newMat, maxY, chance, rng) {
  for (let y = 0; y < Math.min(m.sy, m.pivot.y + maxY); y++)
    for (let z = 0; z < m.sz; z++)
      for (let x = 0; x < m.sx; x++) {
        const i = m.idx(x, y, z)
        if (m.data[i] === mat && (chance >= 1 || rng.next() < chance)) m.data[i] = newMat
      }
}

// ---- BIRCH (Betula pendula): white trunk, arching limbs, curtains of hanging twigs --------------
function buildBirch(seed, Hm, o = {}) {
  const rng = new RNG(seed)
  const H = Hm * 4
  const sk = new Skeleton()
  const stems = o.stems ?? 1
  const junctions = []
  const az0 = rng.float(0, TAU)
  for (let s = 0; s < stems; s++) {
    const az = az0 + s * TAU / stems + rng.float(-0.4, 0.4)
    const base = stems > 1 ? [Math.cos(az) * 1.1, -2, Math.sin(az) * 1.1] : [0, -2, 0]
    const lean = stems > 1 ? rng.float(0.1, 0.22) : rng.float(0.0, 0.06)
    const h = s === 0 ? H : H * rng.float(0.8, 0.93)
    const r0 = stems > 1 ? (s === 0 ? 0.95 : 0.8) : (H > 52 ? 1.15 : H > 44 ? 1.0 : 0.85)
    const tp = trunk(sk, rng, { base, lean, leanAz: az, length: h + 2, r0, r1: 0.4, gnarl: 0.05, mat: MAT.barkBirch })
    const top = tp[tp.length - 1].p[1]
    // dead stubs on the bare lower trunk
    const crown0 = h * rng.float(0.3, 0.42)
    const nStubs = rng.int(2, 5)
    for (let k = 0; k < nStubs; k++) {
      const q = atY(tp, rng.float(h * 0.12, crown0))
      junctions.push(q.p)
      sk.grow({ p: q.p, dir: deviate(q.dir, rng.float(1.0, 1.4), rng.float(0, TAU)), length: rng.float(1.2, 3), step: 1.5, r0: 0.4, r1: 0.4, rng, mat: MAT.branch, prio: PRIO.branch })
    }
    let y = crown0
    let roll = rng.float(0, TAU)
    while (y < top - 2) {
      const t = (y - crown0) / Math.max(1, top - crown0)
      const q = atY(tp, y)
      roll += 2.4 + rng.float(-0.5, 0.5)
      const env = Math.pow(Math.sin(Math.PI * (0.1 + 0.9 * t)), 0.7) * (1 - 0.3 * t)
      const L = H * 0.4 * env * rng.float(0.75, 1.15) + 2
      const ang = lerp(0.9, 0.3, t) + rng.float(-0.15, 0.15)
      const r = Math.max(0.42, q.r * 0.62)
      junctions.push(q.p)
      birchLimb(sk, rng, q.p, deviate(q.dir, ang, roll), L, r, t)
      y += rng.float(2.2, 4.2) * (stems > 1 ? 1.35 : 1)
    }
    // leader tip twigs
    const tip = tp[tp.length - 1]
    for (let k = 0; k < 4; k++) hangTwig(sk, rng, tip.p, deviate(UP, rng.float(0.6, 1.3), rng.float(0, TAU)), rng.float(2, 5), 0.25)
  }
  const baseH = H > 48 ? rng.float(4, 7) : rng.float(2, 4)
  const brng = new RNG(seed + 5)
  return finishTree(sk, {
    seed, snowMats: new Set([MAT.limbBirch, MAT.branch]), minHoriz: 0.45, snowChance: 0.6,
    perchMats: new Set([MAT.limbBirch, MAT.branch]),
    paint: (m, k) => birchBark(m, brng, baseH * k, junctions, k),
  })
}

function birchLimb(sk, rng, p, dir, L, r, tCrown) {
  const pts = sk.grow({
    p, dir, length: L, step: 2.4, r0: r, r1: 0.4, gnarl: 0.1, trop: DOWN,
    tropK: t => 0.015 + 0.1 * t, rng,
    matFn: (t, rr) => (t < 0.7 ? MAT.limbBirch : MAT.branch), prio: PRIO.limb,
  })
  let side = rng.chance(0.5) ? 1 : -1
  for (let i = 1; i < pts.length; i++) {
    const q = pts[i]
    if (q.t < 0.2 || rng.chance(0.42)) continue
    side = -side
    const sd = norm(add(deviate(q.dir, rng.float(0.55, 0.95), side * rng.float(1.2, 1.9)), mul(DOWN, 0.2)))
    const sl = L * rng.float(0.2, 0.38) * (1 - 0.4 * q.t) + 1.5
    const sp = sk.grow({ p: q.p, dir: sd, length: sl, step: 2, r0: 0.4, r1: 0.4, gnarl: 0.14, trop: DOWN, tropK: 0.14, rng, mat: MAT.branch, prio: PRIO.branch, conn: 18 })
    const e = sp[sp.length - 1]
    hangTwig(sk, rng, e.p, e.dir, rng.float(2.5, 6) * (1.1 - 0.5 * tCrown), 0.45)
    if (sp.length > 2 && rng.chance(0.3)) hangTwig(sk, rng, sp[1].p, sp[1].dir, rng.float(2, 4), 0.4)
  }
  const tip = pts[pts.length - 1]
  for (let k = 0; k < 2; k++) hangTwig(sk, rng, tip.p, tip.dir, rng.float(3, 8) * (1.1 - 0.5 * tCrown), 0.4)
}

/** A thin pendulous twig: a short reach outward, then hanging down. */
function hangTwig(sk, rng, p, dir, length, reach) {
  const d0 = norm(add(mul(norm([dir[0], 0, dir[2]]), reach + rng.float(0, 0.4)), [0, rng.float(-0.1, 0.4), 0]))
  sk.grow({
    p, dir: d0, length, step: 1.6, r0: 0.3, r1: 0.3, gnarl: 0.12, trop: DOWN, tropK: 0.45, rng,
    mat: MAT.twigBirch, prio: PRIO.twig, conn: 26,
  })
}

// ---- POPLAR: tall fastigiate crowns, and the Moscow pollarded "fists with bristles" ---------------
function poplarBark(m, rng, k = 1) {
  // darker fissured foot
  lowerTrunk(m, MAT.barkPoplar, MAT.bark, 4 * k, 0.4, rng)
  lowerTrunk(m, MAT.barkPoplar, MAT.bark, 10 * k, 0.07, rng)
}

function buildPoplar(seed, Hm) {
  const rng = new RNG(seed)
  const H = Hm * 4
  const sk = new Skeleton()
  const r0 = rng.float(1.5, 1.9)
  const splitY = H * rng.float(0.32, 0.5)
  const tp = trunk(sk, rng, { lean: rng.float(0, 0.05), leanAz: rng.float(0, TAU), length: splitY + 2, r0, r1: r0 * 0.75, gnarl: 0.03, mat: MAT.barkPoplar })
  const top = tp[tp.length - 1]
  const leaders = [tp]
  const nL = rng.int(2, 3)
  const az0 = rng.float(0, TAU)
  for (let k = 0; k < nL; k++) {
    const d = fromVertical(rng.float(0.12, 0.3), az0 + k * TAU / nL)
    leaders.push(sk.grow({ p: top.p, dir: d, length: (H - splitY) * rng.float(0.85, 1.0), step: 4, r0: top.r * 0.72, r1: 0.45, gnarl: 0.05, trop: UP, tropK: 0.03, rng, matFn: (t, rr) => (rr > 0.62 ? MAT.barkPoplar : MAT.twigGrey), prio: PRIO.trunk, conn: 6 }))
  }
  for (const lp of leaders) {
    const y0 = Math.max(H * 0.2, lp[0].p[1] + 1), y1 = lp[lp.length - 1].p[1] - 1
    let y = y0, roll = rng.float(0, TAU)
    while (y < y1) {
      const q = atY(lp, y)
      const t = (y - H * 0.2) / (H * 0.8)
      roll += 2.4 + rng.float(-0.4, 0.4)
      const env = 0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.1))
      const L = H * 0.2 * env * rng.float(0.7, 1.2) + 2
      const d = fromVertical(rng.float(0.32, 0.62), roll)
      const pts = sk.grow({ p: q.p, dir: d, length: L, step: 2.5, r0: 0.55, r1: 0.4, gnarl: 0.08, trop: UP, tropK: 0.07, rng, mat: MAT.twigGrey, prio: PRIO.limb })
      for (let i = 1; i < pts.length; i++) {
        if (rng.chance(0.3)) continue
        const sd = norm(add(deviate(pts[i].dir, rng.float(0.4, 0.8), rng.float(0, TAU)), [0, 0.5, 0]))
        sk.grow({ p: pts[i].p, dir: sd, length: rng.float(2, 6), step: 2, r0: 0.35, r1: 0.35, gnarl: 0.08, trop: UP, tropK: 0.08, rng, mat: MAT.twigGrey, prio: PRIO.twig })
      }
      y += rng.float(1.8, 3.5)
    }
  }
  const prng = new RNG(seed + 5)
  return finishTree(sk, {
    seed, snowMats: new Set([MAT.twigGrey, MAT.barkPoplar]), minHoriz: 0.42, snowChance: 0.5,
    perchMats: new Set([MAT.twigGrey]), perchHoriz: 0, perchMinFrac: 0.55, thinMin: f => (f <= 2 ? 2 : 7),
    crownThin: k => (k <= 2 ? 2 : 8),
    paint: (m, k) => poplarBark(m, prng, k),
  })
}

function buildPollard(seed, Hm, o = {}) {
  const rng = new RNG(seed)
  const H = Hm * 4
  const sk = new Skeleton()
  const r0 = rng.float(1.75, 2.25)
  const stems = []
  const lean = rng.float(0.0, 0.07), leanAz = rng.float(0, TAU)
  if (o.fork) {
    const fy = H * rng.float(0.45, 0.6)
    const tp = trunk(sk, rng, { lean, leanAz, length: fy + 2, r0, r1: r0 * 0.85, mat: MAT.barkPoplar })
    const top = tp[tp.length - 1]
    for (let k = 0; k < 2; k++) {
      const d = fromVertical(rng.float(0.18, 0.32), leanAz + k * Math.PI + rng.float(-0.3, 0.3))
      stems.push(sk.grow({ p: top.p, dir: d, length: (H - fy) * rng.float(0.8, 1.0), step: 3, r0: r0 * 0.68, r1: r0 * 0.6, gnarl: 0.05, rng, mat: MAT.barkPoplar, prio: PRIO.trunk, conn: 6 }))
    }
  } else {
    stems.push(trunk(sk, rng, { lean, leanAz, length: H + 2, r0, r1: r0 * 0.78, gnarl: 0.03, mat: MAT.barkPoplar }))
  }
  const knuckles = []
  for (const tp of stems) {
    const top = tp[tp.length - 1]
    // cut top: a swollen knuckle
    sk.blob(top.p, top.r + 0.6, 1.3, top.r + 0.6, MAT.barkPoplar, PRIO.trunk, 1, seed + 3)
    knuckles.push({ p: add(top.p, [0, 1, 0]), r: top.r + 0.5 })
    const nLimbs = rng.int(3, 5)
    const az0 = rng.float(0, TAU)
    for (let k = 0; k < nLimbs; k++) {
      const q = atY(tp, top.p[1] - rng.float(0.5, 6))
      const d = fromVertical(rng.float(0.35, 0.95), az0 + k * TAU / nLimbs + rng.float(-0.4, 0.4))
      const L = rng.float(3, 10)
      const pts = sk.grow({ p: q.p, dir: d, length: L, step: 2.5, r0: rng.float(1.0, 1.25), r1: 0.9, gnarl: 0.12, trop: UP, tropK: 0.05, rng, mat: MAT.barkPoplar, prio: PRIO.limb, conn: 6 })
      const e = pts[pts.length - 1]
      const kr = rng.float(1.3, 1.8)
      sk.blob(e.p, kr, kr * 0.9, kr, MAT.barkPoplar, PRIO.limb, 1, seed + k)
      knuckles.push({ p: e.p, r: kr })
      // a sprout or two along the limb
      for (let s = 0; s < rng.int(0, 2); s++) {
        const a = pts[rng.int(0, pts.length - 1)].p
        sprout(sk, rng, add(a, [0, 0.8, 0]), rng.float(3, 8))
      }
    }
    // epicormic shoots on the trunk
    for (let s = 0; s < rng.int(3, 8); s++) {
      const q = atY(tp, rng.float(5, top.p[1] - 3))
      const az = rng.float(0, TAU)
      const p = add(q.p, [Math.cos(az) * q.r, 0, Math.sin(az) * q.r])
      sk.grow({ p, dir: norm([Math.cos(az), 0.9, Math.sin(az)]), length: rng.float(1.5, 4), step: 1.5, r0: 0.3, r1: 0.3, gnarl: 0.15, trop: UP, tropK: 0.1, rng, mat: MAT.twigGrey, prio: PRIO.twig })
    }
  }
  // bristles of straight shoots from every knuckle
  for (const k of knuckles) {
    const n = rng.int(4, 9)
    for (let s = 0; s < n; s++) {
      const az = rng.float(0, TAU)
      const rr = k.r * rng.float(0.4, 1.0)
      const p = add(k.p, [Math.cos(az) * rr, rng.float(0, 0.8), Math.sin(az) * rr])
      sprout(sk, rng, p, rng.float(4, 12) * (o.short ? 0.6 : 1))
    }
  }
  if (o.regrown) {
    // one leader allowed to grow back: a thin tall shoot with side twigs
    const k = knuckles[0]
    const pts = sk.grow({ p: k.p, dir: fromVertical(0.12, rng.float(0, TAU)), length: rng.float(14, 20), step: 2.5, r0: 0.62, r1: 0.38, gnarl: 0.06, trop: UP, tropK: 0.05, rng, matFn: (t, rr) => (rr > 0.55 ? MAT.branch : MAT.twigGrey), prio: PRIO.limb })
    for (let i = 2; i < pts.length; i++) if (rng.chance(0.7)) sprout(sk, rng, pts[i].p, rng.float(2, 5))
  }
  const prng = new RNG(seed + 5)
  return finishTree(sk, {
    seed, snowMats: new Set([MAT.barkPoplar, MAT.twigGrey]),
    minHoriz: mat => (mat === MAT.barkPoplar ? 0 : 0.5), snowChance: 0.75, shelter: 0.5,
    perchMats: new Set([MAT.barkPoplar, MAT.twigGrey]), perchHoriz: 0, perchMinFrac: 0.4, thinMin: f => (f <= 2 ? 2 : 6),
    crownThin: k => (k <= 2 ? 2 : 6),
    paint: (m, k) => poplarBark(m, prng, k),
  })
}

function sprout(sk, rng, p, length) {
  const az = rng.float(0, TAU)
  const d = norm(add(fromVertical(rng.float(0, 0.32), az), [0, 0.2, 0]))
  const pts = sk.grow({ p, dir: d, length, step: 2, r0: 0.35, r1: 0.35, gnarl: 0.05, trop: UP, tropK: 0.05, rng, mat: MAT.twigGrey, prio: PRIO.twig, conn: 18 })
  if (length > 6 && rng.chance(0.3)) {
    const q = pts[Math.floor(pts.length * 0.6)]
    sk.grow({ p: q.p, dir: deviate(q.dir, rng.float(0.3, 0.6), rng.float(0, TAU)), length: rng.float(2, 4), step: 2, r0: 0.3, r1: 0.3, gnarl: 0.08, rng, mat: MAT.twigGrey, prio: PRIO.twig })
  }
}

// ---- MAPLE: Norway maple (forked, round crown) and ash-leaved maple (sprawling, seed keys) -------
function buildMaple(seed, Hm) {
  const rng = new RNG(seed)
  const H = Hm * 4
  const sk = new Skeleton()
  const forkY = rng.float(2.5, 3.8) * 4
  const tp = trunk(sk, rng, { lean: rng.float(0, 0.08), leanAz: rng.float(0, TAU), length: forkY + 2, r0: rng.float(1.1, 1.35), r1: 1.0, mat: MAT.bark })
  const top = tp[tp.length - 1]
  const n = rng.int(3, 4)
  const az0 = rng.float(0, TAU)
  for (let k = 0; k < n; k++) {
    const ang = rng.float(0.35, 0.72)
    const d = fromVertical(ang, az0 + k * TAU / n + rng.float(-0.35, 0.35))
    const L = (H - forkY) * rng.float(0.78, 1.0) / Math.cos(ang * 0.6)
    const pts = sk.grow({
      p: add(top.p, [0, -1, 0]), dir: d, length: L, step: 2.6, r0: 0.95, r1: 0.4, gnarl: 0.1, trop: UP, tropK: t => 0.03 - 0.07 * t, rng,
      matFn: (t, rr) => (rr > 0.62 ? MAT.bark : MAT.branch), prio: PRIO.limb, conn: 6,
    })
    let roll = rng.float(0, TAU)
    for (let i = 1; i < pts.length; i++) {
      const q = pts[i]
      if (q.t < 0.15) continue
      roll += Math.PI / 2
      for (const s of [0, Math.PI]) {
        if (rng.chance(0.4)) continue
        const sd = norm(add(deviate(q.dir, rng.float(0.6, 0.95), roll + s), [0, 0.15, 0]))
        const sl = L * (1 - q.t) * rng.float(0.35, 0.6) + 2
        const sp = sk.grow({ p: q.p, dir: sd, length: sl, step: 2, r0: 0.4, r1: 0.4, gnarl: 0.13, trop: DOWN, tropK: 0.03, rng, mat: MAT.branch, prio: PRIO.branch })
        for (let j = 1; j < sp.length; j++) if (rng.chance(0.5)) twigs(sk, rng, sp[j].p, sp[j].dir, 1, 1.5, 3.5, MAT.twigGrey)
      }
    }
  }
  return finishTree(sk, { seed, snowMats: new Set([MAT.branch, MAT.bark]), minHoriz: 0.45, snowChance: 0.55, perchMats: new Set([MAT.branch]) })
}

function buildNegundo(seed, Hm) {
  const rng = new RNG(seed)
  const H = Hm * 4
  const sk = new Skeleton()
  const n = rng.int(2, 4)
  const az0 = rng.float(0, TAU)
  const tips = []
  for (let s = 0; s < n; s++) {
    const az = az0 + s * TAU / n + rng.float(-0.5, 0.5)
    const lean = rng.float(0.22, 0.6)
    const L = H * rng.float(0.75, 1.0) / Math.cos(lean * 0.7)
    const base = [Math.cos(az) * 1.2, -2, Math.sin(az) * 1.2]
    const tp = sk.grow({ p: base, dir: fromVertical(lean, az), length: L, step: 3, r0: rng.float(0.75, 0.95), r1: 0.4, gnarl: 0.16, trop: UP, tropK: 0.045, rng, matFn: (t, rr) => (rr > 0.62 ? MAT.bark : MAT.branch), prio: PRIO.trunk, conn: 6 })
    for (let i = 2; i < tp.length; i++) {
      if (tp[i].t < 0.25 || rng.chance(0.2)) continue
      const bd = deviate(tp[i].dir, rng.float(0.7, 1.2), rng.float(0, TAU))
      const bp = sk.grow({ p: tp[i].p, dir: bd, length: rng.float(4, 11), step: 2.2, r0: 0.4, r1: 0.4, gnarl: 0.18, trop: UP, tropK: 0.03, rng, mat: MAT.twigGrey, prio: PRIO.branch })
      for (let j = 1; j < bp.length; j++) twigs(sk, rng, bp[j].p, bp[j].dir, rng.int(1, 2), 1.5, 3, MAT.twigGrey, tips)
      tips.push(bp[bp.length - 1].p)
    }
  }
  // hanging clusters of dry seed keys (Acer negundo keeps them all winter)
  for (const t of tips) {
    if (!rng.chance(0.3)) continue
    const len = rng.int(2, 4)
    for (let k = 1; k <= len; k++) sk.point(add(t, [rng.float(-0.4, 0.4), -k, rng.float(-0.4, 0.4)]), MAT.seeds, PRIO.fruit)
  }
  return finishTree(sk, { seed, snowMats: new Set([MAT.branch, MAT.twigGrey, MAT.bark]), minHoriz: 0.45, snowChance: 0.5, perchMats: new Set([MAT.branch, MAT.twigGrey]) })
}

function twigs(sk, rng, p, dir, n, lmin, lmax, mat, tipsOut) {
  for (let k = 0; k < n; k++) {
    const pts = sk.grow({ p, dir: deviate(dir, rng.float(0.45, 1.0), rng.float(0, TAU)), length: rng.float(lmin, lmax), step: 1.4, r0: 0.3, r1: 0.3, gnarl: 0.25, rng, mat, prio: PRIO.twig })
    if (tipsOut) tipsOut.push(pts[pts.length - 1].p)
  }
}

// ---- LINDEN: straight stem, dense oval crown of zig-zag twigs, suckers at the foot -----------------
function buildLinden(seed, Hm, o = {}) {
  const rng = new RNG(seed)
  const H = Hm * 4
  const sk = new Skeleton()
  const r0 = rng.float(1.05, 1.4)
  const tp = trunk(sk, rng, { lean: rng.float(0, 0.04), leanAz: rng.float(0, TAU), length: H * 0.9 + 2, r0, r1: 0.45, gnarl: 0.03, mat: MAT.bark })
  const top = tp[tp.length - 1].p[1]
  const crown0 = H * rng.float(0.22, 0.32)
  let y = crown0, roll = rng.float(0, TAU)
  while (y < top - 1) {
    const t = (y - crown0) / Math.max(1, top - crown0)
    const q = atY(tp, y)
    roll += 2.4 + rng.float(-0.4, 0.4)
    const env = Math.pow(Math.sin(Math.PI * (0.08 + 0.92 * t)), 0.6)
    const L = H * 0.3 * env * rng.float(0.75, 1.1) + 2
    const ang = lerp(1.15, 0.45, t) + rng.float(-0.12, 0.12)
    const pts = sk.grow({
      p: q.p, dir: deviate(q.dir, ang, roll), length: L, step: 2.4, r0: Math.max(0.45, q.r * 0.55), r1: 0.38, gnarl: 0.09, trop: UP, tropK: 0.06, rng,
      matFn: (tt, rr) => (rr > 0.62 ? MAT.bark : MAT.branch), prio: PRIO.limb,
    })
    let side = 1
    for (let i = 1; i < pts.length; i++) {
      const qq = pts[i]
      if (rng.chance(0.3)) continue
      side = -side
      const sd = deviate(qq.dir, rng.float(0.6, 1.0), roll + side * rng.float(1.2, 1.9))
      const sl = L * (1 - qq.t) * 0.45 + rng.float(1.5, 3)
      const sp = sk.grow({ p: qq.p, dir: sd, length: sl, step: 1.8, r0: 0.38, r1: 0.38, gnarl: 0.16, trop: UP, tropK: 0.05, rng, mat: MAT.branch, prio: PRIO.branch })
      for (let j = 1; j < sp.length; j++) if (rng.chance(0.45)) twigs(sk, rng, sp[j].p, sp[j].dir, 1, 1.5, 3, MAT.twigGrey)
    }
    y += rng.float(2.4, 4.2)
  }
  // a few suckers around the foot (lindens throw them up every spring)
  for (let k = 0; k < (rng.chance(0.6) ? rng.int(2, 6) : 0); k++) {
    const az = rng.float(0, TAU)
    const d = r0 + rng.float(0.4, 1.4)
    const p = [Math.cos(az) * d, -1, Math.sin(az) * d]
    sk.grow({ p, dir: fromVertical(rng.float(0.05, 0.35), az), length: rng.float(2, 6), step: 1.6, r0: 0.3, r1: 0.3, gnarl: 0.1, trop: UP, tropK: 0.06, rng, mat: MAT.twigGrey, prio: PRIO.twig })
  }
  const limeH = Math.round(rng.float(4, 5.5))
  return finishTree(sk, {
    seed, snowMats: new Set([MAT.branch, MAT.bark]), minHoriz: 0.45, snowChance: 0.5, shelter: 0.65, perchMats: new Set([MAT.branch]),
    paint: o.lime ? (m, k) => lowerTrunk(m, MAT.bark, MAT.lime, limeH * k, 1, rng) : null,
  })
}

// ---- APPLE: small, gnarled, low fork, a few frozen apples, whitewashed stem -----------------------
function buildApple(seed, Hm, o = {}) {
  const rng = new RNG(seed)
  const H = Hm * 4
  const sk = new Skeleton()
  const forkY = rng.float(3.5, 5.5)
  const tp = trunk(sk, rng, { lean: rng.float(0.05, 0.25), leanAz: rng.float(0, TAU), length: forkY + 2, step: 2, r0: rng.float(0.85, 1.05), r1: 0.85, gnarl: 0.08, mat: MAT.bark })
  const top = tp[tp.length - 1]
  const n = rng.int(3, 4)
  const az0 = rng.float(0, TAU)
  const tips = []
  for (let k = 0; k < n; k++) {
    const d = fromVertical(rng.float(0.55, 1.05), az0 + k * TAU / n + rng.float(-0.4, 0.4))
    const L = (H - forkY) * rng.float(0.7, 1.0)
    const pts = sk.grow({ p: top.p, dir: d, length: L, step: 2, r0: 0.72, r1: 0.4, gnarl: 0.24, trop: UP, tropK: 0.07, rng, matFn: (t, rr) => (rr > 0.62 ? MAT.bark : MAT.branch), prio: PRIO.limb, conn: 6 })
    for (let i = 1; i < pts.length; i++) {
      const q = pts[i]
      if (rng.chance(0.25)) continue
      const sp = sk.grow({ p: q.p, dir: deviate(q.dir, rng.float(0.5, 1.0), rng.float(0, TAU)), length: rng.float(3, 7), step: 1.6, r0: 0.38, r1: 0.38, gnarl: 0.25, trop: UP, tropK: 0.06, rng, mat: MAT.branch, prio: PRIO.branch })
      tips.push(sp[sp.length - 1].p)
      for (let j = 1; j < sp.length; j++) if (rng.chance(0.6)) twigs(sk, rng, sp[j].p, sp[j].dir, 1, 1, 2, MAT.twigGrey)
      // water sprouts
      if (rng.chance(0.3)) sk.grow({ p: add(q.p, [0, 0.6, 0]), dir: fromVertical(rng.float(0, 0.15), rng.float(0, TAU)), length: rng.float(3, 7), step: 2, r0: 0.3, r1: 0.3, gnarl: 0.03, rng, mat: MAT.twigGrey, prio: PRIO.twig })
    }
  }
  // a few dried apples still hanging
  rng.shuffle(tips)
  for (const t of tips.slice(0, rng.int(3, 7))) sk.point(add(t, [0, -1, 0]), MAT.berryRed, PRIO.fruit)
  return finishTree(sk, {
    seed, snowMats: new Set([MAT.branch, MAT.bark]), minHoriz: 0.4, snowChance: 0.6, perchMats: new Set([MAT.branch]), perchMinFrac: 0.4,
    paint: o.lime ? (m, k) => lowerTrunk(m, MAT.bark, MAT.lime, Math.round(forkY) * k, 1, rng) : null,
  })
}

// ---- SPRUCE: dark conical tiers, heavy snow on every tier ------------------------------------------
function buildSpruce(seed, Hm, o = {}) {
  const rng = new RNG(seed)
  const H = Hm * 4
  const sk = new Skeleton()
  const needles = o.blue ? MAT.needlesBlue : MAT.needles
  const tp = trunk(sk, rng, { lean: rng.float(0, 0.025), leanAz: rng.float(0, TAU), length: H + 1, r0: 0.75 + H / 90, r1: 0.35, gnarl: 0.015, mat: MAT.bark })
  const skirt = o.bare ? rng.float(5, 8) : rng.float(0.5, 2.5)
  const jit = o.blue ? 0.5 : 1
  // dead dry stubs below the skirt
  if (o.bare) {
    for (let y = 1; y < skirt; y += rng.float(1.5, 2.5)) {
      const q = atY(tp, y)
      for (let k = 0; k < 3; k++) sk.grow({ p: q.p, dir: fromVertical(rng.float(1.5, 1.9), rng.float(0, TAU)), length: rng.float(2, 5), step: 1.5, r0: 0.3, r1: 0.3, gnarl: 0.2, trop: DOWN, tropK: 0.05, rng, mat: MAT.twig, prio: PRIO.twig })
    }
  }
  let y = skirt
  while (y < H - 2.5) {
    const hrel = y / H
    const q = atY(tp, y)
    const nB = rng.int(6, 8)
    const roll0 = rng.float(0, TAU)
    const Lw = (H - y) * 0.3 * (y < skirt + 3 ? 0.92 : 1) + 1.5
    for (let b = 0; b < nB; b++) {
      const az = roll0 + b * TAU / nB + rng.float(-0.25, 0.25) * jit
      const L = Lw * rng.float(1 - 0.16 * jit, 1 + 0.08 * jit)
      const ang = lerp(1.78, 1.25, hrel) + rng.float(-0.06, 0.06)
      spruceBranch(sk, rng, q.p, fromVertical(ang, az), L, needles, hrel)
    }
    // tiers get closer toward the top
    y += lerp(4.6, 2.6, hrel) * rng.float(0.88, 1.12)
  }
  // leader spire
  const tip = tp[tp.length - 1].p
  sk.seg(add(tip, [0, -3, 0]), add(tip, [0, 2, 0]), 0.4, 0.4, needles, PRIO.needle, 6)
  sk.blob(add(tip, [0, -2, 0]), 1.1, 1.5, 1.1, needles, PRIO.needle, 0.9, seed + 99)
  return finishTree(sk, {
    single: true, seed, snowMats: new Set([needles, MAT.branch]), minHoriz: 0, snowChance: 0.9, shelter: 0.5,
    perchMats: new Set([needles]), perchMinFrac: 0.35, thinMin: f => (f <= 2 ? 2 : 5), snowMin: f => (f <= 2 ? 2 : 6),
  })
}

function spruceBranch(sk, rng, p, dir, L, needles, hrel) {
  const pts = sk.grow({ p, dir, length: L, step: 1.5, r0: 0.35, r1: 0.35, gnarl: 0.04, trop: UP, tropK: t => (t > 0.7 ? 0.16 : -0.06), rng, mat: MAT.branch, prio: PRIO.branch })
  for (let i = 1; i < pts.length; i++) {
    const q = pts[i]
    const w = lerp(1.5, 0.7, q.t)
    // a flat sagging layer of needles with a fringe hanging under its outer half
    sk.blob(add(q.p, [0, -0.2, 0]), w, 0.62, w, needles, PRIO.needle, 0.9, hash2(i, Math.floor(q.p[0] * 13 + q.p[2] * 7 + q.p[1] * 31)))
    if (q.t > 0.35 && rng.chance(0.5)) sk.seg(q.p, add(q.p, [rng.float(-0.6, 0.6), -rng.float(1.2, 2.2), rng.float(-0.6, 0.6)]), 0.3, 0.3, needles, PRIO.needle, 18)
  }
}

// ---- ROWAN: slender, ascending, clusters of red berries --------------------------------------------
function buildRowan(seed, Hm) {
  const rng = new RNG(seed)
  const H = Hm * 4
  const sk = new Skeleton()
  const stems = rng.chance(0.4) ? 2 : 1
  const tips = []
  for (let s = 0; s < stems; s++) {
    const az = rng.float(0, TAU)
    const base = stems > 1 ? [Math.cos(az) * 0.8, -2, Math.sin(az) * 0.8] : [0, -2, 0]
    const h = H * (s ? rng.float(0.75, 0.9) : 1)
    const tp = trunk(sk, rng, { base, lean: rng.float(0.02, stems > 1 ? 0.2 : 0.08), leanAz: az, length: h * 0.9 + 2, r0: 0.75, r1: 0.4, gnarl: 0.05, mat: MAT.barkPoplar })
    const top = tp[tp.length - 1].p[1]
    const crown0 = h * rng.float(0.3, 0.42)
    let y = crown0, roll = rng.float(0, TAU)
    while (y < top) {
      const t = (y - crown0) / Math.max(1, top - crown0)
      const q = atY(tp, y)
      roll += 2.4 + rng.float(-0.5, 0.5)
      const env = Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * t)), 0.7)
      const L = h * 0.3 * env * rng.float(0.75, 1.1) + 2
      const pts = sk.grow({ p: q.p, dir: deviate(q.dir, lerp(0.75, 0.35, t), roll), length: L, step: 2.2, r0: 0.45, r1: 0.4, gnarl: 0.1, trop: UP, tropK: 0.06, rng, mat: MAT.branch, prio: PRIO.limb })
      for (let i = 1; i < pts.length; i++) {
        if (rng.chance(0.35)) continue
        const sp = sk.grow({ p: pts[i].p, dir: deviate(pts[i].dir, rng.float(0.4, 0.8), rng.float(0, TAU)), length: rng.float(2, 5), step: 1.8, r0: 0.35, r1: 0.35, gnarl: 0.12, trop: UP, tropK: 0.06, rng, mat: MAT.branch, prio: PRIO.branch })
        tips.push(sp[sp.length - 1].p)
      }
      tips.push(pts[pts.length - 1].p)
      y += rng.float(2, 3.5)
    }
  }
  for (const t of tips) {
    if (!rng.chance(0.38)) continue
    sk.blob(add(t, [0, -0.9, 0]), rng.float(0.8, 1.2), 0.8, rng.float(0.8, 1.2), MAT.berryRed, PRIO.fruit, 0.75, hash2(Math.floor(t[0] * 10), Math.floor(t[1] * 10 + t[2])))
  }
  return finishTree(sk, { seed, snowMats: new Set([MAT.branch, MAT.berryRed]), minHoriz: 0.4, snowChance: 0.55, perchMats: new Set([MAT.branch]) })
}

// ---- SAPLINGS: young trees tied to stakes -----------------------------------------------------------
function buildSapling(seed, Hm, o = {}) {
  // fine 12.5 cm voxels: a sapling stem and its stakes are only a few centimetres thick
  const rng = new RNG(seed)
  const H = Hm * 8
  const sk = new Skeleton()
  const bark = o.birch ? MAT.barkBirch : MAT.bark
  const tp = sk.grow({ p: [0, -3, 0], dir: fromVertical(rng.float(0, 0.04), rng.float(0, TAU)), length: H + 3, step: 3, r0: 0.4, r1: 0.4, gnarl: 0.04, trop: UP, tropK: 0.05, rng, mat: bark, prio: PRIO.trunk, conn: 6 })
  const top = tp[tp.length - 1].p[1]
  for (let k = 0; k < rng.int(5, 9); k++) {
    const q = atY(tp, rng.float(top * 0.55, top - 1))
    const pts = sk.grow({ p: q.p, dir: fromVertical(rng.float(0.4, 0.8), rng.float(0, TAU)), length: rng.float(4, 10), step: 2, r0: 0.3, r1: 0.3, gnarl: 0.1, trop: o.birch ? DOWN : UP, tropK: o.birch ? 0.1 : 0.05, rng, mat: o.birch ? MAT.twigBirch : MAT.twigGrey, prio: PRIO.twig })
    if (o.birch) hangTwig(sk, rng, pts[pts.length - 1].p, pts[pts.length - 1].dir, rng.float(4, 8), 0.2)
  }
  const stakeH = rng.float(14, 17)
  const tieY = 10
  if (o.tripod) {
    const posts = []
    const az0 = rng.float(0, TAU)
    for (let k = 0; k < 3; k++) {
      const az = az0 + k * TAU / 3
      const p = [Math.round(Math.cos(az) * 5) + 0.5, 0, Math.round(Math.sin(az) * 5) + 0.5]
      sk.seg(add(p, [0, -3, 0]), add(p, [0, stakeH - 1, 0]), 0.4, 0.4, MAT.wood, PRIO.solid, 6)
      posts.push(p)
    }
    for (let k = 0; k < 3; k++) {
      const a = posts[k], b = posts[(k + 1) % 3]
      sk.seg(add(a, [0, tieY + 2, 0]), add(b, [0, tieY + 2, 0]), 0.4, 0.4, MAT.woodDark, PRIO.solid, 6)
      sk.seg(add(a, [0, tieY - 1, 0]), [0.5, tieY - 1, 0.5], 0.3, 0.3, MAT.rubber, PRIO.solid, 6)
    }
  } else {
    const nS = o.two ? 2 : 1
    const az0 = rng.float(0, TAU)
    for (let k = 0; k < nS; k++) {
      const az = az0 + k * Math.PI
      const p = [Math.round(Math.cos(az) * 3) + 0.5, 0, Math.round(Math.sin(az) * 3) + 0.5]
      const lean = o.slant ? [Math.cos(az) * -1.6, 0, Math.sin(az) * -1.6] : [0, 0, 0]
      sk.seg(add(p, [0, -3, 0]), add(add(p, lean), [0, stakeH - 1, 0]), 0.4, 0.4, MAT.wood, PRIO.solid, 6)
      sk.seg(add(p, [0, tieY, 0]), [0.5, tieY, 0.5], 0.3, 0.3, MAT.rubber, PRIO.solid, 6)
    }
  }
  const r = rasterize(sk, { below: 3 })
  if (o.lime) lowerTrunk(r.model, bark, MAT.lime, 8, 1, rng)
  if (o.birch) birchBark(r.model, rng, 0, [])
  return finishFine(r, {
    seed, fine: 0.5, snowMats: new Set([MAT.wood, MAT.woodDark, MAT.twigGrey, MAT.twigBirch]), minHoriz: mat => (mat === MAT.wood ? 0 : 0.5),
    snowChance: 0.8, perchMats: new Set([MAT.twigGrey, MAT.woodDark]), perchMinFrac: 0.3,
  })
}

// ---- registration -----------------------------------------------------------------------------------
// Trunk models (25 cm): LOD distances as before. Crown models (12.5 cm → 25 cm → 50 cm thinned).
const BIG = { lods: [1, 2, 4], lodDistances: [55, 140], maxDistance: 400 }
const MID = { lods: [1, 2, 4], lodDistances: [45, 120], maxDistance: 320 }
const SMALL = { lods: [1, 2], lodDistances: [40], maxDistance: 200 }
// (the engine meshes a factor of exactly 1 straight from the model, so the 25 cm crown level is
// asked for as 0.999: thinned by 2 in fineScale's reducer, meshed at 0.1 % under 25 cm)
const LOD1 = 0.999
const CROWN_BIG = { lods: [0.5, LOD1, 2], lodDistances: [38, 110], maxDistance: 400, collide: false, contact: false }
const CROWN_MID = { lods: [0.5, LOD1, 2], lodDistances: [34, 95], maxDistance: 320, collide: false, contact: false }
const CROWN_SMALL = { lods: [0.5, LOD1], lodDistances: [32], maxDistance: 200, collide: false, contact: false }

function reg(species, kind, idx, heightM, build, opts, crownOpts) {
  if (!SPECIES[species]) SPECIES[species] = { variants: [] }
  const name = `nature_${species}_${idx}`
  let built = null
  const get = () => (built ||= build())
  defineModel(name, () => get().base, opts)
  let crown = null
  if (crownOpts) {
    crown = `${name}_crown`
    defineModel(crown, () => get().crown || fineScale(new VoxelModel(1, 1, 1), 0.5), crownOpts)
  }
  SPECIES[species].variants.push({ name, crown, height: heightM, idx, kind })
}

// birch: 8 variants (three are clumps of 2–3 stems, the way birches self-seed)
;[[10.5, 1], [12, 1], [13, 2], [14, 1], [15, 1], [16.5, 3], [17.5, 1], [12.5, 2]].forEach(([h, stems], i) =>
  reg('birch', stems > 1 ? 'clump' : 'single', i, h, () => buildBirch(1000 + i * 37, h, { stems }), BIG, CROWN_BIG))
// poplar: 4 tall natural crowns, 4 pollarded (опиленные) — the courtyard classic
;[19, 21, 23, 24.5].forEach((h, i) => reg('poplar', 'natural', i, h, () => buildPoplar(2000 + i * 41, h), BIG, CROWN_BIG))
;[[7.5, {}], [8.5, { short: true }], [10, { fork: true }], [11, { regrown: true }]].forEach(([h, o], i) =>
  reg('poplar', 'pollarded', 4 + i, h + 2, () => buildPollard(2100 + i * 43, h, o), BIG, CROWN_BIG))
// maple: 3 Norway maples, 3 ash-leaved maples
;[10, 12, 14].forEach((h, i) => reg('maple', 'norway', i, h, () => buildMaple(3000 + i * 47, h), BIG, CROWN_BIG))
;[7, 8.5, 9.5].forEach((h, i) => reg('maple', 'negundo', 3 + i, h, () => buildNegundo(3100 + i * 53, h), MID, CROWN_MID))
// linden: 6 variants, two with whitewashed stems
;[11, 12.5, 13.5, 15, 16, 17.5].forEach((h, i) => reg('linden', 'single', i, h, () => buildLinden(4000 + i * 59, h, { lime: i === 1 || i === 3 }), BIG, CROWN_BIG))
// apple: 5 small gnarled trees, most whitewashed
;[3.6, 4.0, 4.4, 4.8, 5.2].forEach((h, i) => reg('apple', 'single', i, h, () => buildApple(5000 + i * 61, h, { lime: i !== 3 }), SMALL, CROWN_SMALL))
// spruce: 4 green (one with a bare dry skirt), 2 blue
;[[6.5, {}], [9, {}], [11.5, { bare: true }], [14, {}], [8, { blue: true }], [12, { blue: true }]].forEach(([h, o], i) =>
  reg('spruce', o.blue ? 'blue' : 'green', i, h, () => buildSpruce(6000 + i * 67, h, o), h > 10 ? BIG : MID))
// rowan: 4 variants
;[5, 6, 7, 8].forEach((h, i) => reg('rowan', 'single', i, h, () => buildRowan(7000 + i * 71, h), MID, CROWN_MID))
// saplings: one stake / birch / tripod / two stakes slanted, whitewashed
;[[2.2, {}], [2.6, { birch: true }], [3.0, { tripod: true }], [3.4, { two: true, slant: true, lime: true }]].forEach(([h, o], i) =>
  reg('sapling', 'young', i, h, () => buildSapling(8000 + i * 73, h, o), { lods: [0.5], lodDistances: [], maxDistance: 150, collide: false, contact: false }))

export const SPECIES_NAMES = Object.keys(SPECIES)
