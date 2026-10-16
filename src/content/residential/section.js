// Section (подъезд) model builder: one entrance of a Soviet panel/brick block, with plinth,
// facades (windows, loggias, balconies, bay windows), stair core seen through the staggered
// half-landing windows, technical attic, roof with parapet, lift machine room and antennas.
//
// mode: 'plain' — stairwell volume with self-lit ("glow") whitewash on lit floors, no lift shaft;
//       'ent'   — explorable stairwell: lift shaft, unlit walls (real indoor lights are added by
//                 the runtime), details for close inspection;
//       'loop'  — like 'ent' but the stair well is walled up (the never-ending stairwell).

import { VoxelModel } from '../../core/VoxelModel.js'
import { RNG, hash2, hashString, valueNoise2 } from '../../core/rng.js'
import { sectionLayout, G, FH } from './series.js'
import { MAT, Face, drawWindow, snowPass } from './vox.js'

/** Deterministic style of apartment door i on floor k (shared by the model and the runtime). */
export function aptDoorStyle(k, i, salt = 0) {
  const h = hash2(hash2(k * 31 + 7, i * 17 + 3), salt) / 4294967296
  // 0 leatherette brown, 1 burgundy, 2 black leatherette, 3 steel brown, 4 oak vinyl, 5 grey steel
  return h < 0.2 ? 0 : h < 0.32 ? 1 : h < 0.42 ? 2 : h < 0.72 ? 3 : h < 0.88 ? 4 : 5
}
export const APT_DOOR_COLORS = ['#4a2c1f', '#5a1e24', '#1f1d1c', '#5a3e2e', '#7a5a3c', '#6f7270']

function doorMat(T, style) {
  return [T.leatherette, T.res_leather_red, T.plastic_dark, T.metal_brown, T.wood, T.metal_gray][style]
}

/** Floor index used for per-floor details: periodic in the endless stairwell (identical floors). */
export function perFloor(L, mode, k) {
  if (mode === 'loop' && L.N >= 9 && k >= 2) return ((k - 2) % 3) + 32
  return k
}

/** Painted lower-wall colour of a stairwell (by section variant). */
export function stairPaintIndex(seed) { return seed % 3 }

export function buildSection(seriesKey, floors, variant, mode) {
  const T = MAT()
  const L = sectionLayout(seriesKey, floors)
  const S = L.series
  const seed = hash2(hashString(seriesKey) + floors * 7, variant * 1013 + 11)
  const rng = new RNG(seed)
  const m = new VoxelModel(L.SX, L.sy, L.sz)
  m.setPivot(0, G, L.F)
  const wall = T[S.wall]
  const c = { m, L, S, T, rng, mode, wall, seed, variant, ent: mode !== 'plain' }
  // body
  m.fill(0, 0, L.F, L.SX, L.R0, L.D, wall)
  m.fill(0, 0, L.F, L.SX, G, L.D, T.concrete_dark)
  m.fill(0, L.R0, L.F, L.SX, 1, L.D, T.roof_tar)
  c.front = new Face(m, L, 'front')
  c.back = new Face(m, L, 'back')
  c.left = new Face(m, L, 'left')
  c.right = new Face(m, L, 'right')
  // facade accent (paint) choices per bay column
  c.carpet = new Map()
  stairCore(c)
  facade(c, c.front, L.front, true)
  facade(c, c.back, L.back, false)
  gables(c)
  plinth(c)
  attic(c)
  seamsAndWeather(c)
  roof(c)
  stairPaint(c)
  const sseed = seed % 1000
  snowPass(m, {
    skip: new Set([T.window, T.glass_clear, T.glass_frosted, T.lamp_bulb, T.lamp_warm, T.res_cloth, T.metal_dark]),
    exclude: (x, y, z) => x >= L.door.x0 - 1 && x < L.door.x1 + 1 && z >= L.F - 1 && z <= L.F + 2 && y < L.G + 12,
    depthAt: (x, y, z, open) => {
      if (open) {
        if (y < L.R0) return 1 + (valueNoise2(x * 0.3, z * 0.3, sseed) > 0.55 ? 1 : 0)
        const edge = Math.min(x, L.SX - 1 - x, z - L.F, L.F + L.D - 1 - z)
        return 2 + (edge < 4 ? 1 : 0) + (valueNoise2(x * 0.12, z * 0.12, sseed + 1) > 0.62 ? 1 : 0)
      }
      return valueNoise2(x * 0.45 + y * 3.1, z * 0.45 + y * 1.7, sseed + 2) > 0.38 ? 1 : 0
    },
  })
  icicles(c)
  return m
}

// ---------------------------------------------------------------------------------------------
// Facades
// ---------------------------------------------------------------------------------------------

function frameFor(c) {
  const { rng, T, S } = c
  const r = rng.next()
  if (S.frames === 'pvc') return r < 0.85 ? T.window_frame_white : T.window_frame_brown
  if (S.frames === 'mixed') return r < 0.42 ? T.window_frame_wood : r < 0.9 ? T.window_frame_white : T.window_frame_brown
  return r < 0.58 ? T.window_frame_wood : r < 0.92 ? T.window_frame_white : T.window_frame_brown
}

