// Hooded crows (серая ворона): small fine-voxel birds that perch on trees, wires, roofs or
// peck at the snow, caw now and then, burst off when the player comes within ~12 m — flapping
// (frames swapped by toggling dynamic placements) away into the fog — and drift back much later.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M } from '../../core/materials.js'
import { RNG } from '../../core/rng.js'
import { fineScale } from './voxutil.js'
import { natureState, placeModel } from './state.js'

const FINE = 0.17 // crow voxels are ~4.3 cm: a hooded crow is ~48 cm long, ~95 cm across the wings
const GREY = M('concrete_light'), BLACK = M('rubber'), DARK = M('metal_dark')
const CROW_OPTS = { lods: [FINE], lodDistances: [], maxDistance: 150, collide: false, contact: false, dynamic: true }

function body(m, o) {
  // o: { cx, cy, cz, tilt (head up +), headDy, beakOpen, headDown }
  const { cx, cy, cz } = o
  m.ellipsoid(cx, cy, cz, 3.3, 1.75, 1.35, GREY)
  // folded wings: black along the upper sides and back
  m.ellipsoid(cx - 0.6, cy + 0.45, cz - 1.0, 2.9, 1.15, 0.55, BLACK)
  m.ellipsoid(cx - 0.6, cy + 0.45, cz + 1.0, 2.9, 1.15, 0.55, BLACK)
  // tail
  m.line(cx - 2.6, cy + 0.2, cz, cx - 5.2, cy - 1.1 + (o.tailUp ?? 0), cz, BLACK, 0.75)
  // head and bib
  const hx = cx + 3.4 + (o.headDx ?? 0), hy = cy + 2.0 + (o.headDy ?? 0)
  m.ellipsoid(cx + 2.3, cy + 0.6 + (o.headDy ?? 0) * 0.4, cz, 1.1, 1.3, 1.15, BLACK)
  m.sphere(hx, hy, cz, 1.45, BLACK)
  // beak
  const bl = 1.9
  const bdy = o.beakDy ?? -0.25
  m.line(hx + 1.2, hy - 0.1, cz, hx + 1.2 + bl, hy + bdy, cz, DARK)
  if (o.beakOpen) m.line(hx + 1.0, hy - 0.7, cz, hx + 1.0 + bl * 0.8, hy - 1.4, cz, DARK)
}

function perched(variant) {
  const m = new VoxelModel(16, 12, 7)
  const cz = 3.5
  // legs
  m.fill(7, 0, 2, 1, 2, 1, DARK)
  m.fill(7, 0, 4, 1, 2, 1, DARK)
  if (variant === 'peck') {
    body(m, { cx: 6.5, cy: 3.8, cz, headDy: -3.2, headDx: 0.6, beakDy: -1.6, tailUp: 1.4 })
  } else if (variant === 'caw') {
    body(m, { cx: 6.5, cy: 3.8, cz, headDy: 0.9, headDx: -0.2, beakDy: 0.6, beakOpen: true, tailUp: -0.6 })
  } else {
    body(m, { cx: 6.5, cy: 3.8, cz })
  }
  m.setPivot(7.5, 0, 3.5)
  return fineScale(m, FINE)
}

