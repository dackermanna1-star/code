// Heightfield terrain made of voxel columns (one column per 0.25 m cell).
//
// Height h (in voxels) means the column is solid for voxel rows [h - CRUST, h) and its top
// surface is at y = h * VOXEL meters. Only a thin crust collides so underground spaces
// (underpass, metro) can live below it; holes remove the column entirely (stair pits).
//
// All public painting methods take METERS. Rectangles are [x0,x1) × [z0,z1) in meters.

import * as THREE from 'three'
import { VOXEL, TERRAIN_CELLS } from './constants.js'
import { M, SURFACE } from './materials.js'
import { MeshBuffers, voxelGeometry } from './mesher.js'
import { fbm2, hashf } from './rng.js'

export const HOLE = -32768
export const CRUST = 6
const REGION = 128 // cells per render region side (32 m)

export class Terrain {
  constructor(cells = TERRAIN_CELLS) {
    this.n = cells
    this.h = new Int16Array(cells * cells)
    this.mat = new Uint8Array(cells * cells)
    this.occ = new Uint8Array(cells * cells) // object contact occupancy (set during finalize)
    this.soft = null // soft AO distance field (Uint8), computed in buildMeshes
    this.mat.fill(M('snow'))
    this.meshes = []
  }

  // ---- coordinate helpers ------------------------------------------------------------
  c(x) { return Math.floor(x / VOXEL) }
  inside(cx, cz) { return cx >= 0 && cz >= 0 && cx < this.n && cz < this.n }
  i(cx, cz) { return cx + cz * this.n }

