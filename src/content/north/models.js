// Voxel models of the north package: railway (fine rails, crossing deck, catenary poles, signal,
// relay box, platform «Заводская»), power-line pylon, park pieces (cast-iron fence, gates,
// war memorial, wreath, summer café, bandstand), industrial props (heat-pipe chamber, steel gate
// leaf, doghouse, container, slab stack, cable drum). All defined at import time.
//
// Facing conventions are noted per model ("front"). 1 voxel = 0.25 m unless a model is fine.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M } from '../../core/materials.js'
import { RNG } from '../../core/rng.js'
import { fineModel } from './lib.js'

const snowOn = (m, o = {}) => m.addSnow({ mat: M('snow'), depth: 1, ...o })

// ---------------------------------------------------------------------------------------------
// RAILWAY
// ---------------------------------------------------------------------------------------------

/** Rail length per segment (m). A multiple of the 0.75 m sleeper pitch. */
export const RAIL_SEG = 15

/**
 * Two rails of one track, 15 m, in 12.5 cm voxels (gauge 1.5 m, rails at ±0.75 m of the track
 * axis), rusty web, polished head, clips at every sleeper (0.75 m pitch, first sleeper at the
 * segment start). Pivot: segment start, track axis, sleeper-top level (rail top = pivot + 0.25).
 * Runs along local +X. Non-colliding (the player walks on the sleepers / deck).
 */
defineModel('north_rail', () => {
  const L = RAIL_SEG * 8
  const m = new VoxelModel(L, 2, 15)
  const rust = M('metal_rust'), head = M('chrome'), clip = M('metal_dark')
  for (let x = 0; x < L; x++) {
    for (const z of [1, 13]) {
      m.set(x, 0, z, rust)
      m.set(x, 1, z, head)
    }
    if (x % 6 < 2) for (const z of [0, 2, 12, 14]) m.set(x, 0, z, clip)
  }
  m.setPivot(0, 0, 7.5)
  return fineModel(m, 0.5)
}, { lods: [0.5, 0.999], lodDistances: [70], maxDistance: 260, collide: false, contact: false })

/**
 * Level-crossing decking (rubber panels with timber edging) for both tracks: 6 m along x,
 * 7.75 m across (z), one voxel thick, slots where the four rails run. Pivot: centre of the
 * north edge (place at x = crossing centre, z = 44.125, y = 1.0).
 */
defineModel('north_crossing_deck', () => {
  const m = new VoxelModel(24, 1, 31)
  const rng = new RNG(77)
  for (let z = 0; z < 31; z++) for (let x = 0; x < 24; x++) {
    let mat = (Math.floor(x / 4) + Math.floor(z / 6)) % 2 ? M('rubber') : M('asphalt')
    if (z === 0 || z === 30 || x === 0 || x === 23) mat = M('wood_dark')
    if (z >= 14 && z <= 16) mat = M('asphalt')
    if (rng.chance(0.08)) mat = M('snow_dirty')
    m.set(x, 0, z, mat)
  }
  for (const z of [4, 10, 20, 26]) for (let x = 0; x < 24; x++) m.set(x, 0, z, 0)
  m.setPivot(12, 0, 0)
  return m
}, { lods: [1, 2], lodDistances: [60], maxDistance: 220, contact: false })

/**
 * Catenary pole: square concrete pole (0.5 m, 10 m) with a steel cantilever reaching 4 m
 * toward local +Z (the track), stay, insulators and the registration arm that holds the contact
 * wire about 6.2 m above the pivot. Pivot = pole centre at its foot.
 */
defineModel('north_cat_pole', () => {
  const m = new VoxelModel(2, 42, 19)
  const conc = M('pole_concrete'), steel = M('metal_gray'), ins = M('plastic_white')
  m.fill(0, 0, 0, 2, 40, 2, conc)
  m.fill(0, 40, 0, 2, 1, 2, M('concrete_dark'))
  m.fill(0, 33, 0, 2, 1, 2, M('metal_dark')) // clamp band
  m.fill(0, 24, 0, 2, 1, 2, M('metal_dark'))
  m.fill(0, 4, 0, 2, 1, 2, M('concrete_dark')) // soot / ground line
  // cantilever tube at y 33, from the pole to the track axis (+Z), insulator at the pole
  for (let z = 2; z <= 18; z++) m.set(1, 33, z, steel)
  m.set(1, 33, 2, ins)
  // stay from near the pole top down to the cantilever
  m.line(1, 39, 1, 1, 34, 13, steel)
  m.set(1, 38, 2, ins)
  // dropper to the registration arm, which holds the contact wire
  for (let y = 26; y <= 32; y++) m.set(1, y, 16, steel)
  m.set(1, 29, 16, ins)
  for (let z = 11; z <= 18; z++) m.set(1, 25, z, steel)
  m.line(1, 24, 2, 1, 25, 11, steel) // bottom tube back to the pole
  m.set(1, 24, 3, ins)
  snowOn(m, { chance: 0.55, seed: 4 })
  m.setPivot(1, 0, 1)
  return m
}, { lods: [1, 2], lodDistances: [70], maxDistance: 420 })

