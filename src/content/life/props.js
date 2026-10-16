// Storytelling props: small traces of other people's lives. All fine-voxel models; front is
// local +Z, pivot is the bottom centre of the footprint unless noted. Placed through
// placeStory() in story.js, which also adds the quiet inspect interaction.

import { M } from '../../core/materials.js'
import { VoxelModel, defineFine, F4, F8, F16, capsule, ellip, obox, boxF, line, rope, rowEllipse, speckle, snowTop, rngFor } from './vox.js'
import { drawSledBody } from './people.js'
import { valueNoise2 } from '../../core/rng.js'

const STATIC = { maxDistance: 70 }

// ---- children's mittens on an elastic cord (lying on a snowy bench) ----------------------------
function mitten(m, x, z, ang, flip) {
  const red = M('fabric_red'), cuff = M('whitewash')
  const c = Math.cos(ang), s = Math.sin(ang)
  const P = (u, v) => [Math.round(x + u * c - v * s), Math.round(z + u * s + v * c)]
  // knitted mitten lying flat: 2 voxels thick, 6 long (cuff + hand), 3 wide, a thumb on one side
  for (let u = 0; u < 6; u++)
    for (let v = -1; v <= 1; v++) {
      if (u === 5 && v !== 0) continue
      const [px, pz] = P(u, v)
      const mat = u === 0 ? cuff : red
      m.set(px, 0, pz, mat)
      if (u > 0 && u < 5 && v === 0) m.set(px, 1, pz, u === 2 ? cuff : red)
      else if (u > 0 && u < 5) m.set(px, 1, pz, red)
    }
  const [tx, tz] = P(2, flip ? -2 : 2)
  m.set(tx, 0, tz, red)
  const [ux, uz] = P(3, flip ? -2 : 2)
  m.set(ux, 0, uz, red)
  return P(-0.5, 0)
}
defineFine('life_mittens', F8, () => {
  const m = new VoxelModel(17, 3, 11)
  const a = mitten(m, 2, 4, 0.3, false)
  const b = mitten(m, 14, 7, Math.PI - 0.25, true)
  // the elastic cord looping between the cuffs
  rope(m, [a[0] + 0.5, 0.3, a[1] + 0.5], [b[0] + 0.5, 0.3, b[1] + 0.5], -2.5, M('plastic_white'))
  return m
}, { maxDistance: 45 })

// ---- a lost glove pulled onto a fence post (1.56 cm voxels) ------------------------------------
function glove(m, cx, y0, cz, mat) {
  // palm and back wrapped round the post top, four fingers pointing up, the thumb to the side
  boxF(m, cx - 3.5, y0, cz - 2.0, cx + 3.5, y0 + 6.5, cz + 2.0, mat)
  const fingers = [[-3.0, 4.5], [-1.0, 6.0], [1.0, 5.5], [3.0, 3.8]]
  for (const [fx, h] of fingers) {
    capsule(m, [cx + fx, y0 + 6.0, cz], [cx + fx + fx * 0.12, y0 + 6.0 + h, cz - 0.3], 0.95, 0.85, mat)
  }
  capsule(m, [cx + 3.4, y0 + 2.5, cz], [cx + 5.6, y0 + 5.8, cz + 0.4], 1.0, 0.85, mat)
  // ribbed cuff, slightly darker
  for (let y = 0; y < 2; y++) rowEllipse(m, Math.floor(y0) + y, cx, cz, 3.9, 2.4, y ? M('life_knit') : mat)
}
defineFine('life_glove', F16, () => {
  const m = new VoxelModel(14, 15, 7)
  glove(m, 7, 0, 3.5, M('life_knit_dark'))
  snowTop(m, { chance: 0.5, seed: 5 })
  return m
}, { maxDistance: 50 })
defineFine('life_glove_post', F16, () => {
  const m = new VoxelModel(14, 80, 7)
  // a lone square steel post left from an old fence, rust at the foot
  boxF(m, 5, 0, 1.5, 9, 64, 5.5, M('metal_green'))
  boxF(m, 5, 0, 1.5, 9, 12, 5.5, M('metal_rust'))
  speckle(m, rngFor('glovepost'), M('metal_green'), M('metal_rust'), 0.1)
  boxF(m, 4.5, 64, 1, 9.5, 66, 6, M('metal_dark'))
  glove(m, 7, 62, 3.5, M('life_knit_dark'))
  snowTop(m, { chance: 0.6, seed: 6, onlyAbove: 60, depth: 2 })
  return m
}, { maxDistance: 70 })

