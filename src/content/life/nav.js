// Pedestrian graph built from ctx.navPaths (layout packages) plus residential entrance stubs.
// Polylines are merged at shared vertices, split where they cross, and loose ends are snapped
// onto nearby paths, so walkers can turn at junctions. Entrance stubs ({kind:'entrance'}, first
// point at the door) become door nodes; if a stub's outer end touches nothing, a short trodden
// link joins it to the nearest path (people cut across the snow to their door).
// If the layouts provided no walkable paths yet, fallback routes follow the streets of PLAN.md.

const WALK_KINDS_DENY = new Set(['indoor', 'metro', 'platform', 'underpass', 'stairwell', 'interior', 'road', 'vehicle', 'rail', 'tunnel', 'lift', 'elevator'])
const MERGE = 0.9 // m: vertices closer than this become one node
const SNAP = 2.6 // m: loose ends this close to another path get joined to it
const DOOR_LINK = 32 // m: entrance stubs are linked to paths this close

/** Straight fallback routes along the streets of docs/PLAN.md (used when navPaths is empty). */
export const FALLBACK_ROUTES = [
  // проспект Строителей sidewalks (north z 508–524, south z 556–572), full width
  { points: [[24, 512], [616, 512]], kind: 'sidewalk' },
  { points: [[24, 568], [616, 568]], kind: 'sidewalk' },
  // ул. Заводская sidewalks
  { points: [[24, 131], [616, 131]], kind: 'sidewalk' },
  { points: [[24, 145.5], [616, 145.5]], kind: 'sidewalk' },
  // ул. Берёзовая (x 140–150) both sides, and the north–south driveways
  { points: [[140.8, 132], [140.8, 512]], kind: 'sidewalk' },
  { points: [[149.2, 132], [149.2, 512]], kind: 'sidewalk' },
  { points: [[302.8, 145.5], [302.8, 512]], kind: 'driveway' },
  { points: [[461.2, 145.5], [461.2, 512]], kind: 'driveway' },
  // the east–west driveway between the block rows
  { points: [[149.2, 322.8], [616, 322.8]], kind: 'driveway' },
  { points: [[149.2, 327.2], [302.8, 327.2]], kind: 'driveway' },
  // the bus terminal loop and a courtyard diagonal or two (people cut across)
  { points: [[530, 568], [530, 600], [600, 600], [600, 568]], kind: 'path' },
  { points: [[149.2, 420], [230, 420], [302.8, 470]], kind: 'courtyard' },
  { points: [[302.8, 240], [380, 240], [461.2, 200]], kind: 'courtyard' },
  { points: [[461.2, 420], [540, 420], [616, 440]], kind: 'courtyard' },
]

export class NavGraph {
  constructor() {
    this.nodes = [] // { id, x, z, adj: [edgeId], door: entrance|null, kind }
    this.edges = [] // { id, a, b, len, kind, dx, dz }
    this._grid = new Map()
    this.cum = [] // cumulative edge lengths for uniform sampling
    this.total = 0
    this.doors = []
    this.fallback = false
  }

  _key(ix, iz) { return ix * 73856093 ^ iz * 19349663 }

