// Shared helpers for the public-buildings package: a local coordinate frame for placing
// multi-part sites (models, lights, signs, zones, interactions in building-local meters),
// facade / window builders for voxel models, figure builders, and canvas sign painters.

import { VOXEL } from '../../core/constants.js'
import { M } from '../../core/materials.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { RNG } from '../../core/rng.js'
import { SIGN_FONT, PLAIN_FONT, SERIF_FONT, HAND_FONT, drawText, ageCanvas } from '../../render/Signs.js'

export const V = VOXEL
export const HALF_PI = Math.PI / 2
export { SIGN_FONT, PLAIN_FONT, SERIF_FONT, HAND_FONT, drawText, ageCanvas }

// ---------------------------------------------------------------------------------------
// Local frame: lx → right (east at angle 0), ly → up, lz → back (south at angle 0).
// The "front" of every building in this package is its local −Z side.
// ---------------------------------------------------------------------------------------
export class Frame {
  constructor(x, y, z, angle = 0) {
    this.x = x; this.y = y; this.z = z; this.a = angle
    let c = Math.cos(angle), s = Math.sin(angle)
    if (Math.abs(c) < 1e-9) c = 0
    if (Math.abs(s) < 1e-9) s = 0
    if (Math.abs(Math.abs(c) - 1) < 1e-9) c = Math.sign(c)
    if (Math.abs(Math.abs(s) - 1) < 1e-9) s = Math.sign(s)
    this.c = c; this.s = s
  }
  wx(lx, lz) { return this.x + lx * this.c + lz * this.s }
  wz(lx, lz) { return this.z - lx * this.s + lz * this.c }
  p(lx, ly, lz) { return [this.wx(lx, lz), this.y + ly, this.wz(lx, lz)] }
  /** Local horizontal direction → world. */
  dir(nx, nz) { return [nx * this.c + nz * this.s, -nx * this.s + nz * this.c] }
  /** Sign angle (Signs convention: 0 faces +Z) for a surface whose outward local normal is (nx, nz). */
  ang(nx, nz) { const d = this.dir(nx, nz); return Math.atan2(d[0], d[1]) }
  /** Child frame at a local offset, turned by dAngle. */
  sub(lx, lz, dAngle = 0, ly = 0) { return new Frame(this.wx(lx, lz), this.y + ly, this.wz(lx, lz), this.a + dAngle) }
  /** World AABB {min, max} of a local box. */
  box(lx0, ly0, lz0, lx1, ly1, lz1) {
    const xs = [this.wx(lx0, lz0), this.wx(lx1, lz0), this.wx(lx0, lz1), this.wx(lx1, lz1)]
    const zs = [this.wz(lx0, lz0), this.wz(lx1, lz0), this.wz(lx0, lz1), this.wz(lx1, lz1)]
    return {
      min: [Math.min(...xs), this.y + Math.min(ly0, ly1), Math.min(...zs)],
      max: [Math.max(...xs), this.y + Math.max(ly0, ly1), Math.max(...zs)],
    }
  }
  /** World-axis size of a local box size (exact for quarter turns). */
  size(sx, sy, sz) {
    return [Math.abs(sx * this.c) + Math.abs(sz * this.s), sy, Math.abs(sx * this.s) + Math.abs(sz * this.c)]
  }
}

/** Resolve the frame for a public API call: {x, z, y?, rot?, angle?}. */
export function frameFor(ctx, o) {
  const angle = o.angle ?? ((o.rot ?? 0) * HALF_PI)
  let y = o.y
  if (y === undefined) {
    const h = ctx.terrain.heightAt(o.x, o.z)
    y = Number.isFinite(h) ? h : 0.25
  }
  return new Frame(o.x, y, o.z, angle)
}

/** Place a model at local (lx, lz). o: { q (extra quarter turns), da, ly, ground (use terrain height), ...placement opts } */
export function put(ctx, F, name, lx, lz, o = {}) {
  const x = F.wx(lx, lz), z = F.wz(lx, lz)
  const po = {
    x, z,
    angle: F.a + (o.q ?? 0) * HALF_PI + (o.da ?? 0),
    seed: o.seed, tint: o.tint, tag: o.tag, flag: o.flag, dynamic: o.dynamic, collide: o.collide, indoor: o.indoor,
    // every placement of this package carries static signs/lights or belongs to a composite:
    // anomaly code must not relocate it (see docs/catalog/public.md)
    userData: { pkg: 'public', noRelocate: true, ...(o.userData || {}) },
  }
  if (o.ground) {
    const h = ctx.terrain.heightAt(x, z)
    po.y = (Number.isFinite(h) ? h : F.y) + (o.ly ?? 0)
  } else po.y = F.y + (o.ly ?? 0)
  return ctx.world.place(name, po)
}

