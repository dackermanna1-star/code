// Bushes, hedges, dry weeds and reeds poking out of the snow.

import { defineModel } from '../../core/models.js'
import { RNG, hash2 } from '../../core/rng.js'
import { MAT } from './materials.js'
import { Skeleton, rasterize, branchSnow, fineScale, scaleSkeleton, fromVertical, deviate, add, norm, PRIO } from './voxutil.js'
import { VOXEL } from '../../core/constants.js'
import { VoxelModel } from '../../core/VoxelModel.js'

export const PLANTS = {} // kind → [model names]
const TAU = Math.PI * 2
const UP = [0, 1, 0], DOWN = [0, -1, 0]

function reg(kind, name, build, opts) {
  ;(PLANTS[kind] ||= []).push(name)
  defineModel(name, build, opts)
}

// Bushes are built from fine 12.5 cm voxels (like weeds): at 25 cm a shrub of thin stems turns into
// a dark heap. Fine-scale models do not collide (the player can push into a bush).
const BFINE = 0.5

function snowyFine(r, mats, seed, chance = 0.6, minHoriz = 0.4) {
  branchSnow(r, { mats: new Set(mats), minHoriz, chance, shelter: 0.55, seed, minY: 3 })
  return fineScale(r.model, BFINE, k => (k <= 2 ? 3 : 10))
}

// ---- lilac (сирень): upright grey stems fanning out, dry brown panicles at the tips -------------
function lilac(seed) {
  const rng = new RNG(seed)
  const sk = new Skeleton()
  const n = rng.int(7, 11)
  const H = rng.float(18, 26)
  const tips = []
  for (let i = 0; i < n; i++) {
    const a = rng.float(0, TAU), d = rng.float(0.5, 5)
    const base = [Math.cos(a) * d, -2, Math.sin(a) * d]
    const lean = rng.float(0.08, 0.42)
    const L = H * rng.float(0.65, 1.05)
    const pts = sk.grow({ p: base, dir: fromVertical(lean, a + rng.float(-0.5, 0.5)), length: L, step: 3, r0: 0.4, r1: 0.4, gnarl: 0.07, trop: UP, tropK: 0.02, rng, mat: MAT.twigGrey, prio: PRIO.branch, conn: 6 })
    // opposite side shoots in the upper half
    for (let j = Math.floor(pts.length * 0.5); j < pts.length; j++) {
      if (!rng.chance(0.45)) continue
      for (const s of [0, Math.PI]) {
        if (rng.chance(0.3)) continue
        const sp = sk.grow({ p: pts[j].p, dir: deviate(pts[j].dir, rng.float(0.45, 0.8), s + rng.float(0, 1)), length: rng.float(3, 7), step: 2, r0: 0.3, r1: 0.3, gnarl: 0.12, trop: UP, tropK: 0.06, rng, mat: MAT.twigGrey, prio: PRIO.twig })
        tips.push(sp[sp.length - 1].p)
      }
    }
    tips.push(pts[pts.length - 1].p)
  }
  for (const t of tips) {
    if (!rng.chance(0.45)) continue
    sk.blob(add(t, [0, 1, 0]), 1.1, 2.2, 1.1, MAT.seeds, PRIO.fruit, 0.7, hash2(seed, Math.floor(t[0] * 9 + t[2] * 5)))
  }
  return snowyFine(rasterize(sk, { below: 2 }), [MAT.seeds, MAT.twigGrey], seed, 0.5)
}

// ---- currant / generic low bush: arching stems fanning out -------------------------------------
function currant(seed) {
  const rng = new RNG(seed)
  const sk = new Skeleton()
  const n = rng.int(10, 15)
  for (let i = 0; i < n; i++) {
    const a = rng.float(0, TAU)
    const base = [Math.cos(a) * rng.float(0, 2.5), -2, Math.sin(a) * rng.float(0, 2.5)]
    const pts = sk.grow({ p: base, dir: fromVertical(rng.float(0.25, 0.75), a), length: rng.float(8, 14), step: 2.5, r0: 0.35, r1: 0.35, gnarl: 0.1, trop: DOWN, tropK: 0.08, rng, mat: MAT.branch, prio: PRIO.branch, conn: 18 })
    for (let j = 2; j < pts.length; j++) if (rng.chance(0.4)) sk.grow({ p: pts[j].p, dir: deviate(pts[j].dir, 0.6, rng.float(0, TAU)), length: rng.float(2, 4.5), step: 2, r0: 0.3, r1: 0.3, gnarl: 0.18, rng, mat: MAT.twigGrey, prio: PRIO.twig })
  }
  return snowyFine(rasterize(sk, { below: 2 }), [MAT.branch, MAT.twigGrey], seed, 0.55)
}

