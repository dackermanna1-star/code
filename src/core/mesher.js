// Greedy voxel mesher with per-vertex ambient occlusion.
//
// Output vertex format (shared by models and terrain):
//   position : Float32 x3   model-local meters (pivot already subtracted)
//   aData    : Uint8 x4     (materialId, dir | corner<<3 | ao<<5, extra, flags)
//                            dir ∈ 0..5 (+X,-X,+Y,-Y,+Z,-Z), corner ∈ 0..3, ao ∈ 0..3 (3 = open)
//                            flags bit0 = indoor surface
//   aSize    : Uint8 x2     quad size in voxels (u, v), capped at 255
//
// Quads are merged only when material, extra byte, domain and AO pattern match and the AO
// does not vary along the merge direction, so interpolation stays correct.

import { VOXEL } from './constants.js'

class Growable {
  constructor(Type, initial = 4096) { this.Type = Type; this.a = new Type(initial); this.n = 0 }
  ensure(k) {
    if (this.n + k <= this.a.length) return
    let cap = this.a.length * 2
    while (cap < this.n + k) cap *= 2
    const b = new this.Type(cap)
    b.set(this.a.subarray(0, this.n))
    this.a = b
  }
  view() { return this.a.slice(0, this.n) }
}

class MeshBuffers {
  constructor() {
    this.pos = new Growable(Float32Array, 12 * 1024)
    this.dat = new Growable(Uint8Array, 16 * 1024)
    this.siz = new Growable(Uint8Array, 8 * 1024)
    this.idx = new Growable(Uint32Array, 6 * 1024)
    this.verts = 0
  }
  /**
   * Push a quad. c = 4 corner positions [x,y,z]*4 (already in meters), ao = [a0..a3].
   * front=true: CCW order c0,c1,c2,c3 faces the viewer.
   */
  quad(c, mat, dir, ao, extra, flags, w, h, front) {
    const p = this.pos, d = this.dat, s = this.siz, ix = this.idx
    p.ensure(12); d.ensure(16); s.ensure(8); ix.ensure(6)
    const base = this.verts
    for (let k = 0; k < 4; k++) {
      p.a[p.n++] = c[k * 3]; p.a[p.n++] = c[k * 3 + 1]; p.a[p.n++] = c[k * 3 + 2]
      d.a[d.n++] = mat
      d.a[d.n++] = dir | (k << 3) | (ao[k] << 5)
      d.a[d.n++] = extra
      d.a[d.n++] = flags
      s.a[s.n++] = w > 255 ? 255 : w
      s.a[s.n++] = h > 255 ? 255 : h
    }
    const flip = ao[0] + ao[2] > ao[1] + ao[3]
    if (front) {
      if (flip) { ix.a[ix.n++] = base + 1; ix.a[ix.n++] = base + 2; ix.a[ix.n++] = base + 3; ix.a[ix.n++] = base + 1; ix.a[ix.n++] = base + 3; ix.a[ix.n++] = base + 0 }
      else { ix.a[ix.n++] = base + 0; ix.a[ix.n++] = base + 1; ix.a[ix.n++] = base + 2; ix.a[ix.n++] = base + 0; ix.a[ix.n++] = base + 2; ix.a[ix.n++] = base + 3 }
    } else {
      if (flip) { ix.a[ix.n++] = base + 1; ix.a[ix.n++] = base + 3; ix.a[ix.n++] = base + 2; ix.a[ix.n++] = base + 1; ix.a[ix.n++] = base + 0; ix.a[ix.n++] = base + 3 }
      else { ix.a[ix.n++] = base + 0; ix.a[ix.n++] = base + 2; ix.a[ix.n++] = base + 1; ix.a[ix.n++] = base + 0; ix.a[ix.n++] = base + 3; ix.a[ix.n++] = base + 2 }
    }
    this.verts += 4
  }
  result() {
    if (this.verts === 0) return null
    return {
      positions: this.pos.view(),
      data: this.dat.view(),
      size: this.siz.view(),
      indices: this.idx.view(),
      vertexCount: this.verts,
    }
  }
}