/** Add a sign on a surface with outward local normal (nx, nz) centred at local (lx, ly, lz). */
export function sign(ctx, F, lx, ly, lz, nx, nz, o) {
  const off = o.offset ?? 0.012
  const [x, y, z] = F.p(lx + nx * off, ly, lz + nz * off)
  return ctx.signs.add({ ...o, x, y, z, angle: F.ang(nx, nz) })
}

/** Readable interaction box at local (lx, ly, lz) of local size [sx, sy, sz]. note: {ru, en, title, style, footer} */
export function readable(ctx, F, lx, ly, lz, sz3, note, o = {}) {
  const [x, y, z] = F.p(lx, ly, lz)
  return ctx.interactions.add({
    x, y, z, size: F.size(sz3[0], sz3[1], sz3[2]),
    prompt: o.prompt ?? { ru: 'Читать', en: 'Read' },
    reach: o.reach ?? 2.6,
    tag: o.tag ?? 'notice',
    onUse(game) { game.ui.showNote(note) },
  })
}

/** Generic interaction at local coords. */
export function interact(ctx, F, lx, ly, lz, sz3, o) {
  const [x, y, z] = F.p(lx, ly, lz)
  return ctx.interactions.add({ ...o, x, y, z, size: F.size(sz3[0], sz3[1], sz3[2]) })
}

/** Light at local coords; o.dir is a local direction [dx, dy, dz]. */
export function light(ctx, F, lx, ly, lz, o) {
  const [x, y, z] = F.p(lx, ly, lz)
  const lo = { ...o, x, y, z }
  if (o.dir) {
    const [dx, dz] = F.dir(o.dir[0], o.dir[2])
    lo.dir = [dx, o.dir[1], dz]
  }
  return ctx.lights.add(lo)
}

/** Zone from a local box. */
export function zone(ctx, F, lx0, ly0, lz0, lx1, ly1, lz1, o) {
  const b = F.box(lx0, ly0, lz0, lx1, ly1, lz1)
  return ctx.zones.add({ ...o, min: b.min, max: b.max })
}

/** Flatten terrain under a local rectangle to absolute height y (meters), optional material. */
export function flatten(ctx, F, lx0, lz0, lx1, lz1, y, mat) {
  const b = F.box(lx0, 0, lz0, lx1, 0, lz1)
  ctx.terrain.setHeightRect(b.min[0], b.min[2], b.max[0], b.max[2], y, mat)
}

/** Paint terrain material only (keeps heights) in a local rectangle. */
export function paint(ctx, F, lx0, lz0, lx1, lz1, mat) {
  const b = F.box(lx0, 0, lz0, lx1, 0, lz1)
  ctx.terrain.paintRect(b.min[0], b.min[2], b.max[0], b.max[2], mat)
}

/** Push a pedestrian path given in local coords. */
export function navPath(ctx, F, pts, kind = 'path', extra = {}) {
  ctx.navPaths.push({ points: pts.map(([lx, lz]) => [F.wx(lx, lz), F.wz(lx, lz)]), kind, ...extra })
}

/** Append to a registry list. */
export function reg(ctx, key, item) {
  const r = ctx.registry
  if (!Array.isArray(r[key])) r[key] = []
  r[key].push(item)
  return item
}

/** Deterministic seed integer from an API seed (number 0..1, integer, or undefined). */
export function seedInt(seed, salt = 0) {
  if (seed === undefined || seed === null) return 1009 + salt
  const s = seed < 1 && seed > 0 ? Math.floor(seed * 1e6) : Math.floor(Math.abs(seed))
  return (s * 2654435761 + salt * 97) >>> 0
}
/** Instance seed 0..1 for world.place from any seed. */
export function seed01(seed, salt = 0) {
  return (seedInt(seed, salt) % 100000) / 100000
}