// ---- snowberry (снежноягодник): fine twigs, white berries all winter ----------------------------
function snowberry(seed) {
  const rng = new RNG(seed)
  const sk = new Skeleton()
  const n = rng.int(11, 16)
  const tips = []
  for (let i = 0; i < n; i++) {
    const a = rng.float(0, TAU)
    const base = [Math.cos(a) * rng.float(0, 3), -2, Math.sin(a) * rng.float(0, 3)]
    const pts = sk.grow({ p: base, dir: fromVertical(rng.float(0.1, 0.55), a), length: rng.float(9, 15), step: 2.5, r0: 0.3, r1: 0.3, gnarl: 0.13, trop: DOWN, tropK: 0.06, rng, mat: MAT.twigGrey, prio: PRIO.twig, conn: 18 })
    tips.push(pts[pts.length - 1].p)
    for (let j = 2; j < pts.length; j++) if (rng.chance(0.35)) {
      const sp = sk.grow({ p: pts[j].p, dir: deviate(pts[j].dir, 0.7, rng.float(0, TAU)), length: rng.float(2, 4.5), step: 2, r0: 0.3, r1: 0.3, gnarl: 0.2, rng, mat: MAT.twigGrey, prio: PRIO.twig })
      tips.push(sp[sp.length - 1].p)
    }
  }
  for (const t of tips) if (rng.chance(0.45)) {
    sk.blob(add(t, [0, -1, 0]), 0.8, 0.8, 0.8, MAT.berryWhite, PRIO.fruit, 0.9, hash2(seed, Math.floor(t[0] * 7 + t[2] * 3)))
  }
  return snowyFine(rasterize(sk, { below: 2 }), [MAT.twigGrey], seed, 0.45)
}

// ---- trimmed hedge (живая изгородь) — 2 m segments along local X ----------------------------------
// Two models per segment: solid 25 cm stems every 0.5 m (they keep the player out) and the clipped
// twig mass in fine 12.5 cm voxels (non-solid), airy at the foot, dense at the clipped faces, with a
// snow cap on the flat top and a few shoots the shears missed.
const HL = 8, HW = 3 // 2 m × 0.75 m (25 cm voxels)

function hedgeStems(o = {}) {
  const H = o.low ? 3 : 4
  const m = new VoxelModel(HL, H, HW)
  for (let x = 0; x < HL; x += 2) m.fill(x, 0, 1, 1, H - 1, 1, MAT.branchSolid)
  m.setPivot(HL / 2, 1, HW / 2)
  return m
}

function hedgeTwigs(seed, o = {}) {
  const rng = new RNG(seed)
  const L = HL * 2, W = HW * 2, H = (o.low ? 3 : 4) * 2 // fine voxels above the ground
  const below = 2
  const m = new VoxelModel(L, below + H + 4, W)
  m.setPivot(L / 2, below, W / 2)
  const top = new Int16Array(L * W).fill(-1)
  for (let y = 0; y < below + H; y++)
    for (let z = 0; z < W; z++)
      for (let x = 0; x < L; x++) {
        const yy = y - below
        let hTop = H - 1
        if (o.gap) {
          // a trampled dip where people push through
          const d = Math.abs(x + 0.5 - L / 2)
          if (d < 4.5) hTop -= Math.round(4 - d * 0.6)
        }
        if (yy > hTop) continue
        const side = z === 0 || z === W - 1
        const crest = yy === hTop
        if (crest && side && rng.chance(0.55)) continue // clipped edges round off
        let p = crest ? 0.9 : side ? 0.6 : 0.38
        if (yy < 2) p *= 0.55 // bare stems at the foot
        if (rng.next() > p) continue
        const r = rng.next()
        m.data[m.idx(x, y, z)] = r < 0.62 ? MAT.twigGrey : r < 0.86 ? MAT.branch : MAT.twigBirch
        if (y > top[x + z * L]) top[x + z * L] = y
      }
  // snow cap on the clipped top, thicker in the middle
  for (let z = 0; z < W; z++)
    for (let x = 0; x < L; x++) {
      const t = top[x + z * L]
      if (t < below + 2) continue
      const side = z === 0 || z === W - 1
      if (rng.chance(side ? 0.7 : 0.95)) m.set(x, t + 1, z, MAT.snowBranch)
      if (!side && rng.chance(0.45)) m.set(x, t + 2, z, MAT.snowBranch)
    }
  // a few long shoots the shears missed, poking out of the snow
  for (let k = 0; k < rng.int(3, 7); k++) {
    const x = rng.int(0, L - 1), z = rng.int(1, W - 2)
    const t = top[x + z * L]
    if (t < 0) continue
    const n = rng.int(2, 4)
    for (let y = 1; y <= n; y++) m.set(x + (y > 2 && rng.chance(0.5) ? (rng.chance(0.5) ? 1 : -1) : 0), t + 1 + y, z, MAT.twigGrey)
  }
  return fineScale(m, 0.5, k => (k <= 2 ? 3 : 12))
}