/** Railway relay cabinet (релейный шкаф): grey steel box on a concrete foot. Front −Z. */
defineModel('north_relay_box', () => {
  const m = new VoxelModel(4, 8, 3)
  m.fill(0, 0, 0, 4, 1, 3, M('concrete'))
  m.fill(0, 1, 0, 4, 6, 3, M('metal_gray'))
  for (let y = 1; y < 7; y++) m.set(2, y, 0, M('metal_dark'))
  m.set(1, 4, 0, M('chrome')); m.set(3, 4, 0, M('chrome'))
  m.set(0, 1, 0, M('metal_rust')); m.set(3, 2, 0, M('metal_rust'))
  snowOn(m)
  m.setPivot(2, 0, 1.5)
  return m
}, { lods: [1], maxDistance: 140 })

/**
 * Crossing signal post: black-and-white striped post (3.5 m), a black backboard with two red
 * lamp hoods (lamps are separate 'north_signal_lamp' placements so they can alternate), a small
 * bell dome on top. The «Андреевский крест» is a sign above the backboard. Front = −Z.
 */
defineModel('north_crossing_signal', () => {
  const m = new VoxelModel(7, 16, 3)
  for (let y = 0; y < 14; y++) m.set(3, y, 1, (Math.floor(y / 2) % 2) ? M('metal_dark') : M('panel_white'))
  m.fill(3, 0, 1, 1, 1, 1, M('concrete'))
  // backboard
  m.fill(0, 8, 1, 7, 3, 1, M('metal_dark'))
  // lamp hoods (lamps sit at x 1 and 5, y 9, z 0)
  for (const x of [1, 5]) { m.set(x, 10, 0, M('metal_dark')); m.set(x - 1, 9, 0, M('metal_dark')); m.set(x + 1, 9, 0, M('metal_dark')) }
  // bell
  m.fill(2, 14, 1, 3, 1, 1, M('metal_dark'))
  m.set(3, 15, 1, M('metal_dark'))
  snowOn(m, { chance: 0.8 })
  m.setPivot(3.5, 0, 1.5)
  return m
}, { lods: [1], maxDistance: 200 })

/** One red signal lamp (emissive, follows its linked light). Pivot = voxel centre-bottom. */
defineModel('north_signal_lamp', () => {
  const m = new VoxelModel(1, 1, 1)
  m.set(0, 0, 0, M('lamp_red'))
  return m
}, { lods: [1], maxDistance: 400, collide: false, contact: false })

/** Simple sign post (two 0.25 m posts and a blank board) — text is a double-sided sign. */
defineModel('north_board_posts', () => {
  const m = new VoxelModel(14, 12, 1)
  for (const x of [0, 13]) m.fill(x, 0, 0, 1, 11, 1, M('metal_dark'))
  m.fill(0, 11, 0, 14, 1, 1, M('metal_dark'))
  m.fill(1, 7, 0, 12, 3, 1, M('metal_blue'))
  snowOn(m)
  m.setPivot(7, 0, 0.5)
  return m
}, { lods: [1, 2], lodDistances: [50], maxDistance: 260 })

// ---- platform «Заводская» ----------------------------------------------------------------------

export const PLAT = { seg: 10, depth: 4, top: 2.25 }

/**
 * One 10 m section of the high concrete platform (top 2.25 m above the world zero): solid body,
 * edge slab with a painted safety line on the track side (local z 0), packed snow on the deck
 * with a trodden middle, pipe railing on the back edge (local z 15). Pivot = corner (x0, 0, z0):
 * place at y = 0.
 */