// ---- a sled left by the entrance ------------------------------------------------------------------
defineFine('life_sled', F4, () => {
  const m = new VoxelModel(8, 8, 18)
  drawSledBody(m, 4, 15, 2, M('paint'))
  // rope loop from the front, lying in the snow
  rope(m, [4, 2.2, 15.5], [5.5, 0.2, 17.5], 0.0, M('life_knit'))
  line(m, [5.5, 0.2, 17.5], [2.5, 0.2, 17.2], M('life_knit'))
  snowTop(m, { chance: 0.28, seed: 9, depth: 1 })
  m.setPivot(4, 0, 9)
  return m
}, STATIC)
// leaning on a wall: the same sled stood on its back end, runners to the wall, seat facing out.
// Pivot = bottom centre at the wall plane (local z = 0), front (+Z) faces away from the wall.
defineFine('life_sled_lean', F4, () => {
  const m = new VoxelModel(8, 19, 11)
  const a = 0.2 // top leans back onto the wall
  const ca = Math.cos(a), sa = Math.sin(a)
  // sled space: along = z (from the back end), up = y; world: y up, z out from the wall
  const T = p => [p[0], 0.6 + (p[2] - 1.4) * ca + p[1] * sa, 3.4 - (p[2] - 1.4) * sa + p[1] * ca]
  const R = v => [v[0], v[2] * ca + v[1] * sa, -v[2] * sa + v[1] * ca]
  drawSledBody(m, 4, 15, 2, M('paint'), { T, R }, false)
  snowTop(m, { chance: 0.3, seed: 10 })
  m.setPivot(4, 0, 0)
  return m
}, STATIC)