// ---- dry weeds -----------------------------------------------------------------------------------
/** Well-spaced stalk bases (voxel units) in a disc: thin stalks need air between them. */
function bases(rng, n, R, minD = 2) {
  const out = []
  for (let t = 0; t < n * 12 && out.length < n; t++) {
    const a = rng.float(0, TAU), d = R * Math.sqrt(rng.next())
    const p = [Math.round(Math.cos(a) * d) + 0.5, -1, Math.round(Math.sin(a) * d) + 0.5]
    if (out.some(q => Math.abs(q[0] - p[0]) + Math.abs(q[2] - p[2]) < minD)) continue
    out.push(p)
  }
  return out
}

// Weeds and reeds are designed in 12.5 cm units and rasterized at 6.25 cm (a quarter of the world
// voxel): a dry stalk is a centimetre or two thick, and even at 12.5 cm a stand of them reads as a
// fence of boards.
const FINE = 0.25

/** Rasterize a weed skeleton (12.5 cm design units) into a 6.25 cm model; seed heads hold a little snow. */
function weedModel(sk, seed, snowHeads = false) {
  const r = rasterize(scaleSkeleton(sk, 2, 0.7), { below: 4, pad: 1 })
  if (snowHeads) branchSnow(r, { mats: new Set([MAT.seeds]), minHoriz: 0, chance: 0.55, shelter: 0.5, seed, minY: r.model.pivot.y + 6 })
  return fineScale(r.model, FINE)
}

function grassTuft(seed) {
  const rng = new RNG(seed)
  const sk = new Skeleton()
  for (const base of bases(rng, rng.int(10, 16), 9, 2)) {
    const bent = rng.chance(0.25)
    sk.grow({ p: base, dir: fromVertical(bent ? rng.float(0.7, 1.3) : rng.float(0, 0.4), rng.float(0, TAU)), length: rng.float(2.5, 7), step: 2, r0: 0.3, r1: 0.3, gnarl: 0.1, trop: bent ? DOWN : UP, tropK: 0.1, rng, mat: rng.chance(0.75) ? MAT.straw : MAT.stalk, prio: PRIO.twig, conn: 18 })
  }
  return weedModel(sk, seed)
}

function burdock(seed) {
  const rng = new RNG(seed)
  const sk = new Skeleton()
  for (const b of bases(rng, rng.int(3, 5), 6.5, 4)) {
    const a = Math.atan2(b[2], b[0])
    const pts = sk.grow({ p: b, dir: fromVertical(rng.float(0, 0.3), a), length: rng.float(8, 13), step: 2.5, r0: 0.35, r1: 0.35, gnarl: 0.1, trop: UP, tropK: 0.03, rng, mat: MAT.stalk, prio: PRIO.branch, conn: 6 })
    const top = pts[pts.length - 1]
    sk.blob(add(top.p, [0, 0.4, 0]), 0.62, 0.62, 0.62, MAT.seeds, PRIO.fruit, 1, seed + 1)
    for (let k = 0; k < rng.int(2, 3); k++) {
      const j = Math.max(1, pts.length - 1 - rng.int(0, 2))
      const sp = sk.grow({ p: pts[j].p, dir: deviate(pts[j].dir, rng.float(0.5, 0.9), rng.float(0, TAU)), length: rng.float(2.5, 5), step: 2, r0: 0.3, r1: 0.3, gnarl: 0.1, rng, mat: MAT.stalk, prio: PRIO.twig, conn: 18 })
      sk.blob(add(sp[sp.length - 1].p, [0, 0.3, 0]), 0.55, 0.55, 0.55, MAT.seeds, PRIO.fruit, 1, seed + k)
    }
  }
  return weedModel(sk, seed, true)
}

function tansy(seed) {
  const rng = new RNG(seed)
  const sk = new Skeleton()
  let i = 0
  for (const b of bases(rng, rng.int(5, 8), 7.5, 3)) {
    i++
    const a = Math.atan2(b[2], b[0])
    const pts = sk.grow({ p: b, dir: fromVertical(rng.float(0, 0.25), a), length: rng.float(6.5, 10.5), step: 2.5, r0: 0.3, r1: 0.3, gnarl: 0.06, rng, mat: MAT.stalk, prio: PRIO.branch, conn: 18 })
    const t = pts[pts.length - 1].p
    sk.blob(add(t, [0, 0.35, 0]), 0.85, 0.4, 0.85, MAT.seeds, PRIO.fruit, 0.85, hash2(seed, i))
  }
  return weedModel(sk, seed, true)
}

