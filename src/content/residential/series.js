// Series definitions and the structural layout of one section (подъезд).
//
// Section model, local voxel coordinates (1 voxel = 0.25 m):
//   x: along the building (sections are placed side by side along +X)
//   y: up. Rows 0..G-1 are foundation buried under grade; row G is grade level.
//   z: depth. The FRONT (entrance) facade faces local −Z: its outer face is the plane z = F.
//      The back facade's outer face is the plane z = F + D. Balconies stick out into the
//      margins [0, F) and [F+D, F+D+B).
// Pivot: (0, G, F) — the front-left corner of the facade at grade.
//
// Stair core (stair-local coords x', z' with origin at (SX0, F+2), i.e. the inner face of the
// front wall):
//   x' [0,5) strip A (flight A: floor k → half-landing), [5,7) well, [7,12) strip B (flight B:
//   half-landing → floor k+1). z' [0,5) half-landing zone (window in the front wall),
//   [5,15) flights (treads 2 voxels deep, risers 1 voxel), [15,23) floor landing hall which
//   widens to x' [-4,16) with the apartment doors; lift shaft behind it at x' [2,10), z' [24,30).
//   Entrance door in the front wall at x' [8,12), tambour x' [5,12) z' [0,5) at grade+2.

export const G = 3 // foundation rows below grade
export const FH = 11 // floor-to-floor height in voxels (2.75 m)
export const PLINTH = 5 // floor 1 is FH... FL1 = G + PLINTH
export const STAIR_W = 12

/**
 * Series table. Widths in voxels. `front`/`back`: { center, half } bay patterns; the half
 * pattern is laid out from the centre outward and mirrored; leftover width becomes end bays.
 */
export const SERIES = {
  p44: {
    key: 'p44', label: 'П-44', floors: [9, 10, 12, 14, 16, 17], defaultFloors: 17,
    D: 52, F: 6, B: 6, attic: 7, parapet: 4,
    style: 'p44', wall: 'res_tile_white', tint: 0x4f6b8f,
    front: { center: 'stair', half: ['transit', 'kit', 'log', 'room'] },
    back: { center: 'room', half: ['log', 'room', 'kit', 'log'] },
    flats: 4, lift: true, chute: 'landing', machine: true,
    win: { room: [5, 4], kit: [4, 4] }, frames: 'mixed',
  },
  ii49: {
    key: 'ii49', label: 'II-49', floors: [5, 9, 12], defaultFloors: 9,
    D: 48, F: 6, B: 6, attic: 6, parapet: 4,
    style: 'mosaic', wall: 'res_panel_cream', tint: 0x7f9ab3,
    front: { center: 'stair', half: ['kit', 'log', 'kit', 'room'] },
    back: { center: 'room', half: ['log', 'room', 'kit', 'log'] },
    flats: 4, lift: true, chute: 'half', machine: true,
    win: { room: [5, 4], kit: [4, 4] }, frames: 'old',
  },
  1515: {
    key: '1515', label: '1-515/9Ш', floors: [5, 9], defaultFloors: 9,
    D: 48, F: 6, B: 6, attic: 5, parapet: 4,
    style: 'gray', wall: 'panel_gray', tint: 0x8a6a4a,
    front: { center: 'stair', half: ['kit', 'bal', 'room', 'kit'] },
    back: { center: 'room', half: ['bal', 'room', 'room', 'bal'] },
    flats: 4, lift: true, chute: 'half', machine: true,
    win: { room: [5, 4], kit: [4, 4] }, frames: 'old',
  },
  p44t: {
    key: 'p44t', label: 'П-44Т', floors: [9, 12, 14, 16, 17], defaultFloors: 17,
    D: 56, F: 6, B: 6, attic: 7, parapet: 5,
    style: 'p44t', wall: 'res_panel_cream', tint: 0xa0563f,
    front: { center: 'stair', half: ['transit', 'kit', 'erker', 'log'] },
    back: { center: 'erker', half: ['log', 'room', 'erker', 'kit'] },
    flats: 4, lift: true, chute: 'landing', machine: true,
    win: { room: [5, 4], kit: [4, 4] }, frames: 'pvc',
  },
  k7: {
    key: 'k7', label: 'К-7', floors: [5], defaultFloors: 5,
    D: 42, F: 4, B: 4, attic: 4, parapet: 3,
    style: 'k7', wall: 'tile_cream', tint: 0x9a9a92,
    front: { center: 'stair', half: ['kit', 'room', 'room'] },
    back: { center: 'room', half: ['room', 'kit', 'room'] },
    flats: 3, lift: false, chute: null, machine: false,
    win: { room: [4, 4], kit: [3, 4] }, frames: 'old',
  },
  ii32: {
    key: 'ii32', label: 'II-32', floors: [5], defaultFloors: 5,
    D: 44, F: 6, B: 6, attic: 4, parapet: 3,
    style: 'brick', wall: 'brick_silicate', tint: 0x6a6f66,
    front: { center: 'stair', half: ['kit', 'bal', 'room'] },
    back: { center: 'room', half: ['bal', 'room', 'kit'] },
    flats: 4, lift: false, chute: null, machine: false,
    win: { room: [4, 4], kit: [3, 4] }, frames: 'old',
  },
}