// ---- the half-melted snowman by the playground -----------------------------------------------------
function snowman(variant) {
  const rng = rngFor('snowman', variant)
  const m = new VoxelModel(18, 26, 18)
  const cx = 9, cz = 9
  const lean = variant ? -0.09 : 0.07
  const lump = (x, y, z) => valueNoise2(x * 0.45 + y * 0.31, z * 0.45 - y * 0.27, 11 + variant) - 0.5
  const ball = (cy, r, mat, squash = 1) => {
    const ox = lean * cy * 0.9
    for (let y = Math.floor(cy - r * squash - 1); y <= Math.ceil(cy + r * squash + 1); y++)
      for (let z = Math.floor(cz - r - 1); z <= Math.ceil(cz + r + 1); z++)
        for (let x = Math.floor(cx + ox - r - 1); x <= Math.ceil(cx + ox + r + 1); x++) {
          const dx = x + 0.5 - cx - ox, dy = (y + 0.5 - cy) / squash, dz = z + 0.5 - cz
          const d = Math.hypot(dx, dy, dz)
          if (d <= r + lump(x, y, z) * 1.1) m.set(x, y, z, mat)
        }
    return [cx + ox, cy, cz]
  }
  // a little trampled mound at the foot
  for (let y = 0; y < 2; y++) rowEllipse(m, y, cx, cz, 7.5 - y * 1.5, 7.0 - y * 1.5, M('snow_packed'))
  ball(5.2, 5.3, M('snow_packed'), 0.9)
  const b1 = ball(12.6, 3.9, M('snow'), 0.92)
  const b2 = ball(18.4, 2.8, M('snow'), 1.0)
  // grit and a few leaves rolled into the bottom ball, a greyer crust after a thaw
  for (let y = 0; y < 9; y++) for (let z = 0; z < m.sz; z++) for (let x = 0; x < m.sx; x++) {
    if (m.get(x, y, z) !== M('snow_packed')) continue
    const r = rng.next()
    if (r < 0.05) m.set(x, y, z, M('snow_dirty'))
    else if (r < 0.058 && y > 1) m.set(x, y, z, M('bark'))
  }
  speckle(m, rng, M('snow'), M('snow_packed'), 0.06)
  // coal eyes, carrot nose (drooping), coal buttons
  const hx = b2[0], hy = b2[1], hz = b2[2]
  for (const sx of [-1, 1]) m.set(Math.floor(hx + sx * 1.1), Math.floor(hy + 0.7), Math.floor(hz + 2.5), M('rubber'))
  capsule(m, [hx, hy - 0.1, hz + 2.4], [hx + 0.2, hy - 0.8 - variant * 0.4, hz + 5.2], 0.7, 0.35, M('life_carrot'))
  for (let k = 0; k < 3; k++) m.set(Math.floor(b1[0]), Math.floor(b1[1] + 2.0 - k * 1.7), Math.floor(b1[2] + 3.8 - Math.abs(k - 1) * 0.3), M('rubber'))
  // twig arms, one broken off
  line(m, [b1[0] + 3.4, b1[1] + 0.8, b1[2]], [b1[0] + 7.6, b1[1] + 3.0, b1[2] + 0.5], M('branch'))
  line(m, [b1[0] + 6.0, b1[1] + 2.2, b1[2] + 0.3], [b1[0] + 7.2, b1[1] + 1.4, b1[2] - 0.8], M('branch'))
  line(m, [b1[0] - 3.4, b1[1] + 0.6, b1[2]], [b1[0] - 5.2 - variant, b1[1] - 0.6 + variant * 2, b1[2] + 0.4], M('branch'))
  // the bucket hat, tipped back
  const tip = variant ? 0.35 : 0.2
  const up = [Math.sin(-lean) * 0.5, Math.cos(tip), -Math.sin(tip)]
  const bc = [hx - 0.2, hy + 2.6, hz - 0.4]
  for (let k = 0; k < 4; k++) {
    const r = 1.75 + k * 0.18
    const c = [bc[0] + up[0] * k, bc[1] + up[1] * k, bc[2] + up[2] * k]
    obox(m, c, [1, 0, 0], up, [0, Math.sin(tip), Math.cos(tip)], r, 0.55, r, k === 3 ? M('metal_dark') : M('metal_gray'))
  }
  line(m, [bc[0] - 2.0, bc[1] + 1.5, bc[2]], [bc[0] + 2.0, bc[1] + 1.5, bc[2]], M('metal_dark'))
  snowTop(m, { chance: 0.5, seed: 12 + variant, mat: M('snow_fresh') })
  return m
}
defineFine('life_snowman_a', F4, () => snowman(0), { maxDistance: 140 })
defineFine('life_snowman_b', F4, () => snowman(1), { maxDistance: 140 })

// ---- a used bus ticket on the ground -----------------------------------------------------------------
defineFine('life_ticket', F8, () => {
  const m = new VoxelModel(3, 1, 2)
  boxF(m, 0, 0, 0, 3, 1, 2, M('paper'))
  m.set(0, 0, 0, M('metal_blue'))
  m.set(0, 0, 1, M('metal_blue'))
  return m
}, { maxDistance: 25 })

// ---- a loaf in a carrier bag left on a bench -------------------------------------------------------
defineFine('life_bread', F4, () => {
  const m = new VoxelModel(8, 5, 8)
  // the «маечка» bag lying on its side, slightly slumped
  ellip(m, 3.6, 1.6, 4.0, 2.6, 1.6, 3.0, M('plastic_white'))
  capsule(m, [3.6, 2.6, 1.2], [4.6, 3.6, 0.8], 0.45, 0.45, M('plastic_white'))
  capsule(m, [2.6, 2.6, 1.2], [2.2, 3.6, 0.9], 0.45, 0.45, M('plastic_white'))
  // батон sticking out of the open end
  capsule(m, [5.0, 1.8, 2.4], [7.3, 1.6, 6.4], 1.15, 1.0, M('life_bread'))
  // the scored top of the loaf
  for (let k = 0; k < 3; k++) m.set(Math.floor(5.9 + k * 0.6), 2, Math.floor(4.0 + k * 0.9), M('wood'))
  return m
}, STATIC)