  /** Surface height in meters at world (x, z). Holes return -Infinity. */
  heightAt(x, z) {
    const cx = Math.floor(x / VOXEL), cz = Math.floor(z / VOXEL)
    if (!this.inside(cx, cz)) return 0
    const h = this.h[cx + cz * this.n]
    return h === HOLE ? -Infinity : h * VOXEL
  }
  /** Height in voxels at cell (HOLE for holes, 0 outside). */
  hCell(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= this.n || cz >= this.n) return 0
    return this.h[cx + cz * this.n]
  }
  materialAt(x, z) {
    const cx = Math.floor(x / VOXEL), cz = Math.floor(z / VOXEL)
    if (!this.inside(cx, cz)) return 0
    return this.mat[cx + cz * this.n]
  }
  surfaceAt(x, z) { return SURFACE[this.materialAt(x, z)] }

  /** Voxel-space solidity (integer voxel coords). */
  solidVoxel(vx, vy, vz) {
    if (vx < 0 || vz < 0 || vx >= this.n || vz >= this.n) return vy < 0 && vy >= -CRUST
    const h = this.h[vx + vz * this.n]
    if (h === HOLE) return false
    return vy < h && vy >= h - CRUST
  }

  // ---- painting ------------------------------------------------------------------------
  _rect(x0, z0, x1, z1, fn) {
    const cx0 = Math.max(0, Math.round(Math.min(x0, x1) / VOXEL)), cx1 = Math.min(this.n, Math.round(Math.max(x0, x1) / VOXEL))
    const cz0 = Math.max(0, Math.round(Math.min(z0, z1) / VOXEL)), cz1 = Math.min(this.n, Math.round(Math.max(z0, z1) / VOXEL))
    for (let cz = cz0; cz < cz1; cz++)
      for (let cx = cx0; cx < cx1; cx++) fn(cx, cz, cx + cz * this.n)
  }

  /** Set material in a rect. */
  paintRect(x0, z0, x1, z1, mat) {
    this._rect(x0, z0, x1, z1, (cx, cz, i) => { if (this.h[i] !== HOLE) this.mat[i] = mat })
  }

  /** Set absolute height (meters, snapped to voxels) and optionally material in a rect. */
  setHeightRect(x0, z0, x1, z1, heightM, mat) {
    const hv = Math.round(heightM / VOXEL)
    this._rect(x0, z0, x1, z1, (cx, cz, i) => { this.h[i] = hv; if (mat) this.mat[i] = mat })
  }

  /** Add height (meters) in a rect. */
  raiseRect(x0, z0, x1, z1, dM, mat) {
    const dv = Math.round(dM / VOXEL)
    this._rect(x0, z0, x1, z1, (cx, cz, i) => { if (this.h[i] !== HOLE) { this.h[i] += dv; if (mat) this.mat[i] = mat } })
  }

  /** Remove terrain in a rect (opening for underground stairs). */
  holeRect(x0, z0, x1, z1) {
    this._rect(x0, z0, x1, z1, (cx, cz, i) => { this.h[i] = HOLE })
  }

  /**
   * Paint along a segment with given width (meters). opts: { mat, height (abs m), raise (m),
   * only: Set<matId> (only overwrite these materials) }
   */
  paintLine(x0, z0, x1, z1, width, opts) {
    const dx = x1 - x0, dz = z1 - z0
    const len2 = dx * dx + dz * dz || 1e-6
    const r = width / 2
    const minX = Math.min(x0, x1) - r, maxX = Math.max(x0, x1) + r
    const minZ = Math.min(z0, z1) - r, maxZ = Math.max(z0, z1) + r
    const hv = opts.height !== undefined ? Math.round(opts.height / VOXEL) : null
    const rv = opts.raise !== undefined ? Math.round(opts.raise / VOXEL) : 0
    this._rect(minX, minZ, maxX, maxZ, (cx, cz, i) => {
      const px = (cx + 0.5) * VOXEL, pz = (cz + 0.5) * VOXEL
      let t = ((px - x0) * dx + (pz - z0) * dz) / len2
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const ex = x0 + dx * t - px, ez = z0 + dz * t - pz
      if (ex * ex + ez * ez > r * r) return
      if (this.h[i] === HOLE) return
      if (opts.only && !opts.only.has(this.mat[i])) return
      if (opts.mat) this.mat[i] = opts.mat
      if (hv !== null) this.h[i] = hv
      if (rv) this.h[i] += rv
    })
  }

  /** Paint a disc. opts as paintLine. */
  paintCircle(cx, cz, r, opts) { this.paintLine(cx, cz, cx + 1e-4, cz, r * 2, opts) }

  /**
   * Smooth mound (snow pile/drift). heightM at center falling off to 0 at radius. Elliptical
   * radii rx, rz in meters; adds to current height. Optional noise for lumpy snow.
   */
  mound(cx, cz, rx, rz, heightM, mat, noise = 0.3, seed = 7) {
    this._rect(cx - rx, cz - rz, cx + rx, cz + rz, (x, z, i) => {
      if (this.h[i] === HOLE) return
      const px = (x + 0.5) * VOXEL, pz = (z + 0.5) * VOXEL
      const dx = (px - cx) / rx, dz = (pz - cz) / rz
      let d = 1 - (dx * dx + dz * dz)
      if (d <= 0) return
      d = d * d * (3 - 2 * d)
      const n = 1 + noise * (fbm2(px * 0.8, pz * 0.8, 3, seed) - 0.5) * 2
      const add = Math.round((heightM * d * n) / VOXEL)
      if (add > 0) { this.h[i] += add; if (mat) this.mat[i] = mat }
    })
  }

  /** Generic per-cell function in a rect: fn(x, z, hVoxels, mat) → {h, mat} | null (meters for x,z). */
  apply(x0, z0, x1, z1, fn) {
    this._rect(x0, z0, x1, z1, (cx, cz, i) => {
      const r = fn((cx + 0.5) * VOXEL, (cz + 0.5) * VOXEL, this.h[i], this.mat[i])
      if (!r) return
      if (r.h !== undefined) this.h[i] = r.h
      if (r.mat !== undefined) this.mat[i] = r.mat
    })
  }

  markOccupied(cx, cz) { if (this.inside(cx, cz)) this.occ[cx + cz * this.n] = 1 }

  // ---- meshing -----------------------------------------------------------------------
  _computeSoftAO() {
    const n = this.n, H = this.h, occ = this.occ
    const dist = new Uint8Array(n * n)
    // seed: cells that are occupied or next to a taller column
    for (let cz = 0; cz < n; cz++)
      for (let cx = 0; cx < n; cx++) {
        const i = cx + cz * n
        const h = H[i]
        let seed = occ[i] === 1
        if (!seed && h !== HOLE) {
          if ((cx > 0 && H[i - 1] > h + 1) || (cx < n - 1 && H[i + 1] > h + 1) ||
            (cz > 0 && H[i - n] > h + 1) || (cz < n - 1 && H[i + n] > h + 1)) seed = true
        }
        dist[i] = seed ? 0 : 60
      }
    // chamfer (3,4) two-pass
    for (let cz = 0; cz < n; cz++)
      for (let cx = 0; cx < n; cx++) {
        const i = cx + cz * n
        let d = dist[i]
        if (cx > 0) d = Math.min(d, dist[i - 1] + 3)
        if (cz > 0) {
          d = Math.min(d, dist[i - n] + 3)
          if (cx > 0) d = Math.min(d, dist[i - n - 1] + 4)
          if (cx < n - 1) d = Math.min(d, dist[i - n + 1] + 4)
        }
        dist[i] = d
      }
    for (let cz = n - 1; cz >= 0; cz--)
      for (let cx = n - 1; cx >= 0; cx--) {
        const i = cx + cz * n
        let d = dist[i]
        if (cx < n - 1) d = Math.min(d, dist[i + 1] + 3)
        if (cz < n - 1) {
          d = Math.min(d, dist[i + n] + 3)
          if (cx < n - 1) d = Math.min(d, dist[i + n + 1] + 4)
          if (cx > 0) d = Math.min(d, dist[i + n - 1] + 4)
        }
        dist[i] = d
      }
    this.soft = dist
  }

  _occluder(cx, cz, h) {
    if (cx < 0 || cz < 0 || cx >= this.n || cz >= this.n) return 0
    const i = cx + cz * this.n
    if (this.occ[i]) return 1
    const nh = this.h[i]
    return nh !== HOLE && nh > h ? 1 : 0
  }

  /** Build THREE meshes for all regions. Returns array of THREE.Mesh. */
  buildMeshes(material) {
    this._computeSoftAO()
    const n = this.n
    const meshes = []
    for (let rz = 0; rz < n; rz += REGION)
      for (let rx = 0; rx < n; rx += REGION) {
        const buf = this._meshRegion(rx, rz, Math.min(REGION, n - rx), Math.min(REGION, n - rz))
        const r = buf.result()
        if (!r) continue
        const g = voxelGeometry(THREE, r)
        const mesh = new THREE.Mesh(g, material)
        mesh.matrixAutoUpdate = false
        mesh.name = `terrain_${rx}_${rz}`
        meshes.push(mesh)
      }
    this.meshes = meshes
    return meshes
  }

  _meshRegion(rx, rz, w, d) {
    const n = this.n, H = this.h, MAT = this.mat, soft = this.soft
    const buf = new MeshBuffers()
    const key = new Int32Array(w * d)
    const hgt = new Int16Array(w * d)
    const corners = new Float32Array(12)
    const ao = [3, 3, 3, 3]
    // --- top faces
    for (let z = 0; z < d; z++)
      for (let x = 0; x < w; x++) {
        const cx = rx + x, cz = rz + z, i = cx + cz * n
        const h = H[i]
        const k = x + z * w
        if (h === HOLE) { key[k] = 0; continue }
        let bits = 0
        for (let c = 0; c < 4; c++) {
          const su = (c === 1 || c === 2) ? 1 : -1
          const sv = c >= 2 ? 1 : -1
          const s1 = this._occluder(cx + su, cz, h)
          const s2 = this._occluder(cx, cz + sv, h)
          const cc = this._occluder(cx + su, cz + sv, h)
          let val = (s1 && s2) ? 0 : 3 - (s1 + s2 + cc)
          // soft contact AO from the distance field, sampled at the corner
          const sx = cx + (su > 0 ? 1 : 0), sz = cz + (sv > 0 ? 1 : 0)
          let dmin = 255
          for (let oz = -1; oz <= 0; oz++)
            for (let ox = -1; ox <= 0; ox++) {
              const ax = sx + ox, az = sz + oz
              if (ax >= 0 && az >= 0 && ax < n && az < n) dmin = Math.min(dmin, soft[ax + az * n])
            }
          const sl = dmin < 4 ? 1 : dmin < 8 ? 2 : 3
          if (sl < val) val = sl
          bits |= val << (c * 2)
        }
        key[k] = MAT[i] | (bits << 8)
        hgt[k] = h
      }
    // greedy merge of top faces (axis u = z? we use x as u, z as v; normal +Y)
    // For +Y normal with d=1: u = z (axis 2), v = x (axis 0) in the model mesher convention.
    // Here we emit directly with explicit winding, so any orientation works.
    for (let z = 0; z < d; z++)
      for (let x = 0; x < w;) {
        const k0 = x + z * w
        const kk = key[k0]
        if (kk === 0) { x++; continue }
        const hh = hgt[k0]
        const aob = kk >>> 8
        const a0 = aob & 3, a1 = (aob >> 2) & 3, a2 = (aob >> 4) & 3, a3 = (aob >> 6) & 3
        const canX = a0 === a1 && a3 === a2
        const canZ = a0 === a3 && a1 === a2
        let ww = 1
        if (canX) while (x + ww < w && ww < 255 && key[k0 + ww] === kk && hgt[k0 + ww] === hh) ww++
        let dd = 1
        if (canZ) {
          outer: while (z + dd < d && dd < 255) {
            const row = k0 + dd * w
            for (let t = 0; t < ww; t++) if (key[row + t] !== kk || hgt[row + t] !== hh) break outer
            dd++
          }
        }
        const y = hh * VOXEL
        const X0 = (rx + x) * VOXEL, X1 = (rx + x + ww) * VOXEL
        const Z0 = (rz + z) * VOXEL, Z1 = (rz + z + dd) * VOXEL
        // corners: c0 (x-,z-), c1 (x+,z-), c2 (x+,z+), c3 (x-,z+)
        corners[0] = X0; corners[1] = y; corners[2] = Z0
        corners[3] = X1; corners[4] = y; corners[5] = Z0
        corners[6] = X1; corners[7] = y; corners[8] = Z1
        corners[9] = X0; corners[10] = y; corners[11] = Z1
        ao[0] = a0; ao[1] = a1; ao[2] = a2; ao[3] = a3
        // c0→c1→c2 is (x+, then z+): cross((1,0,0),(0,0,1)) = (0,-1,0) → back-facing for +Y,
        // so emit with front=false to get +Y facing triangles.
        buf.quad(corners, kk & 0xff, 2, ao, 0, 0, ww, dd, false)
        for (let t = 0; t < dd; t++) key.fill(0, k0 + t * w, k0 + t * w + ww)
        x += ww
      }
    // --- side faces (merge runs along the edge)
    const sideAO = [3, 3, 3, 3]
    const deep = M('concrete_dark')
    const emitSide = (axis, sign) => {
      // axis 'x': faces normal ±X between cell (cx) and (cx+sign); runs along z
      const outerLen = axis === 'x' ? w : d
      const innerLen = axis === 'x' ? d : w
      for (let a = 0; a < outerLen; a++) {
        let run = null
        const flush = () => {
          if (!run) return
          this._sideQuad(buf, axis, sign, run, corners)
          run = null
        }
        for (let b = 0; b < innerLen; b++) {
          const cx = axis === 'x' ? rx + a : rx + b
          const cz = axis === 'x' ? rz + b : rz + a
          const i = cx + cz * n
          const h = H[i]
          if (h === HOLE) { flush(); continue }
          const nx = axis === 'x' ? cx + sign : cx, nz = axis === 'x' ? cz : cz + sign
          let nh
          if (nx < 0 || nz < 0 || nx >= n || nz >= n) nh = h - 2
          else { nh = H[nx + nz * n]; if (nh === HOLE) nh = h - 48 }
          if (nh >= h) { flush(); continue }
          const lo = Math.max(nh, h - 48)
          const mat = MAT[i]
          if (run && run.h === h && run.lo === lo && run.mat === mat && run.end === b) { run.end = b + 1; continue }
          flush()
          run = { cx, cz, h, lo, mat, start: b, end: b + 1, deep }
        }
        flush()
      }
    }
    emitSide('x', 1); emitSide('x', -1); emitSide('z', 1); emitSide('z', -1)
    void sideAO
    return buf
  }

  _sideQuad(buf, axis, sign, run, corners) {
    const len = run.end - run.start
    const ao = [3, 3, 3, 3]
    const parts = []
    // top voxel band in the cell's material; anything deeper in dark concrete
    const topLo = Math.max(run.lo, run.h - 2)
    parts.push([topLo, run.h, run.mat])
    if (topLo > run.lo) parts.push([run.lo, topLo, run.deep])
    for (const [y0v, y1v, mat] of parts) {
      const y0 = y0v * VOXEL, y1 = y1v * VOXEL
      if (axis === 'x') {
        const X = (run.cx + (sign > 0 ? 1 : 0)) * VOXEL
        const Z0 = run.cz * VOXEL, Z1 = (run.cz + len) * VOXEL
        // corners along (z, y)
        corners[0] = X; corners[1] = y0; corners[2] = Z0
        corners[3] = X; corners[4] = y0; corners[5] = Z1
        corners[6] = X; corners[7] = y1; corners[8] = Z1
        corners[9] = X; corners[10] = y1; corners[11] = Z0
        // c0→c1 = +z, c1→c2 = +y: cross((0,0,1),(0,1,0)) = (-1,0,0)
        buf.quad(corners, mat, sign > 0 ? 0 : 1, ao, 0, 0, len, y1v - y0v, sign < 0)
      } else {
        const Z = (run.cz + (sign > 0 ? 1 : 0)) * VOXEL
        const X0 = run.cx * VOXEL, X1 = (run.cx + len) * VOXEL
        corners[0] = X0; corners[1] = y0; corners[2] = Z
        corners[3] = X1; corners[4] = y0; corners[5] = Z
        corners[6] = X1; corners[7] = y1; corners[8] = Z
        corners[9] = X0; corners[10] = y1; corners[11] = Z
        // c0→c1 = +x, c1→c2 = +y: cross((1,0,0),(0,1,0)) = (0,0,1)
        buf.quad(corners, mat, sign > 0 ? 4 : 5, ao, 0, 0, len, y1v - y0v, sign > 0)
      }
    }
  }

  /** Low-res heightmap texture for effects (snow occlusion etc.) is built by World. */
  dispose() { for (const m of this.meshes) m.geometry.dispose() }
}

// tiny deterministic jitter helper for content code
export function cellNoise(x, z, seed = 0) { return hashf(Math.floor(x / VOXEL), Math.floor(z / VOXEL), seed) }
