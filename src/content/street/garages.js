// «Ракушки» — pressed-steel clamshell garages (≈ 5 × 2.75 × 1.75 m) in tinted paint with rust,
// snow on the shell, a padlock at the front, sometimes «ПРОДАЮ» sprayed on the side or a
// demolition notice from the district council (the 2008 removal campaign).
// Front (the opening shell end with the padlock) = local +Z; pivot bottom-centre.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M, rngFor, rustify, snowTop, put, seedInt, RNG, angleAlong, rotXZ, reg, streak } from './lib.js'
import { drawGraffiti, drawPlate, drawNotice } from './signs.js'
import { PLATES } from './texts.js'
import './materials.js'

export const RAKUSHKA_TINTS = [0x9ea3a3, 0x80878a, 0x6f725a, 0x6c8597, 0xa49c86, 0x55655a, 0xb2b3ad, 0x7b6f63]

function buildRakushka(variant) {
  const W = 11, L = 20, H = 7
  const m = new VoxelModel(W, H + 3, L)
  const p = M('paint')
  const rng = rngFor('rakushka' + variant)
  const prof = (x, big) => {
    const u = (x + 0.5 - W / 2) / (W / 2 + (big ? 0.1 : -0.4))
    if (Math.abs(u) >= 1) return 0
    return Math.round((H + (big ? 0.3 : -0.5)) * Math.sqrt(1 - u * u))
  }
  for (let z = 0; z < L; z++) {
    const front = z >= 11
    for (let x = 0; x < W; x++) {
      const h = prof(x, front)
      if (h <= 0) continue
      m.fill(x, 0, z, 1, h, 1, p)
    }
  }
  // seam between the fixed rear shell and the swinging front shell; pressed ribs
  for (let x = 0; x < W; x++) {
    const h = prof(x, true)
    if (h > 0) m.set(x, h - 1, 11, M('metal_gray'))
    for (const z of [3, 7, 15]) { const hh = prof(x, z >= 11); if (hh > 0 && rng.chance(0.85)) m.set(x, hh - 1, z, M('paint_matte')) }
  }
  // base rails, padlock, handle
  m.fill(0, 0, 0, 1, 1, L, M('metal_dark')); m.fill(W - 1, 0, 0, 1, 1, L, M('metal_dark'))
  m.set(5, 1, L - 1, M('metal_dark'))
  m.set(5, 2, L - 1, M('chrome'))
  m.set(3, 3, L - 1, M('metal_dark')); m.set(7, 3, L - 1, M('metal_dark'))
  // rust: bottom edges, around the seam, random blooms
  rustify(m, rng, [p, M('paint_matte')], 0.07 + variant * 0.05, { bottomBias: 2.5 })
  for (let i = 0; i < 6; i++) { const x = rng.int(1, W - 2), z = rng.int(0, L - 1); streak(m, x, prof(x, z >= 11) - 1, z, rng.int(1, 3), M('street_rust_light')) }
  if (variant === 2) { m.clear(0, 1, 17, 2, 2, 3); m.set(0, 1, 17, M('metal_rust')) } // a rusted-through corner
  snowTop(m, { chance: 0.97, seed: 5 + variant, depth: 1, vary: 1 })
  return m
}
for (let v = 0; v < 3; v++) defineModel(`street_rakushka${v ? '_' + v : ''}`, () => buildRakushka(v), { lods: [1, 2], lodDistances: [55], maxDistance: 240 })

/**
 * One shell garage. opts: { x, z, y?, angle (front faces (sin a, cos a)), tint, seed, sale, notice, graffiti }
 */