// ---- a carrier bag frozen to the bench --------------------------------------------------------------
defineFine('life_frozen_bag', F4, () => {
  const rng = rngFor('frozenbag')
  const m = new VoxelModel(8, 3, 7)
  for (let z = 0; z < 7; z++) for (let x = 0; x < 8; x++) {
    const d = Math.hypot((x + 0.5 - 4) / 4, (z + 0.5 - 3.5) / 3.5)
    if (d > 1) continue
    m.set(x, 0, z, rng.chance(0.25) ? M('ice') : M('metal_blue'))
    if (d > 0.6 && rng.chance(0.35)) m.set(x, 1, z, M('metal_blue'))
  }
  // handles sticking up, stiff with frost
  m.set(1, 1, 1, M('metal_blue')); m.set(1, 2, 1, M('metal_blue'))
  m.set(2, 1, 0, M('metal_blue'))
  snowTop(m, { chance: 0.45, seed: 14 })
  return m
}, STATIC)

// ---- dropped keys with an intercom fob ------------------------------------------------------------
defineFine('life_key', F8, () => {
  const m = new VoxelModel(9, 2, 6)
  // split ring
  for (let a = 0; a < 12; a++) {
    const t = a / 12 * Math.PI * 2
    m.set(Math.floor(3 + Math.cos(t) * 1.4), 0, Math.floor(3 + Math.sin(t) * 1.4), M('chrome'))
  }
  // two keys
  line(m, [4.2, 0.3, 3.1], [8.6, 0.3, 4.2], M('metal_yellow'))
  m.set(8, 0, 5, M('metal_yellow'))
  line(m, [4.0, 0.3, 2.4], [7.8, 0.3, 0.6], M('chrome'))
  // «таблетка» intercom fob, half sunk in the snow
  boxF(m, 0, 0, 3, 2, 2, 5, M('metal_blue'))
  return m
}, { maxDistance: 25 })

// ---- cigarette ends round a tin-can ashtray (1.56 cm voxels) ------------------------------------
defineFine('life_butts', F16, () => {
  const rng = rngFor('butts')
  const m = new VoxelModel(30, 10, 26)
  const cx = 15, cz = 13
  // pea tin (7.5 cm × 11 cm): faded green label, bare tin top and bottom, a rusty rim
  for (let y = 0; y < 7; y++)
    rowEllipse(m, y, cx, cz, 2.6, 2.6, y === 0 || y === 6 ? M('metal_gray') : (y === 3 ? M('plaster_yellow') : M('metal_green')))
  rowEllipse(m, 6, cx, cz, 1.7, 1.7, M('rubber'))
  m.set(cx + 2, 6, cz, M('metal_rust')); m.set(cx - 1, 6, cz + 2, M('metal_rust'))
  // ends sticking out of the tin
  for (const [dx, dz, h] of [[0, 0, 2], [-1, 1, 1], [1, -1, 2], [0, -1, 1]]) {
    for (let k = 0; k < h; k++) m.set(cx + dx, 7 + k, cz + dz, k === h - 1 ? M('paper') : M('plaster_yellow'))
  }
  // scattered ends in the snow: filter (tan) + a little paper, lying in random directions
  for (let i = 0; i < 22; i++) {
    const a = rng.float(0, Math.PI * 2), r = rng.float(4, 13)
    const x = Math.floor(cx + Math.cos(a) * r), z = Math.floor(cz + Math.sin(a) * r * 0.9)
    const ax = rng.chance(0.5)
    m.set(x, 0, z, M('plaster_yellow'))
    m.set(x + (ax ? 1 : 0), 0, z + (ax ? 0 : 1), M('plaster_yellow'))
    if (rng.chance(0.6)) m.set(x + (ax ? 2 : 0), 0, z + (ax ? 0 : 2), M('paper'))
  }
  return m
}, { maxDistance: 30 })