export { MeshBuffers }

/**
 * Build a THREE.BufferGeometry from mesher output. Indices become 16-bit when they fit, and
 * the CPU-side arrays are released right after their first GPU upload (static voxel geometry
 * is never read back), roughly halving the memory a big city needs.
 */
export function voxelGeometry(THREE, r, { release = true } = {}) {
  const g = new THREE.BufferGeometry()
  const free = release ? function () { this.array = null } : null
  const attr = (arr, n) => {
    const a = new THREE.BufferAttribute(arr, n)
    if (free) a.onUpload(free)
    return a
  }
  g.setAttribute('position', attr(r.positions, 3))
  g.setAttribute('aData', attr(r.data, 4))
  g.setAttribute('aSize', attr(r.size, 2))
  const idx = r.vertexCount <= 65535 ? Uint16Array.from(r.indices) : r.indices
  g.setIndex(attr(idx, 1))
  g.computeBoundingSphere()
  g.computeBoundingBox()
  return g
}

let DEFAULT_TRANSPARENT = new Uint8Array(256)
/** Main thread registers the material transparency table (workers receive it per job). */
export function setTransparentTable(t) { DEFAULT_TRANSPARENT = t }

/**
 * Mesh a VoxelModel.
 * @param {import('./VoxelModel.js').VoxelModel} model
 * @param {object} [opts]
 * @param {number} [opts.scale=VOXEL] meters per voxel (LOD models use 2x/4x)
 * @param {boolean} [opts.cullBottom=true] skip downward faces on the bottom layer
 * @param {Uint8Array} opts.transparent material id → 1 if transparent (materials.TRANSPARENT)
 * @param {Uint8Array|null} [opts.interior] per-voxel interior mask (defaults to model.interiorMask())
 * @returns {{opaque: object|null, transparent: object|null}}
 */
