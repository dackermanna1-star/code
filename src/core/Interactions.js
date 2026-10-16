// Interactable objects: doors, benches, notices, phones, elevator buttons...
// Picked by a ray from the camera; the nearest unoccluded hit within reach wins.

export class Interactions {
  constructor() {
    this.list = []
  }

  /**
   * Register an interactable.
   * o: { x, y, z, size: [sx,sy,sz] (box centered on x,y,z; default 0.5 cube),
   *      prompt: {ru, en} | (game) => {ru, en},
   *      onUse(game, item), enabled: bool | (game) => bool, reach (m, default 2.4), tag, data }
   */
  add(o) {
    const s = o.size ?? [0.5, 0.5, 0.5]
    const it = {
      enabled: true,
      reach: 2.4,
      ...o,
      min: [o.x - s[0] / 2, o.y - s[1] / 2, o.z - s[2] / 2],
      max: [o.x + s[0] / 2, o.y + s[1] / 2, o.z + s[2] / 2],
    }
    this.list.push(it)
    return it
  }

  remove(it) {
    const i = this.list.indexOf(it)
    if (i >= 0) this.list.splice(i, 1)
  }

  move(it, x, y, z) {
    const sx = (it.max[0] - it.min[0]) / 2, sy = (it.max[1] - it.min[1]) / 2, sz = (it.max[2] - it.min[2]) / 2
    it.x = x; it.y = y; it.z = z
    it.min = [x - sx, y - sy, z - sz]
    it.max = [x + sx, y + sy, z + sz]
  }

  /** Ray pick. Returns {item, dist} or null. */
  pick(o, d, world, game) {
    let best = null, bestT = Infinity
    for (const it of this.list) {
      const en = typeof it.enabled === 'function' ? it.enabled(game) : it.enabled
      if (!en) continue
      const t = rayBox(o, d, it.min, it.max)
      if (t === null || t > it.reach || t >= bestT) continue
      best = it; bestT = t
    }
    if (!best) return null
    // occlusion: a solid voxel clearly in front of the item blocks it
    const hit = world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, Math.max(0, bestT - 0.12), 0.06)
    if (hit && hit.dist < bestT - 0.15) {
      // allow if the voxel hit is inside the item's own box (e.g. clicking a door itself)
      const p = hit
      const inside = p.x >= best.min[0] - 0.05 && p.x <= best.max[0] + 0.05 && p.y >= best.min[1] - 0.05 &&
        p.y <= best.max[1] + 0.05 && p.z >= best.min[2] - 0.05 && p.z <= best.max[2] + 0.05
      if (!inside) return null
    }
    return { item: best, dist: bestT }
  }
}

function rayBox(o, d, mn, mx) {
  let t0 = 0, t1 = Infinity
  const os = [o.x, o.y, o.z], ds = [d.x, d.y, d.z]
  for (let a = 0; a < 3; a++) {
    if (Math.abs(ds[a]) < 1e-9) {
      if (os[a] < mn[a] || os[a] > mx[a]) return null
      continue
    }
    let ta = (mn[a] - os[a]) / ds[a], tb = (mx[a] - os[a]) / ds[a]
    if (ta > tb) { const t = ta; ta = tb; tb = t }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb)
    if (t0 > t1) return null
  }
  return t0
}
