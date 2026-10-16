// Avenue traffic on проспект Строителей: sparse, right-hand, time-of-day density, wrapping
// through the whiteout at both world ends. Cars, marshrutkas, LiAZ buses and ZiU trolleybuses
// (stopping at the stops in registry.stops), now and then a KAMAZ snowplow with its beacon.
// At game start a trolleybus is pulling away from the spawn stop westbound.

import { RNG } from '../../core/rng.js'
import { Rig } from './rig.js'
import { CAR_INFO } from './cars.js'
import { BIG_INFO } from './big.js'
import { ROUTES } from './plates.js'
import { CAR_PALETTE, TYPE_PALETTE } from './palette.js'

export const AVENUE = {
  west: { dir: -1, angle: Math.PI / 2, lanes: [527.5, 531, 534.5], sideZ: [508, 538] },
  east: { dir: 1, angle: -Math.PI / 2, lanes: [552.5, 549, 545.5], sideZ: [542, 572] },
  xMin: -45, xMax: 685, roadY: 0,
}
export const SPAWN_STOP = { x: 248, z: 520.6 } // PLAN: trolleybus stop on the north sidewalk

// vehicles per minute per direction by hour (Moscow outskirts, a winter weekday)
const RATE = [0.35, 0.15, 0.08, 0.06, 0.1, 0.35, 1.0, 1.9, 2.3, 1.9, 1.4, 1.3, 1.3, 1.3, 1.3, 1.4, 1.6, 2.4, 2.6, 2.0, 1.5, 1.1, 0.8, 0.55]

const CAR_SLOTS = [
  ['vaz2107', ''], ['vaz2106', '_s1'], ['vaz21099', ''], ['vaz2110', '_s1'], ['moskvich2141', ''], ['volga3110', ''],
  ['nexia', ''], ['focus', '_s1'], ['vaz2107', '_s1'], ['vaz2110', ''], ['vaz21099', '_s1'], ['nexia', '_s1'],
  ['gazelle', ''], ['gazelle', '_s1'], ['gazelle_van', ''], ['uaz452', ''],
]

const smooth = t => t * t * (3 - 2 * t)

export class Traffic {
  constructor(sys) {
    this.sys = sys
    const ctx = sys.ctx
    this.rng = new RNG(0x7a11c)
    this.rigs = []
    const r = this.rng
    // ---- the pool (placed at build time so meshing happens during loading)
    CAR_SLOTS.forEach(([type, snow], i) => {
      const marsh = type === 'gazelle'
      const tint = marsh ? r.pick([0xe2e0d6, 0xe2e0d6, 0xd8b03a]) : type === 'gazelle_van' ? 0xdcdbd2 : r.pick(CAR_PALETTE)
      const rt = marsh ? ROUTES.taxi[i % ROUTES.taxi.length] : null
      this.rigs.push(new Rig(sys, {
        model: 'veh_' + type + snow, info: CAR_INFO[type], kind: 'car', type, tint, seed: r.next(), rng: r.fork(i + 1),
        plate: marsh ? 'route' : 'civil', boardText: rt ? `${rt.num}  ${rt.to}` : null,
        head: { intensity: 120, range: 42, cone: 30, inner: 12 }, sound: 'car_pass', soundNominal: 50, exhaust: true,
      }))
    })
    for (let i = 0; i < 3; i++) {
      this.rigs.push(new Rig(sys, {
        model: 'veh_liaz5256', info: BIG_INFO.liaz, kind: 'bus', type: 'liaz', tint: r.pick([0xe4e2d8, 0xe4e2d8, 0xd9cfae]), seed: r.next(), rng: r.fork(100 + i),
        plate: 'route', route: ROUTES.bus[i % ROUTES.bus.length], head: { intensity: 130, range: 44, cone: 32, inner: 13 },
        interior: { color: 0xe4eedc, intensity: 10, range: 10 }, sound: 'bus_pass', soundNominal: 40, exhaust: true, glowHead: 50,
      }))
    }
    for (let i = 0; i < 3; i++) {
      this.rigs.push(new Rig(sys, {
        model: 'veh_ziu682', info: BIG_INFO.ziu, kind: 'trolleybus', type: 'ziu', seed: r.next(), rng: r.fork(200 + i),
        plate: 'route', route: ROUTES.trolleybus[i % ROUTES.trolleybus.length], fleet: String(r.int(3, 9)) + String(r.int(100, 999)),
        head: { intensity: 120, range: 42, cone: 32, inner: 13 }, interior: { color: 0xe8efdc, intensity: 10, range: 10 },
        sound: 'trolleybus_pass', soundNominal: 40, glowHead: 45,
      }))
    }
    for (let i = 0; i < 2; i++) {
      this.rigs.push(new Rig(sys, {
        model: 'veh_kamaz_plow', info: BIG_INFO.kamaz, kind: 'plow', type: 'kamaz', seed: r.next(), rng: r.fork(300 + i),
        plate: 'civil', doorText: 'ГУП «ДОРСЕРВИС» ВАО', head: { intensity: 125, range: 40, cone: 34, inner: 14 },
        sound: 'bus_pass', soundNominal: 40, beacon: true, exhaust: true, glowHead: 50,
      }))
    }
    this.byKind = k => this.rigs.filter(g => g.kind === k)
    this.timer = { west: 4, east: 7 }
    this.plowTimer = r.float(120, 300)
    this.started = false
    this.list = [] // registry.traffic
  }

