// Stand-in ground for testing the package alone (?only=base,vehicles): when the layout packages
// that own the avenue and the railway are not loaded, carve a plain carriageway / embankment so
// traffic drives on asphalt instead of wading through 0.5 m of lawn snow. Never runs in the full
// game. Also the private showcase scene (?vehtest=1) for in-world shots of parked cars.

import { AVENUE } from './traffic.js'
import { RAILWAY } from './rail.js'
import { placeParkedCar, parkRow, placeParkedBus } from './parked.js'

const has = (ctx, name) => (ctx.game?.modules || []).some(m => m.name === name)

export function buildFallback(ctx) {
  const { terrain, M } = ctx
  if (!has(ctx, 'avenue')) {
    // north sidewalk, carriageways with wet tyre tracks, snowy median, south sidewalk
    terrain.setHeightRect(0, 508, 640, 524, 0.25, M('snow_packed'))
    terrain.setHeightRect(0, 556, 640, 572, 0.25, M('snow_packed'))
    for (const [z0, z1, lanes] of [[524, 538, AVENUE.west.lanes], [542, 556, AVENUE.east.lanes]]) {
      terrain.apply(0, z0, 640, z1, (x, z) => {
        let best = 9
        for (const c of lanes) best = Math.min(best, Math.abs(z - c))
        const rut = Math.abs(best - 0.8) < 0.3
        const between = best > 1.6
        return { h: 0, mat: rut ? M('asphalt_wet') : between ? M('snow_dirty') : M('slush') }
      })
    }
    terrain.setHeightRect(0, 538, 640, 542, 0.5, M('snow'))
    terrain.setHeightRect(0, 524, 640, 524.25, 0.25, M('curb'))
  }
  if (!has(ctx, 'north')) {
    terrain.setHeightRect(0, 40, 640, 56, 0.75, M('snow'))
    terrain.setHeightRect(0, 43, 640, 53, 1.0, M('gravel'))
    for (const tz of RAILWAY.tracks) terrain.setHeightRect(0, tz - 1.25, 640, tz + 1.25, 1.0, M('wood_dark'))
  }
}

/** ?vehtest=1: a courtyard parking strip with every model and snow state, a terminal, a driveway. */
export function buildShowcase(ctx) {
  const { terrain, M } = ctx
  // driveway (E–W) with parking on both sides, at the centre of the map
  terrain.setHeightRect(280, 300, 380, 336, 0.25, M('snow'))
  terrain.setHeightRect(280, 315, 380, 321, 0.0, M('snow_packed'))
  terrain.setHeightRect(280, 309, 380, 315, 0.0, M('snow_dirty'))
  terrain.setHeightRect(280, 321, 380, 327, 0.0, M('snow_dirty'))
  const types = ['vaz2107', 'vaz2106', 'vaz21099', 'vaz2110', 'moskvich2141', 'volga3110', 'nexia', 'focus', 'gazelle', 'gazelle_van', 'uaz452']
  const snows = ['heavy', 'light', 'buried', 'brushed', 'none']
  types.forEach((t, i) => {
    placeParkedCar(ctx, { x: 292 + i * 2.7, z: 312.2, angle: 0, type: t, snow: snows[i % snows.length], seed: i + 1 })
    placeParkedCar(ctx, { x: 292 + i * 2.7, z: 323.8, angle: Math.PI, type: t, snow: snows[(i + 2) % snows.length], seed: i + 31 })
  })
  placeParkedCar(ctx, { x: 324, z: 312.2, angle: 0, type: 'vaz2107', warm: true, tint: 0x55212a, seed: 77 })
  parkRow(ctx, { x0: 330, z0: 312.2, x1: 378, z1: 312.2, angle: 0, density: 0.85, seed: 5 })
  placeParkedBus(ctx, { x: 352, z: 330.5, angle: Math.PI / 2, kind: 'bus', seed: 3, placard: 'В ПАРК' })
  placeParkedBus(ctx, { x: 352, z: 304.5, angle: -Math.PI / 2, kind: 'trolleybus', seed: 4 })
  ;(ctx.registry.driveways ||= []).push([[282, 318], [378, 318]])
  // stand-in sodium lamps over the strip (the street package owns the real ones)
  for (const x of [298, 326, 354]) ctx.lights.add({ x, y: 7.5, z: 317, type: 'spot', dir: [0, -1, 0], cone: 62, inner: 30, intensity: 55, range: 24, color: 0xffa040, schedule: 'street' })
  ctx.registry._vehTest = true
}
