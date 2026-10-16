// Per-game runtime state of the nature package (trees for clumps/crows, steam, crows, ponds).
// Keyed by the Game so API calls made before or after our own build() share one state.

const states = new WeakMap()
const CELL = 16
const key = (gx, gz) => (gx + 1024) * 4096 + (gz + 1024)

export function natureState(ctx) {
  const game = ctx.game || ctx
  let s = states.get(game)
  if (!s) {
    s = {
      ctx,
      trees: [],
      grid: new Map(), // cell key → [tree]
      steam: null,
      crowGroups: [],
      ponds: [],
      clumps: null,
    }
    states.set(game, s)
    if (ctx.registry) {
      ctx.registry.trees = s.trees
      ctx.registry.ponds = s.ponds
      ctx.registry.crows = s.crowGroups
    }
  }
  s.ctx = ctx
  return s
}

export function addTreeRecord(s, t) {
  s.trees.push(t)
  const k = key(Math.floor(t.x / CELL), Math.floor(t.z / CELL))
  let list = s.grid.get(k)
  if (!list) s.grid.set(k, list = [])
  list.push(t)
}

/** Trees whose trunk lies within r of (x, z). Pushes into `out`. */
export function treesNear(s, x, z, r, out = []) {
  out.length = 0
  const g0x = Math.floor((x - r) / CELL), g1x = Math.floor((x + r) / CELL)
  const g0z = Math.floor((z - r) / CELL), g1z = Math.floor((z + r) / CELL)
  for (let gz = g0z; gz <= g1z; gz++)
    for (let gx = g0x; gx <= g1x; gx++) {
      const list = s.grid.get(key(gx, gz))
      if (!list) continue
      for (const t of list) {
        const dx = t.x - x, dz = t.z - z
        if (dx * dx + dz * dz <= r * r) out.push(t)
      }
    }
  return out
}