// ---- a cat in a basement vent (продух), eyes catching the light at night ---------------------------
// Wall-mounted: pivot = bottom centre of the BACK plane (put it against the plinth), front = +Z.
defineFine('life_cat', F8, () => {
  const m = new VoxelModel(16, 13, 7)
  const cat = M('life_cat'), dark = M('branch'), white = M('whitewash')
  // concrete frame round the dark opening, a sill below
  boxF(m, 0, 0, 0, 16, 13, 2, M('concrete'))
  boxF(m, 2, 2, 0, 14, 11, 2, M('rubber'))
  boxF(m, 0, 0, 2, 16, 1, 3, M('concrete'))
  // the cat peeking out: head poking past the frame, chest and paws on the sill
  ellip(m, 8.5, 2.6, 2.4, 2.6, 1.8, 1.6, cat)
  boxF(m, 6, 1, 2, 11, 3.5, 4.2, white)
  m.set(6, 1, 4, white); m.set(10, 1, 4, white)
  ellip(m, 8.5, 5.4, 3.3, 2.5, 2.0, 1.8, cat)
  // ears
  for (const [ex, ix] of [[6, 7], [10, 9]]) { m.set(ex, 7, 3, cat); m.set(ex, 8, 3, cat); m.set(ix, 7, 3, cat); m.set(ex, 7, 2, cat) }
  // tabby stripes, pale muzzle, pink nose
  m.set(8, 6, 4, dark); m.set(6, 6, 3, dark); m.set(10, 6, 3, dark)
  m.set(7, 4, 4, white); m.set(8, 4, 4, white); m.set(9, 4, 4, white)
  m.set(8, 4, 5, M('life_skin'))
  // eyes (eyeshine at night)
  m.set(7, 5, 4, M('life_eye')); m.set(9, 5, 4, M('life_eye'))
  snowTop(m, { chance: 0.7, seed: 18, skip: new Set([cat, dark, white, M('life_eye'), M('life_skin')]) })
  m.setPivot(8, 0, 0)
  return m
}, { maxDistance: 60 })
// a lid with soggy bread and kasha below the vent
defineFine('life_cat_bowl', F8, () => {
  const m = new VoxelModel(6, 2, 6)
  rowEllipse(m, 0, 3, 3, 2.6, 2.6, M('metal_gray'))
  m.set(2, 1, 2, M('life_bread')); m.set(3, 1, 3, M('plaster_yellow')); m.set(3, 1, 2, M('life_bread'))
  return m
}, { maxDistance: 30 })