/** Style-specific panel material at a facade position (front layer). */
function accentAt(c, fc, b, k, y, u) {
  const { S, T, L } = c
  const y0 = L.FL(k)
  const st = S.style
  if (st === 'p44') {
    if ((b.type === 'room' || b.type === 'kit') && y >= y0 && y < y0 + 3) return T.paint_matte
  } else if (st === 'mosaic') {
    const key = fc.side + b.u
    if (!c.carpet.has(key)) c.carpet.set(key, c.rng.next() < 0.6)
    if (c.carpet.get(key) && y >= y0 && y < y0 + 3 && (b.type === 'room' || b.type === 'kit')) return y & 1 ? T.paint_matte : T.res_tile_white
  } else if (st === 'p44t') {
    if (b.type === 'end' || b.type === 'erker' || b.type === 'transit') return (y % 3 === 0) ? T.res_seam : T.paint_matte
    if (y >= y0 && y < y0 + 3) return T.paint_matte
  } else if (st === 'gray') {
    if (b.type === 'end' && u >= b.u + b.w - 3 && fc.side === 'front') return T.paint_matte
    if (b.type === 'bal' && y >= y0 && y < y0 + 3) return T.paint_matte
  }
  return 0
}

function facade(c, fc, bays, isFront) {
  const { L, S, T, rng } = c
  for (const b of bays) {
    if (b.type === 'stair') continue
    for (let k = 1; k <= L.N; k++) {
      const y0 = L.FL(k)
      // accents on the wall layer for this floor band (rows y0-1 .. y0+9)
      for (let y = y0 - 1; y < y0 + FH - 1; y++)
        for (let u = b.u; u < b.u + b.w; u++) {
          const a = accentAt(c, fc, b, k, y, u)
          if (a) fc.set(u, y, 0, a)
        }
      bay(c, fc, b, k, isFront)
    }
  }
  // satellite dishes, AC units, cables
  const nDish = rng.int(isFront ? 0 : 1, isFront ? 2 : 3)
  for (let i = 0; i < nDish; i++) {
    const b = rng.pick(bays.filter(bb => bb.type === 'room' || bb.type === 'kit'))
    if (!b) break
    const k = rng.int(2, L.N)
    const u = b.mirror ? b.u + 1 : b.u + b.w - 3
    const y = L.FL(k) + 5
    fc.fill(u, y, -1, 1, 1, 1, T.metal_gray)
    fc.fill(u, y - 1, -3, 2, 2, 2, T.plastic_white)
    fc.set(u + (b.mirror ? 1 : 0), y + 1, -3, T.plastic_white)
  }
  if (rng.chance(0.35)) {
    const b = rng.pick(bays.filter(bb => bb.type === 'kit' || bb.type === 'room'))
    if (b) {
      const k = rng.int(2, L.N)
      const y = L.FL(k) + 1
      fc.fill(b.u + 2, y, -2, 3, 2, 2, T.plastic_white)
    }
  }
}

function bay(c, fc, b, k, isFront) {
  const { L, S, T, rng } = c
  const y0 = L.FL(k)
  const [rw, rh] = S.win.room
  const [kw, kh] = S.win.kit
  const t = b.type
  if (t === 'end') return
  if (t === 'room' || t === 'kit' || ((t === 'bal' || t === 'erker') && k === 1)) {
    const gw = t === 'kit' ? kw : rw
    const u0 = b.u + Math.floor((b.w - gw) / 2)
    drawWindow(fc, u0, y0 + 4, gw, rh, { frame: frameFor(c), sillMat: S.style === 'brick' || S.style === 'k7' ? T.concrete_light : T.metal_gray })
    if (k === 1 && rng.chance(0.3)) grille(c, fc, u0, y0 + 4, gw, rh)
    return
  }
  if (t === 'log') return loggia(c, fc, b, k)
  if (t === 'bal') return balcony(c, fc, b, k)
  if (t === 'erker') return erker(c, fc, b, k)
  if (t === 'transit') {
    if (k === 1) return
    return transit(c, fc, b, k)
  }
}

function grille(c, fc, u0, y0, gw, gh) {
  const { T, rng } = c
  const mat = rng.chance(0.5) ? T.plastic_white : T.metal_dark
  for (let u = u0 - 1; u <= u0 + gw; u += 2) fc.fill(u, y0 - 1, -1, 1, gh + 2, 1, mat)
  fc.fill(u0 - 1, y0 - 1 + Math.floor((gh + 2) / 2), -1, gw + 2, 1, 1, mat)
  fc.fill(u0 - 1, y0 + gh, -1, gw + 2, 1, 1, mat)
}

function parapetMat(c, u, y, kind) {
  const { T, S } = c
  if (kind === 'siding') return T.res_siding
  if (kind === 'blue') return u & 1 ? T.metal_blue : T.tile_blue
  if (kind === 'lining') return T.wood
  if (kind === 'white') return T.plastic_white
  if (S.style === 'p44' || S.style === 'p44t') return T.paint_matte
  if (S.style === 'mosaic') return y & 1 ? T.paint_matte : T.res_tile_white
  if (S.style === 'gray') return u & 1 ? T.panel_gray : T.concrete_dark
  if (S.style === 'brick') return c.wall
  return T.concrete_light
}