function flying(frame) {
  const m = new VoxelModel(16, 17, 23)
  const cx = 7, cy = 8, cz = 11.5
  m.ellipsoid(cx, cy, cz, 3.6, 1.35, 1.3, GREY)
  m.ellipsoid(cx - 0.4, cy + 0.6, cz, 3.0, 0.7, 1.1, BLACK)
  // fanned tail
  for (let k = -1; k <= 1; k++) m.line(cx - 2.8, cy + 0.1, cz + k * 0.4, cx - 5.6, cy - 0.2, cz + k * 1.4, BLACK)
  m.sphere(cx + 3.6, cy + 0.6, cz, 1.35, BLACK)
  m.ellipsoid(cx + 2.4, cy + 0.1, cz, 1.0, 1.1, 1.1, BLACK)
  m.line(cx + 4.8, cy + 0.5, cz, cx + 6.6, cy + 0.2, cz, DARK)
  // wings: frame 0 = up, 1 = level (glide), 2 = down
  const tipDy = frame === 0 ? 6.5 : frame === 1 ? 0.6 : -5.5
  const span = frame === 1 ? 10.5 : 9.2
  for (const side of [-1, 1]) {
    let prevY = cy + 0.6
    for (let d = 1; d <= span; d++) {
      const t = d / span
      const y = Math.round(cy + 0.6 + tipDy * Math.pow(t, 1.25))
      const chord = 4.6 * (1 - 0.5 * t)
      const xc = cx + 0.4 - t * 1.6
      const z = Math.round(cz + side * (1 + d))
      const y0 = Math.min(y, prevY), y1 = Math.max(y, prevY)
      for (let x = Math.round(xc - chord / 2); x <= Math.round(xc + chord / 2); x++) {
        // primaries: ragged "fingers" near the tip
        if (t > 0.75 && (x + d) % 2 === 0 && x < xc) continue
        for (let yy = y0; yy <= y1; yy++) m.set(x, yy, z, BLACK)
      }
      prevY = y
    }
  }
  m.setPivot(8, 4, 11.5)
  return fineScale(m, FINE)
}

defineModel('nature_crow_perch', () => perched('perch'), CROW_OPTS)
defineModel('nature_crow_caw', () => perched('caw'), CROW_OPTS)
defineModel('nature_crow_peck', () => perched('peck'), CROW_OPTS)
defineModel('nature_crow_fly_up', () => flying(0), CROW_OPTS)
defineModel('nature_crow_fly_mid', () => flying(1), CROW_OPTS)
defineModel('nature_crow_fly_down', () => flying(2), CROW_OPTS)

const FRAMES = ['perch', 'caw', 'peck', 'up', 'mid', 'down']
const MODEL_OF = { perch: 'nature_crow_perch', caw: 'nature_crow_caw', peck: 'nature_crow_peck', up: 'nature_crow_fly_up', mid: 'nature_crow_fly_mid', down: 'nature_crow_fly_down' }
const FLAP = ['up', 'mid', 'down', 'mid']

function play(ctx, name, pos, o = {}) {
  const a = ctx.audio
  if (!a || !a.ready || (a.has && !a.has(name))) return null
  try { return a.play(name, { pos, bus: 'sfx', refDistance: 4, maxDistance: 260, ...o }) } catch { return null }
}

/**
 * Add a small group of crows.
 * o: { x, y, z, count (1–8), perch: 'tree'|'wire'|'roof'|'ground', tree (handle from placeTree:
 *      uses its branch perches), points [[x,y,z],...] (explicit perch points), angle (wire/roof
 *      direction, radians, default 0 = along +X), facing (roof: direction the crows look),
 *      spacing (m), radius (ground/tree scatter), scareRadius (default 12), seed }
 * Returns { crows, scare(), center }.
 */