function platformSeg(seed, end) {
  const m = new VoxelModel(40, 14, 16)
  const rng = new RNG(seed)
  m.fill(0, 0, 0, 40, 9, 16, M('concrete'))
  // vertical facing on the track side with stains and a darker plinth
  for (let x = 0; x < 40; x++) {
    for (let y = 3; y < 9; y++) if (rng.chance(0.18)) m.set(x, y, 0, M('concrete_dark'))
    if (x % 8 === 0) for (let y = 3; y < 9; y++) m.set(x, y, 0, M('panel_seam'))
  }
  for (let x = 0; x < 40; x++) if (x % 10 === 0) for (let y = 0; y < 9; y++) m.set(x, y, 15, M('panel_seam'))
  // deck surface
  for (let z = 0; z < 16; z++) for (let x = 0; x < 40; x++) {
    let mat
    if (z === 0) mat = M('concrete_light')
    else if (z === 1) mat = rng.chance(0.85) ? M('road_marking') : M('concrete_light')
    else if (z >= 6 && z <= 9) mat = rng.chance(0.75) ? M('snow_packed') : (rng.chance(0.5) ? M('snow_dirty') : M('asphalt'))
    else mat = rng.chance(0.85) ? M('snow') : M('snow_packed')
    m.set(x, 8, z, mat)
  }
  // back railing
  for (let x = 0; x < 40; x++) {
    if (x % 8 === 2) for (let y = 9; y < 13; y++) m.set(x, y, 15, M('metal_dark'))
    m.set(x, 12, 15, M('metal_dark'))
    m.set(x, 10, 15, M('metal_dark'))
  }
  if (end === 'west') { for (let z = 2; z < 15; z++) { m.set(0, 12, z, M('metal_dark')); m.set(0, 10, z, M('metal_dark')); if (z % 4 === 2) for (let y = 9; y < 12; y++) m.set(0, y, z, M('metal_dark')) } }
  snowOn(m, { onlyAbove: 9, chance: 0.7, seed })
  m.setPivot(0, 0, 0)
  return m
}
defineModel('north_platform', () => platformSeg(5), { lods: [1, 2], lodDistances: [60], maxDistance: 400 })
defineModel('north_platform_b', () => platformSeg(17), { lods: [1, 2], lodDistances: [60], maxDistance: 400 })
defineModel('north_platform_west', () => platformSeg(29, 'west'), { lods: [1, 2], lodDistances: [60], maxDistance: 400 })

/**
 * Steps down from the platform deck (2.25 m) to the crossing approach (1.0 m): five 0.25 m
 * steps of 0.5 m toward local +X, 2 m wide (local z 4–12 of the 4 m platform), handrails.
 * Pivot = corner like the platform section (place at the platform's east end, y 0).
 */
defineModel('north_platform_stairs', () => {
  const m = new VoxelModel(11, 14, 16)
  for (let k = 0; k < 5; k++) {
    const top = 8 - k // top voxel row of the step (surface 2.25 → 1.25 m)
    m.fill(2 * k, 0, 4, 2, top + 1, 8, M('concrete'))
    for (let z = 4; z < 12; z++) for (let dx = 0; dx < 2; dx++) m.set(2 * k + dx, top, z, (z + dx + k) % 5 ? M('snow_packed') : M('snow_dirty'))
  }
  // side walls (low) and handrails
  for (const z of [3, 12]) {
    for (let x = 0; x < 10; x++) {
      const top = 8 - Math.floor(x / 2)
      for (let y = 0; y <= top; y++) m.set(x, y, z, M('concrete'))
      m.set(x, top + 4, z, M('metal_dark'))
      if (x % 3 === 0) for (let y = top + 1; y < top + 4; y++) m.set(x, y, z, M('metal_dark'))
    }
  }
  snowOn(m, { onlyAbove: 10, chance: 0.6 })
  m.setPivot(0, 0, 0)
  return m
}, { lods: [1, 2], lodDistances: [50], maxDistance: 260 })

/**
 * Platform shelter (навес): four steel posts, corrugated back wall and roof, a wooden bench.
 * 7 × 2.75 × 3 m. Open side = local −Z (toward the track). Pivot = bottom centre.
 */
defineModel('north_platform_shelter', () => {
  const m = new VoxelModel(28, 13, 11)
  const post = M('metal_blue'), sheet = M('metal_blue')
  for (const x of [0, 27]) for (const z of [1, 9]) m.fill(x, 0, z, 1, 11, 1, post)
  for (let x = 0; x < 28; x++) for (let y = 1; y < 10; y++) {
    const rust = (x * 7 + y * 3) % 23 === 0 || (y < 3 && (x * 5) % 7 === 0)
    m.set(x, y, 10, rust ? M('metal_rust') : (x % 2 ? sheet : M('metal_gray')))
  }
  for (let x = 0; x < 28; x++) for (let z = 0; z < 11; z++) m.set(x, 11, z, (x % 2) ? M('metal_gray') : M('metal_dark'))
  // bench
  m.fill(4, 2, 7, 20, 1, 2, M('wood'))
  for (const x of [5, 22]) m.fill(x, 0, 8, 1, 2, 1, M('metal_dark'))
  m.fill(4, 3, 9, 20, 2, 1, M('wood'))
  m.addSnow({ mat: M('snow'), depth: 2, onlyAbove: 10, vary: 1 })
  m.setPivot(14, 0, 5.5)
  return m
}, { lods: [1, 2], lodDistances: [50], maxDistance: 300, occludesSnow: true })