/** Glazing panes + frames over a run in facade coords at layer w. Returns the window id. */
function glazing(c, fc, u0, wi, y0, w, kind, sides) {
  const { T, rng, m } = c
  const frame = kind === 'wood' ? T.window_frame_wood : kind === 'alu' ? T.chrome : kind === 'brown' ? T.window_frame_brown : T.window_frame_white
  const pm = kind === 'wood' ? 3 : 4
  const id = m.nextWindowId()
  fc.fill(u0, y0 + 4, w, wi, 1, 1, frame)
  fc.fill(u0, y0 + 9, w, wi, 1, 1, frame)
  fc.fill(u0, y0 + 5, w, wi, 4, 1, T.window, id)
  for (let u = u0; u < u0 + wi; u += pm) fc.fill(u, y0 + 5, w, 1, 4, 1, frame)
  fc.fill(u0 + wi - 1, y0 + 5, w, 1, 4, 1, frame)
  if (kind === 'wood' && rng.chance(0.25)) {
    const u = u0 + 1 + rng.int(0, Math.max(0, wi - 3))
    if (fc.get(u, y0 + 6, w) === T.window) fc.fill(u, y0 + 5, w, 1, 4, 1, rng.chance(0.5) ? T.wood : T.paper)
  }
  return id
}

function loggia(c, fc, b, k) {
  const { L, T, rng } = c
  const y0 = L.FL(k)
  const ui = b.u + 1, wi = b.w - 2
  const open = k === 1 ? rng.chance(0.15) : rng.chance(0.27)
  if (!open) {
    // glazed by the owner, all differently
    const kinds = ['wood', 'wood', 'alu', 'pvc', 'pvc', 'brown']
    const kind = rng.pick(kinds)
    const ext = k > 1 && rng.chance(0.25)
    const w = ext ? -1 : 0
    const clad = rng.chance(0.45) ? rng.pick(['siding', 'blue', 'lining', 'white']) : null
    for (let y = y0; y < y0 + 4; y++)
      for (let u = ui; u < ui + wi; u++) fc.set(u, y, w, parapetMat(c, u, y, clad))
    glazing(c, fc, ui, wi, y0, w, kind)
    if (ext) {
      fc.fill(ui, y0 - 1, -1, wi, 1, 1, T.concrete)
      if (k === L.N || rng.chance(0.2)) fc.fill(ui - 1, y0 + 10, -2, wi + 2, 1, 2, T.metal_gray)
      else fc.fill(ui, y0 + 10, -1, wi, 1, 1, T.metal_gray)
    }
    return
  }
  // open loggia: recess with a parapet and the room's window + balcony door at the back
  const LD = 5
  fc.fill(ui, y0, 0, wi, FH - 1, LD, 0)
  fc.fill(ui, y0 - 1, 0, wi, 1, LD, T.concrete)
  for (let y = y0; y < y0 + 4; y++)
    for (let u = ui; u < ui + wi; u++) fc.set(u, y, 0, parapetMat(c, u, y, null))
  fc.fill(ui, y0 + 3, 0, wi, 1, 1, T.concrete_light)
  const fr = frameFor(c)
  const id = c.m.nextWindowId()
  const doorU = b.mirror ? ui + wi - 3 : ui + 1
  const winU = b.mirror ? ui + 1 : ui + 5
  drawWindow(fc, doorU, y0 + 1, 2, 7, { wb: LD, frame: fr, id, sill: false })
  drawWindow(fc, winU, y0 + 4, Math.min(5, wi - 6), 5, { wb: LD, frame: fr, id })
  balconyJunk(c, fc, ui, wi, y0, 1, LD - 1)
}

/** Junk, laundry and the odd sled on an open balcony/loggia floor (layers w0..w1). */
function balconyJunk(c, fc, ui, wi, y0, w0, w1) {
  const { T, rng } = c
  const n = rng.int(0, 3)
  for (let i = 0; i < n; i++) {
    const u = ui + rng.int(0, wi - 2)
    const w = rng.int(Math.min(w0, w1), Math.max(w0, w1))
    const r = rng.next()
    if (r < 0.25) fc.fill(u, y0, w, 2, 2, 1, T.wood) // box
    else if (r < 0.4) fc.fill(u, y0, w, 1, 7, 1, T.wood_dark) // skis
    else if (r < 0.55) fc.fill(u, y0, w, 2, 1, 1, T.glass_frosted) // jars
    else if (r < 0.7) { fc.fill(u, y0, w, 2, 2, 1, T.rubber); fc.set(u, y0 + 1, w, 0) } // tyre
    else if (r < 0.82) { fc.fill(u, y0, w, 2, 1, 1, T.wood_painted_blue); fc.fill(u, y0 + 1, w, 1, 2, 1, T.wood_painted_blue) } // chair
    else fc.fill(u, y0, w, 3, 1, 1, T.metal_red) // sled
  }
  if (rng.chance(0.35)) {
    // frozen laundry on a line under the ceiling
    const w = Math.min(w0, w1) + 1
    for (let u = ui; u < ui + wi; u++) {
      if (rng.chance(0.55)) fc.fill(u, y0 + 6, w, 1, rng.int(1, 3), 1, rng.chance(0.25) ? T.fabric_red : T.res_cloth)
    }
  }
}

