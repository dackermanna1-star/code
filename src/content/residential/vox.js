// Small voxel helpers shared by the residential builders.

import { M } from '../../core/materials.js'

let _mat = null
/** Material ids, resolved lazily (all materials exist once the module graph has loaded). */
export function MAT() {
  if (_mat) return _mat
  const n = [
    'snow', 'snow_fresh', 'ice', 'concrete', 'concrete_dark', 'concrete_light', 'panel_white', 'panel_gray',
    'panel_beige', 'panel_seam', 'tile_blue', 'tile_teal', 'tile_brown', 'tile_cream', 'brick_red', 'brick_silicate',
    'roof_tar', 'metal_dark', 'metal_gray', 'metal_rust', 'metal_green', 'metal_blue', 'metal_red', 'metal_yellow',
    'metal_brown', 'chrome', 'wood', 'wood_dark', 'wood_painted_green', 'wood_painted_blue', 'rubber', 'window',
    'glass_clear', 'glass_frosted', 'window_frame_white', 'window_frame_brown', 'window_frame_wood', 'lamp_warm',
    'lamp_bulb', 'fluorescent', 'lamp_red', 'paint', 'paint_matte', 'linoleum', 'floor_tile', 'floor_tile_red',
    'wall_paint_green', 'wall_paint_blue', 'wall_paint_brown', 'whitewash', 'wall_tile_white', 'wall_tile_beige',
    'leatherette', 'fabric_red', 'plastic_white', 'plastic_dark', 'paper',
    'res_tile_white', 'res_panel_cream', 'res_seam', 'res_mastic', 'res_plinth', 'res_rust_stain', 'res_siding',
    'res_terrazzo', 'res_stair_glow', 'res_stair_glow_hi', 'res_laminate', 'res_leather_red', 'res_cloth',
  ]
  _mat = {}
  for (const k of n) _mat[k] = M(k)
  return _mat
}

/**
 * A facade view onto a section model: u runs along the facade, y up, w is the wall layer
 * (0 = outermost wall layer, positive = deeper into the building, negative = outside).
 */
export class Face {
  constructor(m, L, side) {
    this.m = m; this.L = L; this.side = side
    const { F, D, SX } = L
    if (side === 'front') { this.len = SX; this._x = (u, w) => u; this._z = (u, w) => F + w }
    else if (side === 'back') { this.len = SX; this._x = (u, w) => u; this._z = (u, w) => F + D - 1 - w }
    else if (side === 'left') { this.len = D; this._x = (u, w) => w; this._z = (u, w) => F + u }
    else { this.len = D; this._x = (u, w) => SX - 1 - w; this._z = (u, w) => F + u }
  }
  set(u, y, w, mat, e) { this.m.set(this._x(u, w), y, this._z(u, w), mat, e) }
  get(u, y, w) { return this.m.get(this._x(u, w), y, this._z(u, w)) }
  /** Box in facade coordinates, size semantics. */
  fill(u, y, w, du, dy, dw, mat, e) {
    if (du <= 0 || dy <= 0 || dw <= 0) return
    const x0 = this._x(u, w), x1 = this._x(u + du - 1, w + dw - 1)
    const z0 = this._z(u, w), z1 = this._z(u + du - 1, w + dw - 1)
    this.m.fill(Math.min(x0, x1), y, Math.min(z0, z1), Math.abs(x1 - x0) + 1, dy, Math.abs(z1 - z0) + 1, mat, e)
  }
  /** Replace material `a` by `b` inside a facade box. */
  replace(u, y, w, du, dy, dw, a, b) {
    for (let yy = y; yy < y + dy; yy++)
      for (let ww = w; ww < w + dw; ww++)
        for (let uu = u; uu < u + du; uu++) if (this.get(uu, yy, ww) === a) this.set(uu, yy, ww, b)
  }
}

/**
 * Apartment window: glass recessed one layer behind an opening that is one voxel larger on every
 * side, so the glass forms a single quad (the lit-room shader needs whole panes) and the ring
 * around it reads as the frame. A sill sticks out below. Returns the window id.
 */
export function drawWindow(fc, u0, y0, gw, gh, o = {}) {
  const T = MAT()
  const wb = o.wb ?? 0
  const frame = o.frame ?? T.window_frame_white
  const glass = o.glass ?? T.window
  const id = o.id ?? (glass === T.window ? fc.m.nextWindowId() : (o.extra ?? 0))
  fc.fill(u0 - 1, y0 - 1, wb, gw + 2, gh + 2, 1, 0)
  fc.fill(u0 - 1, y0 - 1, wb + 1, gw + 2, gh + 2, 1, frame)
  fc.fill(u0, y0, wb + 1, gw, gh, o.plug ?? 3, glass, id)
  if (o.sill !== false) fc.fill(u0 - 1, y0 - 2, wb - 1, gw + 2, 1, 1, o.sillMat ?? T.metal_gray)
  return id
}

/** Outdoor-air flood fill from the model's sides and top; interiors and solids block it. */
export function outdoorMask(m) {
  const { sx, sy, sz } = m
  const n = sx * sy * sz
  const out = new Uint8Array(n)
  const inter = m.interiorMask()
  const data = m.data
  const q = new Int32Array(n)
  let qh = 0, qt = 0
  const push = i => { if (!out[i] && !data[i] && !(inter && inter[i])) { out[i] = 1; q[qt++] = i } }
  for (let y = 0; y < sy; y++)
    for (let z = 0; z < sz; z++)
      for (let x = 0; x < sx; x++) {
        if (x === 0 || z === 0 || x === sx - 1 || z === sz - 1 || y === sy - 1) push(x + sx * (z + sz * y))
      }
  const sxz = sx * sz
  while (qh < qt) {
    const i = q[qh++]
    const y = (i / sxz) | 0
    const r = i - y * sxz
    const z = (r / sx) | 0
    const x = r - z * sx
    if (x > 0) push(i - 1)
    if (x < sx - 1) push(i + 1)
    if (z > 0) push(i - sx)
    if (z < sz - 1) push(i + sx)
    if (y > 0) push(i - sxz)
    if (y < sy - 1) push(i + sxz)
  }
  return out
}

/**
 * Snow on every exposed top that faces outdoor air: deep on surfaces open to the sky, thinner
 * and patchier under overhangs (window sills, balcony floors, railings).
 * opts: { rng, skip: Set(matIds) not to snow on, exclude(x,y,z) → bool, roofDepth, ledgeChance }
 */
export function snowPass(m, opts) {
  const T = MAT()
  const rng = opts.rng
  const out = outdoorMask(m)
  const { sx, sy, sz } = m
  const sxz = sx * sz
  const snowMat = opts.mat ?? T.snow
  const skip = opts.skip
  for (let z = 0; z < sz; z++)
    for (let x = 0; x < sx; x++) {
      let open = true
      for (let y = sy - 2; y >= 1; y--) {
        const i = x + sx * (z + sz * y)
        const mat = m.data[i]
        if (!mat) continue
        const above = i + sxz
        if (out[above] && !(skip && skip.has(mat)) && !(opts.exclude && opts.exclude(x, y, z))) {
          if (open) {
            let d = opts.roofDepth ? opts.roofDepth(x, y, z) : 1
            for (let k = 1; k <= d && y + k < sy; k++) if (!m.data[i + k * sxz]) m.data[i + k * sxz] = snowMat
          } else if (rng.next() < (opts.ledgeChance ?? 0.6)) {
            m.data[above] = snowMat
          }
        }
        open = false
      }
    }
}
