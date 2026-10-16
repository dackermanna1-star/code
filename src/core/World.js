// World: terrain + instanced voxel model placements, with collision and ray queries.
//
// Placement transform: world = T(x,y,z) · RotY(angle) · (local - pivot). Rotation uses THREE's
// convention (positive angle turns +X toward -Z). `rot` is a quarter-turn shortcut (0..3).

import * as THREE from 'three'
import { VOXEL, WORLD_SIZE } from './constants.js'
import { SOLID, LOD_REMAP, TRANSPARENT } from './materials.js'
import { getModelDef } from './models.js'
import { meshModel, setTransparentTable } from './mesher.js'
import { MeshPool } from './MeshPool.js'
import { HOLE } from './Terrain.js'
import { hashf } from './rng.js'

const GRID = 8 // broadphase cell size (m)
const GN = Math.ceil(WORLD_SIZE / GRID)

let placementCounter = 0

export class Placement {
  constructor(def, o) {
    this.id = placementCounter++
    this.def = def
    this.name = def.name
    this.x = o.x ?? 0
    this.y = o.y ?? 0
    this.z = o.z ?? 0
    this.angle = o.angle ?? ((o.rot ?? 0) * Math.PI / 2)
    this.seed = o.seed ?? hashf(this.id, 77)
    this.tint = new THREE.Color(o.tint ?? 0xffffff)
    this.flag = o.flag ?? 1 // per-instance emissive multiplier (0 = lamp broken)
    this.indoor = o.indoor ?? def.indoor
    this.visible = o.visible ?? true
    this.collide = o.collide ?? def.collide
    this.dynamic = o.dynamic ?? def.dynamic
    this.tag = o.tag ?? null
    this.userData = o.userData ?? {}
    this.matrix = new Float32Array(16)
    this.aabb = new Float32Array(6)
    this._stamp = 0
    this.updateTransform()
  }

  updateTransform() {
    let c = Math.cos(this.angle), s = Math.sin(this.angle)
    // snap exact quarter turns so voxel lookups don't wobble
    if (Math.abs(c) < 1e-9) c = 0
    if (Math.abs(s) < 1e-9) s = 0
    if (Math.abs(Math.abs(c) - 1) < 1e-9) c = Math.sign(c)
    if (Math.abs(Math.abs(s) - 1) < 1e-9) s = Math.sign(s)
    this.c = c; this.s = s
    const m = this.matrix
    // column-major THREE matrix for RotY then translate
    m[0] = c; m[1] = 0; m[2] = -s; m[3] = 0
    m[4] = 0; m[5] = 1; m[6] = 0; m[7] = 0
    m[8] = s; m[9] = 0; m[10] = c; m[11] = 0
    m[12] = this.x; m[13] = this.y; m[14] = this.z; m[15] = 1
    // world AABB from local AABB corners
    const d = this.def
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (let k = 0; k < 4; k++) {
      const lx = k & 1 ? d.max[0] : d.min[0]
      const lz = k & 2 ? d.max[2] : d.min[2]
      const wx = this.x + lx * c + lz * s
      const wz = this.z - lx * s + lz * c
      if (wx < minX) minX = wx; if (wx > maxX) maxX = wx
      if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz
    }
    const a = this.aabb
    a[0] = minX; a[1] = this.y + d.min[1]; a[2] = minZ
    a[3] = maxX; a[4] = this.y + d.max[1]; a[5] = maxZ
    this.cx = (minX + maxX) / 2; this.cy = (a[1] + a[4]) / 2; this.cz = (minZ + maxZ) / 2
    this.radius = Math.hypot(maxX - minX, a[4] - a[1], maxZ - minZ) / 2
  }

  /** World point → local voxel coords (floats). */
  toLocal(wx, wy, wz, out) {
    const dx = wx - this.x, dz = wz - this.z
    const lx = dx * this.c - dz * this.s
    const lz = dx * this.s + dz * this.c
    const p = this.def.model.pivot
    out[0] = lx / VOXEL + p.x
    out[1] = (wy - this.y) / VOXEL + p.y
    out[2] = lz / VOXEL + p.z
    return out
  }