/** Closed ticket booth (касса): blue sheet-metal hut, boarded window on −Z, door on +X. */
defineModel('north_ticket_booth', () => {
  const m = new VoxelModel(10, 13, 9)
  m.fill(0, 0, 0, 10, 1, 9, M('concrete'))
  m.walls(0, 1, 0, 10, 10, 9, M('paint'))
  m.fill(0, 11, 0, 10, 1, 9, M('metal_gray'))
  m.fill(0, 1, 0, 10, 1, 9, M('metal_rust'))
  // boarded window
  m.fill(2, 4, 0, 6, 4, 1, M('wood'))
  m.line(2, 4, 0, 7, 7, 0, M('wood_dark'))
  m.fill(4, 3, 0, 2, 1, 1, M('metal_dark'))
  // door on +X
  m.fill(9, 1, 3, 1, 8, 3, M('metal_dark'))
  m.set(9, 5, 5, M('chrome'))
  m.addSnow({ mat: M('snow'), depth: 2, onlyAbove: 10 })
  m.setPivot(5, 0, 4.5)
  return m
}, { lods: [1, 2], lodDistances: [50], maxDistance: 260 })

// ---------------------------------------------------------------------------------------------
// POWER LINE
// ---------------------------------------------------------------------------------------------

/**
 * 110 kV lattice pylon, 27.5 m: four galvanized legs converging to a waist at 18 m, X-bracing,
 * three crossarms each side along local Z (tips at ±4.1 m), insulator strings, earth-wire
 * peak. Pivot = centre of the 4 m base. Conductors hang at PYLON_ATTACH.
 */
const PYLON_ARMS = [[74, 16], [86, 19], [98, 13]] // [voxel y, reach in voxels]
/** Conductor attachment points [local z, y] (insulator bottoms), 3 per side. */
export const PYLON_ATTACH = []
for (const [y, reach] of PYLON_ARMS) for (const tip of [20 - reach, 19 + reach]) PYLON_ATTACH.push([(tip + 0.5 - 20) * 0.25, (y - 3) * 0.25])
export const PYLON_PEAK = 27.75
defineModel('north_pylon', () => {
  const m = new VoxelModel(16, 112, 40)
  const g = M('metal_gray')
  const legs = [[0, 12], [15, 12], [0, 27], [15, 27]]
  const waist = [[5, 17], [10, 17], [5, 22], [10, 22]]
  for (let i = 0; i < 4; i++) {
    m.line(legs[i][0], 0, legs[i][1], waist[i][0], 72, waist[i][1], g)
    m.line(waist[i][0], 72, waist[i][1], waist[i][0], 106, waist[i][1], g)
    m.fill(legs[i][0] === 0 ? 0 : 14, 0, legs[i][1] === 12 ? 12 : 26, 2, 1, 2, M('concrete'))
  }
  const at = (i, y) => {
    const t = Math.min(1, y / 72)
    return [legs[i][0] + (waist[i][0] - legs[i][0]) * t, legs[i][1] + (waist[i][1] - legs[i][1]) * t]
  }
  const faces = [[0, 1], [1, 3], [3, 2], [2, 0]]
  for (let y = 0; y < 72; y += 12) {
    for (const [a, b] of faces) {
      const a0 = at(a, y), b0 = at(b, y), a1 = at(a, y + 12), b1 = at(b, y + 12)
      m.line(a0[0], y, a0[1], b1[0], y + 12, b1[1], g)
      m.line(b0[0], y, b0[1], a1[0], y + 12, a1[1], g)
      if (y > 0) m.line(a0[0], y, a0[1], b0[0], y, b0[1], g)
    }
  }
  for (let y = 72; y <= 106; y += 6) for (const [a, b] of faces) m.line(waist[a][0], y, waist[a][1], waist[b][0], y, waist[b][1], g)
  for (let y = 72; y < 106; y += 6) for (const [a, b] of faces) m.line(waist[a][0], y, waist[a][1], waist[b][0], y + 6, waist[b][1], g)
  // crossarms reaching along local Z with a sloping top chord, insulator strings at the tips
  for (const [y, reach] of PYLON_ARMS) {
    for (const s of [-1, 1]) {
      const z0 = s < 0 ? 17 : 22, tip = s < 0 ? 20 - reach : 19 + reach
      for (const x of [5, 10]) { m.line(x, y, z0, x, y, tip, g); m.line(x, y + 3, z0, x, y, tip, g) }
      for (let k = 0; k <= Math.abs(tip - z0); k += 3) m.line(5, y, z0 + s * k, 10, y, z0 + s * k, g)
      m.line(5, y, tip, 10, y, tip, g)
      for (let d = 1; d <= 3; d++) m.set(7, y - d, tip, d === 3 ? M('metal_dark') : M('plastic_white'))
      for (let d = 1; d <= 3; d++) m.set(8, y - d, tip, d === 3 ? M('metal_dark') : M('plastic_white'))
    }
  }
  // earth-wire peak
  m.line(5, 106, 17, 7, 111, 19, g); m.line(10, 106, 22, 8, 111, 20, g)
  m.line(5, 106, 22, 7, 111, 20, g); m.line(10, 106, 17, 8, 111, 19, g)
  m.addSnow({ mat: M('snow'), depth: 1, chance: 0.35, seed: 3, onlyAbove: 4 })
  m.setPivot(8, 0, 20)
  return m
}, { lods: [1, 2, 4], lodDistances: [60, 170], maxDistance: 760 })

