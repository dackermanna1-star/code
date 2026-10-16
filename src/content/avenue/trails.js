// Old footprint trails in the snow where people actually walk (added in init, on the final ground).

import { PASSAGES, ROW_Z, NAV_N, safe } from './layout.js'

export function initTrails(ctx) {
  const fp = ctx.footprints, t = ctx.terrain
  if (!fp || !t) return
  const trails = [
    // into the courtyards of Block D and Block F
    [[PASSAGES[0] + 0.2, NAV_N - 0.6], [PASSAGES[0] + 0.6, 504], [PASSAGES[0] - 0.4, 500.5]],
    [[PASSAGES[1] - 0.2, NAV_N - 0.6], [PASSAGES[1] + 0.5, 504], [PASSAGES[1] - 0.3, 500.5]],
    // the short-cut from the spawn stop straight to the passage (over the sidewalk snow)
    [[246.5, 517.2], [238, 512.4], [230.4, 509.6]],
    // through the row to the porches
    [[163, 570], [162, 584], [163.5, ROW_Z + 4.2]],
    [[294, 570], [292.5, 586], [294, ROW_Z + 4.2]],
    [[372.6, 571], [372, 584], [366, 592], [362.5, ROW_Z + 4.2]],
    // across the lawn strips to the kerb (people cross mid-block)
    [[96.3, 515.6], [97.2, 523.4]], [[336.3, 515.6], [337.2, 523.4]], [[205.2, 563.6], [204.2, 556.6]],
    // to the terminal platform round the pharmacy
    [[486, 574.5], [505, 581], [527.6, 582.9]],
    // behind the kiosks to the bins
    [[396.8, 578], [396, 588], [386, 595]],
  ]
  for (const tr of trails) safe('trail', () => fp.addTrail(tr, t, 0.55))
}