  node(x, z) {
    const ix = Math.floor(x / MERGE), iz = Math.floor(z / MERGE)
    let best = -1, bd = MERGE * MERGE
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = this._grid.get(this._key(ix + a, iz + b))
      if (!list) continue
      for (const id of list) {
        const n = this.nodes[id]
        const d = (n.x - x) ** 2 + (n.z - z) ** 2
        if (d < bd) { bd = d; best = id }
      }
    }
    if (best >= 0) return best
    const id = this.nodes.length
    this.nodes.push({ id, x, z, adj: [], door: null, kind: null })
    const k = this._key(ix, iz)
    if (!this._grid.has(k)) this._grid.set(k, [])
    this._grid.get(k).push(id)
    return id
  }

  edge(a, b, kind) {
    if (a === b) return -1
    const A = this.nodes[a], B = this.nodes[b]
    for (const e of A.adj) { const E = this.edges[e]; if ((E.a === a && E.b === b) || (E.a === b && E.b === a)) return e }
    const len = Math.hypot(B.x - A.x, B.z - A.z)
    if (len < 0.05) return -1
    const id = this.edges.length
    this.edges.push({ id, a, b, len, kind, dx: (B.x - A.x) / len, dz: (B.z - A.z) / len })
    A.adj.push(id); B.adj.push(id)
    return id
  }

  other(e, n) { const E = this.edges[e]; return E.a === n ? E.b : E.a }

  /** Uniformly sample a point on the graph: { e, t (0..1 from a), x, z }. */
  sample(rng) {
    if (!this.total) return null
    const r = rng.next() * this.total
    let lo = 0, hi = this.cum.length - 1
    while (lo < hi) { const mid = (lo + hi) >> 1; if (this.cum[mid] < r) lo = mid + 1; else hi = mid }
    const E = this.edges[lo]
    const t = rng.next()
    const A = this.nodes[E.a], B = this.nodes[E.b]
    return { e: lo, t, x: A.x + (B.x - A.x) * t, z: A.z + (B.z - A.z) * t }
  }

  /** Graph distance search from node `start` up to maxDist: Map nodeId → {d, prevEdge}. */
  dijkstra(start, maxDist = Infinity, skipDoors = false) {
    const out = new Map([[start, { d: 0, prev: -1 }]])
    const open = [start]
    while (open.length) {
      // small graphs near the walker: linear extract-min is fine
      let bi = 0
      for (let i = 1; i < open.length; i++) if (out.get(open[i]).d < out.get(open[bi]).d) bi = i
      const n = open.splice(bi, 1)[0]
      const dn = out.get(n).d
      for (const e of this.nodes[n].adj) {
        const m = this.other(e, n)
        if (skipDoors && this.nodes[m].door && m !== start) continue
        const d = dn + this.edges[e].len
        if (d > maxDist) continue
        const cur = out.get(m)
        if (!cur || d < cur.d) { out.set(m, { d, prev: e }); open.push(m) }
      }
    }
    return out
  }

  /** Edge list from start to goal using a dijkstra result. */
  route(res, goal) {
    const path = []
    let n = goal
    let guard = 0
    while (res.has(n) && res.get(n).prev >= 0 && guard++ < 4000) {
      const e = res.get(n).prev
      path.unshift(e)
      n = this.other(e, n)
    }
    return path
  }

  finalize() {
    this.cum = new Float64Array(this.edges.length)
    let acc = 0
    for (let i = 0; i < this.edges.length; i++) {
      // entrance stubs and islands are not spawn spots
      const k = this.edges[i].kind
      acc += k === 'entrance' || k === 'island' ? 0 : this.edges[i].len
      this.cum[i] = acc
    }
    this.total = acc
    this.doors = this.nodes.filter(n => n.door)
  }
}

function segPointT(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az
  const ll = dx * dx + dz * dz || 1e-9
  let t = ((px - ax) * dx + (pz - az) * dz) / ll
  t = Math.max(0, Math.min(1, t))
  const qx = ax + dx * t, qz = az + dz * t
  return { t, d: Math.hypot(px - qx, pz - qz), x: qx, z: qz }
}

function intersect(s, u) {
  const rx = s.bx - s.ax, rz = s.bz - s.az, qx = u.bx - u.ax, qz = u.bz - u.az
  const den = rx * qz - rz * qx
  if (Math.abs(den) < 1e-9) return null
  const wx = u.ax - s.ax, wz = u.az - s.az
  const t = (wx * qz - wz * qx) / den
  const v = (wx * rz - wz * rx) / den
  if (t <= 0.001 || t >= 0.999 || v <= 0.001 || v >= 0.999) return null
  return [t, v]
}

/**
 * Build the walk graph. entrances: registry.entrances (optional) to attach door records.
 * Returns a NavGraph (possibly empty).
 */
