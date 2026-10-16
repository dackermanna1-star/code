// Ground of the eastern blocks: lawn snow, driveways, parking, sidewalks, forecourts and the
// courtyard footpaths. Everything is painted BEFORE the buildings are placed (residential and
// public helpers read the terrain height).

import { M } from '../../core/materials.js'
import { paintYard } from '../base/api.js'
import { DRIVE, SITE, SHOP_DOOR } from './geo.js'
import { paintDrive, paintWalk, paintLot, paintApron, walkway, keep, safe } from './lib.js'
import { VOXEL } from '../../core/constants.js'
import { fbm2, valueNoise2 } from '../../core/rng.js'

export function paintGround(ctx) {
  const t = ctx.terrain
  // ---- untouched lawn snow (0.5 m, gentle undulation) --------------------------------
  paintYard(ctx, 308, 148, 456, 322, 31)
  paintYard(ctx, 308, 328, 456, 500, 32)
  paintYard(ctx, 462, 148, 598, 322, 33)

  // ---- driveways (y 0) ---------------------------------------------------------------
  const D = DRIVE
  paintDrive(ctx, D.ns.x0, D.ns.z0, D.ns.x1, D.ns.z1, 'z', 211)
  paintDrive(ctx, D.ew.x0, D.ew.z0, D.ew.x1, D.ew.z1, 'x', 212)
  paintDrive(ctx, D.innerB.x0, D.innerB.z0, D.innerB.x1, D.innerB.z1, 'x', 213)
  paintDrive(ctx, D.innerE.x0, D.innerE.z0, D.innerE.x1, D.innerE.z1, 'x', 214)
  paintDrive(ctx, D.innerC.x0, D.innerC.z0, D.innerC.x1, D.innerC.z1, 'x', 215)
  paintDrive(ctx, D.garageC.x0, D.garageC.z0, D.garageC.x1, D.garageC.z1, 'x', 216)
  for (const d of [D.ns, D.ew, D.innerB, D.innerE, D.innerC, D.garageC]) keep(d.x0, d.z0, d.x1, d.z1, 0.8, 'drive')

  // ---- parking (y 0) -------------------------------------------------------------------
  paintLot(ctx, 318, 178, 446, 183.5, 51)      // Block B: perpendicular bays along the 9-storey
  paintLot(ctx, 440, 183.5, 452, 188.25, 52)   // Block B: garbage apron
  paintLot(ctx, 318, 362, 450, 364.5, 53)      // Block E: parallel strip along the towers
  paintLot(ctx, 434, 444, 456, 500, 54)        // Block E: the shop's parking lot
  paintLot(ctx, 470, 203, 590, 205.5, 55)      // Block C: parallel strip
  paintLot(ctx, 470.5, 150, 591.5, 158.5, 56)  // Block C: garage row footprint at road level
  paintLot(ctx, 462, 205.5, 476, 210.5, 57)    // Block C: garbage apron
  keep(318, 178, 446, 183.5, 0.5); keep(434, 444, 456, 500, 0.5); keep(318, 362, 450, 364.5, 0.5)
  keep(470, 203, 590, 205.5, 0.5); keep(462, 205.5, 476, 210.5, 0.5); keep(440, 183.5, 452, 188.25, 0.5)

  // ---- sidewalks (0.25) ------------------------------------------------------------------
  const W = (x0, z0, x1, z1, curb, s) => { paintWalk(ctx, x0, z0, x1, z1, s, curb); keep(x0, z0, x1, z1, 1.0, 'walk') }
  // Block B
  W(312, 168, 452, 173, 's', 61)          // in front of the 9-storey (porches stand on it)
  W(318, 183.5, 452, 185.5, 'n', 62)       // behind the parking bays
  W(330, 185.5, 335.5, 252, null, 63)      // in front of tower B1
  W(430.5, 185.5, 436, 246, null, 64)      // in front of tower B2
  W(453.5, 148, 456, 173, 'e', 65)         // west side of the N–S driveway
  W(453.5, 178, 456, 322, 'e', 66)
  W(308, 319.5, 456, 322, 's', 67)         // north side of the E–W driveway
  // Block E
  W(308, 328, 456, 330.5, 'n', 71)         // south side of the E–W driveway
  W(312, 352, 452, 357, 's', 72)           // tower fronts
  W(312, 364.5, 452, 366.5, 'n', 73)       // behind the parallel parking
  W(308, 330.5, 310.5, 508, 'w', 74)       // along the western driveway (Block D side)
  W(453.5, 330.5, 456, 357, 'e', 75)       // west side of the N–S driveway
  W(453.5, 362, 456, 444, 'e', 76)
  // Block C
  W(462, 319.5, 598, 322, 's', 81)         // north side of the E–W driveway
  W(464, 193, 597, 198, 's', 82)           // long building front
  W(464, 205.5, 597, 207.5, 'n', 83)       // behind the parallel parking
  W(483, 285, 575, 290, null, 84)          // 5-storey front

  // ---- forecourts --------------------------------------------------------------------------
  paintApron(ctx, 406, 459, 432, 485, 91)   // shop footprint + porch forecourt
  keep(406, 459, 432, 485, 1.5, 'shop')
  paintApron(ctx, 431, 474, 434, 486, 92)   // from the shop's back corner to its parking lot
  paintApron(ctx, 322.5, 481, 332, 491, 93) // substation apron
  keep(322.5, 481, 332, 491, 1, 'substation')
  // kindergarten site sits at 0.25 (the helper flattens its building; the yard stays snowy)
  // hockey box (the helper flattens the rink and its edge at the given y)
  keep(352, 206, 408, 238, 1, 'hockey')
  keep(357.5, 260.75, 422.5, 313.25, 0.8, 'kindergarten')

  // ---- playground beds: level snow so the equipment stands evenly -------------------------
  t.setHeightRect(337, 412, 365, 440, 0.5, M('snow'))   // Block E playground (22 × 16, turned)
  t.setHeightRect(498, 235, 514, 249, 0.5, M('snow'))   // Block C small playground
  keep(339, 414, 363, 438, 0.5, 'playground'); keep(499, 236, 513, 248, 0.5, 'playground')

  // ---- construction pit (Block C) ----------------------------------------------------------
  safe('pit', () => digPit(ctx))

  // ---- the heating main under Block E: a thawed strip with steaming manholes --------------
  safe('heatmain', () => thawStrip(ctx, [[311, 412], [370, 404], [454, 398]]))
}