// ---------------------------------------------------------------------------------------------
// PARK
// ---------------------------------------------------------------------------------------------

/**
 * Cast-iron park fence, 2.5 m panel, in two parts on one transform:
 * - `north_fence_cast` (25 cm, solid): granite plinth and a dark iron base band, 0.5 m high —
 *   the part that keeps the player out (the fine bars cannot collide).
 * - `north_fence_cast_bars` (12.5 cm fine voxels, non-solid): bars every 50 cm with spear tips,
 *   two rails, small scrolls under the top rail, thin snow on it. Place it at the band top (+0.5 m)
 *   with placeFine.
 * Both run along local +X; pivot = bottom centre.
 */
defineModel('north_fence_cast', () => {
  const m = new VoxelModel(10, 3, 1)
  m.fill(0, 0, 0, 10, 1, 1, M('granite'))
  m.fill(0, 1, 0, 10, 1, 1, M('metal_dark'))
  for (const x of [2, 7]) m.set(x, 1, 0, M('metal_rust'))
  m.setPivot(5, 0, 0.5)
  return m
}, { lods: [1, 2], lodDistances: [45], maxDistance: 200 })

defineModel('north_fence_cast_bars', () => {
  const L = 20, m = new VoxelModel(L, 15, 1)
  const iron = M('metal_dark')
  for (let x = 0; x < L; x++) { m.set(x, 0, 0, iron); m.set(x, 9, 0, iron) }
  for (let x = 2; x < L; x += 4) {
    for (let y = 0; y <= 11; y++) m.set(x, y, 0, iron)
    m.set(x, 12, 0, iron) // spear tip
  }
  // a small scroll between every pair of bars just under the top rail
  for (let x = 4; x < L; x += 4) { m.set(x, 8, 0, iron); m.set(x - 1, 7, 0, iron); m.set(x + 1, 7, 0, iron) }
  m.addSnow({ mat: M('snow'), depth: 1, chance: 0.75, seed: 6, onlyAbove: 8 })
  m.setPivot(L / 2, 0, 0.5)
  return fineModel(m, 0.5)
}, { lods: [0.5, 0.999], lodDistances: [38], maxDistance: 170, collide: false, contact: false })

/** Brick pillar of the park fence with a concrete cap, 0.75 × 2.0 m. Pivot = bottom centre. */
defineModel('north_fence_pillar', () => {
  const m = new VoxelModel(3, 10, 3)
  m.fill(0, 0, 0, 3, 7, 3, M('brick_red'))
  m.fill(0, 0, 0, 3, 1, 3, M('granite'))
  m.fill(0, 7, 0, 3, 1, 3, M('concrete_light'))
  m.set(1, 3, 0, M('brick_silicate')); m.set(2, 5, 2, M('brick_silicate'))
  m.addSnow({ mat: M('snow'), depth: 2, onlyAbove: 7 })
  m.setPivot(1.5, 0, 1.5)
  return m
}, { lods: [1, 2], lodDistances: [45], maxDistance: 200 })

/** One cast-iron gate leaf (1.5 m × 2 m), fine 12.5 cm voxels, drawn closed along local +X from its
 * hinge (pivot). Non-solid (an open leaf never traps the player); place with placeFine. */
defineModel('north_gate_cast', () => {
  const m = new VoxelModel(12, 17, 1)
  const iron = M('metal_dark')
  for (let y = 0; y < 15; y++) { m.set(0, y, 0, iron); m.set(11, y, 0, iron) }
  for (let x = 0; x < 12; x++) { m.set(x, 1, 0, iron); m.set(x, 13, 0, iron); m.set(x, 5, 0, iron) }
  for (let x = 3; x < 11; x += 3) for (let y = 1; y < 16; y++) m.set(x, y, 0, iron)
  // a little scroll in the lower panel and the latch
  for (const [x, y] of [[1, 3], [2, 2], [4, 3], [5, 4], [7, 3], [8, 2], [10, 3]]) m.set(x, y, 0, iron)
  m.set(11, 8, 0, M('metal_rust')); m.set(10, 8, 0, iron)
  m.addSnow({ mat: M('snow'), depth: 1, chance: 0.7, seed: 8, onlyAbove: 12 })
  m.setPivot(0, 0, 0.5)
  return fineModel(m, 0.5)
}, { lods: [0.5, 0.999], lodDistances: [38], maxDistance: 160, collide: false, contact: false })