  init() {
    for (const g of this.rigs) g.init()
  }

  /** registry.busTerminal (avenue package) → { P: loop polyline, stands, exit } or null. */
  _terminal() {
    const t = this.sys.ctx.registry.busTerminal
    if (!t || !Array.isArray(t.loop) || t.loop.length < 3) return null
    if (this._term && this._termSrc === t) return this._term
    const P = t.loop.map(p => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z])).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))
    const stands = (Array.isArray(t.stops) ? t.stops : Array.isArray(t.stands) ? t.stands : [])
      .map(p => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z])).filter(p => Number.isFinite(p[0]))
    this._termSrc = t
    this._term = P.length >= 3 ? { P, stands, exit: t.exit === 'west' ? 'west' : 'east' } : null
    return this._term
  }

  /** Divert a bus into the terminal loop: lead-in from the curb lane, the loop, lead-out. */
  _enterTerminal(g) {
    const T = this._terminal()
    if (!T) return
    const S = AVENUE[g.side]
    const P0 = T.P[0], PL = T.P[T.P.length - 1]
    const ex = AVENUE[T.exit]
    const lead = [[g.x, g.z], [P0[0] - 9 * S.dir, S.lanes[0]], [P0[0] - 3 * S.dir, (S.lanes[0] + P0[1]) / 2]]
    const out = [[PL[0] + 4 * ex.dir, (PL[1] + ex.lanes[0]) / 2], [PL[0] + 12 * ex.dir, ex.lanes[0]], [PL[0] + 22 * ex.dir, ex.lanes[0]]]
    const pts = [...lead, ...T.P, ...out]
    const cum = [0]
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    // the stand: the free layover position closest to the loop
    let standS = -1
    const parked = this.sys.ctx.registry.parkedBuses || []
    for (const st of T.stands) {
      if (parked.some(b => Math.hypot(b.x - st[0], b.z - st[1]) < 7)) continue
      let best = 1e9, bs = -1
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i]
        const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1
        let t = ((st[0] - a[0]) * dx + (st[1] - a[1]) * dz) / l2
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const d = Math.hypot(st[0] - a[0] - dx * t, st[1] - a[1] - dz * t)
        if (d < best) { best = d; bs = cum[i - 1] + t * Math.sqrt(l2) }
      }
      if (best < 6 && bs > cum[3]) { standS = bs; break }
    }
    g.path = { pts, cum, L: cum[cum.length - 1], s: 0, standS, dwelt: false, yaw: g.angle, exit: T.exit }
  }

  _followPath(g, dt, time) {
    const r = this.rng
    const pa = g.path
    let target = pa.s > pa.cum[2] && pa.s < pa.cum[pa.cum.length - 3] ? 4.2 : 7
    if (g.state === 'dwell') {
      target = 0
      g.dwell -= dt
      if (g.dwell <= 0) g.state = 'drive'
    } else if (pa.standS > 0 && !pa.dwelt) {
      const dist = pa.standS - pa.s
      target = Math.min(target, Math.sqrt(2 * 1.0 * Math.max(0, dist - 0.2)))
      if (dist < 0.6 && g.speed < 0.5) { pa.dwelt = true; g.state = 'dwell'; g.dwell = r.float(25, 55); g.speed = 0 }
    }
    const dv = target - g.speed
    g.speed += dv > 0 ? Math.min(dv, 1.0 * dt) : Math.max(dv, -3 * dt)
    pa.s += g.speed * dt
    if (pa.s >= pa.L) {
      // back on the avenue
      const ex = pa.exit
      g.side = ex; g.lane = 0; g.toLane = 0; g.laneT = 1
      g.path = null; g.terminal = false
      g.stops = []
      const S = AVENUE[ex]
      const last = pa.pts[pa.pts.length - 1]
      g.set(last[0], AVENUE.roadY, S.lanes[0], S.angle)
      return
    }
    let i = 1
    while (i < pa.cum.length - 1 && pa.cum[i] < pa.s) i++
    const a = pa.pts[i - 1], b = pa.pts[i]
    const seg = pa.cum[i] - pa.cum[i - 1] || 1
    const t = (pa.s - pa.cum[i - 1]) / seg
    const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t
    const want = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]))
    let d = want - pa.yaw
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    pa.yaw += d * Math.min(1, dt * 1.8)
    const th = this.sys.ctx.terrain.heightAt(x, z)
    g.set(x, Number.isFinite(th) ? Math.max(0, Math.min(0.3, th)) : 0, z, pa.yaw)
  }

  /** Stops for buses/trolleybuses along a direction: [{x, z}] (vehicle centre x where it halts). */
  _stops(side) {
    const ctx = this.sys.ctx
    const out = []
    const st = ctx.registry.stops
    const S = AVENUE[side]
    if (Array.isArray(st)) {
      for (const s of st) {
        const cz = s.curb ? s.curb[1] : s.z
        const cx = s.curb ? s.curb[0] : s.x
        if (!(cz > S.sideZ[0] && cz < S.sideZ[1])) continue
        if (side === 'west' && cz > 538) continue
        if (side === 'east' && cz < 542) continue
        out.push({ x: cx + (side === 'west' ? 2.2 : -2.2), z: cz, kind: s.kind })
      }
    }
    if (!out.length && side === 'west') out.push({ x: SPAWN_STOP.x + 2.2, z: 522.8, kind: 'trolleybus' })
    return out
  }

  _busy(side, lane, x, ahead, behind) {
    const S = AVENUE[side]
    for (const g of this.rigs) {
      if (!g.active || g.side !== side) continue
      if (Math.abs(g.z - S.lanes[lane]) > 1.7 && g.lane !== lane && g.toLane !== lane) continue
      const rel = (g.x - x) * S.dir
      if (rel > -behind - g.info.L && rel < ahead + g.info.L) return true
    }
    return false
  }

  _spawn(side, kind, x, opts = {}) {
    const r = this.rng
    const S = AVENUE[side]
    let pool = this.rigs.filter(g => !g.active && g.kind === kind)
    if (!pool.length) return null
    const g = opts.rig ?? r.pick(pool)
    let lane = 0
    if (kind === 'car') lane = opts.lane ?? r.weighted([[0, 0.3], [1, 0.42], [2, 0.28]])
    if (kind === 'plow') lane = opts.lane ?? r.weighted([[0, 0.6], [1, 0.4]])
    if (!opts.force && this._busy(side, lane, x, 30, 30)) {
      if (kind !== 'car') return null
      lane = [0, 1, 2].find(l => !this._busy(side, l, x, 30, 30))
      if (lane === undefined) return null
    }
    g.side = side
    g.lane = lane; g.toLane = lane; g.laneT = 1
    g.z0 = S.lanes[lane]
    g.vmax = kind === 'car' ? r.float(12.5, 16.5) : kind === 'bus' ? r.float(10.5, 12.2) : kind === 'trolleybus' ? r.float(9.8, 11.2) : r.float(8.2, 9.4)
    if (kind === 'car' && g.type === 'gazelle') g.vmax += 1.2
    g.speed = opts.speed ?? g.vmax
    g.state = opts.state ?? 'drive'
    g.dwell = opts.dwell ?? 0
    g.stops = (kind === 'bus' || kind === 'trolleybus') ? this._stops(side).filter(s => (s.x - x) * S.dir > (opts.atStop ? -1 : 8)) : []
    g.stops.sort((a, b) => (a.x - b.x) * S.dir)
    g.skipStops = opts.atStop ? 0 : r.next() < 0.15 ? 1 : 0
    g.lit = true
    g.beaconOn = kind === 'plow'
    g.stuck = 0
    g.departSnd = false
    if (kind !== 'car' || g.type !== 'gazelle') {
      if (g.o.tintFrom) g.p.tint.setHex(r.pick(g.o.tintFrom))
    }
    if (kind === 'car') g.p.tint.setHex(r.pick(TYPE_PALETTE[g.type] ?? CAR_PALETTE))
    g.path = null
    g.scrape = null
    g.quietUntil = 0
    g.opening = false
    g.terminal = kind === 'bus' && side === 'east' && !opts.atStop && !!this._terminal() && r.chance(0.65) && !this.rigs.some(o => o !== g && o.active && o.terminal)
    g.show(x, AVENUE.roadY, g.z0, S.angle)
    return g
  }

  /** First frame: a lived-in avenue around the player, the trolleybus at the spawn stop. */
  _start(cam) {
    this.started = true
    const r = this.rng
    const h = this.sys.hour()
    const rate = RATE[Math.floor(h) % 24]
    const px = cam.x
    // the trolleybus that just dropped the player off
    const stop = this._stops('west')[0]
    const tb = this._spawn('west', 'trolleybus', stop.x, { force: true, speed: 0, state: 'dwell', dwell: 1.9, atStop: true })
    if (tb) { tb.stops = tb.stops.filter(s => Math.abs(s.x - stop.x) > 1); tb.departSnd = 'pending'; tb.opening = true }
    // dev: ?traffictest=x,side,kind,lane;... spawns vehicles at fixed spots (screenshots)
    const tt = this.sys.ctx.game?.params?.traffictest
    if (tt) {
      for (const spec of String(tt).split(';')) {
        const [x, side, kind, lane] = spec.split(',')
        this._spawn(side === 'east' ? 'east' : 'west', kind || 'car', parseFloat(x), { force: true, lane: lane !== undefined ? parseInt(lane, 10) : undefined })
      }
      return
    }
    // a few vehicles already under way
    const nearAvenue = cam.z > 470 && cam.z < 610
    if (rate > 0.3 && nearAvenue) {
      this._spawn('west', 'car', px + r.float(32, 52), { lane: 1 })
      if (rate > 0.6) this._spawn('east', 'car', px + r.float(12, 36), { lane: r.pick([1, 2]) })
    }
    const n = Math.round(rate * 1.2)
    for (let i = 0; i < n; i++) {
      const side = r.chance(0.5) ? 'west' : 'east'
      const x = r.float(AVENUE.xMin + 20, AVENUE.xMax - 20)
      if (Math.abs(x - px) < 120) continue
      this._spawn(side, r.chance(0.12) ? 'bus' : 'car', x)
    }
  }

  update(dt, ctx, cam, time) {
    if (!this.started) this._start(cam)
    const r = this.rng
    const hour = this.sys.hour()
    const h0 = Math.floor(hour) % 24, hf = hour - Math.floor(hour)
    const rate = RATE[h0] + (RATE[(h0 + 1) % 24] - RATE[h0]) * hf
    // ---- spawning
    for (const side of ['west', 'east']) {
      this.timer[side] -= dt
      if (this.timer[side] > 0) continue
      const S = AVENUE[side]
      const x = S.dir < 0 ? AVENUE.xMax : AVENUE.xMin
      const transit = hour > 5.5 || hour < 1
      const k = r.next()
      const kind = transit && k < 0.11 ? 'trolleybus' : transit && k < 0.2 ? 'bus' : 'car'
      const g = this._spawn(side, kind, x) || (kind !== 'car' ? this._spawn(side, 'car', x) : null)
      // exponential gaps, clamped so it is never a convoy nor a desert for too long
      const mean = 60 / Math.max(0.05, rate)
      this.timer[side] = g ? Math.min(420, Math.max(5, -Math.log(1 - r.next() * 0.98) * mean)) : 2.5
    }
    this.plowTimer -= dt
    if (this.plowTimer <= 0) {
      const night = hour >= 22 || hour < 6
      const side = r.chance(0.5) ? 'west' : 'east'
      const x = AVENUE[side].dir < 0 ? AVENUE.xMax : AVENUE.xMin
      const g = this._spawn(side, 'plow', x, { lane: 0 })
      if (g && night && r.chance(0.45)) {
        // a second machine staggered behind, one lane over (уступом)
        const g2 = this._spawn(side, 'plow', x - AVENUE[side].dir * 16, { lane: 1, force: true })
        if (g2) g2.speed = g.speed
      }
      this.plowTimer = night ? r.float(200, 420) : r.float(480, 900)
    }
    // ---- driving
    const pl = ctx.player?.pos
    for (const g of this.rigs) {
      if (!g.active) continue
      if (g.path) { this._followPath(g, dt, time); continue }
      const S = AVENUE[g.side]
      if (g.terminal && !g.path) {
        const T = this._terminal()
        if (!T) g.terminal = false
        else if ((T.P[0][0] - g.x) * S.dir < 24 && (T.P[0][0] - g.x) * S.dir > 8) { this._enterTerminal(g); continue }
      }
      // leader in my lane
      let gap = 1e9, leadSpeed = 0
      for (const o of this.rigs) {
        if (o === g || !o.active || o.side !== g.side) continue
        if (Math.abs(o.z - g.z) > 2.2) continue
        const rel = (o.x - g.x) * S.dir
        if (rel <= 0) continue
        const gg = rel - (o.info.L + g.info.L) / 2
        if (gg < gap) { gap = gg; leadSpeed = o.speed }
      }
      let target = g.vmax
      if (g.state === 'dwell') {
        target = 0
        g.dwell -= dt
        if (g.dwell <= 0) { g.state = 'drive'; g.accelT = 0 }
      } else if (g.stops.length) {
        const st = g.stops[0]
        const dist = (st.x - g.x) * S.dir
        if (dist < -2) g.stops.shift()
        else if (g.skipStops > 0 && dist < 30) { g.stops.shift(); g.skipStops = 0 }
        else {
          // ease into the curb lane well before the stop
          if (g.lane !== 0 && dist < 120) this._changeLane(g, 0)
          const vstop = Math.sqrt(2 * 1.1 * Math.max(0, dist - 0.2))
          target = Math.min(target, vstop)
          if (dist < 0.8 && g.speed < 0.6) {
            g.stops.shift(); g.state = 'dwell'; g.dwell = r.float(7, 15); g.speed = 0
            g.departSnd = g.kind === 'trolleybus' ? 'pending' : false
          }
        }
      }
      if (gap < 80) target = Math.min(target, Math.max(0, (gap - 3.5) / 1.3), gap < 25 ? leadSpeed + gap * 0.1 : 1e9)
      // somebody walking on the carriageway in front: slow down and stop well short
      if (pl && pl.y < 1.2) {
        const rel = (pl.x - g.x) * S.dir - g.info.L / 2
        if (rel > 0 && rel < 40 && Math.abs(pl.z - g.z) < 2.2) target = Math.min(target, Math.max(0, (rel - 5) / 1.5))
      }
      const acc = g.kind === 'car' ? 1.7 : g.kind === 'plow' ? 0.8 : 1.05
      const dv = target - g.speed
      g.speed += dv > 0 ? Math.min(dv, acc * dt) : Math.max(dv, -4.5 * dt)
      if (g.speed < 0) g.speed = 0
      // overtaking a slow / stopped vehicle (cars only)
      if (g.kind === 'car' && g.laneT >= 1) {
        if (gap < 30 && leadSpeed < g.vmax * 0.55) g.stuck += dt
        else g.stuck = Math.max(0, g.stuck - dt)
        if (g.stuck > 1.2) {
          for (const l of g.lane === 0 ? [1] : g.lane === 1 ? [2, 0] : [1]) {
            if (!this._busy(g.side, l, g.x, 30, 18)) { this._changeLane(g, l); break }
          }
          g.stuck = 0
        }
      }
      // lane change progress
      let zz = S.lanes[g.lane], yawOff = 0
      if (g.laneT < 1) {
        g.laneT = Math.min(1, g.laneT + dt / g.laneDur)
        const a = S.lanes[g.lane], b = S.lanes[g.toLane]
        zz = a + (b - a) * smooth(g.laneT)
        const dzdt = (b - a) * 6 * g.laneT * (1 - g.laneT) / g.laneDur
        yawOff = Math.atan2(dzdt, Math.max(2, g.speed)) * S.dir
        if (g.laneT >= 1) { g.lane = g.toLane; zz = b }
      }
      const nx = g.x + S.dir * g.speed * dt
      if (nx < AVENUE.xMin - 10 || nx > AVENUE.xMax + 10) { g.hide(); continue }
      g.set(nx, AVENUE.roadY, zz, S.angle + yawOff)
      // the opening trolleybus: door hiss, contactors, whine as it pulls away
      if (g.departSnd === 'pending' && ctx.audio?.ready && g.state === 'dwell' && g.dwell < 2.0) {
        g.departSnd = true
        const d = Math.hypot(g.x - cam.x, g.z - cam.z)
        if (d < 60) {
          try { g.oneShot = ctx.audio.play('trolleybus_depart', { pos: [g.x, 1.2, g.z], gain: g.opening ? 1 : 0.8 }) } catch { /* audio optional */ }
          g.quietUntil = time + 9
        }
      }
    }
    // ---- dressing, sound, registry
    this.list.length = 0
    const audio = ctx.audio
    for (const g of this.rigs) {
      if (!g.active) { if (g.em) g.stopSound(); continue }
      g.dress(cam, time, dt)
      g.updateSound(audio, cam, { mute: g.quietUntil && time < g.quietUntil })
      if (g.kind === 'plow' && audio?.ready && !g.scrape) {
        const rel = (cam.x - g.x) * AVENUE[g.side].dir
        if (rel > 0 && rel < 70 && Math.abs(cam.z - g.z) < 60) {
          try { g.scrape = audio.play('snowplow_pass', { pos: [g.x, 0.6, g.z] }) } catch { g.scrape = null }
          g.scrapeT = time
        }
      }
      if (g.scrape) {
        try { g.scrape.setPosition(g.x, 0.6, g.z) } catch { /* ignore */ }
        if (time - g.scrapeT > 14) g.scrape = null
      }
      this.list.push(g.entry || (g.entry = { x: 0, z: 0, speed: 0, type: g.kind, model: g.type, dir: 0, angle: 0, rig: g }))
      const e = g.entry
      e.x = g.x; e.z = g.z; e.speed = g.speed; e.dir = AVENUE[g.side].dir; e.angle = g.angle
    }
  }

  _changeLane(g, lane) {
    if (g.laneT < 1 || lane === g.lane) return
    g.toLane = lane
    g.laneT = 0
    g.laneDur = g.kind === 'car' ? 2.6 : 4.0
  }
}
