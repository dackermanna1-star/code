// Frozen pond kit: a shallow bowl of ice with wind-swept dark patches, white cracks, drifted
// snow, a patch cleared by kids for hockey, reeds and cattails along the shore, a trodden path
// around it, a trail of footprints across the ice despite the sign «Выход на лёд запрещён!».

import { RNG, fbm2, valueNoise2, smoothstep, hash2 } from '../../core/rng.js'
import { VOXEL } from '../../core/constants.js'
import { MAT } from './materials.js'
import { PLANTS } from './plants.js'
import { natureState } from './state.js'
import { SIGN_FONT } from '../../render/Signs.js'

const TAU = Math.PI * 2
const ICE = new Set([MAT.icePond, MAT.iceDark])

export const POND_SIGN = {
  ru: 'ВЫХОД НА ЛЁД ЗАПРЕЩЁН!',
  en: 'Walking on the ice is prohibited!',
  footer: { ru: 'Управа района «Восточный»', en: 'Vostochny District Council' },
}

function drawPondSign(c, W, H) {
  c.fillStyle = '#e9e6dc'
  c.fillRect(0, 0, W, H)
  c.strokeStyle = '#a3241c'
  c.lineWidth = Math.max(2, H * 0.05)
  c.strokeRect(c.lineWidth / 2, c.lineWidth / 2, W - c.lineWidth, H - c.lineWidth)
  // pictogram: a figure on ice, crossed out
  const r = H * 0.3, cx = W * 0.2, cy = H * 0.48
  c.fillStyle = '#1d1d1d'
  c.fillRect(cx - r * 0.12, cy - r * 0.5, r * 0.24, r * 0.75)
  c.beginPath(); c.arc(cx, cy - r * 0.68, r * 0.17, 0, TAU); c.fill()
  c.fillRect(cx - r * 0.55, cy + r * 0.32, r * 1.1, r * 0.1)
  c.strokeStyle = '#a3241c'
  c.lineWidth = r * 0.16
  c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.stroke()
  c.beginPath(); c.moveTo(cx - r * 0.7, cy - r * 0.7); c.lineTo(cx + r * 0.7, cy + r * 0.7); c.stroke()
  // text
  c.fillStyle = '#a3241c'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  const tx = W * 0.64
  c.font = `bold ${Math.round(H * 0.2)}px ${SIGN_FONT}`
  c.fillText('ВЫХОД', tx, H * 0.22)
  c.fillText('НА ЛЁД', tx, H * 0.44)
  c.fillText('ЗАПРЕЩЁН!', tx, H * 0.66)
  c.fillStyle = '#333'
  c.font = `${Math.round(H * 0.085)}px ${SIGN_FONT}`
  c.fillText('Управа района «Восточный»', tx, H * 0.86)
}

/**
 * Frozen pond. o: { x, z, rx, rz (half-axes, m), seed, depth (bowl depth below the shore, default
 * 0.5 m), sign (true | {angle}), reeds (true), path (true), trail (true), rink (auto: ponds wider
 * than 22 m), avoid(x,z) (keep reeds/path off these spots) }
 * Returns { x, z, rx, rz, iceY, contains(x,z), shapeAt(x,z) }.
 */