/**
 * War memorial: two granite steps, pedestal, a whitened concrete obelisk (6.75 m) tapering to
 * a pyramidion, a red five-pointed star on the front (local −Z), two frozen carnations on the
 * step. Modest, as in a district park. Pivot = bottom centre.
 */
defineModel('north_memorial', () => {
  const m = new VoxelModel(14, 30, 14)
  m.fill(0, 0, 0, 14, 1, 14, M('granite'))
  m.fill(1, 1, 1, 12, 1, 12, M('granite'))
  m.fill(3, 2, 3, 8, 4, 8, M('marble_gray'))
  m.fill(3, 6, 3, 8, 1, 8, M('granite'))
  for (let y = 7; y < 26; y++) {
    const t = (y - 7) / 19
    const half = Math.round(3 - t * 1.6) // 6 → ~3 voxels wide
    const c0 = 7 - half, w = half * 2
    m.fill(c0, y, c0, w, 1, w, M('concrete_light'))
  }
  m.fill(6, 26, 6, 2, 2, 2, M('concrete_light'))
  m.set(6, 28, 6, M('concrete_light'))
  // red star on the front face (z = front of the shaft at y 18..23)
  const star = ['.##.', '####', '.##.', '#..#']
  const yTop = 22
  for (let r = 0; r < star.length; r++) for (let c = 0; c < 4; c++) {
    if (star[r][c] !== '#') continue
    const y = yTop - r, x = 5 + c
    // front face of the shaft at this height
    let zf = 0
    while (zf < 14 && !m.get(x, y, zf)) zf++
    if (zf >= 14) continue
    m.set(x, y, Math.max(0, zf - 1), M('metal_red'))
  }
  // weathering streaks under the star
  for (const x of [6, 7]) for (let y = 12; y < 17; y++) if ((x + y) % 3 === 0) { let zf = 0; while (zf < 14 && !m.get(x, y, zf)) zf++; if (zf < 14) m.set(x, y, zf, M('concrete')) }
  // two carnations on the upper step
  m.set(5, 2, 2, M('metal_red')); m.set(8, 2, 2, M('metal_red'))
  m.addSnow({ mat: M('snow'), depth: 1, skip: new Set([M('metal_red')]) })
  m.setPivot(7, 0, 7)
  return m
}, { lods: [1, 2], lodDistances: [60], maxDistance: 400 })

/** Fir wreath with a red ribbon, leaning (0.9 m). Front = −Z. Pivot = bottom centre. */
defineModel('north_wreath', () => {
  const m = new VoxelModel(5, 5, 2)
  const ring = ['.###.', '#...#', '#...#', '#...#', '.###.']
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (ring[r][c] === '#') m.set(c, 4 - r, r < 2 ? 1 : 0, M('needles'))
  m.set(2, 0, 0, M('metal_red')); m.set(1, 1, 0, M('metal_red'))
  m.set(3, 1, 0, M('fabric_red'))
  snowOn(m, { chance: 0.6 })
  m.setPivot(2.5, 0, 1)
  return m
}, { lods: [1], maxDistance: 90, collide: false, contact: false })

/**
 * Summer café «Берёзка», closed for the winter: 6 × 3.5 m painted sheet-metal pavilion, long
 * serving window behind a ribbed roller shutter on the front (local −Z), side door with a
 * padlock (+X), fascia board, a thick roof of snow. Pivot = bottom centre. Tint = walls.
 */
defineModel('north_cafe', () => {
  const m = new VoxelModel(24, 16, 15)
  m.fill(0, 0, 0, 24, 1, 14, M('concrete'))
  m.walls(0, 1, 0, 24, 11, 14, M('paint'))
  for (let x = 0; x < 24; x++) for (let z = 0; z < 14; z++) if ((x === 0 || x === 23 || z === 0 || z === 13) && (x * 3 + z) % 11 === 0) m.set(x, 1, z, M('metal_rust'))
  // roller shutter over the serving window
  for (let x = 2; x < 22; x++) for (let y = 4; y < 10; y++) m.set(x, y, 0, y % 2 ? M('metal_gray') : M('metal_dark'))
  m.fill(1, 3, 0, 22, 1, 1, M('metal_dark')) // counter ledge
  m.fill(1, 10, 0, 22, 1, 1, M('metal_dark')) // shutter box
  // fascia band
  m.fill(0, 11, 0, 24, 2, 1, M('panel_white'))
  // side door with padlock on +X
  m.fill(23, 1, 5, 1, 8, 4, M('metal_dark'))
  m.set(23, 5, 8, M('chrome'))
  // flat roof with an overhang toward the front
  m.fill(0, 13, 0, 24, 1, 14, M('roof_tar'))
  m.fill(0, 12, 0, 24, 1, 1, M('metal_gray'))
  m.addSnow({ mat: M('snow'), depth: 2, vary: 1, onlyAbove: 12, seed: 2 })
  m.setPivot(12, 0, 7)
  return m
}, { lods: [1, 2], lodDistances: [50], maxDistance: 300, occludesSnow: true })