/** The abandoned dug pit: stepped earth slopes (one voxel per 0.5 m, walkable) down to a snowy
 *  frozen floor with puddles of ice. */
function digPit(ctx) {
  const { x0, z0, x1, z1 } = SITE.pit
  const floor = Math.round(SITE.floorY / VOXEL)
  const earth = M('earth'), snow = M('snow'), ice = M('ice'), dirty = M('snow_dirty'), gravel = M('gravel')
  ctx.terrain.apply(x0 - 0.5, z0 - 0.5, x1 + 0.5, z1 + 0.5, (x, z, hv) => {
    const d = Math.min(x - x0, x1 - x, z - z0, z1 - z) // distance in from the rim
    if (d < 0) return null
    const top = hv
    const h = Math.max(floor, Math.min(top, top - Math.floor(d / 0.5)))
    let mat
    if (h <= floor) {
      const n = fbm2(x * 0.3, z * 0.3, 2, 77)
      mat = n > 0.62 ? ice : n < 0.3 ? dirty : snow
      if (valueNoise2(x * 0.8, z * 0.8, 78) > 0.86) mat = gravel
    } else {
      // slope: fresh snow on the treads, raw earth where it is steep or slumped
      mat = valueNoise2(x * 0.9, z * 0.9, 79) > 0.55 ? earth : (h % 2 ? snow : dirty)
    }
    return { h, mat }
  })
  keep(x0, z0, x1, z1, 0.5, 'pit')
}

/** Melted strip of dirty snow and bare earth over an underground heating main (y 0.25). */
function thawStrip(ctx, pts) {
  const t = ctx.terrain
  const earth = M('earth'), slush = M('slush'), dirty = M('snow_dirty')
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1]
    t.paintLine(ax, az, bx, bz, 2.6, { mat: dirty, height: 0.25, only: new Set([M('snow'), M('snow_fresh')]) })
    t.paintLine(ax, az, bx, bz, 1.1, { mat: earth, only: new Set([dirty]) })
    // wet patches
    const len = Math.hypot(bx - ax, bz - az)
    for (let d = 3; d < len; d += 9) {
      const k = d / len
      t.paintCircle(ax + (bx - ax) * k, az + (bz - az) * k, 0.6, { mat: slush, only: new Set([earth]) })
    }
  }
}