function balcony(c, fc, b, k) {
  const { L, T, rng, S } = c
  const y0 = L.FL(k)
  const ui = b.u + 1, wi = b.w - 2
  const BD = 4
  // facade behind: balcony door + window
  const fr = frameFor(c)
  const id = c.m.nextWindowId()
  const doorU = b.mirror ? ui + wi - 3 : ui + 1
  const winU = b.mirror ? ui + 1 : ui + 5
  drawWindow(fc, doorU, y0 + 1, 2, 7, { frame: fr, id, sill: false })
  drawWindow(fc, winU, y0 + 4, Math.min(5, wi - 6), 5, { frame: fr, id })
  // slab
  fc.fill(ui, y0 - 1, -BD, wi, 1, BD, T.concrete)
  const style = S.style === 'brick' ? 'bars' : S.style === 'gray' ? (rng.chance(0.7) ? 'ribbed' : 'bars') : rng.pick(['bars', 'panel'])
  const glazed = k > 1 && rng.chance(S.style === 'brick' ? 0.45 : 0.6)
  const rail = (u, w) => {
    for (let y = y0; y < y0 + 4; y++) {
      let mat
      if (glazed && rng.chance(0.4)) mat = parapetMat(c, u + w, y, rng.pick(['siding', 'blue', 'lining']))
      else if (style === 'bars') mat = (y === y0 + 3) ? T.metal_dark : ((u + w) & 1 ? T.metal_dark : 0)
      else if (style === 'ribbed') mat = (u + w) & 1 ? T.panel_gray : T.concrete
      else mat = T.concrete_light
      if (mat) fc.set(u, y, w, mat)
    }
  }
  for (let u = ui; u < ui + wi; u++) rail(u, -BD)
  for (let w = -BD + 1; w < 0; w++) { rail(ui, w); rail(ui + wi - 1, w) }
  if (glazed) {
    const kind = rng.pick(['wood', 'alu', 'pvc', 'pvc'])
    glazing(c, fc, ui, wi, y0, -BD, kind)
    // side panes
    const frame = kind === 'wood' ? T.window_frame_wood : kind === 'alu' ? T.chrome : T.window_frame_white
    for (const u of [ui, ui + wi - 1]) {
      fc.fill(u, y0 + 4, -BD + 1, 1, 1, BD - 1, frame)
      fc.fill(u, y0 + 9, -BD + 1, 1, 1, BD - 1, frame)
      fc.fill(u, y0 + 5, -BD + 1, 1, 4, BD - 1, T.window, c.m.nextWindowId())
    }
    // interior hidden behind opaque panes: keep it solid so it costs nothing
    fc.fill(ui + 1, y0, -BD + 1, wi - 2, 10, BD - 1, T.concrete)
    if (k === L.N) fc.fill(ui - 1, y0 + 10, -BD - 1, wi + 2, 1, BD + 1, T.metal_gray)
  } else balconyJunk(c, fc, ui + 1, wi - 2, y0, -BD + 1, -1)
  // rust streak from the slab corners
  if (k > 1 && rng.chance(0.45)) {
    const u = rng.chance(0.5) ? ui : ui + wi - 1
    const len = rng.int(2, 7)
    for (let y = y0 - 2; y > y0 - 2 - len; y--) if (fc.get(u, y, 0) === c.wall || fc.get(u, y, 0) === T.paint_matte) fc.set(u, y, 0, T.res_rust_stain)
  }
}

function erker(c, fc, b, k) {
  const { L, T } = c
  const y0 = L.FL(k)
  const ui = b.u + 1, wi = b.w - 2
  const E = 3
  fc.fill(ui, y0 - 1, -E, wi, FH, E, T.paint_matte)
  for (let y = y0 - 1; y < y0 + FH - 1; y++) if (y % 3 === 0) fc.fill(ui, y, -E, wi, 1, 1, T.res_seam)
  fc.fill(ui, y0 - 1, -E, wi, 2, E, T.res_panel_cream)
  const gw = wi - 4
  drawWindow(fc, ui + 2, y0 + 4, gw, 5, { wb: -E, frame: T.window_frame_white, sillMat: T.res_panel_cream })
  // narrow side panes on the bay's flanks
  const id = c.m.nextWindowId()
  for (const u of [ui, ui + wi - 1]) {
    const side = u === ui ? -1 : 1
    void side
    fc.fill(u, y0 + 4, -E + 1, 1, 5, 1, T.window, id)
    fc.fill(u, y0 + 3, -E + 1, 1, 1, 1, T.window_frame_white)
    fc.fill(u, y0 + 9, -E + 1, 1, 1, 1, T.window_frame_white)
  }
}

function transit(c, fc, b, k) {
  const { L, T } = c
  const y0 = L.FL(k)
  const ui = b.u + 1, wi = b.w - 2
  const LD = 5
  fc.fill(ui, y0, 0, wi, FH - 1, LD, 0)
  fc.fill(ui, y0 - 1, 0, wi, 1, LD, T.concrete)
  for (let u = ui; u < ui + wi; u++) {
    fc.set(u, y0 + 3, 0, T.metal_dark)
    if ((u - ui) % 2 === 0) fc.fill(u, y0, 0, 1, 3, 1, T.metal_dark)
  }
  // ceiling glow + bulb, steel door to the smoke-proof stair at the back
  fc.fill(ui, y0 + FH - 1, 1, wi, 1, LD - 1, T.res_stair_glow)
  fc.set(ui + (wi >> 1), y0 + FH - 2, 3, T.lamp_bulb)
  fc.fill(ui + 1, y0, LD, 3, 8, 1, T.metal_gray)
  fc.fill(ui + 1, y0 + 8, LD, wi - 2, 2, 1, T.res_stair_glow)
  for (let w = 1; w < LD; w++) fc.fill(ui, y0 + 4, w, 1, 6, 1, T.res_stair_glow)
  for (let w = 1; w < LD; w++) fc.fill(ui + wi - 1, y0 + 4, w, 1, 6, 1, T.res_stair_glow)
}

// ---------------------------------------------------------------------------------------------
// Gables, plinth, attic, roof
// ---------------------------------------------------------------------------------------------