export function buildNavGraph(navPaths, entrances = [], opts = {}) {
  const g = new NavGraph()
  const polys = []
  for (const p of navPaths || []) {
    if (!p || !Array.isArray(p.points) || p.points.length < 2) continue
    const kind = p.kind ?? 'path'
    if (WALK_KINDS_DENY.has(kind)) continue
    if (p.y !== undefined && (p.y < -1 || p.y > 4)) continue
    polys.push({ points: p.points.filter(q => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1])), kind, y: p.y })
  }
  const walkable = polys.filter(p => p.kind !== 'entrance')
  if (!walkable.length && opts.fallback !== false) {
    g.fallback = true
    for (const r of FALLBACK_ROUTES) polys.push({ points: r.points, kind: r.kind })
  }

  // ---- segments
  const segs = []
  polys.forEach((p, pi) => {
    for (let i = 0; i < p.points.length - 1; i++) {
      const [ax, az] = p.points[i], [bx, bz] = p.points[i + 1]
      if (Math.hypot(bx - ax, bz - az) < 0.05) continue
      segs.push({ ax, az, bx, bz, kind: p.kind, poly: pi, idx: i, ts: [0, 1], links: [] })
    }
  })
  // spatial buckets (16 m) for pair tests
  const B = 16
  const buckets = new Map()
  segs.forEach((s, si) => {
    const x0 = Math.floor((Math.min(s.ax, s.bx) - SNAP) / B), x1 = Math.floor((Math.max(s.ax, s.bx) + SNAP) / B)
    const z0 = Math.floor((Math.min(s.az, s.bz) - SNAP) / B), z1 = Math.floor((Math.max(s.az, s.bz) + SNAP) / B)
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const k = x * 100003 + z
      if (!buckets.has(k)) buckets.set(k, [])
      buckets.get(k).push(si)
    }
  })
  const near = (x, z, r) => {
    const out = new Set()
    for (let bx = Math.floor((x - r) / B); bx <= Math.floor((x + r) / B); bx++)
      for (let bz = Math.floor((z - r) / B); bz <= Math.floor((z + r) / B); bz++) {
        const l = buckets.get(bx * 100003 + bz)
        if (l) for (const i of l) out.add(i)
      }
    return out
  }
  // crossings
  const seen = new Set()
  for (const list of buckets.values()) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j]
      const key = a < b ? a * 1e6 + b : b * 1e6 + a
      if (seen.has(key)) continue
      seen.add(key)
      const s = segs[a], u = segs[b]
      if (s.poly === u.poly && Math.abs(s.idx - u.idx) <= 1) continue
      if (s.kind === 'entrance' || u.kind === 'entrance') continue
      const r = intersect(s, u)
      if (r) { s.ts.push(r[0]); u.ts.push(r[1]) }
    }
  }
  // loose ends: snap onto the nearest other segment within SNAP (entrance outer ends: DOOR_LINK)
  const degree = new Map()
  const vkey = (x, z) => `${Math.round(x / MERGE)}:${Math.round(z / MERGE)}`
  for (const p of polys) for (let i = 0; i < p.points.length; i++) {
    const k = vkey(...p.points[i])
    degree.set(k, (degree.get(k) || 0) + (i === 0 || i === p.points.length - 1 ? 1 : 2))
  }
  const extraLinks = []
  polys.forEach((p, pi) => {
    const ends = p.kind === 'entrance' ? [p.points.length - 1] : [0, p.points.length - 1]
    for (const ei of ends) {
      const [x, z] = p.points[ei]
      if ((degree.get(vkey(x, z)) || 0) > 1) continue
      const r = p.kind === 'entrance' ? DOOR_LINK : SNAP
      let best = null
      for (const si of near(x, z, r)) {
        const s = segs[si]
        if (s.poly === pi) continue
        if (s.kind === 'entrance') continue
        const q = segPointT(x, z, s.ax, s.az, s.bx, s.bz)
        if (q.d <= r && (!best || q.d < best.q.d)) best = { si, q }
      }
      if (best) {
        segs[best.si].ts.push(best.q.t)
        if (best.q.d > MERGE * 0.8) extraLinks.push({ a: [x, z], b: [best.q.x, best.q.z], kind: p.kind === 'entrance' ? 'trodden' : 'path' })
      }
    }
  })
  // ---- nodes & edges
  for (const s of segs) {
    const ts = [...new Set(s.ts.map(t => Math.round(t * 1e4) / 1e4))].sort((a, b) => a - b)
    let prev = null
    for (const t of ts) {
      const n = g.node(s.ax + (s.bx - s.ax) * t, s.az + (s.bz - s.az) * t)
      if (prev !== null) g.edge(prev, n, s.kind)
      prev = n
    }
  }
  for (const l of extraLinks) g.edge(g.node(...l.a), g.node(...l.b), l.kind)

  // ---- door nodes: the first point of each entrance stub
  for (const p of polys) {
    if (p.kind !== 'entrance') continue
    const [x, z] = p.points[0]
    const n = g.nodes[g.node(x, z)]
    let rec = null, bd = 1.5
    for (const e of entrances || []) {
      const d = Math.hypot(e.x - x, e.z - z)
      if (d < bd) { bd = d; rec = e }
    }
    n.door = rec || { x, z, y: p.y ?? null, angle: null }
    n.kind = 'door'
  }
  // drop tiny islands (< 25 m of walkway): nobody walks there
  const comp = new Int32Array(g.nodes.length).fill(-1)
  let c = 0
  const keep = new Set()
  for (const n of g.nodes) {
    if (comp[n.id] >= 0) continue
    const stack = [n.id], members = []
    comp[n.id] = c
    let len = 0
    while (stack.length) {
      const k = stack.pop()
      members.push(k)
      for (const e of g.nodes[k].adj) {
        const m = g.other(e, k)
        if (comp[m] < 0) { comp[m] = c; stack.push(m); len += g.edges[e].len }
      }
    }
    if (len >= 25) for (const k of members) keep.add(k)
    c++
  }
  for (const E of g.edges) if (!keep.has(E.a)) E.kind = 'island'
  g.finalize()
  g.doors = g.doors.filter(n => keep.has(n.id))
  return g
}