// ---- a bicycle chained to a pipe post, wheels sunk in the snow ---------------------------------------
defineFine('life_bicycle', F4, () => {
  const m = new VoxelModel(10, 20, 20)
  const x = 4, frame = M('paint')
  const R = 4.7
  const wr = 5.0, wf = 15.4, wy = R + 0.5
  // wheels: black tyre, a steel rim just inside it, the hub (spokes are far thinner than a
  // 6 cm voxel: leaving them out reads as a wheel, drawing them reads as a cartwheel)
  for (const wz of [wr, wf]) {
    for (let a = 0; a < 64; a++) {
      const t = a / 64 * Math.PI * 2
      m.set(x, Math.floor(wy + Math.sin(t) * R), Math.floor(wz + Math.cos(t) * R), M('rubber'))
      const rx = Math.floor(wy + Math.sin(t) * (R - 0.95)), rz = Math.floor(wz + Math.cos(t) * (R - 0.95))
      if (!m.get(x, rx, rz)) m.set(x, rx, rz, M('metal_gray'))
    }
    boxF(m, x - 0.5, wy - 0.5, wz - 0.5, x + 1.5, wy + 0.5, wz + 0.5, M('metal_dark'))
  }
  // diamond frame: seat tube, top tube, down tube, stays, fork
  const bb = [x + 0.5, wy - 0.4, 9.2], seat = [x + 0.5, wy + 6.4, 7.8], head = [x + 0.5, wy + 6.2, 13.6]
  capsule(m, bb, seat, 0.5, 0.5, frame)
  capsule(m, seat, head, 0.5, 0.5, frame)
  capsule(m, bb, [x + 0.5, wy + 4.8, 13.9], 0.55, 0.5, frame)
  capsule(m, bb, [x + 0.5, wy, wr], 0.45, 0.45, frame)
  capsule(m, [x + 0.5, wy + 5.6, 7.9], [x + 0.5, wy, wr], 0.45, 0.45, frame)
  capsule(m, head, [x + 0.5, wy, wf], 0.5, 0.45, frame)
  // saddle, handlebar, pedal crank, chain guard
  boxF(m, x - 0.6, wy + 7.0, 6.6, x + 1.6, wy + 7.8, 9.2, M('rubber'))
  capsule(m, [x + 0.5, wy + 6.3, 13.8], [x + 0.5, wy + 8.2, 13.3], 0.45, 0.45, M('chrome'))
  capsule(m, [x - 2.6, wy + 8.2, 13.2], [x + 3.6, wy + 8.2, 13.2], 0.45, 0.45, M('chrome'))
  capsule(m, [x - 2.6, wy + 8.2, 13.2], [x - 2.6, wy + 7.9, 12.4], 0.5, 0.5, M('rubber'))
  capsule(m, [x + 3.6, wy + 8.2, 13.2], [x + 3.6, wy + 7.9, 12.4], 0.5, 0.5, M('rubber'))
  boxF(m, x - 1.5, wy - 2.2, 8.7, x - 0.5, wy - 1.4, 10.2, M('metal_dark'))
  // the post (a pipe of an old railing) and the chain round post and frame
  boxF(m, x + 2, 0, 9, x + 4, 18, 11, M('metal_gray'))
  speckle(m, rngFor('bikepost'), M('metal_gray'), M('metal_rust'), 0.15)
  for (let a = 0; a < 14; a++) {
    const t = a / 14 * Math.PI * 2
    m.set(Math.floor(x + 2.2 + Math.cos(t) * 1.6), Math.floor(wy + 2.6 + Math.sin(t) * 0.6), Math.floor(9.6 + Math.sin(t) * 1.4), M('metal_dark'))
  }
  // the drift that has swallowed the bottom of the wheels: a long low mound along the bike
  for (let z = 0; z < 20; z++) for (let xx = 0; xx < 10; xx++) {
    const ez = (z + 0.5 - 10) / 10.5, ex = (xx + 0.5 - 4.6) / 4.2
    const e = 1 - ez * ez - ex * ex
    if (e <= 0) continue
    const h = Math.round(e * 3.4 + (valueNoise2(xx * 0.6, z * 0.4, 4) - 0.5) * 1.4)
    for (let y = 0; y < h; y++) if (m.get(xx, y, z) !== M('metal_gray')) m.set(xx, y, z, y === h - 1 ? M('snow_fresh') : M('snow'))
  }
  snowTop(m, { chance: 0.85, seed: 21, onlyAbove: 3 })
  return m
}, { maxDistance: 110 })