export const BAY_W = { room: 12, kit: 10, log: 13, bal: 12, stair: 14, erker: 13, transit: 7 }

/** Lay out a facade: mirror the half pattern around the centre bay; leftovers widen the bays. */
function layoutFacade(SX, spec, exact) {
  const cw = BAY_W[spec.center]
  const halfW = Math.floor((SX - cw) / 2)
  const half = []
  let used = 0
  const n = exact ? spec.half.length : 12
  for (let i = 0; i < n; i++) {
    const t = spec.half[i % spec.half.length]
    const w = BAY_W[t]
    if (used + w + 2 > halfW) break
    half.push({ type: t, w })
    used += w
  }
  // spread the leftover over the bays (max +3 each), the rest goes to the end bay
  let extra = halfW - used - 2
  for (let pass = 0; pass < 3 && extra > 0; pass++)
    for (const b of half) { if (extra <= 0) break; b.w++; extra-- }
  used = half.reduce((a, b) => a + b.w, 0)
  const endL = halfW - used
  const endR = SX - cw - used * 2 - endL
  const bays = []
  bays.push({ type: 'end', w: endL })
  for (let k = half.length - 1; k >= 0; k--) bays.push({ ...half[k] })
  bays.push({ type: spec.center, w: cw, center: true })
  for (let k = 0; k < half.length; k++) bays.push({ ...half[k] })
  bays.push({ type: 'end', w: endR })
  let u = 0
  for (const b of bays) { b.u = u; u += b.w }
  let seenCenter = false
  for (const b of bays) { if (b.center) seenCenter = true; else b.mirror = seenCenter }
  return bays
}

/** Section width: the front pattern with 2-voxel end bays. */
function seriesWidth(S) {
  return BAY_W[S.front.center] + 2 * (S.front.half.reduce((a, t) => a + BAY_W[t], 0) + 2)
}
for (const S of Object.values(SERIES)) S.SX = seriesWidth(S)

const layoutCache = new Map()

/** Structural layout of a section of `series` with `floors` storeys (shared by model + runtime). */
export function sectionLayout(seriesKey, floors) {
  const key = seriesKey + ':' + floors
  if (layoutCache.has(key)) return layoutCache.get(key)
  const S = SERIES[seriesKey]
  if (!S) throw new Error(`residential: unknown series "${seriesKey}"`)
  const N = floors
  const { SX, D, F, B } = S
  const FL1 = G + PLINTH
  const FL = k => FL1 + FH * (k - 1)
  const HL = k => FL(k) + 6
  const topCeil = FL(N) + FH - 1 // slab row above the top floor
  const R0 = topCeil + 1 + S.attic // roof slab row
  const RS = R0 + 1 // roof surface (first air row above the roof slab)
  const front = layoutFacade(SX, S.front, true)
  const back = layoutFacade(SX, S.back, false)
  const stairBay = front.find(b => b.type === 'stair')
  const SX0 = stairBay.u + 1 // stair core inner origin (x)
  const ZI = F + 2 // inner face of the front wall
  const sy = RS + 14 + 14 // roof + machine room + antennas
  const sz = F + D + B
  const L = {
    series: S, key: seriesKey, N, SX, D, F, B, G, FH, FL1, FL, HL, topCeil, R0, RS, sy, sz,
    front, back, SX0, ZI,
    door: { x0: SX0 + 8, x1: SX0 + 12, y0: G + 2, h: 8, z: F }, // entrance door opening (front wall)
    tambourY: G + 2,
    shaft: S.lift ? { x0: SX0 + 2, x1: SX0 + 10, z0: ZI + 24, z1: ZI + 30, door0: SX0 + 4, door1: SX0 + 8 } : null,
    heightM: (RS + 4 - G) * 0.25,
    flatsPerEntrance: S.flats * N,
  }
  // apartment doors on each landing: {side:'L'|'R'|'B', x0,x1 (or z0,z1), plane}
  const ap = []
  ap.push({ side: 'L', plane: SX0 - 5, z0: ZI + 17, z1: ZI + 21 })
  if (S.flats >= 4) {
    ap.push({ side: 'B', plane: ZI + 23, x0: SX0 - 3, x1: SX0 + 1 })
    ap.push({ side: 'B', plane: ZI + 23, x0: SX0 + 11, x1: SX0 + 15 })
  } else ap.push({ side: 'B', plane: ZI + 23, x0: SX0 + 4, x1: SX0 + 8 })
  ap.push({ side: 'R', plane: SX0 + 16, z0: ZI + 17, z1: ZI + 21 })
  L.aptDoors = ap
  layoutCache.set(key, L)
  return L
}

export function seriesFloors(seriesKey) { return SERIES[seriesKey]?.floors ?? [] }