  /** Local meters (relative to pivot) → world. */
  toWorld(lx, ly, lz, out = new THREE.Vector3()) {
    return out.set(this.x + lx * this.c + lz * this.s, this.y + ly, this.z - lx * this.s + lz * this.c)
  }

  /** Local VOXEL coords (fractional ok, origin at model corner) → world meters. */
  voxelToWorld(vx, vy, vz, out = new THREE.Vector3()) {
    const p = this.def.model.pivot
    return this.toWorld((vx - p.x) * VOXEL, (vy - p.y) * VOXEL, (vz - p.z) * VOXEL, out)
  }

  /** Move a placement (dynamic placements only; static ones must call world.relocate). */
  set(x, y, z, angle) {
    this.x = x; this.y = y; this.z = z
    if (angle !== undefined) this.angle = angle
    this.updateTransform()
  }
}

const _v = [0, 0, 0]
const _frustum = new THREE.Frustum()
const _projScreen = new THREE.Matrix4()
const _sphere = new THREE.Sphere()

export class World {
  constructor(terrain) {
    this.terrain = terrain
    this.placements = []
    this.statics = []
    this.dynamics = []
    this.grid = Array.from({ length: GN * GN }, () => [])
    this.renderSets = new Map() // defName → { def, levels:[{mesh, glass, f}], placements:[] }
    this.finalized = false
    this._stamp = 1
    this.roofTexture = null
    this.stats = { instancesDrawn: 0, models: 0 }
    this.camera = null
  }

  /**
   * Place a model. o: { x, z, y (default: terrain height), rot | angle, seed, tint, flag,
   *   dynamic, collide, visible, indoor, tag, userData, yOffset }
   */
  place(name, o = {}) {
    const def = getModelDef(name)
    if (!def) {
      console.warn(`place(): unknown model "${name}"`)
      return null
    }
    if (o.y === undefined) {
      const h = this.terrain.heightAt(o.x ?? 0, o.z ?? 0)
      o = { ...o, y: (Number.isFinite(h) ? h : 0) + (o.yOffset ?? 0) }
    }
    const p = new Placement(def, o)
    this.placements.push(p)
    if (p.dynamic) this.dynamics.push(p)
    else {
      this.statics.push(p)
      if (this.finalized) this._insertGrid(p)
    }
    if (this.finalized) this._ensureRenderSet(def).placements.push(p)
    return p
  }

  /** Remove a placement entirely. */
  remove(p) {
    p.visible = false
    p.collide = false
    p.removed = true
  }

  /** Move a static placement and refresh its broadphase entry. */
  relocate(p, x, y, z, angle) {
    if (!p.dynamic) this._removeGrid(p)
    p.set(x, y, z, angle)
    if (!p.dynamic) this._insertGrid(p)
  }

  _cellsOf(a, fn) {
    const gx0 = Math.max(0, Math.floor(a[0] / GRID)), gx1 = Math.min(GN - 1, Math.floor(a[3] / GRID))
    const gz0 = Math.max(0, Math.floor(a[2] / GRID)), gz1 = Math.min(GN - 1, Math.floor(a[5] / GRID))
    for (let gz = gz0; gz <= gz1; gz++)
      for (let gx = gx0; gx <= gx1; gx++) fn(this.grid[gx + gz * GN])
  }
  _insertGrid(p) { this._cellsOf(p.aabb, list => list.push(p)) }
  _removeGrid(p) {
    this._cellsOf(p.aabb, list => { const i = list.indexOf(p); if (i >= 0) list.splice(i, 1) })
  }