function gables(c) {
  const { L, T, S, rng } = c
  for (const fc of [c.left, c.right]) {
    for (let y = L.FL1 - 1; y < L.R0; y++)
      for (let u = 0; u < L.D; u++) {
        let mat = 0
        if (S.style === 'p44' && u > 4 && u < L.D - 5 && y > L.FL(2) && (Math.floor((u - 5) / 3) % 4 === 0)) mat = T.paint_matte
        if (S.style === 'p44t' && (u < 8 || u >= L.D - 8)) mat = y % 3 === 0 ? T.res_seam : T.paint_matte
        if (S.style === 'mosaic' && u > 6 && u < L.D - 7 && y > L.topCeil - 22 && y < L.topCeil - 4) mat = (y >> 1) & 1 ? T.paint_matte : T.res_tile_white
        if (mat) fc.set(u, y, 0, mat)
      }
    // a single small window per floor on some gables (stair to the end flat's kitchen)
    if (S.style === 'brick') {
      for (let k = 1; k <= L.N; k++) if (rng.chance(0.5)) drawWindow(fc, Math.floor(L.D / 2) - 1, L.FL(k) + 4, 3, 5, { frame: frameFor(c), sillMat: T.concrete_light })
    }
  }
}

function plinth(c) {
  const { L, T, rng } = c
  const top = L.FL1 - 1
  const doorC = (L.door.x0 + L.door.x1) >> 1
  for (const fc of [c.front, c.back, c.left, c.right]) {
    fc.fill(0, G, 0, fc.len, top - G, 1, T.res_plinth)
    for (let u = 0; u < fc.len; u++) {
      if (fc === c.front && u >= doorC - 9 && u < doorC + 9) continue
      fc.fill(u, G, -1, 1, top - G - 1, 1, T.res_plinth)
      fc.set(u, top - 1, -1, T.concrete)
    }
    // basement vents (продухи), some with a cat-sized dark hole
    for (let u = 4 + rng.int(0, 3); u < fc.len - 3; u += rng.int(9, 14)) {
      if (fc === c.front && u >= doorC - 10 && u < doorC + 10) continue
      fc.set(u, G + 1, -1, 0)
      fc.set(u, G + 1, 0, 0)
      fc.set(u, G + 1, 1, T.rubber)
    }
  }
  // refuse-room door next to the stairwell (series with a chute)
  if (c.S.chute === 'half') {
    const x0 = L.SX0 - 4
    c.front.fill(x0 - 1, G, -1, 5, 5, 1, 0)
    c.front.fill(x0 - 1, G, -1, 5, 1, 1, T.concrete)
    c.front.fill(x0, G + 1, 0, 3, 8, 1, T.metal_rust)
    c.front.fill(x0 - 1, G + 9, 0, 5, 1, 1, T.concrete_light)
  }
}

function attic(c) {
  const { L, T, rng } = c
  const y0 = L.topCeil + 1
  for (const fc of [c.front, c.back]) {
    for (let u = 3 + rng.int(0, 4); u < fc.len - 3; u += rng.int(7, 11)) {
      if (fc === c.front && u > L.SX0 - 2 && u < L.SX0 + 13) continue
      fc.fill(u, y0 + 2, 0, 2, 1, 1, 0)
      fc.fill(u, y0 + 2, 1, 2, 1, 1, T.rubber)
    }
  }
}

function seamsAndWeather(c) {
  const { L, T, S, rng, wall } = c
  const panel = S.style !== 'brick'
  const base = new Set([wall, T.paint_matte, T.res_tile_white])
  const seamAt = (fc, u, y) => { if (base.has(fc.get(u, y, 0))) fc.set(u, y, 0, T.res_seam) }
  for (const [fc, bays] of [[c.front, L.front], [c.back, L.back]]) {
    if (S.style === 'k7') {
      // protruding column-and-girder frame
      for (let k = 1; k <= L.N + 1; k++) {
        const y = k <= L.N ? L.FL(k) - 1 : L.topCeil
        for (let u = 0; u < fc.len; u++) if (fc.get(u, y, -1) === 0 && fc.get(u, y, 0) !== 0) fc.set(u, y, -1, T.concrete_light)
      }
      for (const b of bays) for (let y = L.FL1 - 1; y <= L.topCeil; y++) if (fc.get(b.u, y, 0) !== 0 && fc.get(b.u, y, -1) === 0) fc.set(b.u, y, -1, T.concrete_light)
      continue
    }
    if (!panel) {
      for (let k = 2; k <= L.N; k++) for (let u = 0; u < fc.len; u++) if (fc.get(u, L.FL(k) - 1, 0) === wall) fc.set(u, L.FL(k) - 1, 0, T.concrete_light)
      continue
    }
    for (let k = 2; k <= L.N; k++) for (let u = 0; u < fc.len; u++) seamAt(fc, u, L.FL(k) - 1)
    for (let u = 0; u < fc.len; u++) seamAt(fc, u, L.topCeil)
    for (const b of bays) {
      const mastic = rng.chance(0.3)
      const ky0 = rng.int(1, L.N), ky1 = Math.min(L.N, ky0 + rng.int(1, 5))
      for (let y = L.FL1 - 1; y <= L.topCeil; y++) {
        const v = fc.get(b.u, y, 0)
        if (!base.has(v)) continue
        const k = Math.floor((y - L.FL1 + 1) / FH) + 1
        fc.set(b.u, y, 0, mastic && k >= ky0 && k <= ky1 ? T.res_mastic : T.res_seam)
      }
    }
    // fallen tile scars (raw concrete) on tiled facades
    if (S.style === 'mosaic' || S.style === 'p44') {
      const n = rng.int(3, 8)
      for (let i = 0; i < n; i++) {
        const u = rng.int(2, fc.len - 6), y = rng.int(L.FL1 + 4, L.topCeil - 4)
        const w = rng.int(1, 3), h = rng.int(1, 3)
        for (let yy = y; yy < y + h; yy++) for (let uu = u; uu < u + w; uu++) if (base.has(fc.get(uu, yy, 0)) && rng.chance(0.8)) fc.set(uu, yy, 0, T.concrete)
      }
    }
  }
  // gable seams
  if (panel && S.style !== 'k7') {
    for (const fc of [c.left, c.right]) {
      for (let k = 2; k <= L.N; k++) for (let u = 0; u < fc.len; u++) seamAt(fc, u, L.FL(k) - 1)
      for (let u = 12; u < fc.len - 6; u += 12) for (let y = L.FL1 - 1; y <= L.topCeil; y++) seamAt(fc, u, y)
    }
  }
}