// ---------------------------------------------------------------------------------------
// Facade helpers (voxel space). A facade addresses the model by (u along the wall, y up,
// d depth into the wall from the outside face).
// ---------------------------------------------------------------------------------------
export function fmap(m, face, u, y, d) {
  switch (face) {
    case 'front': return [u, y, d]
    case 'back': return [u, y, m.sz - 1 - d]
    case 'left': return [d, y, u]
    case 'right': return [m.sx - 1 - d, y, u]
  }
  return [u, y, d]
}
export function fset(m, face, u, y, d, mat, extra) {
  const [x, yy, z] = fmap(m, face, u, y, d)
  m.set(x, yy, z, mat, extra)
}
export function fget(m, face, u, y, d) {
  const [x, yy, z] = fmap(m, face, u, y, d)
  return m.get(x, yy, z)
}
/** Fill a box in facade coords: [u, u+w) × [y, y+h) × [d, d+t). */
export function ffill(m, face, u, y, d, w, h, t, mat, extra) {
  for (let yy = y; yy < y + h; yy++)
    for (let uu = u; uu < u + w; uu++)
      for (let dd = d; dd < d + t; dd++) fset(m, face, uu, yy, dd, mat, extra)
}

/**
 * Window in a facade. Clears a recess of `depth` voxels, then puts frame + glass at d = depth.
 * o: { depth=1, glass (mat id), frame (mat id | 0 for none), cols (panes across), transom (row from top, 0 = none),
 *      windowId (bool: allocate EMIT_WINDOW id), snow (sill snow chance), rng, sill (mat for a 1-voxel sill under the
 *      recess bottom), extra, d0 (depth of the outer wall face from the model edge) }
 */
export function win(m, face, u, y, w, h, o = {}) {
  const depth = o.depth ?? 1
  const d0 = o.d0 ?? 0
  const glass = o.glass ?? M('pub_glass_dark')
  const frame = o.frame ?? M('window_frame_white')
  const extra = o.windowId ? m.nextWindowId() : o.extra
  ffill(m, face, u, y, d0, w, h, depth, 0)
  ffill(m, face, u, y, d0 + depth, w, h, 1, glass, extra)
  if (frame) {
    const d = d0 + depth
    for (let uu = u; uu < u + w; uu++) { fset(m, face, uu, y, d, frame); fset(m, face, uu, y + h - 1, d, frame) }
    for (let yy = y; yy < y + h; yy++) { fset(m, face, u, yy, d, frame); fset(m, face, u + w - 1, yy, d, frame) }
    const cols = o.cols ?? 1
    for (let k = 1; k < cols; k++) {
      const uu = u + Math.round((w - 1) * k / cols)
      for (let yy = y; yy < y + h; yy++) fset(m, face, uu, yy, d, frame)
    }
    if (o.transom) {
      const yy = y + h - 1 - o.transom
      for (let uu = u; uu < u + w; uu++) fset(m, face, uu, yy, d, frame)
    }
  }
  if (o.sill) for (let uu = u - 1; uu <= u + w; uu++) fset(m, face, uu, y - 1, d0, o.sill)
  if (o.snow && o.rng) {
    for (let uu = u; uu < u + w; uu++)
      if (o.rng.next() < o.snow) for (let dd = 0; dd < depth; dd++) fset(m, face, uu, y, d0 + dd, M('snow'))
  }
  return extra
}

/** Vertical grime/rust streak running down a facade from (u, y). */
export function streak(m, face, u, y, len, mat, rng, chance = 0.85) {
  for (let k = 0; k < len; k++) {
    const yy = y - k
    if (yy < 0) break
    const cur = fget(m, face, u, yy, 0)
    if (!cur || cur === M('snow')) continue
    if (rng.next() < chance) fset(m, face, u, yy, 0, mat)
  }
}

/** Random speckle replacement of material a → b on the outer layer of a facade box. */
export function speckle(m, face, u, y, w, h, from, to, chance, rng) {
  for (let yy = y; yy < y + h; yy++)
    for (let uu = u; uu < u + w; uu++)
      if (fget(m, face, uu, yy, 0) === from && rng.next() < chance) fset(m, face, uu, yy, 0, to)
}