  // ---- finalize: geometry + instancing ------------------------------------------------
  async finalize(scene, mats, onProgress) {
    setTransparentTable(TRANSPARENT)
    for (const p of this.statics) this._insertGrid(p)
    // terrain contact occupancy
    for (const p of this.statics) if (p.def.contact && p.visible) this._rasterizeContact(p)
    const byDef = new Map()
    for (const p of this.placements) {
      if (!byDef.has(p.def)) byDef.set(p.def, [])
      byDef.get(p.def).push(p)
    }
    this.scene = scene
    this.mats = mats
    // mesh every LOD of every used model in parallel workers
    const pool = new MeshPool()
    const t0 = performance.now()
    let done = 0
    const total = [...byDef.keys()].reduce((n, d) => n + d.lods.length, 0)
    const jobs = []
    for (const def of byDef.keys()) {
      def._meshes = []
      def.lods.forEach((f, li) => {
        const vm = f === 1 ? def.model : def.model.downsample(f, 1, LOD_REMAP)
        jobs.push(pool.mesh(vm, { scale: VOXEL * f, cullBottom: def.cullBottom, transparent: TRANSPARENT }).then(res => {
          def._meshes[li] = res
          onProgress?.(++done / total, def.name)
        }))
      })
    }
    await Promise.all(jobs)
    pool.dispose()
    this.stats.meshMs = performance.now() - t0
    for (const [def, list] of byDef) this._ensureRenderSet(def).placements.push(...list)
    this._buildRoofTexture()
    this.finalized = true
    this.stats.models = this.renderSets.size
  }

  _ensureRenderSet(def) {
    let rs = this.renderSets.get(def.name)
    if (rs) return rs
    rs = { def, levels: [], placements: [], capacity: 0 }
    for (let li = 0; li < def.lods.length; li++) {
      const f = def.lods[li]
      let res = def._meshes?.[li]
      if (!res) {
        const vm = f === 1 ? def.model : def.model.downsample(f, 1, LOD_REMAP)
        res = meshModel(vm, { scale: VOXEL * f, cullBottom: def.cullBottom, transparent: TRANSPARENT })
      }
      const level = { f, opaque: null, glass: null }
      if (res.opaque) level.opaque = this._makeInstanced(res.opaque, this.mats.voxel[Math.min(li, this.mats.voxel.length - 1)], def.name + '_L' + li)
      if (res.transparent && li === 0) level.glass = this._makeInstanced(res.transparent, this.mats.glass, def.name + '_glass')
      rs.levels.push(level)
    }
    def._meshes = null
    this.renderSets.set(def.name, rs)
    return rs
  }