function roof(c) {
  const { L, T, S, rng, m } = c
  const RS = L.RS, P = S.parapet
  // parapet on all four sides, flashing with a drip overhang (icicles hang from it)
  for (const fc of [c.front, c.back, c.left, c.right]) {
    fc.fill(0, RS, 0, fc.len, P - 1, 2, c.wall === T.brick_silicate || c.wall === T.brick_red ? c.wall : T.concrete_light)
    fc.fill(0, RS + P - 1, -1, fc.len, 1, 3, T.metal_gray)
  }
  // a cable draped over the front parapet
  for (let i = 0; i < 2; i++) {
    const u = rng.int(4, L.SX - 4)
    const len = rng.int(3, 12)
    c.front.fill(u, RS + P - 1 - len, -2, 1, len, 1, T.metal_dark)
    c.front.set(u, RS + P - 1, -2, T.metal_dark)
  }
  const x0 = L.SX0, zi = L.ZI
  // lift machine room / roof exit
  if (S.machine) {
    const bx = x0 - 1, bz = zi + 12, bw = 14, bd = 20, bh = 11
    const mat = rng.chance(0.5) ? T.brick_silicate : T.concrete_light
    m.fill(bx, RS, bz, bw, bh, bd, mat)
    m.fill(bx, RS + bh, bz, bw, 1, bd, T.roof_tar)
    m.fill(bx - 1, RS + bh, bz - 1, bw + 2, 1, bd + 2, T.metal_gray)
    m.fill(bx + 4, RS, bz - 1, 4, 8, 1, T.metal_brown) // steel door
    for (let y = RS + 3; y < RS + 8; y += 2) m.fill(bx + bw, y, bz + 6, 1, 1, 8, T.metal_gray) // louvre
  } else {
    m.fill(x0 + 6, RS, zi + 1, 6, 4, 6, T.concrete_light)
    m.fill(x0 + 6, RS + 4, zi + 1, 6, 1, 6, T.metal_gray)
  }
  // vent stacks
  const nv = rng.int(2, 4)
  for (let i = 0; i < nv; i++) {
    const x = rng.int(4, L.SX - 7), z = L.F + rng.int(4, L.D - 7)
    if (x > x0 - 3 && x < x0 + 15) continue
    m.fill(x, RS, z, 2, 4, 3, T.concrete_light)
    m.fill(x - 1, RS + 4, z - 1, 4, 1, 5, T.metal_gray)
  }
  // TV antennas: masts with a few elements, some rusty and abandoned
  const na = rng.int(2, 4)
  for (let i = 0; i < na; i++) {
    const x = rng.int(3, L.SX - 4), z = L.F + rng.int(3, L.D - 4)
    if (x > x0 - 2 && x < x0 + 14 && S.machine) continue
    const h = rng.int(9, 14)
    const mat = rng.chance(0.3) ? T.metal_rust : T.metal_gray
    m.fill(x, RS, z, 1, h, 1, mat)
    for (let j = 0; j < 3; j++) {
      const y = RS + h - 1 - j * 2
      if (rng.chance(0.85)) {
        if (i & 1) m.fill(x - 2, y, z, 5, 1, 1, mat)
        else m.fill(x, y, z - 2, 1, 1, 5, mat)
      }
    }
  }
}

function icicles(c) {
  const { L, T, rng, m } = c
  // under the parapet drip edge
  for (const fc of [c.front, c.back]) {
    for (let u = 1; u < fc.len - 1; u++) {
      if (rng.next() < 0.18) {
        const len = rng.int(1, 3)
        for (let k = 1; k <= len; k++) if (fc.get(u, L.RS + c.S.parapet - 1 - k, -1) === 0) fc.set(u, L.RS + c.S.parapet - 1 - k, -1, T.ice)
      }
    }
  }
  void m
}

// ---------------------------------------------------------------------------------------------
// Stair core
// ---------------------------------------------------------------------------------------------