// ---------------------------------------------------------------------------------------
// Figures (people) — 0.25 m voxels, so a person is a dense little silhouette: 3 voxels wide
// (shoulders/arms), 2 deep, 7 tall standing (1.75 m) or 6 tall seated. Built facing −Z.
// ---------------------------------------------------------------------------------------
/**
 * o: { pose: 'stand'|'sit', top, bottom, shoes, skin, hair, hat, apron, scarf, armsFront (bool: hands on counter),
 *      mop (bool), bag (mat) }
 */
export function figureModel(o = {}) {
  const top = o.top ?? M('fabric_red')
  const bottom = o.bottom ?? M('metal_dark')
  const shoes = o.shoes ?? M('rubber')
  const skin = o.skin ?? M('pub_skin')
  const hair = o.hair ?? M('wood_dark')
  if (o.pose === 'sit') {
    const m = new VoxelModel(3, 6, 4)
    // shins down at the front, thighs along z, torso at the back
    m.set(0, 0, 0, shoes); m.set(2, 0, 0, shoes)
    m.set(0, 1, 0, bottom); m.set(2, 1, 0, bottom)
    m.fill(0, 2, 0, 3, 1, 3, bottom)
    m.fill(0, 3, 1, 3, 2, 2, top)
    if (o.armsFront) { m.set(0, 3, 0, top); m.set(2, 3, 0, top) }
    m.set(1, 5, 1, skin)
    m.set(1, 5, 2, o.hat ?? hair)
    if (o.scarf) m.set(1, 4, 0, o.scarf)
    return m
  }
  const m = new VoxelModel(3, 7, 3)
  m.set(0, 0, 1, shoes); m.set(2, 0, 1, shoes)
  if (o.skirt) {
    m.set(0, 1, 1, o.legs ?? bottom); m.set(2, 1, 1, o.legs ?? bottom)
    m.fill(0, 2, 1, 3, 1, 2, o.skirt)
  } else {
    m.fill(0, 1, 1, 1, 2, 1, bottom); m.fill(2, 1, 1, 1, 2, 1, bottom)
    m.set(1, 2, 1, bottom)
  }
  m.fill(0, 3, 1, 3, 3, 2, top)
  if (o.coatLong) m.fill(0, 2, 1, 3, 1, 2, top)
  if (o.apron) { m.fill(1, 2, 0, 1, 3, 1, o.apron); m.set(0, 4, 0, o.apron); m.set(2, 4, 0, o.apron) }
  if (o.armsFront) { m.set(0, 3, 0, top); m.set(2, 3, 0, top) }
  m.set(1, 6, 1, skin)
  m.set(1, 6, 2, o.hat ?? hair)
  if (o.hat) m.set(1, 6, 2, o.hat)
  if (o.bun) m.set(1, 5, 2, hair)
  if (o.scarf) m.set(1, 5, 1, o.scarf)
  return m
}

/** Paste a figure into a model at (x, y, z); facing: 0 = −Z, 1 = −X (west at rot 0), 2 = +Z, 3 = +X. */
export function pasteFigure(m, x, y, z, facing, o) {
  const f = figureModel(o)
  m.paste(f, x, y, z, { rot: facing })
  return f
}

// ---------------------------------------------------------------------------------------
// Canvas painters for signs
// ---------------------------------------------------------------------------------------
/** Deterministic hand-written text (marker on cardboard/paper). */
export function handText(ctx, W, H, o) {
  const rng = new RNG(o.seed ?? 7)
  const lines = Array.isArray(o.lines) ? o.lines : String(o.lines).split('\n')
  if (o.bg) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, W, H) }
  const pad = W * 0.06
  const gap = 0.12
  let size = (H - pad * 2) / (lines.length + (lines.length - 1) * gap)
  if (o.size) size = Math.min(size, o.size * H)
  ctx.font = `bold ${size}px ${HAND_FONT}`
  let maxW = 0
  for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width)
  if (maxW > W - pad * 2) { size *= (W - pad * 2) / maxW; ctx.font = `bold ${size}px ${HAND_FONT}` }
  ctx.textBaseline = 'top'
  let y = (H - (size * lines.length + size * gap * (lines.length - 1))) / 2
  for (let li = 0; li < lines.length; li++) {
    const l = lines[li]
    ctx.fillStyle = Array.isArray(o.color) ? o.color[li % o.color.length] : (o.color ?? '#1a1a40')
    let w = 0
    for (const ch of l) w += ctx.measureText(ch).width
    let x = (W - w) / 2 + (rng.next() - 0.5) * W * 0.03
    const slope = (rng.next() - 0.5) * 0.05
    for (const ch of l) {
      ctx.save()
      ctx.translate(x, y + (rng.next() - 0.5) * size * 0.08 + (x - W / 2) * slope)
      ctx.rotate((rng.next() - 0.5) * 0.1)
      ctx.fillText(ch, 0, 0)
      ctx.restore()
      x += ctx.measureText(ch).width
    }
    y += size * (1 + gap)
  }
}