// ---- a thrown-out New Year tree with tinsel still on it (mid-January) --------------------------------
// A 1.7 m spruce lying on its side, still nailed to its wooden cross stand (крестовина): whorls of
// thin branches with side twigs (a lacy, triangular silhouette rather than a heap), the lower
// branches pressed flat on the snow, silver дождик strands along the top and one forgotten bauble.
defineFine('life_yolka', F4, () => {
  const rng = rngFor('yolka')
  const L = 26
  const m = new VoxelModel(22, 14, 34)
  const cx = 11, cy = 5.6, z0 = 4
  const ndl = M('life_needles_dry')
  const put = (x, y, z) => {
    const ix = Math.floor(x), iy = Math.max(0, Math.floor(y)), iz = Math.floor(z)
    if (ix < 0 || iz < 0 || ix >= m.sx || iy >= m.sy || iz >= m.sz) return
    if (!m.get(ix, iy, iz)) m.set(ix, iy, iz, ndl)
  }
  const twig = (a, b) => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 1.6) + 1
    for (let i = 0; i <= n; i++) { const t = i / n; put(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t) }
  }
  // trunk: butt with a pale saw cut, tapering to the leader
  capsule(m, [cx, cy, z0], [cx, cy + 0.4, z0 + L], 0.95, 0.4, M('bark'))
  for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) m.set(cx + dx, Math.floor(cy) + dy, z0, M('wood'))
  // whorls of branches
  for (let zk = z0 + 2.5; zk < z0 + L - 1; zk += 2.3 + rng.next() * 0.6) {
    const t = (zk - z0) / L
    const len = (1 - t) * 8.8 + 1.4
    const n = 7 + (rng.next() < 0.5 ? 1 : 0)
    const ph = rng.next() * Math.PI * 2
    for (let i = 0; i < n; i++) {
      const a = ph + (i / n) * Math.PI * 2 + (rng.next() - 0.5) * 0.4
      const dx = Math.cos(a), dy = Math.sin(a)
      const base = [cx + 0.5, cy + 0.5 + 0.4 * t, zk]
      let end = [base[0] + dx * len, base[1] + dy * len * 0.9 - len * 0.12, zk + len * 0.42]
      // branches under the trunk are pressed flat into the snow, splaying outward
      if (end[1] < 0.6) { end = [base[0] + dx * len * 1.15, 0.4 + rng.next() * 0.6, end[2]]; }
      twig(base, end)
      // side twigs in the branch plane, shorter toward the tip
      const px = -dy, py = dx
      for (let s2 = 0.3; s2 < 0.95; s2 += 0.22) {
        const q = [base[0] + (end[0] - base[0]) * s2, base[1] + (end[1] - base[1]) * s2, base[2] + (end[2] - base[2]) * s2]
        const tl = (1 - s2) * len * 0.32 + 0.7
        for (const sg of [-1, 1]) twig(q, [q[0] + px * tl * sg + dx * tl * 0.35, q[1] + py * tl * sg * 0.8 + dy * tl * 0.3, q[2] + tl * 0.55])
      }
    }
  }
  // the leader
  twig([cx + 0.5, cy + 0.9, z0 + L - 1], [cx + 0.5, cy + 1.0, z0 + L + 3])
  speckle(m, rng, ndl, M('branch'), 0.07)
  // the wooden cross stand nailed to the butt
  const st = M('wood_painted_green')
  boxF(m, cx - 5.5, cy - 0.1, z0 - 2, cx + 6.5, cy + 1.1, z0 - 0.4, st)
  boxF(m, cx - 0.1, 0, z0 - 3.4, cx + 1.1, cy + 6.2, z0 - 1.9, st)
  // дождик: silver strands lying along the top of the tree, a few hanging down the side
  for (let k = 0; k < 5; k++) {
    const a = Math.PI * (0.18 + 0.64 * rng.next())
    const za = z0 + 3 + rng.next() * (L * 0.55), zb = Math.min(z0 + L - 2, za + 6 + rng.next() * 6)
    for (let z = Math.floor(za); z <= zb; z++) {
      const aa = a + Math.sin(z * 0.9 + k) * 0.12
      // outermost needle voxel along the ray from the trunk at this angle
      for (let r = 11; r > 0.5; r -= 0.5) {
        const x = Math.floor(cx + 0.5 + Math.cos(aa) * r), y = Math.floor(cy + 0.5 + Math.sin(aa) * r)
        if (x < 0 || y < 0 || x >= m.sx || y >= m.sy) continue
        const v = m.get(x, y, z)
        if (v && v !== M('chrome')) {
          const ox = Math.floor(cx + 0.5 + Math.cos(aa) * (r + 1)), oy = Math.floor(cy + 0.5 + Math.sin(aa) * (r + 1))
          if (oy < m.sy && ox >= 0 && ox < m.sx) m.set(ox, oy, z, M('chrome'))
          break
        }
      }
    }
  }
  ellip(m, cx + 3.6, cy + 2.6, z0 + 11, 0.95, 0.95, 0.95, M('metal_red'))
  snowTop(m, { chance: 0.35, seed: 23, mat: M('snow_fresh'), skip: new Set([M('chrome'), M('metal_red')]) })
  return m
}, { maxDistance: 120 })