function stairCore(c) {
  const { L, T, m, mode, rng, S } = c
  const X = xp => L.SX0 + xp, Z = zp => L.ZI + zp
  const N = L.N
  const top = L.R0 - 1
  const ty = L.tambourY // G+2
  const stairMat = T.res_terrazzo
  const slab = T.concrete
  // void
  m.fill(X(0), ty, Z(0), 12, top - ty + 1, 15, 0)
  for (let k = 1; k <= N; k++) m.fill(X(-4), L.FL(k), Z(15), 20, FH - 1, 8, 0)
  m.addInterior(X(0), ty, Z(0), 12, top - ty + 1, 15)
  m.addInterior(X(-4), L.FL1, Z(15), 20, L.FL(N) + FH - 1 - L.FL1, 8)
  // ground: closet under strip A, tambour, entrance flight
  m.fill(X(0), ty, Z(0), 5, L.HL(1) - 1 - ty, 5, T.concrete_dark)
  m.fill(X(5), ty, Z(4), 3, 8, 1, c.wall) // tambour partition
  m.fill(X(5), ty, Z(5), 7, 1, 2, stairMat)
  m.fill(X(5), ty, Z(7), 7, 2, 2, stairMat)
  m.fill(X(5), ty, Z(9), 7, 3, 6, slab)
  // entrance opening through the front wall
  m.fill(L.door.x0, ty, L.F, L.door.x1 - L.door.x0, L.door.h, 2, 0)
  m.fill(L.door.x0 - 1, ty - 1, L.F - 0, L.door.x1 - L.door.x0 + 2, 1, 2, T.concrete)
  // per floor
  for (let k = 1; k <= N; k++) {
    const FLk = L.FL(k), HLk = L.HL(k)
    // half-landing slab
    m.fill(X(0), HLk - 1, Z(0), 12, 1, 5, slab)
    // flight A: floor k (back) up to the half-landing (front)
    for (let i = 1; i <= 5; i++) {
      const zz = 15 - 2 * i
      if (k === 1) m.fill(X(0), ty, Z(zz), 5, FLk + i - ty, 2, stairMat)
      else m.fill(X(0), FLk + i - 1, Z(zz), 5, 1, 2, stairMat)
    }
    // flight B: half-landing up to floor k+1
    if (k < N) {
      for (let j = 1; j <= 4; j++) m.fill(X(7), HLk + j - 1, Z(3 + 2 * j), 5, 1, 2, stairMat)
      m.fill(X(5), L.FL(k + 1) - 1, Z(13), 7, 1, 2, slab)
    }
    if (k > 1) m.fill(X(5), FLk - 1, Z(13), 2, 1, 2, slab)
    // well railing (or a solid wall for the loop stairwell)
    if (mode === 'loop') {
      if (k < N && k > 1) m.fill(X(5), FLk, Z(5), 2, FH, 8, c.wall)
      else if (k === 1) {
        m.fill(X(5), FLk, Z(9), 2, FH, 4, c.wall)
        m.fill(X(5), HLk, Z(5), 2, FL(c, k + 1) - HLk, 4, c.wall)
      }
    } else {
      for (let zz = 5; zz < 15; zz += 2) {
        const i = (15 - zz) >> 1 // flight A tread index at zz (1..5)
        const ta = FLk + i
        m.fill(X(5), ta, Z(zz), 1, 3, 1, T.metal_dark)
        m.fill(X(5), ta + 3, Z(zz), 1, 1, 2, T.wood_dark)
        if (k < N && zz < 13) {
          const j = (zz - 3) >> 1 // flight B tread index (1..4)
          const tb = HLk + j
          m.fill(X(6), tb, Z(zz), 1, 3, 1, T.metal_dark)
          m.fill(X(6), tb + 3, Z(zz), 1, 1, 2, T.wood_dark)
        }
      }
      m.fill(X(5), HLk, Z(4), 2, 3, 1, T.metal_dark)
      m.fill(X(5), HLk + 3, Z(4), 2, 1, 1, T.wood_dark)
    }
    // half-landing window (staggered half a floor above the flats' windows)
    const frosted = mode === 'loop' && N >= 9 && k >= N - 7 && k <= N - 1
    drawWindow(c.front, X(3), HLk + 4, 6, 5, { glass: frosted ? T.glass_frosted : T.glass_clear, extra: k, plug: 1, frame: T.window_frame_wood, sillMat: T.metal_gray })
    // radiator under it
    m.fill(X(4), HLk + 1, Z(0), 4, 2, 1, T.metal_gray)
    // apartment doors on the landing
    L.aptDoors.forEach((d, i) => aptDoor(c, d, k, i))
    // lift doors (flush) on the back wall
    if (S.lift) {
      const sh = L.shaft
      m.fill(sh.door0 - 1, FLk, Z(23), sh.door1 - sh.door0 + 2, 9, 1, T.metal_gray)
      if (mode !== 'plain') m.fill(sh.door0, FLk, Z(23), sh.door1 - sh.door0, 8, 1, 0)
      else m.fill(sh.door0, FLk, Z(23), sh.door1 - sh.door0, 8, 1, T.metal_dark)
    }
    // floor electrical cabinet (ЩЭ) on the hall's front wall
    m.fill(X(13), FLk + 3, Z(15), 2, 5, 1, T.metal_gray)
    // garbage chute
    if (S.chute === 'half') {
      m.fill(X(0), HLk - 1, Z(0), 2, FH, 2, T.metal_gray)
      m.fill(X(0), HLk + 3, Z(2), 2, 2, 1, T.metal_dark)
    } else if (S.chute === 'landing') {
      m.fill(X(-4), FLk - 1, Z(15), 2, FH, 2, T.metal_gray)
      m.fill(X(-2), FLk + 3, Z(15), 1, 2, 2, T.metal_dark)
    }
  }
  // top: ladder to the roof hatch in the last half-landing
  {
    const HLN = L.HL(N)
    for (let y = HLN + 1; y < top; y += 2) m.fill(X(11), y, Z(1), 1, 1, 2, T.metal_dark)
    m.fill(X(10), L.R0, Z(1), 2, 1, 2, T.metal_dark)
  }
  // lift shaft
  if (S.lift && mode !== 'plain') {
    const sh = L.shaft
    m.fill(sh.x0, L.FL1 - 2, sh.z0, sh.x1 - sh.x0, top - L.FL1 + 3, sh.z1 - sh.z0, 0)
    m.addInterior(sh.x0, L.FL1 - 2, sh.z0, sh.x1 - sh.x0, top - L.FL1 + 3, sh.z1 - sh.z0)
    m.fill(sh.x0, L.FL1 - 3, sh.z0, sh.x1 - sh.x0, 1, sh.z1 - sh.z0, T.concrete_dark)
  }
  // mailboxes by the entrance flight (1st floor)
  m.fill(X(11), L.FL1 + 2, Z(9), 1, 5, 6, rng.chance(0.5) ? T.metal_blue : T.metal_gray)
  // lit bands (plain mode): bulbs + self-lit whitewash so the stair column glows at night
  c.lit = []
  for (let k = 0; k <= N + 1; k++) c.lit.push(mode === 'plain' ? rng.chance(k === 0 ? 0.6 : 0.72) : false)
  if (mode === 'plain') {
    for (let k = 1; k <= N; k++) {
      if (c.lit[k]) {
        m.set(X(6), L.HL(k) + 9, Z(2), T.lamp_bulb)
        m.set(X(6), L.FL(k) + 9, Z(19), T.lamp_bulb)
      }
    }
  }
}