  _makeInstanced(r, material, name, capacity = 4) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(r.positions, 3))
    g.setAttribute('aData', new THREE.BufferAttribute(r.data, 4))
    g.setAttribute('aSize', new THREE.BufferAttribute(r.size, 2))
    g.setIndex(new THREE.BufferAttribute(r.indices, 1))
    g.computeBoundingSphere()
    const holder = { geometry: g, material, name, mesh: null, capacity: 0 }
    this._resizeInstanced(holder, capacity)
    return holder
  }

  _resizeInstanced(h, capacity) {
    if (h.mesh) { this.scene.remove(h.mesh); h.mesh.dispose() }
    const mesh = new THREE.InstancedMesh(h.geometry, h.material, capacity)
    mesh.name = h.name
    mesh.frustumCulled = false // we cull per instance ourselves
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    const inst = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4)
    const inst2 = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4)
    inst.setUsage(THREE.DynamicDrawUsage); inst2.setUsage(THREE.DynamicDrawUsage)
    h.geometry.setAttribute('aInst', inst)
    h.geometry.setAttribute('aInst2', inst2)
    mesh.count = 0
    mesh.matrixAutoUpdate = false
    h.mesh = mesh
    h.capacity = capacity
    h.count = 0
    this.scene.add(mesh)
  }

  _rasterizeContact(p) {
    const def = p.def, m = def.model
    if (!def._footprint) {
      const fp = []
      for (let z = 0; z < m.sz; z++)
        for (let x = 0; x < m.sx; x++) {
          for (let y = 0; y < Math.min(3, m.sy); y++)
            if (SOLID[m.data[m.idx(x, y, z)]]) { fp.push(x, z); break }
        }
      def._footprint = fp
    }
    const fp = def._footprint
    const t = this.terrain
    const out = new THREE.Vector3()
    for (let i = 0; i < fp.length; i += 2) {
      p.voxelToWorld(fp[i] + 0.5, 0, fp[i + 1] + 0.5, out)
      const cx = Math.floor(out.x / VOXEL), cz = Math.floor(out.z / VOXEL)
      const th = t.hCell(cx, cz)
      if (th === HOLE) continue
      if (Math.abs(th * VOXEL - p.y) < 0.6) t.markOccupied(cx, cz)
    }
  }

  /** 1 m resolution texture of the highest snow-blocking surface (terrain or roof). */
  _buildRoofTexture() {
    const N = Math.ceil(WORLD_SIZE)
    const data = new Float32Array(N * N)
    const t = this.terrain
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        let hmax = -1000
        for (let k = 0; k < 4; k++) {
          const h = t.hCell(x * 4 + (k & 1) * 2 + 1, z * 4 + (k >> 1) * 2 + 1)
          if (h !== HOLE && h * VOXEL > hmax) hmax = h * VOXEL
        }
        data[x + z * N] = hmax
      }
    for (const p of this.statics) {
      if (!p.def.occludesSnow || !p.visible) continue
      const a = p.aabb
      for (let z = Math.max(0, Math.floor(a[2])); z < Math.min(N, Math.ceil(a[5])); z++)
        for (let x = Math.max(0, Math.floor(a[0])); x < Math.min(N, Math.ceil(a[3])); x++)
          if (data[x + z * N] < a[4]) data[x + z * N] = a[4]
    }
    this.roofData = data
    this.roofN = N
    this.roofTexture = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.FloatType)
    this.roofTexture.magFilter = THREE.NearestFilter
    this.roofTexture.minFilter = THREE.NearestFilter
    this.roofTexture.needsUpdate = true
  }

  /** Height of the highest snow-blocking surface at (x,z) — roofs or terrain. */
  roofAt(x, z) {
    const N = this.roofN
    const ix = Math.floor(x), iz = Math.floor(z)
    if (ix < 0 || iz < 0 || ix >= N || iz >= N) return 0
    return this.roofData[ix + iz * N]
  }

  // ---- per-frame instancing -------------------------------------------------------------
  update(camera) {
    this.camera = camera
    camera.updateMatrixWorld()
    _projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    _frustum.setFromProjectionMatrix(_projScreen)
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z
    let drawn = 0
    for (const rs of this.renderSets.values()) {
      const def = rs.def
      const levels = rs.levels
      // ensure capacity
      const need = rs.placements.length
      for (const L of levels) {
        if (L.opaque && L.opaque.capacity < need) this._resizeInstanced(L.opaque, Math.max(need, L.opaque.capacity * 2))
        if (L.glass && L.glass.capacity < need) this._resizeInstanced(L.glass, Math.max(need, L.glass.capacity * 2))
        if (L.opaque) L.opaque.count = 0
        if (L.glass) L.glass.count = 0
      }
      const dists = def.lodDistances
      for (const p of rs.placements) {
        if (!p.visible) continue
        const dx = p.cx - cx, dy = p.cy - cy, dz = p.cz - cz
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) - p.radius
        if (dist > def.maxDistance) continue
        _sphere.center.set(p.cx, p.cy, p.cz)
        _sphere.radius = p.radius
        if (!_frustum.intersectsSphere(_sphere)) continue
        let li = 0
        while (li < dists.length && li < levels.length - 1 && dist > dists[li]) li++
        const L = levels[li]
        if (L.opaque) this._push(L.opaque, p)
        if (L.glass) this._push(L.glass, p)
        // glass only lives in LOD0; when an object switches LOD the far material takes over
        drawn++
      }
      for (const L of levels) {
        for (const h of [L.opaque, L.glass]) {
          if (!h) continue
          h.mesh.count = h.count
          if (h.count) {
            h.mesh.instanceMatrix.needsUpdate = true
            h.mesh.instanceMatrix.clearUpdateRanges()
            h.mesh.instanceMatrix.addUpdateRange(0, h.count * 16)
            const a1 = h.geometry.attributes.aInst, a2 = h.geometry.attributes.aInst2
            a1.needsUpdate = true; a2.needsUpdate = true
            a1.clearUpdateRanges(); a1.addUpdateRange(0, h.count * 4)
            a2.clearUpdateRanges(); a2.addUpdateRange(0, h.count * 4)
          }
        }
      }
    }
    this.stats.instancesDrawn = drawn
  }

  _push(h, p) {
    const i = h.count++
    h.mesh.instanceMatrix.array.set(p.matrix, i * 16)
    const a = h.geometry.attributes.aInst.array
    a[i * 4] = p.seed; a[i * 4 + 1] = p.tint.r; a[i * 4 + 2] = p.tint.g; a[i * 4 + 3] = p.tint.b
    const b = h.geometry.attributes.aInst2.array
    b[i * 4] = p.flag; b[i * 4 + 1] = p.indoor ? 1 : 0; b[i * 4 + 2] = p.id % 1024; b[i * 4 + 3] = 0
  }

  // ---- queries --------------------------------------------------------------------------
  /** Candidate placements whose AABB overlaps the box. */
  _candidates(minX, minY, minZ, maxX, maxY, maxZ, out) {
    out.length = 0
    const stamp = ++this._stamp
    const gx0 = Math.max(0, Math.floor(minX / GRID)), gx1 = Math.min(GN - 1, Math.floor(maxX / GRID))
    const gz0 = Math.max(0, Math.floor(minZ / GRID)), gz1 = Math.min(GN - 1, Math.floor(maxZ / GRID))
    for (let gz = gz0; gz <= gz1; gz++)
      for (let gx = gx0; gx <= gx1; gx++) {
        const list = this.grid[gx + gz * GN]
        for (let i = 0; i < list.length; i++) {
          const p = list[i]
          if (p._stamp === stamp) continue
          p._stamp = stamp
          if (!p.collide) continue
          const a = p.aabb
          if (a[0] > maxX || a[3] < minX || a[1] > maxY || a[4] < minY || a[2] > maxZ || a[5] < minZ) continue
          out.push(p)
        }
      }
    for (const p of this.dynamics) {
      if (!p.collide) continue
      const a = p.aabb
      if (a[0] > maxX || a[3] < minX || a[1] > maxY || a[4] < minY || a[2] > maxZ || a[5] < minZ) continue
      out.push(p)
    }
    return out
  }

  /** Material id of the voxel containing world point (0 = air). Includes terrain. */
  materialAt(x, y, z, includeNonSolid = false) {
    const cands = this._candidates(x, y, z, x, y, z, this._candList || (this._candList = []))
    for (const p of cands) {
      p.toLocal(x, y, z, _v)
      const m = p.def.model
      const vx = Math.floor(_v[0]), vy = Math.floor(_v[1]), vz = Math.floor(_v[2])
      if (vx < 0 || vy < 0 || vz < 0 || vx >= m.sx || vy >= m.sy || vz >= m.sz) continue
      const id = m.data[vx + m.sx * (vz + m.sz * vy)]
      if (id && (includeNonSolid || SOLID[id])) return id
    }
    const t = this.terrain
    const vx = Math.floor(x / VOXEL), vy = Math.floor(y / VOXEL), vz = Math.floor(z / VOXEL)
    if (t.solidVoxel(vx, vy, vz)) return t.mat[vx + vz * t.n] || 1
    return 0
  }

  /** Placement owning the solid voxel at the point (null for terrain/air). */
  placementAt(x, y, z) {
    const cands = this._candidates(x, y, z, x, y, z, this._candList || (this._candList = []))
    for (const p of cands) {
      p.toLocal(x, y, z, _v)
      const m = p.def.model
      const vx = Math.floor(_v[0]), vy = Math.floor(_v[1]), vz = Math.floor(_v[2])
      if (vx < 0 || vy < 0 || vz < 0 || vx >= m.sx || vy >= m.sy || vz >= m.sz) continue
      if (SOLID[m.data[vx + m.sx * (vz + m.sz * vy)]]) return p
    }
    return null
  }

  solidAt(x, y, z) { return this.materialAt(x, y, z) !== 0 }

  /**
   * Does the axis-aligned box intersect any solid voxel? Returns the hit placement, `true` for
   * terrain, or null. Boxes are slightly shrunk to ignore touching contact.
   */
  boxHit(minX, minY, minZ, maxX, maxY, maxZ) {
    const e = 1e-4
    minX += e; minY += e; minZ += e; maxX -= e; maxY -= e; maxZ -= e
    // terrain
    const t = this.terrain
    const vy0 = Math.floor(minY / VOXEL), vy1 = Math.floor(maxY / VOXEL)
    const cx0 = Math.floor(minX / VOXEL), cx1 = Math.floor(maxX / VOXEL)
    const cz0 = Math.floor(minZ / VOXEL), cz1 = Math.floor(maxZ / VOXEL)
    for (let cz = cz0; cz <= cz1; cz++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const h = t.hCell(cx, cz)
        if (h === HOLE) continue
        // solid rows [h-CRUST, h)
        if (vy0 < h && vy1 >= h - 6) return true
      }
    const cands = this._candidates(minX, minY, minZ, maxX, maxY, maxZ, this._candList2 || (this._candList2 = []))
    for (const p of cands) {
      const m = p.def.model
      // transform the 4 xz corners to local and take bounds
      let lx0 = Infinity, lx1 = -Infinity, lz0 = Infinity, lz1 = -Infinity
      for (let k = 0; k < 4; k++) {
        p.toLocal(k & 1 ? maxX : minX, minY, k & 2 ? maxZ : minZ, _v)
        if (_v[0] < lx0) lx0 = _v[0]; if (_v[0] > lx1) lx1 = _v[0]
        if (_v[2] < lz0) lz0 = _v[2]; if (_v[2] > lz1) lz1 = _v[2]
      }
      const ly0 = _v[1], ly1 = ly0 + (maxY - minY) / VOXEL
      const x0 = Math.max(0, Math.floor(lx0)), x1 = Math.min(m.sx - 1, Math.floor(lx1))
      const y0 = Math.max(0, Math.floor(ly0)), y1 = Math.min(m.sy - 1, Math.floor(ly1))
      const z0 = Math.max(0, Math.floor(lz0)), z1 = Math.min(m.sz - 1, Math.floor(lz1))
      const data = m.data, sx = m.sx, sz = m.sz
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          let i = x0 + sx * (z + sz * y)
          for (let x = x0; x <= x1; x++, i++) if (SOLID[data[i]]) return p
        }
    }
    return null
  }

  /**
   * March a ray. Returns { dist, x, y, z, mat, placement } or null.
   * step: marching step in meters (default VOXEL/3).
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist, step = VOXEL / 3, includeNonSolid = false) {
    const len = Math.hypot(dx, dy, dz) || 1
    dx /= len; dy /= len; dz /= len
    for (let t = 0; t <= maxDist; t += step) {
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t
      const mat = this.materialAt(x, y, z, includeNonSolid)
      if (mat) return { dist: t, x, y, z, mat, placement: this.placementAt(x, y, z) }
    }
    return null
  }

  /** Is the straight segment between two points free of solid voxels? (coarse) */
  lineOfSight(ax, ay, az, bx, by, bz, step = 0.5) {
    const dx = bx - ax, dy = by - ay, dz = bz - az
    const len = Math.hypot(dx, dy, dz)
    const n = Math.ceil(len / step)
    for (let i = 1; i < n; i++) {
      const t = i / n
      if (this.materialAt(ax + dx * t, ay + dy * t, az + dz * t)) return false
    }
    return true
  }

  /** Highest walkable surface below y at (x,z) within maxDrop meters, or null. */
  groundBelow(x, y, z, maxDrop = 50) {
    for (let d = 0; d <= maxDrop; d += VOXEL) {
      const yy = y - d
      if (this.materialAt(x, yy, z)) return Math.floor(yy / VOXEL) * VOXEL + VOXEL
    }
    return null
  }

  byTag(tag) { return this.placements.filter(p => p.tag === tag) }
}