export function addCrows(ctx, o) {
  const s = natureState(ctx)
  const sx = o.x ?? o.tree?.x ?? o.points?.[0]?.[0] ?? 0, sz = o.z ?? o.tree?.z ?? o.points?.[0]?.[2] ?? 0
  const rng = new RNG(o.seed ?? Math.floor((sx * 31 + sz * 17) * 16))
  const count = Math.max(1, Math.min(10, o.count ?? 3))
  const kind = o.perch ?? 'tree'
  const homes = []
  if (o.points?.length) {
    for (let i = 0; i < count; i++) {
      const q = o.points[i % o.points.length]
      homes.push({ x: q[0], y: q[1], z: q[2], h: rng.float(0, Math.PI * 2) })
    }
  } else if (kind === 'tree' && o.tree) {
    const pts = o.tree.perches()
    rng.shuffle(pts)
    for (let i = 0; i < count && i < pts.length; i++) homes.push({ x: pts[i].x, y: pts[i].y, z: pts[i].z, h: rng.float(0, Math.PI * 2) })
    if (!homes.length) {
      // no usable branch tops: sit up in the crown anyway
      const R = (o.tree.crownR ?? 2) * 0.4
      for (let i = 0; i < count; i++) {
        const a = rng.float(0, Math.PI * 2)
        homes.push({ x: o.tree.x + Math.cos(a) * R, y: o.tree.y + (o.tree.height ?? 8) * rng.float(0.55, 0.75), z: o.tree.z + Math.sin(a) * R, h: rng.float(0, Math.PI * 2) })
      }
    }
  } else if (kind === 'wire' || kind === 'roof') {
    const a = o.angle ?? 0
    const dx = Math.cos(a), dz = -Math.sin(a)
    let t = 0
    const face = o.facing ?? (a + Math.PI / 2)
    for (let i = 0; i < count; i++) {
      homes.push({ x: o.x + dx * t, y: o.y, z: o.z + dz * t, h: kind === 'roof' ? face + rng.float(-0.5, 0.5) : (rng.chance(0.5) ? a + Math.PI / 2 : a - Math.PI / 2) + rng.float(-0.3, 0.3) })
      t += (o.spacing ?? 0.6) * rng.float(0.6, 1.8)
    }
  } else if (kind === 'ground') {
    const R = o.radius ?? 3
    for (let i = 0; i < count; i++) {
      const a = rng.float(0, Math.PI * 2), d = R * Math.sqrt(rng.next())
      const x = o.x + Math.cos(a) * d, z = o.z + Math.sin(a) * d
      const h = ctx.terrain.heightAt(x, z)
      homes.push({ x, y: Number.isFinite(h) ? h : o.y ?? 0.5, z, h: rng.float(0, Math.PI * 2) })
    }
  } else {
    const R = o.radius ?? 1.5
    for (let i = 0; i < count; i++) {
      const a = rng.float(0, Math.PI * 2), d = R * Math.sqrt(rng.next())
      homes.push({ x: o.x + Math.cos(a) * d, y: (o.y ?? 6) + rng.float(-0.5, 0.5), z: o.z + Math.sin(a) * d, h: rng.float(0, Math.PI * 2) })
    }
  }
  if (!homes.length) return null
  const crows = []
  let cx = 0, cy = 0, cz = 0
  for (const hm of homes) {
    const pl = {}
    for (const f of FRAMES) {
      pl[f] = placeModel(ctx, MODEL_OF[f], { x: hm.x, y: hm.y, z: hm.z, angle: hm.h, dynamic: true, collide: false, visible: false, tag: 'crow' })
    }
    const crow = {
      home: hm, pl, frame: null, state: 'perched', x: hm.x, y: hm.y, z: hm.z, heading: hm.h,
      vx: 0, vy: 0, vz: 0, t: 0, timer: rng.float(2, 10), delay: 0, flapT: rng.next(), glide: 0,
      rng: new RNG(rng.int(1, 1e9)),
    }
    setFrame(crow, kind === 'ground' && rng.chance(0.4) ? 'peck' : 'perch')
    crows.push(crow)
    cx += hm.x; cy += hm.y; cz += hm.z
  }
  const n = Math.max(1, crows.length)
  const group = {
    kind, crows, center: { x: cx / n, y: cy / n, z: cz / n }, state: 'perched',
    scareR: o.scareRadius ?? (kind === 'ground' ? 10 : 12),
    cawTimer: rng.float(4, 25), cawLeft: 0, cawGap: 0, cawCrow: null,
    rng: new RNG(rng.int(1, 1e9)),
    scare() { group.forceScare = true },
  }
  s.crowGroups.push(group)
  return group
}

function setFrame(c, f) {
  if (c.frame === f) return
  if (c.frame) c.pl[c.frame].visible = false
  c.frame = f
  const p = c.pl[f]
  p.visible = true
  p.set(c.x, c.y, c.z, c.heading)
}