export function meshModel(model, opts = {}) {
  const scale = opts.scale ?? VOXEL
  const cullBottom = opts.cullBottom ?? true
  const TRANSPARENT = opts.transparent ?? DEFAULT_TRANSPARENT
  const WINDOWS = opts.windows ?? null
  const { sx, sy, sz, data } = model
  const extra = model.extra
  const interior = opts.interior !== undefined ? opts.interior : (model.interiorMask ? model.interiorMask() : null)
  const dims = [sx, sy, sz]
  const stride = [1, sx * sz, sx]
  const px = model.pivot.x, py = model.pivot.y, pz = model.pivot.z

  const opaque = new MeshBuffers()
  const transparent = new MeshBuffers()

  // occupancy for AO: opaque (non-transparent) voxel present
  const occ = (x, y, z) => {
    if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) return 0
    const m = data[x + sx * (z + sz * y)]
    return m !== 0 && TRANSPARENT[m] === 0 ? 1 : 0
  }

  const pos = [0, 0, 0]
  const q = [0, 0, 0]
  const p3 = [0, 0, 0]
  const corners = new Float32Array(12)
  const ao = [3, 3, 3, 3]

  let maskKey = new Int32Array(0)
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3
    const du = dims[u], dv = dims[v], dd = dims[d]
    const eu = [0, 0, 0], ev = [0, 0, 0]
    eu[u] = 1; ev[v] = 1
    if (maskKey.length < du * dv) maskKey = new Int32Array(du * dv)
    for (let side = 0; side < 2; side++) {
      const dir = side === 0 ? 1 : -1
      const dirIndex = d * 2 + side
      for (let s = 0; s < dd; s++) {
        if (cullBottom && d === 1 && dir === -1 && s === 0) continue
        // build mask
        let n = 0
        const ns = s + dir
        const neighborInside = ns >= 0 && ns < dd
        for (let j = 0; j < dv; j++) {
          for (let i = 0; i < du; i++, n++) {
            pos[d] = s; pos[u] = i; pos[v] = j
            const ia = pos[0] * stride[0] + pos[1] * stride[1] + pos[2] * stride[2]
            const a = data[ia]
            if (a === 0) { maskKey[n] = 0; continue }
            const aT = TRANSPARENT[a]
            let b = 0
            if (neighborInside) b = data[ia + dir * stride[d]]
            let visible
            if (aT) visible = b === 0
            else visible = b === 0 || (TRANSPARENT[b] === 1)
            if (!visible) { maskKey[n] = 0; continue }
            // air cell in front of the face
            q[0] = pos[0]; q[1] = pos[1]; q[2] = pos[2]; q[d] += dir
            let ind = 0
            if (interior && neighborInside) ind = interior[q[0] + sx * (q[2] + sz * q[1])]
            // AO for 4 corners: (u-,v-), (u+,v-), (u+,v+), (u-,v+)
            let aoBits = 0
            const qx = q[0], qy = q[1], qz = q[2]
            for (let c = 0; c < 4; c++) {
              const su = (c === 1 || c === 2) ? 1 : -1
              const sv = (c >= 2) ? 1 : -1
              const ux = eu[0] * su, uy = eu[1] * su, uz = eu[2] * su
              const vx = ev[0] * sv, vy = ev[1] * sv, vz = ev[2] * sv
              const s1 = occ(qx + ux, qy + uy, qz + uz)
              const s2 = occ(qx + vx, qy + vy, qz + vz)
              const cc = occ(qx + ux + vx, qy + uy + vy, qz + uz + vz)
              const val = (s1 && s2) ? 0 : 3 - (s1 + s2 + cc)
              aoBits |= val << (c * 2)
            }
            if (WINDOWS && WINDOWS[a]) aoBits = 0xff // lit glass: no AO, one quad per pane
            const e = extra ? extra[ia] : 0
            maskKey[n] = a | (e << 8) | (ind << 16) | (aoBits << 17) | (aT << 25)
          }
        }
        // greedy merge
        n = 0
        for (let j = 0; j < dv; j++) {
          for (let i = 0; i < du;) {
            const k = maskKey[n]
            if (k === 0) { i++; n++; continue }
            const aob = (k >>> 17) & 0xff
            const a0 = aob & 3, a1 = (aob >> 2) & 3, a2 = (aob >> 4) & 3, a3 = (aob >> 6) & 3
            const canU = a0 === a1 && a3 === a2
            const canV = a0 === a3 && a1 === a2
            let w = 1
            if (canU) while (i + w < du && w < 255 && maskKey[n + w] === k) w++
            let h = 1
            if (canV) {
              outer: while (j + h < dv && h < 255) {
                const row = n + h * du
                for (let t = 0; t < w; t++) if (maskKey[row + t] !== k) break outer
                h++
              }
            }
            // emit
            const mat = k & 0xff, e = (k >>> 8) & 0xff, ind = (k >>> 16) & 1, isT = (k >>> 25) & 1
            const plane = s + (dir > 0 ? 1 : 0)
            // corners in voxel coords
            for (let c = 0; c < 4; c++) {
              const cu = i + ((c === 1 || c === 2) ? w : 0)
              const cv = j + (c >= 2 ? h : 0)
              p3[d] = plane; p3[u] = cu; p3[v] = cv
              corners[c * 3] = (p3[0] - px) * scale
              corners[c * 3 + 1] = (p3[1] - py) * scale
              corners[c * 3 + 2] = (p3[2] - pz) * scale
            }
            ao[0] = a0; ao[1] = a1; ao[2] = a2; ao[3] = a3
            const buf = isT ? transparent : opaque
            buf.quad(corners, mat, dirIndex, ao, e, ind, w, h, dir > 0)
            // clear mask
            for (let hh = 0; hh < h; hh++) {
              const row = n + hh * du
              for (let t = 0; t < w; t++) maskKey[row + t] = 0
            }
            i += w; n += w
          }
        }
      }
    }
  }
  return { opaque: opaque.result(), transparent: transparent.result() }
}
