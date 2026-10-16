// Package «metro»: the pedestrian underpass under проспект Строителей and the terminus station
// «Заречная» (vestibule, escalators, a 1970s column platform hall, tunnels, trains). It places
// itself in the world. See docs/catalog/metro.md.

import './materials.js'
import { Y, STAIRS, PLAT, TRACK, ESC, LOWER } from './layout.js'
import { paintSurface, guardTerrain, buildSurface } from './surface.js'
import { buildUnderpass } from './underpass.js'
import { buildVestibule, KASSA, BOOTH } from './vestibule.js'
import { buildEscalators } from './escalator.js'
import { buildPlatform } from './platform.js'
import { UNIFORM, faceAngle } from './people.js'
import './train.js'
import { MetroRuntime } from './runtime.js'
import { T } from './texts.js'

let rt = null

export default {
  name: 'metro',
  order: 30,

  build(ctx) {
    const { world, interactions, registry } = ctx
    const out = {
      underground: [], deep: [], stairs: [], surface: [], tunnels: [], tubes: [], kiosks: [], payphones: [], drips: [],
      flaps: [], benches: [], escalators: [],
      lightGroups: { underpass: [], vestibule: [], deep: [], tunnel: [] },
    }
    paintSurface(ctx)
    guardTerrain(ctx)
    buildSurface(ctx, out)
    buildUnderpass(ctx, out)
    buildVestibule(ctx, out)
    buildEscalators(ctx, out)
    buildPlatform(ctx, out)

    // staff: the cashier behind the lit window, the controller in her booth, the escalator attendant
    const ud = { pkg: 'metro', noRelocate: true, role: 'staff' }
    out.underground.push(world.place('metro_cashier_seated', { x: 394.75, y: Y.FLOOR + 0.25, z: 532.1, angle: faceAngle(0, 1), tint: 0x5a4334, dynamic: false, collide: false, tag: 'person', userData: ud }))
    out.underground.push(world.place('metro_staff_seated', { x: BOOTH.x0 + 1.15, y: Y.FLOOR + 0.25, z: BOOTH.z0 + 1.0, angle: faceAngle(-1, 0), tint: UNIFORM, dynamic: false, collide: false, tag: 'person', userData: ud }))
    out.deep.push(world.place('metro_staff_seated', { x: 438.25 + 1.05, y: Y.PLAT + 0.25, z: 542.5 + 0.9, angle: faceAngle(-1, 0), tint: UNIFORM, dynamic: false, collide: false, tag: 'person', userData: ud }))

    rt = new MetroRuntime(ctx, out)

    // the ticket office window and the interval clocks
    interactions.add({ x: (KASSA.win1[0] + KASSA.win1[1]) / 2, y: Y.FLOOR + 1.4, z: KASSA.z1 + 0.25, size: [1.4, 0.9, 0.4], tag: 'kassa',
      prompt: () => (rt?.serviceClosed() ? { ru: 'Касса закрыта', en: 'Ticket office closed' } : { ru: 'Купить билет — 19 р.', en: 'Buy a ticket — 19 rub.' }),
      onUse(game) { rt?.buyTicket(game) } })
    for (const [x, z] of [[PLAT.x0 + 0.3, TRACK.S.axis], [PLAT.x1 - 0.3, TRACK.N.axis]]) {
      interactions.add({ x, y: -12.5, z, size: [0.4, 0.5, 1.8], reach: 9, tag: 'metro_clock', prompt: { ru: 'Часы', en: 'Clock' },
        onUse(game) { game.ui.showNote({ ...T.intervalClock, style: 'screen' }) } })
    }

    // registry for other packages (audio reads `manholes` for faint rumbles through the pits)
    registry.metro = {
      station: 'Заречная',
      entrances: STAIRS.map(s => ({ id: s.id, x: (s.x0 + s.x1) / 2, z: s.zTop, y: Y.SIDEWALK, bottom: [(s.x0 + s.x1) / 2, Y.FLOOR, s.zBot] })),
      vestibule: { x: 392, y: Y.FLOOR, z: 540 },
      platform: { x0: PLAT.x0, x1: PLAT.x1, y: Y.PLAT, z0: PLAT.edgeN, z1: PLAT.edgeS },
      escalators: { xTop: ESC.xTop, xBot: ESC.xBot, lanes: { up: ESC.laneN, stopped: ESC.laneM, down: ESC.laneS } },
      kiosks: out.kiosks, payphones: out.payphones, benches: out.benches, lowerHall: LOWER,
      phase: 'idle', trainVisible: false, interval: 0, nextArrivalIn: null,
    }
    registry.manholes = registry.manholes || []
    for (const s of STAIRS) registry.manholes.push({ x: (s.x0 + s.x1) / 2, z: (s.zTop + s.zBot) / 2, kind: 'metro_stair' })
    registry.payphones = registry.payphones || []
    for (const p of out.payphones) registry.payphones.push({ ...p, kind: 'metro' })
  },

  init(ctx) {
    try { rt?.init(ctx) } catch (e) { console.error('[metro] init', e) }
  },

  update(dt, ctx) {
    if (!rt) return
    try { rt.update(dt, ctx) } catch (e) {
      if (!rt._errored) { rt._errored = true; console.error('[metro] update', e) }
    }
  },
}