export function placeRakushka(ctx, opts) {
  const seed = seedInt(opts.seed ?? (opts.x * 11 + opts.z * 5), 61)
  const rng = new RNG(seed)
  const v = rng.chance(0.6) ? 0 : rng.chance(0.6) ? 1 : 2
  const tint = opts.tint ?? RAKUSHKA_TINTS[rng.int(0, RAKUSHKA_TINTS.length - 1)]
  const angle = opts.angle ?? 0
  const p = put(ctx, `street_rakushka${v ? '_' + v : ''}`, { x: opts.x, z: opts.z, y: opts.y, angle, seed, tint, tag: 'garage' })
  const y = p ? p.y : 0
  if (ctx.signs) {
    // one decal on the flat front end: «ПРОДАЮ» + phone, a tag, or the council's notice
    const roll = rng.next()
    const sale = opts.sale ?? roll < 0.2
    const tag = !sale && (opts.graffiti ?? (roll >= 0.2 && roll < 0.4))
    const notice = !sale && !tag && (opts.notice ?? (roll >= 0.4 && roll < 0.6))
    const [fx, fz] = rotXZ(0, 2.515, angle)
    if (sale) {
      ctx.signs.add({ x: opts.x + fx, y: y + 1.02, z: opts.z + fz, angle, w: 1.35, h: 0.42, ppm: 72, draw: drawGraffiti(`${PLATES.garageSale.ru} 8-916-${rng.int(100, 999)}-${rng.int(10, 99)}-${rng.int(10, 99)}`, seed, '#ecebe2') })
    } else if (tag) {
      const txt = rng.pick(['Цой жив', 'КиШ', 'ЦСКА', 'Спартак', 'Хой!', 'Лёха', 'Ⓐ'])
      ctx.signs.add({ x: opts.x + fx, y: y + 1.0, z: opts.z + fz, angle, w: 1.1, h: 0.4, ppm: 64, draw: drawGraffiti(txt, seed + 1, rng.pick(['#2a2a30', '#5a2222', '#22305a', '#e6e4da'])) })
    }
    if (notice) {
      const [nx, nz] = rotXZ(rng.float(-0.55, 0.55), 2.515, angle)
      ctx.signs.add({ x: opts.x + nx, y: y + 1.05, z: opts.z + nz, angle, w: 0.42, h: 0.3, ppm: 200, draw: drawNotice(PLATES.garageNotice, seed), aged: 0.4 })
      if (ctx.interactions) ctx.interactions.add({ x: opts.x + nx, y: y + 1.05, z: opts.z + nz, size: [0.5, 0.4, 0.5], reach: 2, tag: 'notice', prompt: { ru: 'Читать', en: 'Read' }, onUse(game) { game.ui.showNote({ ru: PLATES.garageNotice.ru, en: PLATES.garageNotice.en, style: 'notice' }) } })
    }
  }
  return p
}

/**
 * A row of shell garages side by side along a line (x0,z0)→(x1,z1). Fronts face the right of
 * the walking direction unless `facing: 'left'` or an explicit `angle` is given.
 * opts: { x0, z0, x1, z1, gap=0.3, count?, seed, angle?, facing, missing (0..1 chance of an empty slot) }
 */
export function placeRakushkaRow(ctx, opts) {
  const dx = opts.x1 - opts.x0, dz = opts.z1 - opts.z0
  const len = Math.hypot(dx, dz)
  const gap = opts.gap ?? 0.3
  const w = 2.75 + gap
  const n = opts.count ?? Math.max(1, Math.floor((len + gap) / w))
  const seed = seedInt(opts.seed, 71)
  const rng = new RNG(seed)
  let angle = opts.angle
  if (angle === undefined) { angle = angleAlong(dx, dz); if (opts.facing === 'left') angle += Math.PI }
  const ux = dx / (len || 1), uz = dz / (len || 1)
  const start = (len - n * w + gap) / 2
  const out = []
  for (let i = 0; i < n; i++) {
    if (rng.chance(opts.missing ?? 0.08)) continue
    const t = start + i * w + 1.375 + rng.float(-0.08, 0.08)
    const x = opts.x0 + ux * t, z = opts.z0 + uz * t
    const p = placeRakushka(ctx, { x, z, angle: angle + rng.float(-0.04, 0.04), seed: seed + i * 13 })
    if (p) out.push(p)
  }
  reg(ctx, 'garages', { kind: 'rakushka', x0: opts.x0, z0: opts.z0, x1: opts.x1, z1: opts.z1, count: out.length })
  return out
}