export function placePond(ctx, o) {
  const s = natureState(ctx)
  const t = ctx.terrain
  const { x, z } = o
  const rx = o.rx ?? 12, rz = o.rz ?? 9
  const seed = o.seed ?? hash2(Math.round(x), Math.round(z))
  const rng = new RNG(seed)
  const ph = [rng.float(0, TAU), rng.float(0, TAU), rng.float(0, TAU)]
  const shape = (px, pz) => {
    const dx = (px - x) / rx, dz = (pz - z) / rz
    const th = Math.atan2(dz, dx)
    const R = 1 + 0.1 * Math.sin(2 * th + ph[0]) + 0.07 * Math.sin(3 * th + ph[1]) + 0.04 * Math.sin(5 * th + ph[2])
    return Math.hypot(dx, dz) / R
  }
  // shore level: the lowest ground around the rim
  let rim = Infinity
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * TAU
    const h = t.heightAt(x + Math.cos(a) * rx * 1.25, z + Math.sin(a) * rz * 1.25)
    if (Number.isFinite(h)) rim = Math.min(rim, h)
  }
  if (!Number.isFinite(rim)) rim = 0.5
  const iceY = Math.round((rim - (o.depth ?? 0.5)) / VOXEL) * VOXEL
  const iceV = Math.round(iceY / VOXEL)
  const ext = 1.32
  // the bowl
  t.apply(x - rx * ext, z - rz * ext, x + rx * ext, z + rz * ext, (px, pz, hv, mat) => {
    const r = shape(px, pz)
    if (r >= 1.3) return null
    if (r < 0.93) {
      // ice with drifted snow, wind-polished dark patches
      const n = fbm2(px * 0.16, pz * 0.16, 3, seed)
      const fine = valueNoise2(px * 1.3, pz * 1.3, seed + 1)
      const edge = smoothstep(0.7, 0.93, r)
      let m = MAT.icePond
      let h = iceV
      if (n + edge * 0.45 + fine * 0.12 > 0.66) { m = fine > 0.5 ? MAT.snow : MAT.snowFresh; if (n + edge * 0.4 > 0.8) h += 1 }
      else if (n < 0.36) m = MAT.iceDark
      return { h, mat: m }
    }
    // snow-covered shore slope up to the surrounding ground
    const k = smoothstep(0.93, 1.3, r)
    const h = Math.round(iceV + 1 + (hv - iceV - 1) * k)
    return { h: Math.min(hv, h), mat: k < 0.25 && valueNoise2(px * 2, pz * 2, seed) < 0.3 ? MAT.snowFresh : mat }
  })
  // cracks: random walks across the ice (white fracture lines on dark ice)
  const nCracks = Math.round(3 + (rx * rz) / 40)
  for (let c = 0; c < nCracks; c++) {
    let a = rng.float(0, TAU)
    let px = x + rng.float(-0.6, 0.6) * rx, pz = z + rng.float(-0.6, 0.6) * rz
    const L = rng.float(3, 9)
    for (let d = 0; d < L; d += 0.5) {
      a += rng.float(-0.45, 0.45)
      const nx = px + Math.cos(a) * 0.5, nz = pz + Math.sin(a) * 0.5
      if (shape(nx, nz) > 0.9) break
      t.paintLine(px, pz, nx, nz, 0.22, { mat: MAT.iceCrack, only: ICE })
      if (rng.chance(0.08)) {
        // short side branch
        let ba = a + (rng.chance(0.5) ? 1 : -1) * rng.float(0.6, 1.2), bx = nx, bz = nz
        for (let e = 0; e < rng.float(1, 2.5); e += 0.5) {
          const qx = bx + Math.cos(ba) * 0.5, qz = bz + Math.sin(ba) * 0.5
          t.paintLine(bx, bz, qx, qz, 0.2, { mat: MAT.iceCrack, only: ICE })
          bx = qx; bz = qz; ba += rng.float(-0.4, 0.4)
        }
      }
      px = nx; pz = nz
    }
  }
  // a patch swept clear by kids for hockey, the snow shoved into low ridges around it
  if (o.rink ?? (rx > 11 && rz > 8)) {
    const w = Math.min(rx * 0.7, 9), d = Math.min(rz * 0.55, 6)
    const cx = x + rng.float(-0.2, 0.2) * rx, cz = z + rng.float(-0.2, 0.2) * rz
    t.apply(cx - w / 2 - 0.6, cz - d / 2 - 0.6, cx + w / 2 + 0.6, cz + d / 2 + 0.6, (px, pz, hv, mat) => {
      if (shape(px, pz) > 0.85) return null
      const ix = Math.abs(px - cx) - w / 2, iz = Math.abs(pz - cz) - d / 2
      // shovelled by hand: wobbly edges, snow thrown into a low broken ridge
      const out = Math.max(ix, iz) + (valueNoise2(px * 0.9, pz * 0.9, seed + 11) - 0.5) * 0.9
      if (out < 0) {
        const n = valueNoise2(px * 0.8, pz * 0.8, seed + 7)
        return { h: iceV, mat: n < 0.5 ? MAT.iceDark : n < 0.88 ? MAT.icePond : MAT.snowPacked }
      }
      if (out < 0.7) {
        const n = valueNoise2(px * 2.2, pz * 2.2, seed)
        return { h: iceV + (n < 0.6 ? 1 : 0), mat: n < 0.8 ? MAT.snow : MAT.snowFresh }
      }
      return null
    })
  }
  const ponds = { x, z, rx, rz, iceY, seed, contains: (px, pz) => shape(px, pz) < 0.93, shapeAt: shape }
  s.ponds.push(ponds)
  const avoid = o.avoid || (() => false)
  // reeds and cattails in clumps along the shore, thicker on one side
  if (o.reeds ?? true) {
    const side = rng.float(0, TAU)
    const nC = Math.round(4 + (rx + rz) / 4)
    for (let c = 0; c < nC; c++) {
      const a = side + rng.normal(0, 1.1)
      for (let k = 0; k < rng.int(1, 4); k++) {
        const aa = a + rng.float(-0.12, 0.12)
        const rr = rng.float(0.86, 1.04)
        const px = x + Math.cos(aa) * rx * rr * (1 + 0.1 * Math.sin(2 * Math.atan2(Math.sin(aa) * rz, Math.cos(aa) * rx) + ph[0]))
        const pz = z + Math.sin(aa) * rz * rr
        if (avoid(px, pz)) continue
        const cat = rng.chance(0.3)
        const list = cat ? PLANTS.cattail : PLANTS.reeds
        ctx.world.place(rng.pick(list), { x: px, z: pz, angle: rng.float(0, TAU), tag: 'reeds' })
      }
    }
    // dry grass on the slope
    for (let k = 0; k < Math.round((rx + rz) * 0.6); k++) {
      const a = rng.float(0, TAU), rr = rng.float(1.02, 1.25)
      const px = x + Math.cos(a) * rx * rr, pz = z + Math.sin(a) * rz * rr
      if (avoid(px, pz)) continue
      ctx.world.place(rng.pick(PLANTS.grass), { x: px, z: pz, angle: rng.float(0, TAU), tag: 'weeds' })
    }
  }
  // the trodden path around the pond
  const pathR = 1.42
  if (o.path ?? true) {
    const N = 72
    const gapA = rng.float(0, TAU)
    let prev = null
    const trail = []
    for (let k = 0; k <= N; k++) {
      const a = (k / N) * TAU
      const wob = 1 + 0.04 * Math.sin(a * 3 + ph[1])
      const px = x + Math.cos(a) * rx * pathR * wob, pz = z + Math.sin(a) * rz * pathR * wob
      const inGap = Math.abs(((a - gapA + Math.PI * 3) % TAU) - Math.PI) < 0.35
      if (prev && !inGap && !avoid(px, pz)) {
        t.paintLine(prev[0], prev[1], px, pz, 1.1, { mat: MAT.snowPacked, raise: 0 })
        trail.push([px, pz])
      } else if (trail.length > 3) {
        if (o.trail ?? true) ctx.footprints?.addTrail(trail.slice(), t, 0.55)
        trail.length = 0
      }
      prev = [px, pz]
    }
    if (trail.length > 3 && (o.trail ?? true)) ctx.footprints?.addTrail(trail.slice(), t, 0.55)
  }
  // someone crossed the ice anyway
  if (o.trail ?? true) {
    const a = rng.float(0, TAU)
    const p0 = [x + Math.cos(a) * rx * 1.15, z + Math.sin(a) * rz * 1.15]
    const p1 = [x - Math.cos(a + 0.3) * rx * 1.15, z - Math.sin(a + 0.3) * rz * 1.15]
    const pts = []
    for (let k = 0; k <= 12; k++) {
      const f = k / 12
      pts.push([p0[0] + (p1[0] - p0[0]) * f + Math.sin(f * 5) * 0.6, p0[1] + (p1[1] - p0[1]) * f + Math.cos(f * 4) * 0.5])
    }
    ctx.footprints?.addTrail(pts, t, 0.7)
  }
  // the warning sign by the path
  if (o.sign ?? true) {
    const a = typeof o.sign === 'object' && o.sign.angle !== undefined ? o.sign.angle : rng.float(0, TAU)
    const px = x + Math.cos(a) * rx * 1.2, pz = z + Math.sin(a) * rz * 1.2
    // board faces away from the pond (toward people arriving on the path)
    const out = Math.atan2(Math.sin(a) / rz, Math.cos(a) / rx) // outward normal direction (x,z)
    const nx = Math.cos(out), nz = Math.sin(out)
    // model front is local −Z; local −Z → world (−sinθ, −cosθ) = (nx, nz)
    const theta = Math.atan2(-nx, -nz)
    const p = ctx.world.place('nature_sign_post', { x: px, z: pz, angle: theta, tag: 'sign' })
    if (p) {
      const front = p.toWorld(0, 2.0, -0.14)
      ctx.signs?.add({ x: front.x, y: front.y, z: front.z, angle: theta + Math.PI, w: 1.42, h: 0.92, ppm: 64, draw: drawPondSign, aged: 0.45, seed })
      ctx.interactions?.add({
        x: front.x, y: front.y, z: front.z, size: [1.4, 1.0, 0.4], reach: 3,
        prompt: { ru: 'Читать', en: 'Read' }, tag: 'notice',
        onUse(game) { game.ui.showNote({ ru: `${POND_SIGN.ru}\n\n${POND_SIGN.footer.ru}`, en: `${POND_SIGN.en}\n\n${POND_SIGN.footer.en}`, style: 'sign' }) },
      })
    }
  }
  return ponds
}