function moveCrow(c) {
  c.pl[c.frame].set(c.x, c.y, c.z, c.heading)
}

/** Per-frame crow behaviour (cheap: a few dozen birds). */
export function updateCrows(ctx, s, dt, px, py, pz) {
  for (const g of s.crowGroups) {
    const dxg = g.center.x - px, dzg = g.center.z - pz
    const dg = Math.sqrt(dxg * dxg + dzg * dzg)
    const r = g.rng
    // a scare sends the whole group off, one bird after another
    if (g.state === 'perched' && (dg < g.scareR || g.forceScare)) {
      g.forceScare = false
      g.state = 'scattered'
      play(ctx, 'crows_takeoff', [g.center.x, g.center.y + 0.5, g.center.z], { gain: 0.9 })
      let k = 0
      for (const c of g.crows) {
        if (c.state !== 'perched') continue
        c.state = 'takeoff'
        c.delay = k++ === 0 ? 0 : r.float(0.05, 0.8)
      }
      if (r.chance(0.8)) { g.cawLeft = r.int(2, 4); g.cawGap = r.float(0.3, 0.7); g.cawCrow = g.crows[0] }
    }
    // occasional caws (perched groups within earshot, or the alarm series after a scare)
    if (g.cawLeft > 0) {
      g.cawGap -= dt
      if (g.cawGap <= 0) {
        const c = g.cawCrow || g.crows[0]
        play(ctx, 'crow_caw', [c.x, c.y + 0.3, c.z], { gain: 0.8 })
        if (c.state === 'perched' && c.frame !== 'peck') { setFrame(c, 'caw'); c.cawHold = 0.35 }
        g.cawLeft--
        g.cawGap = r.float(0.55, 0.95)
      }
    } else if (g.state === 'perched' && dg < 90) {
      g.cawTimer -= dt
      if (g.cawTimer <= 0) {
        g.cawTimer = r.float(14, 55)
        if (g.kind !== 'ground' || r.chance(0.4)) {
          g.cawCrow = g.crows[r.int(0, g.crows.length - 1)]
          g.cawLeft = r.int(1, 4)
          g.cawGap = 0
        }
      }
    }
    let home = 0
    for (const c of g.crows) {
      updateCrow(ctx, g, c, dt, px, py, pz)
      if (c.state === 'perched') home++
    }
    if (g.state === 'scattered' && home === g.crows.length) g.state = 'perched'
  }
}