/** Stack of white plastic café chairs and a folded table under a cap of snow. */
defineModel('north_cafe_stack', () => {
  const m = new VoxelModel(4, 7, 4)
  m.fill(0, 0, 0, 2, 4, 2, M('plastic_white'))
  m.fill(0, 4, 1, 2, 2, 1, M('plastic_white'))
  m.fill(2, 0, 2, 2, 3, 2, M('plastic_white'))
  m.set(3, 3, 3, M('plastic_white'))
  m.addSnow({ mat: M('snow'), depth: 1 })
  m.setPivot(2, 0, 2)
  return m
}, { lods: [1], maxDistance: 100 })

/**
 * Old concert shell (эстрада «ракушка»): a 10 m stage 1 m high with side steps, and a
 * quarter-dome shell behind it opening toward local −Z (the audience). Whitewashed concrete,
 * peeling, a bank of snow on the stage. Pivot = bottom centre of the stage footprint.
 */
defineModel('north_bandstand', () => {
  const W = 40, D = 24, H = 24
  const m = new VoxelModel(W, H, D)
  const rng = new RNG(31)
  // stage platform (front edge at z 3), three steps up at both front corners
  m.fill(0, 0, 3, W, 4, 18, M('concrete'))
  for (let x = 0; x < W; x++) { m.set(x, 3, 3, M('wood_dark')); if (rng.chance(0.2)) m.set(x, 1 + rng.int(0, 2), 3, M('concrete_dark')) }
  for (let z = 4; z < 21; z++) for (let x = 1; x < W - 1; x++) m.set(x, 3, z, (z % 2) ? M('wood') : M('wood_dark'))
  for (const x0 of [1, W - 4]) for (let k = 0; k < 3; k++) m.fill(x0, 0, k, 3, k + 1, 1, M('concrete'))
  // quarter-dome shell: centre on the stage front line, the dome curving back over the stage
  const cx = W / 2, cy = 4, cz = 4.5, R = 18.5
  for (let y = cy; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, dz = z + 0.5 - cz
    if (dz < -0.5) continue
    const r = Math.hypot(dx, dy, dz)
    if (r <= R && r > R - 1.4) {
      const rib = Math.abs(Math.atan2(dx, dy)) % 0.45 < 0.1
      let mat = rib ? M('concrete_light') : M('whitewash')
      if (!rib && rng.chance(0.12)) mat = M('concrete') // peeling
      if (y < cy + 3 && rng.chance(0.4)) mat = M('concrete_dark')
      m.set(x, y, z, mat)
    }
  }
  m.addSnow({ mat: M('snow'), depth: 2, vary: 1, seed: 9 })
  m.setPivot(W / 2, 0, 12)
  return m
}, { lods: [1, 2, 4], lodDistances: [50, 140], maxDistance: 420 })

// ---------------------------------------------------------------------------------------------
// INDUSTRIAL
// ---------------------------------------------------------------------------------------------

/**
 * Heat-main chamber (тепловая камера): low concrete box with a hatch where the twin heat pipes
 * (1.25–1.75 m up, 2 m wide like 'pub_heat_pipe') bend down into the ground. The pipes arrive
 * along local −X → pivot at the pipe end (x 0), pipe axis (z centre).
 */
defineModel('north_chamber', () => {
  const m = new VoxelModel(14, 8, 12)
  m.fill(2, 0, 0, 12, 3, 12, M('concrete'))
  m.fill(2, 3, 0, 12, 1, 12, M('concrete_dark'))
  m.fill(7, 4, 5, 2, 1, 2, M('metal_dark')) // hatch
  m.set(7, 4, 4, M('metal_rust'))
  for (const z0 of [3, 6]) {
    for (let x = 0; x < 3; x++) for (let z = z0; z < z0 + 2; z++) { m.set(x, 5, z, M('metal_gray')); m.set(x, 6, z, M('concrete_light')) }
    for (let y = 3; y < 7; y++) for (let z = z0; z < z0 + 2; z++) { m.set(2, y, z, M('metal_gray')); m.set(3, y, z, M('concrete_light')) }
  }
  snowOn(m, { chance: 0.4, seed: 2 })
  m.setPivot(0, 0, 6)
  return m
}, { lods: [1, 2], lodDistances: [50], maxDistance: 220 })

