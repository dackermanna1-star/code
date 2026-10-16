// Pedestrian routes (life package), acoustic zones and registry entries of the avenue.

import { NAV_N, NAV_S, NAV_N_PIT, NAV_S_PIT, METRO, ZEBRA, PASSAGES, ROW, ROW_Z, STOP_N, STOP_S, Z, TERM, PERIOD, LANES_W, LANES_E, safe } from './layout.js'

export function registerNav(ctx) {
  const nav = ctx.navPaths
  if (!nav) return
  safe('nav', () => {
    // both sidewalks end to end, stepping between the stair pits and the kerb at the underpass
    nav.push({ kind: 'sidewalk', points: [[26, NAV_N], [METRO.x0 - 2, NAV_N], [METRO.x0 - 1, NAV_N_PIT], [METRO.x1 + 1, NAV_N_PIT], [METRO.x1 + 2.5, NAV_N], [614, NAV_N]] })
    nav.push({ kind: 'sidewalk', points: [[26, NAV_S], [METRO.x0 - 2, NAV_S], [METRO.x0 - 1, NAV_S_PIT], [METRO.x1 + 1, NAV_S_PIT], [METRO.x1 + 2.5, NAV_S], [614, NAV_S]] })
    // the zebra
    const zx = (ZEBRA.x0 + ZEBRA.x1) / 2
    nav.push({ kind: 'crossing', points: [[zx, NAV_N], [zx, Z.N_CURB], [zx, Z.S_CURB], [zx, NAV_S]] })
    // footpaths into Block D / Block F (blocks' paths snap to the ends at z 500)
    for (const x of PASSAGES) nav.push({ kind: 'path', points: [[x, NAV_N], [x + 0.5, 504], [x - 0.3, 500]] })
    // through the gaps of the 9-storey row to the porches (entrance stubs cross this path)
    nav.push({ kind: 'path', points: [[163, NAV_S], [162, 584], [163.5, ROW_Z + 4.2]] })
    nav.push({ kind: 'path', points: [[294, NAV_S], [292.5, 586], [294, ROW_Z + 4.2]] })
    nav.push({ kind: 'path', points: [[METRO.x0 - 2, NAV_S], [372.6, 571], [372, 584], [366, 592], [362.5, ROW_Z + 4.2]] })
    nav.push({ kind: 'path', points: [[46, ROW_Z + 4.2], [163.5, ROW_Z + 4.2], [294, ROW_Z + 4.2], [362.5, ROW_Z + 4.2]] })
    // terminal platform and the trodden way round the pharmacy to it
    nav.push({ kind: 'sidewalk', points: [[532.9, NAV_S], [532.9, 582.9], [532.9, 593.5]] })
    nav.push({ kind: 'path', points: [[486, NAV_S], [486, 574.5], [505, 581], [527.6, 582.9], [532.9, 582.9]] })
  })
}

export function registerZones(ctx) {
  const zones = ctx.zones
  if (!zones) return
  safe('zones', () => {
    zones.add({ name: 'avenue', min: [0, -1, 500], max: [640, 60, 600], reverb: 'outdoor', traffic: 1, wind: 1, data: { pkg: 'avenue' } })
    // under the stop roofs: a little out of the wind
    const pav = (x, z, rotated) => rotated
      ? { min: [x - 0.9, -0.5, z - 2.5], max: [x + 0.9, 3, z + 2.5] }
      : { min: [x - 2.5, -0.5, z - 0.9], max: [x + 2.5, 3, z + 0.9] }
    zones.add({ name: 'avenue_stop', ...pav(STOP_N.x, STOP_N.z), reverb: 'outdoor', wind: 0.55, traffic: 0.9, priority: 1, data: { pkg: 'avenue', stop: 'north' } })
    zones.add({ name: 'avenue_stop_south', ...pav(STOP_S.x, STOP_S.z), reverb: 'outdoor', wind: 0.55, traffic: 0.9, priority: 1, data: { pkg: 'avenue', stop: 'south' } })
    zones.add({ name: 'terminal_stop', ...pav(530.6, 586.5, true), reverb: 'outdoor', wind: 0.55, traffic: 0.6, priority: 1, data: { pkg: 'avenue', stop: 'terminal' } })
    // the porch side of the 9-storey row: sheltered from the avenue, slapback off the facades
    for (const b of ROW) {
      const len = b.sections * (b.series === '1515' ? 26.5 : 27)
      zones.add({ name: 'avenue_row_yard', min: [b.x - len, -1, ROW_Z], max: [b.x, 30, 600], reverb: 'courtyard', traffic: 0.45, wind: 0.75, data: { pkg: 'avenue' } })
    }
    // the terminal: a bit off the traffic
    zones.add({ name: 'bus_terminal', min: [524, -1, 572], max: [600, 40, 602], reverb: 'outdoor', traffic: 0.75, wind: 1, data: { pkg: 'avenue' } })
  })
}

export function registerAvenue(ctx, parts) {
  const reg = ctx.registry
  reg.avenue = {
    name: 'просп. Строителей', z: Z, lanes: { west: LANES_W, east: LANES_E }, period: PERIOD,
    spawnStop: { x: STOP_N.x, z: STOP_N.z }, southStop: { x: STOP_S.x, z: STOP_S.z },
    zebra: { x: (ZEBRA.x0 + ZEBRA.x1) / 2 }, terminal: { loop: TERM.loop, stand: TERM.stand },
    shop: parts.forecourt?.shop?.entrance ?? null,
  }
  ;(reg.landmarks ||= []).push(
    { kind: 'stop', name: 'Остановка «Улица Берёзовая»', x: STOP_N.x, z: STOP_N.z },
    { kind: 'terminal', name: 'Конечная «Ст. м. «Заречная»»', x: 565, z: 585 },
    { kind: 'shop', name: 'ПРОДУКТЫ 24 ЧАСА (просп. Строителей)', x: 460, z: 580 },
  )
}