function updateCrow(ctx, g, c, dt, px, py, pz) {
  const r = c.rng
  switch (c.state) {
    case 'perched': {
      if (c.cawHold > 0) { c.cawHold -= dt; if (c.cawHold <= 0) setFrame(c, 'perch') }
      c.timer -= dt
      if (c.timer <= 0) {
        c.timer = r.float(3, 11)
        if (g.kind === 'ground') {
          // hop and peck
          if (r.chance(0.5)) setFrame(c, c.frame === 'peck' ? 'perch' : 'peck')
          c.heading += r.float(-1.2, 1.2)
          if (r.chance(0.3)) {
            const a = r.float(0, Math.PI * 2)
            c.x = c.home.x + Math.cos(a) * r.float(0, 0.6)
            c.z = c.home.z + Math.sin(a) * r.float(0, 0.6)
            const h = ctx.terrain.heightAt(c.x, c.z)
            if (Number.isFinite(h)) c.y = h
          }
        } else c.heading += r.float(-1.1, 1.1)
        moveCrow(c)
      }
      break
    }
    case 'takeoff': {
      c.delay -= dt
      if (c.delay > 0) break
      // away from the player, scattered a little
      let ax = c.x - px, az = c.z - pz
      const l = Math.hypot(ax, az) || 1
      ax /= l; az /= l
      const turn = r.float(-0.9, 0.9)
      const dx = ax * Math.cos(turn) - az * Math.sin(turn), dz = ax * Math.sin(turn) + az * Math.cos(turn)
      c.dirX = dx; c.dirZ = dz
      c.speed = r.float(7.5, 10)
      c.vx = dx * 2; c.vz = dz * 2; c.vy = r.float(2.8, 4.2)
      c.t = 0; c.flapT = 0; c.glide = 0
      c.state = 'flying'
      setFrame(c, 'down')
      break
    }
    case 'flying': {
      c.t += dt
      const k = Math.min(1, dt * 1.5)
      c.vx += (c.dirX * c.speed - c.vx) * k
      c.vz += (c.dirZ * c.speed - c.vz) * k
      const climb = c.t < 2.5 ? r.float(2.2, 3.4) : 0.8
      c.vy += (climb - c.vy) * k
      // gentle meander
      const wob = Math.sin(c.t * 0.9 + c.home.x) * 0.25 * dt
      const ndx = c.dirX * Math.cos(wob) - c.dirZ * Math.sin(wob), ndz = c.dirX * Math.sin(wob) + c.dirZ * Math.cos(wob)
      c.dirX = ndx; c.dirZ = ndz
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt
      c.heading = Math.atan2(-c.vz, c.vx)
      flap(c, dt, c.t < 2.2)
      const d = Math.hypot(c.x - px, c.z - pz)
      if (d > 85 || c.t > 16) {
        c.state = 'away'
        c.pl[c.frame].visible = false
        c.frame = null
        c.timer = r.float(50, 160)
      } else moveCrow(c)
      break
    }
    case 'away': {
      c.timer -= dt
      if (c.timer > 0) break
      const dh = Math.hypot(c.home.x - px, c.home.z - pz)
      if (dh < 34) { c.timer = r.float(10, 30); break }
      // come back from far away, high up, out of the fog
      const a = r.float(0, Math.PI * 2)
      c.x = c.home.x + Math.cos(a) * 70; c.z = c.home.z + Math.sin(a) * 70; c.y = c.home.y + r.float(16, 26)
      c.speed = r.float(7, 9)
      c.t = 0
      c.state = 'return'
      setFrame(c, 'mid')
      break
    }
    case 'return': {
      c.t += dt
      const dx = c.home.x - c.x, dy = c.home.y - c.y, dz = c.home.z - c.z
      const d = Math.hypot(dx, dy, dz)
      const dh = Math.hypot(c.home.x - px, c.home.z - pz)
      if (dh < 18 && d > 8) {
        // the player is standing there — veer off and try again later
        c.dirX = -dx / (d || 1); c.dirZ = -dz / (d || 1); c.t = 3; c.speed = 9
        c.state = 'flying'
        break
      }
      if (d < 0.25) {
        c.x = c.home.x; c.y = c.home.y; c.z = c.home.z
        c.heading = c.home.h + r.float(-0.8, 0.8)
        c.state = 'perched'
        c.timer = r.float(3, 10)
        setFrame(c, g.kind === 'ground' ? 'peck' : 'perch')
        break
      }
      const sp = Math.min(c.speed, 0.7 + d * 0.9)
      c.x += dx / d * sp * dt; c.y += dy / d * sp * dt; c.z += dz / d * sp * dt
      if (Math.abs(dx) + Math.abs(dz) > 0.05) c.heading = Math.atan2(-dz, dx)
      flap(c, dt, d < 7)
      moveCrow(c)
      break
    }
  }
}

function flap(c, dt, hard) {
  if (c.glide > 0 && !hard) {
    c.glide -= dt
    setFrame(c, 'mid')
    return
  }
  c.flapT += dt * (hard ? 9 : 7)
  const i = Math.floor(c.flapT) % 4
  setFrame(c, FLAP[i])
  if (!hard && c.flapT > 6 && c.rng.chance(dt * 1.2)) { c.glide = c.rng.float(0.5, 1.4); c.flapT = 0 }
}