/** Courtyard footpaths, cleared and trodden. Called after the sidewalks. */
export function paintPaths(ctx) {
  // ---- Block B ---------------------------------------------------------------------------
  // along the north side of the kindergarten fence, joining both towers to the gate
  walkway(ctx, [[335.5, 250], [362, 255.5], [390, 256], [420, 255.5], [430.5, 244]], { kind: 'path', width: 2.0, seed: 101 })
  walkway(ctx, [[390, 256], [390, 261.5]], { kind: 'path', width: 2.4, seed: 102 })
  // inside the kindergarten yard: gate to the three group porches
  walkway(ctx, [[390, 261.5], [390, 286.8]], { kind: 'path', width: 2.0, seed: 131, nav: false })
  walkway(ctx, [[376.5, 287.4], [403.5, 287.4]], { kind: 'path', width: 1.6, seed: 132, nav: false })
  // around the kindergarten to the E–W driveway (people from Block E walk round to the gate)
  walkway(ctx, [[362, 255.5], [354, 266], [354, 319.5]], { kind: 'path', width: 1.8, seed: 103 })
  walkway(ctx, [[420, 255.5], [426, 266], [426, 319.5]], { kind: 'path', width: 1.8, seed: 104 })
  // from the parking sidewalk across the yard to the hockey box gate, then on to the kindergarten
  walkway(ctx, [[398, 185.5], [404, 205], [404, 238], [384, 240], [380, 234]], { kind: 'path', width: 1.8, seed: 105 })
  walkway(ctx, [[384, 240], [388, 256]], { kind: 'trodden', seed: 106, trail: 0.45, trailLen: 14 })
  // kids' shortcut from tower B1 across the west yard to the E–W driveway
  walkway(ctx, [[335.5, 246], [340, 280], [332, 319.5]], { kind: 'trodden', seed: 107 })
  // tower B2 to the N–S driveway sidewalk
  walkway(ctx, [[436, 240], [453.5, 244]], { kind: 'path', width: 1.6, seed: 108 })
  // west end of the parking sidewalk down to the B1 sidewalk
  walkway(ctx, [[318, 185.5], [330, 190]], { kind: 'path', width: 1.6, seed: 109 })

  // ---- Block E ---------------------------------------------------------------------------
  // the spine: from the middle tower straight south to the metro underpass (x 377–393, z 509)
  walkway(ctx, [[381.25, 366.5], [381.25, 430], [381.5, 500], [383, 508]], { kind: 'path', width: 2.6, wobble: 0.05, seed: 111 })
  // THE desire line: from Block D (western driveway sidewalk) across the vast yard to the shop
  const [dx, dz] = SHOP_DOOR
  walkway(ctx, [[310.5, 438], [346, 451], [381.25, 462], [404, 470.5], [dx - 3.5, dz], [dx - 0.6, dz]], { kind: 'trodden', width: 1.5, seed: 112, trail: 0.35, trailLen: 34 })
  // a second, fainter line from further south on the western sidewalk
  walkway(ctx, [[310.5, 486], [350, 478], [381.4, 472]], { kind: 'trodden', width: 1.1, seed: 113 })
  // tower E3 to the shop
  walkway(ctx, [[433, 366.5], [427, 400], [415, 446], [413, 462]], { kind: 'path', width: 1.8, seed: 114 })
  // tower E1 down to the spine
  walkway(ctx, [[329, 366.5], [352, 395], [381.25, 430]], { kind: 'trodden', seed: 115 })
  // playground gate (faces east) to the spine
  walkway(ctx, [[358.5, 425], [381.25, 427]], { kind: 'path', width: 1.6, seed: 116 })
  // the shop's south side to its parking lot
  walkway(ctx, [[418, 480.5], [434, 481]], { kind: 'path', width: 1.6, seed: 117 })
  // spine to the substation corner and the western sidewalk near the avenue
  walkway(ctx, [[381.4, 492], [334, 493], [310.5, 497]], { kind: 'trodden', seed: 118 })
  // between the towers: tower-front sidewalk to the E–W driveway sidewalk
  walkway(ctx, [[356, 352], [356, 330.5]], { kind: 'path', width: 1.6, seed: 119 })
  walkway(ctx, [[434, 352], [440, 330.5]], { kind: 'trodden', seed: 120 })

  // ---- Block C ---------------------------------------------------------------------------
  // between the long building and the 5-storey
  walkway(ctx, [[488, 207.5], [489, 250], [494, 285]], { kind: 'path', width: 1.8, seed: 121 })
  walkway(ctx, [[530, 207.5], [522, 250], [519, 285]], { kind: 'trodden', seed: 122 })
  // round the 5-storey's west gable to the E–W driveway sidewalk
  walkway(ctx, [[483, 288], [479, 300], [478, 319.5]], { kind: 'path', width: 1.6, seed: 123 })
  // round the east gable
  walkway(ctx, [[575, 288], [580, 304], [583, 319.5]], { kind: 'trodden', seed: 124 })
  // kids' trodden way into the abandoned construction site through the open gate
  walkway(ctx, [[522, 250], [534, 241], [540.5, 240.5], [546.6, 240.2]], { kind: 'trodden', width: 1.2, seed: 125, trail: 0.6, trailLen: 18 })
  // from the garage lane past the long building's east gable to the inner driveway
  walkway(ctx, [[594, 165], [596.5, 180], [596.5, 198]], { kind: 'trodden', seed: 126 })
}

export function gateGap() { return SITE.gate }