function reeds(seed, cattail) {
  const rng = new RNG(seed)
  const sk = new Skeleton()
  const n = cattail ? rng.int(6, 10) : rng.int(12, 18)
  const lean = rng.float(0, TAU)
  for (const base of bases(rng, n, cattail ? 9 : 12, 3)) {
    const L = cattail ? rng.float(10, 14) : rng.float(12, 20)
    const broken = !cattail && rng.chance(0.18)
    const dir = fromVertical(rng.float(0.02, 0.18), lean + rng.float(-0.6, 0.6))
    if (broken) {
      const k = L * rng.float(0.4, 0.7)
      const pts = sk.grow({ p: base, dir, length: k, step: 2.5, r0: 0.3, r1: 0.3, gnarl: 0.03, rng, mat: MAT.straw, prio: PRIO.twig, conn: 26 })
      const e = pts[pts.length - 1]
      sk.grow({ p: e.p, dir: norm(add(fromVertical(rng.float(1.6, 2.4), rng.float(0, TAU)), [0, -0.2, 0])), length: L - k, step: 2.5, r0: 0.3, r1: 0.3, gnarl: 0.05, rng, mat: MAT.straw, prio: PRIO.twig, conn: 26 })
      continue
    }
    const pts = sk.grow({ p: base, dir, length: L, step: 2.5, r0: 0.3, r1: 0.3, gnarl: 0.03, trop: DOWN, tropK: 0.01, rng, mat: rng.chance(0.8) ? MAT.straw : MAT.stalk, prio: PRIO.twig, conn: 26 })
    const top = pts[pts.length - 1]
    if (cattail) {
      // brown cylindrical head under a thin spike
      const hp = pts[Math.max(1, pts.length - 2)].p
      sk.seg(add(hp, [0, -2.2, 0]), add(hp, [0, 0.4, 0]), 0.7, 0.7, MAT.seeds, PRIO.fruit, 6)
    } else if (rng.chance(0.75)) {
      // feathery plume nodding away from the wind
      const off = [Math.cos(lean) * 1.2, 0, Math.sin(lean) * 1.2]
      sk.seg(top.p, add(add(top.p, off), [0, -2.6, 0]), 0.7, 0.45, rng.chance(0.5) ? MAT.seeds : MAT.straw, PRIO.fruit, 18)
    }
  }
  return weedModel(sk, seed, cattail)
}

const BUSH = { lods: [BFINE, 0.999], lodDistances: [32], maxDistance: 140, collide: false, contact: false }
const WEED = { lods: [FINE], lodDistances: [], maxDistance: 75, contact: false, collide: false }

;[0, 1, 2].forEach(i => reg('lilac', `nature_lilac_${i}`, () => lilac(9100 + i * 13), BUSH))
;[0, 1].forEach(i => reg('currant', `nature_currant_${i}`, () => currant(9200 + i * 17), BUSH))
;[0, 1].forEach(i => reg('snowberry', `nature_snowberry_${i}`, () => snowberry(9300 + i * 19), BUSH))
const STEMS = { lods: [1], maxDistance: 120, contact: false }
const TWIGS = { lods: [0.5, 0.999], lodDistances: [40], maxDistance: 160, collide: false, contact: false }
for (const [name, seed, o] of [['nature_hedge', 9400, {}], ['nature_hedge_low', 9401, { low: true }], ['nature_hedge_gap', 9402, { gap: true }]]) {
  reg('hedge', name, () => hedgeStems(o), STEMS)
  defineModel(`${name}_twigs`, () => hedgeTwigs(seed, o), TWIGS)
}
;[0, 1, 2].forEach(i => reg('grass', `nature_weeds_grass_${i}`, () => grassTuft(9500 + i * 7), WEED))
;[0, 1].forEach(i => reg('burdock', `nature_weeds_burdock_${i}`, () => burdock(9600 + i * 7), WEED))
;[0, 1].forEach(i => reg('tansy', `nature_weeds_tansy_${i}`, () => tansy(9700 + i * 7), WEED))
;[0, 1, 2].forEach(i => reg('reeds', `nature_reeds_${i}`, () => reeds(9800 + i * 11, false), { ...WEED, maxDistance: 110 }))
;[0, 1].forEach(i => reg('cattail', `nature_cattail_${i}`, () => reeds(9900 + i * 11, true), { ...WEED, maxDistance: 100 }))

export const HEDGE_LEN = 8 * VOXEL // 2 m