/** Steel gate leaf, 3.25 × 2 m: angle frame, vertical bars, sheet lower half (tint). Pivot = hinge. */
defineModel('north_gate_leaf', () => {
  const m = new VoxelModel(13, 9, 1)
  for (let x = 0; x < 13; x++) { m.set(x, 0, 0, M('metal_dark')); m.set(x, 7, 0, M('metal_dark')); for (let y = 1; y < 4; y++) m.set(x, y, 0, M('paint')) }
  for (let x = 0; x < 13; x += 2) for (let y = 4; y < 7; y++) m.set(x, y, 0, M('metal_dark'))
  for (let y = 0; y < 8; y++) { m.set(0, y, 0, M('metal_dark')); m.set(12, y, 0, M('metal_dark')) }
  for (const [x, y] of [[3, 1], [7, 2], [10, 1], [4, 3]]) m.set(x, y, 0, M('metal_rust'))
  snowOn(m, { chance: 0.8 })
  m.setPivot(0, 0, 0.5)
  return m
}, { lods: [1], maxDistance: 160, contact: false })

/** Concrete gate post (0.5 × 2.5 m). */
defineModel('north_gate_post', () => {
  const m = new VoxelModel(2, 11, 2)
  m.fill(0, 0, 0, 2, 10, 2, M('pole_concrete'))
  m.fill(0, 9, 0, 2, 1, 2, M('concrete_dark'))
  snowOn(m)
  m.setPivot(1, 0, 1)
  return m
}, { lods: [1], maxDistance: 200 })

/** Doghouse (будка) with a pitched roof, opening on local −Z, chain to a stake. */
defineModel('north_doghouse', () => {
  const m = new VoxelModel(6, 8, 8)
  m.fill(0, 0, 1, 5, 1, 5, M('wood_dark'))
  m.walls(0, 1, 1, 5, 3, 5, M('wood'))
  m.fill(1, 1, 1, 3, 2, 1, 0) // opening
  m.fill(0, 4, 1, 5, 1, 5, M('wood_dark'))
  m.fill(1, 5, 1, 3, 1, 5, M('wood_dark'))
  m.fill(2, 6, 1, 1, 1, 5, M('wood_dark'))
  // chain to a stake in front
  m.line(2, 1, 1, 5, 0, 0, M('metal_dark'))
  m.set(5, 0, 0, M('metal_rust'))
  m.set(0, 0, 0, M('metal_gray')) // bowl
  snowOn(m, { depth: 1 })
  m.setPivot(2.5, 0, 3.5)
  return m
}, { lods: [1], maxDistance: 120 })

/** Shipping container, 6 × 2.5 × 2.5 m, corrugated sides (tint), doors on +X. */
defineModel('north_container', () => {
  const m = new VoxelModel(24, 11, 10)
  const rng = new RNG(5)
  for (let x = 0; x < 24; x++) for (let y = 0; y < 10; y++) for (let z = 0; z < 10; z++) {
    if (!(x === 0 || x === 23 || y === 0 || y === 9 || z === 0 || z === 9)) continue
    let mat = M('paint')
    if ((z === 0 || z === 9) && x % 2) mat = M('paint_matte')
    if (y === 0 || y === 9) mat = M('metal_dark')
    if (rng.chance(0.06) || (y < 2 && rng.chance(0.3))) mat = M('metal_rust')
    m.set(x, y, z, mat)
  }
  for (let z = 1; z < 9; z += 2) for (let y = 1; y < 9; y++) m.set(23, y, z, M('metal_dark'))
  m.addSnow({ mat: M('snow'), depth: 1, chance: 0.9 })
  m.setPivot(12, 0, 5)
  return m
}, { lods: [1, 2], lodDistances: [50], maxDistance: 260 })

/** Stack of three road slabs on timber spacers, 6 × 1.5 × 1.5 m. */
defineModel('north_slabs', () => {
  const m = new VoxelModel(25, 8, 7)
  for (let k = 0; k < 3; k++) {
    const y = k * 2, ox = k % 2
    m.fill(ox, y + 1, 0, 24, 1, 6, M('concrete'))
    for (const x of [3, 20]) m.fill(x + ox, y, 0, 1, 1, 6, M('wood_dark'))
  }
  m.fill(0, 0, 0, 25, 1, 7, 0)
  for (const x of [3, 20]) m.fill(x, 0, 0, 1, 1, 6, M('wood_dark'))
  snowOn(m, { depth: 1 })
  m.setPivot(12.5, 0, 3.5)
  return m
}, { lods: [1, 2], lodDistances: [50], maxDistance: 220 })

/** Wooden cable drum lying on its rim (2 m). Axis local Z. */
defineModel('north_drum', () => {
  const m = new VoxelModel(9, 10, 5)
  m.cylinderZ(4.5, 4.5, 0, 1, 4.5, M('wood'))
  m.cylinderZ(4.5, 4.5, 4, 5, 4.5, M('wood'))
  m.cylinderZ(4.5, 4.5, 1, 4, 2.2, M('wood_dark'))
  m.addSnow({ mat: M('snow'), depth: 1 })
  m.setPivot(4.5, 0, 2.5)
  return m
}, { lods: [1], maxDistance: 160 })