function FL(c, k) { return c.L.FL(k) }

function aptDoor(c, d, k, i) {
  const { L, T, m } = c
  const FLk = L.FL(k)
  const mat = doorMat(T, aptDoorStyle(perFloor(L, c.mode, k), i, c.L.key.length))
  if (d.side === 'L' || d.side === 'R') {
    const x = d.plane
    m.fill(x, FLk, d.z0 - 1, 1, 9, d.z1 - d.z0 + 2, T.wood_dark)
    m.fill(x, FLk, d.z0, 1, 8, d.z1 - d.z0, mat)
  } else {
    const z = d.plane
    m.fill(d.x0 - 1, FLk, z, d.x1 - d.x0 + 2, 9, 1, T.wood_dark)
    m.fill(d.x0, FLk, z, d.x1 - d.x0, 8, 1, mat)
  }
}

/** Interior finishes: two-tone paint following the stairs, whitewash, tiled landings. */
function stairPaint(c) {
  const { L, T, m, mode } = c
  const paints = [T.wall_paint_green, T.wall_paint_blue, T.wall_paint_brown]
  const paint = paints[stairPaintIndex(c.seed)]
  const inter = m.interiorMask()
  const { sx, sy, sz } = m
  const isAir = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < sx && y < sy && z < sz && m.data[x + sx * (z + sz * y)] === 0 && inter[x + sx * (z + sz * y)]
  const repaint = new Set([c.wall, T.concrete, T.concrete_dark, T.res_seam, T.paint_matte])
  const floorBelow = (x, y, z) => { let yy = y; while (yy > 0 && m.get(x, yy - 1, z) === 0) yy--; return yy }
  const x0 = L.SX0 - 6, x1 = L.SX0 + 18, z0 = L.ZI - 1, z1 = L.ZI + 31
  const checker = mode !== 'plain' && c.rng.chance(0.6)
  const band = y => {
    const k = Math.floor((y - L.FL1 + 2) / FH) + 1
    return Math.max(0, Math.min(L.N + 1, k))
  }
  const out = []
  for (let y = L.G + 1; y < L.R0 + 1; y++)
    for (let z = z0; z < z1; z++)
      for (let x = x0; x < x1; x++) {
        const v = m.get(x, y, z)
        if (!v || !repaint.has(v)) continue
        let mat = 0
        if (isAir(x, y + 1, z)) {
          // floor: landings tiled, flights terrazzo (already)
          mat = checker ? (((x + z) & 1) ? T.floor_tile : T.wall_tile_beige) : T.floor_tile_red
          if (mode !== 'plain' && ((x * 7 + z * 13 + y) % 23) === 0) mat = T.concrete
        } else if (isAir(x, y - 1, z)) {
          mat = mode === 'plain' && c.lit[band(y)] ? T.res_stair_glow : T.whitewash
        } else {
          let ax = -1, az = -1
          if (isAir(x + 1, y, z)) { ax = x + 1; az = z } else if (isAir(x - 1, y, z)) { ax = x - 1; az = z }
          else if (isAir(x, y, z + 1)) { ax = x; az = z + 1 } else if (isAir(x, y, z - 1)) { ax = x; az = z - 1 }
          if (ax < 0) continue
          const h = y - floorBelow(ax, y, az)
          if (h < 6) mat = paint
          else if (h === 6) mat = T.plastic_dark
          else mat = mode === 'plain' && c.lit[band(y)] ? T.res_stair_glow : T.whitewash
        }
        out.push(x, y, z, mat)
      }
  for (let i = 0; i < out.length; i += 4) m.set(out[i], out[i + 1], out[i + 2], out[i + 3])
  // bright patch around the bulbs
  if (mode === 'plain') {
    for (let k = 1; k <= L.N; k++) if (c.lit[k]) {
      const y = L.HL(k) + 10
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (m.get(L.SX0 + 6 + dx, y, L.ZI + 2 + dz) === T.res_stair_glow) m.set(L.SX0 + 6 + dx, y, L.ZI + 2 + dz, T.res_stair_glow_hi)
    }
  }
}