/** Light-box sign: coloured face, bold condensed letters, slight vignette. */
export function lightBox(o) {
  return (ctx, W, H) => {
    ctx.fillStyle = o.bg ?? '#efeee6'
    ctx.fillRect(0, 0, W, H)
    if (o.band) { ctx.fillStyle = o.band; ctx.fillRect(0, H * 0.82, W, H * 0.18) }
    drawText(ctx, W, H * (o.band ? 0.82 : 1), { lines: o.lines, color: o.color ?? '#b32020', font: o.font ?? SIGN_FONT, weight: 'bold', pad: H * 0.1, lineGap: 0.12 })
    // dim corners: uneven tubes behind the acrylic
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.6)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, `rgba(40,30,20,${o.vignette ?? 0.25})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    if (o.dead) {
      // a dead tube section: darker band
      ctx.fillStyle = 'rgba(30,25,20,0.35)'
      ctx.fillRect(W * o.dead[0], 0, W * (o.dead[1] - o.dead[0]), H)
    }
  }
}

/** Price tag «ценник»: product, price, small print. */
export function priceTag(o) {
  return (ctx, W, H) => {
    ctx.fillStyle = o.promo ? '#e8cf4a' : '#f2f0e6'
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = '#555'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1)
    ctx.fillStyle = '#222'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    let fs = Math.max(6, H * 0.2)
    ctx.font = `bold ${fs}px ${PLAIN_FONT}`
    const name = o.name
    if (ctx.measureText(name).width > W * 0.92) { fs *= (W * 0.92) / ctx.measureText(name).width; ctx.font = `bold ${fs}px ${PLAIN_FONT}` }
    ctx.fillText(name, W * 0.04, H * 0.06)
    ctx.textAlign = 'right'
    ctx.font = `bold ${H * 0.42}px ${SIGN_FONT}`
    ctx.fillStyle = o.promo ? '#a01010' : '#111'
    ctx.fillText(o.price, W * 0.96, H * 0.33)
    ctx.textAlign = 'left'
    ctx.font = `${H * 0.13}px ${PLAIN_FONT}`
    ctx.fillStyle = '#444'
    ctx.fillText(o.unit ?? 'за 1 шт.', W * 0.04, H * 0.5)
    ctx.fillText(o.small ?? 'Россия  12.12.08', W * 0.04, H * 0.8)
  }
}

/** Soviet "Не влезай — убьёт!" danger plate. */
export function dangerPlate(ctx, W, H) {
  ctx.fillStyle = '#e6e1d2'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = '#b01c16'
  ctx.lineWidth = Math.max(2, W * 0.05)
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth)
  // red zig-zag lightning arrow
  ctx.fillStyle = '#c0201a'
  ctx.beginPath()
  const cx = W / 2, top = H * 0.12
  ctx.moveTo(cx + W * 0.06, top)
  ctx.lineTo(cx - W * 0.08, top + H * 0.26)
  ctx.lineTo(cx + W * 0.02, top + H * 0.26)
  ctx.lineTo(cx - W * 0.05, top + H * 0.46)
  ctx.lineTo(cx + W * 0.1, top + H * 0.2)
  ctx.lineTo(cx + W * 0.0, top + H * 0.2)
  ctx.lineTo(cx + W * 0.12, top)
  ctx.closePath()
  ctx.fill()
  drawText(ctx, W, H, { lines: ['НЕ ВЛЕЗАЙ', 'УБЬЁТ!'], color: '#111', valign: 'bottom', pad: H * 0.08, lineGap: 0.05, size: 0.17 })
}

/** Painted mural (kindergarten): faded sun, hills, a hedgehog and a balloon in tempera colours. */
export function muralPainter(seed = 1, kind = 'sun') {
  return (ctx, W, H) => {
    const rng = new RNG(seed)
    ctx.fillStyle = '#9fb3b8'
    ctx.fillRect(0, 0, W, H)
    // hills
    ctx.fillStyle = '#7d9a64'
    ctx.beginPath(); ctx.moveTo(0, H)
    for (let x = 0; x <= W; x += W / 12) ctx.lineTo(x, H * 0.62 + Math.sin(x / W * 5 + seed) * H * 0.08)
    ctx.lineTo(W, H); ctx.fill()
    // sun with rays
    ctx.fillStyle = '#d8b44a'
    const sx = W * (0.15 + rng.next() * 0.2), sy = H * 0.28
    ctx.beginPath(); ctx.arc(sx, sy, H * 0.14, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#d8b44a'; ctx.lineWidth = H * 0.03
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2
      ctx.beginPath(); ctx.moveTo(sx + Math.cos(a) * H * 0.18, sy + Math.sin(a) * H * 0.18)
      ctx.lineTo(sx + Math.cos(a) * H * 0.26, sy + Math.sin(a) * H * 0.26); ctx.stroke()
    }
    if (kind === 'sun' || kind === 'hedgehog') {
      // hedgehog with an apple
      const hx = W * 0.62, hy = H * 0.72
      ctx.fillStyle = '#6b5440'
      ctx.beginPath(); ctx.ellipse(hx, hy, W * 0.1, H * 0.1, 0, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#4a3a2c'; ctx.lineWidth = 2
      for (let k = 0; k < 14; k++) {
        const a = Math.PI + k / 13 * Math.PI
        ctx.beginPath(); ctx.moveTo(hx + Math.cos(a) * W * 0.08, hy + Math.sin(a) * H * 0.08)
        ctx.lineTo(hx + Math.cos(a) * W * 0.12, hy + Math.sin(a) * H * 0.14); ctx.stroke()
      }
      ctx.fillStyle = '#c9a888'
      ctx.beginPath(); ctx.ellipse(hx + W * 0.1, hy + H * 0.02, W * 0.035, H * 0.04, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#a8403a'
      ctx.beginPath(); ctx.arc(hx, hy - H * 0.13, H * 0.05, 0, Math.PI * 2); ctx.fill()
    }
    if (kind === 'balloon' || kind === 'sun') {
      const bx = W * 0.85, by = H * 0.3
      ctx.fillStyle = '#b4504a'
      ctx.beginPath(); ctx.ellipse(bx, by, W * 0.05, H * 0.1, 0, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#444'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(bx, by + H * 0.1); ctx.quadraticCurveTo(bx - W * 0.03, by + H * 0.3, bx + W * 0.01, by + H * 0.45); ctx.stroke()
    }
    if (kind === 'boat') {
      ctx.fillStyle = '#5a7ea0'
      ctx.fillRect(0, H * 0.7, W, H * 0.3)
      ctx.fillStyle = '#a8503c'
      ctx.beginPath(); ctx.moveTo(W * 0.4, H * 0.7); ctx.lineTo(W * 0.7, H * 0.7); ctx.lineTo(W * 0.65, H * 0.8); ctx.lineTo(W * 0.45, H * 0.8); ctx.fill()
      ctx.fillStyle = '#e0dccc'
      ctx.beginPath(); ctx.moveTo(W * 0.55, H * 0.35); ctx.lineTo(W * 0.55, H * 0.68); ctx.lineTo(W * 0.68, H * 0.68); ctx.fill()
    }
    // peeling paint: patches of bare plaster
    for (let k = 0; k < 18; k++) {
      ctx.fillStyle = `rgba(190,186,172,${0.5 + rng.next() * 0.4})`
      const px = rng.next() * W, py = rng.next() * H
      ctx.beginPath(); ctx.ellipse(px, py, 2 + rng.next() * W * 0.05, 2 + rng.next() * H * 0.04, rng.next() * 3, 0, Math.PI * 2); ctx.fill()
    }
    ageCanvas(ctx, W, H, 0.7, seed)
  }
}
