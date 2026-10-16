// The courtyard crawler: rarely, a car creeps along a driveway (проезд) at walking pace,
// headlights sweeping over snowbanks and parked cars, engine murmuring; at the end of its
// route it parks, the lights go out, a door slams, and it stays there until the player has
// wandered away. Routes come from ctx.registry.driveways (polylines from the layout packages:
// [[x,z],...] or {points:[[x,z],...]}); with none registered the crawler never appears.

import { RNG } from '../../core/rng.js'
import { Rig } from './rig.js'
import { CAR_INFO } from './cars.js'
import { TYPE_PALETTE, CAR_PALETTE } from './palette.js'

export class Yard {
  constructor(sys) {
    this.sys = sys
    this.rng = new RNG(0x9a7d)
    const r = this.rng
    this.rigs = [['vaz2107', '_s1'], ['vaz2110', '_s1'], ['vaz21099', '_s1']].map(([type, sn], i) => new Rig(sys, {
      model: 'veh_' + type + sn, info: CAR_INFO[type], kind: 'yard', type, tint: r.pick(TYPE_PALETTE[type] ?? CAR_PALETTE),
      seed: r.next(), rng: r.fork(i + 40), plate: 'civil', head: { intensity: 58, range: 30, cone: 36, inner: 16, scatter: 1.4 },
      sound: 'car_idle', soundVariant: i % 2, exhaust: true, tag: 'car',
    }))
    this.cur = null
    this.timer = r.float(80, 200)
    this.entry = { x: 0, z: 0, speed: 0, type: 'car', model: '', dir: 0, angle: 0, yard: true }
  }

  init() { for (const g of this.rigs) g.init() }

  _routes() {
    const d = this.sys.ctx.registry.driveways
    if (!Array.isArray(d)) return []
    const out = []
    for (const r of d) {
      const pts = Array.isArray(r) ? r : r && Array.isArray(r.points) ? r.points : null
      if (!pts || pts.length < 2) continue
      const P = pts.map(p => (Array.isArray(p) ? p : [p.x, p.z]))
      let L = 0
      for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])
      if (L > 25) out.push({ P, L })
    }
    return out
  }

  _try(cam) {
    const r = this.rng
    const routes = this._routes()
    if (!routes.length) return false
    const cands = []
    for (const rt of routes) {
      // nearest distance from the player to the route
      let best = 1e9
      for (let i = 1; i < rt.P.length; i++) best = Math.min(best, segDist(cam.x, cam.z, rt.P[i - 1], rt.P[i]))
      if (best < 12 || best > 110) continue
      const a = rt.P[0], b = rt.P[rt.P.length - 1]
      const da = Math.hypot(a[0] - cam.x, a[1] - cam.z), db = Math.hypot(b[0] - cam.x, b[1] - cam.z)
      // start from the end farther away; it must be well out of the player's way
      const rev = db > da
      if (Math.max(da, db) < 45) continue
      cands.push({ rt, rev })
    }
    if (!cands.length) return false
    const c = r.pick(cands)
    const P = c.rev ? [...c.rt.P].reverse() : c.rt.P
    const g = this.rigs.find(x => !x.active)
    if (!g) return false
    g.p.tint.setHex(r.pick(TYPE_PALETTE[g.o.type] ?? CAR_PALETTE))
    this.cur = { g, P, L: c.rt.L, s: 0, speed: r.float(2.4, 3.6), state: 'drive', t: 0, seg: 1, segS: 0, yaw: null, y: null }
    const h = this.sys.hour()
    g.lit = this.sys.street() > 0.25 || h < 9 || h > 16
    g.speed = this.cur.speed
    const p0 = P[0], p1 = P[1]
    const yaw = Math.atan2(-(p1[0] - p0[0]), -(p1[1] - p0[1]))
    this.cur.yaw = yaw
    g.show(p0[0], this._ground(p0[0], p0[1]), p0[1], yaw)
    return true
  }

  _ground(x, z) {
    const t = this.sys.ctx.terrain
    const h = t.heightAt(x, z)
    return Number.isFinite(h) ? h : 0
  }

  update(dt, ctx, cam, time) {
    const r = this.rng
    if (!this.cur) {
      this.timer -= dt
      if (this.timer <= 0) {
        const h = this.sys.hour()
        const ok = (h > 6.5 && h < 24) || r.chance(0.15)
        this.timer = (ok && this._try(cam)) ? r.float(200, 420) : r.float(40, 90)
      }
      return
    }
    const c = this.cur, g = c.g
    const pl = ctx.player?.pos
    if (c.state === 'drive') {
      // follow the polyline by arc length
      let target = c.speed
      // somebody on the driveway ahead: stop and wait
      if (pl) {
        const fx = -Math.sin(g.angle), fz = -Math.cos(g.angle)
        const rx = pl.x - g.x, rz = pl.z - g.z
        const ahead = rx * fx + rz * fz, side = Math.abs(rx * fz - rz * fx)
        if (ahead > 0 && ahead < 9 && side < 1.8) target = 0
      }
      g.speed += Math.max(-3 * dt, Math.min(1.2 * dt, target - g.speed))
      c.s += g.speed * dt
      let rem = c.s
      let i = 1
      let segL = 0
      for (; i < c.P.length; i++) {
        segL = Math.hypot(c.P[i][0] - c.P[i - 1][0], c.P[i][1] - c.P[i - 1][1])
        if (rem <= segL) break
        rem -= segL
      }
      if (i >= c.P.length) {
        c.state = 'parked'; c.t = 0; g.speed = 0
      } else {
        const a = c.P[i - 1], b = c.P[i]
        const t = segL > 0 ? rem / segL : 0
        const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t
        const want = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]))
        let d = want - c.yaw
        while (d > Math.PI) d -= 2 * Math.PI
        while (d < -Math.PI) d += 2 * Math.PI
        c.yaw += d * Math.min(1, dt * 1.6)
        const gy = this._ground(x, z)
        c.y = c.y === null ? gy : c.y + (gy - c.y) * Math.min(1, dt * 4)
        g.set(x, c.y, z, c.yaw)
      }
    } else if (c.state === 'parked') {
      c.t += dt
      if (c.t > 3.5 && g.lit) {
        g.lit = false
        try { if (ctx.audio?.ready && Math.hypot(g.x - cam.x, g.z - cam.z) < 70) ctx.audio.play('distant_door_slam', { pos: [g.x, g.y + 1, g.z], gain: 0.6 }) } catch { /* optional */ }
      }
      if (c.t > 6 && !c.off) {
        c.off = true
        g.stopSound(1.2)
        if (g.steam) try { g.steam.stop?.() } catch { /* optional */ }
        g.p.collide = true // parked: solid like any other car
      }
      const far = Math.hypot(g.x - cam.x, g.z - cam.z) > 85
      if (c.t > 30 && far) { g.p.collide = false; g.hide(); this.cur = null; return }
    }
    g.dress(cam, time, dt)
    if (c.state === 'drive' || c.t < 6) g.updateSound(ctx.audio, cam, { range: 80, rate: c.state === 'drive' ? 1.18 : 1 })
    const e = this.entry
    e.x = g.x; e.z = g.z; e.speed = g.speed; e.angle = g.angle; e.model = g.o.type
  }

  get active() { return !!this.cur }
}

function segDist(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const l2 = dx * dx + dz * dz || 1
  let t = ((px - a[0]) * dx + (pz - a[1]) * dz) / l2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(px - (a[0] + dx * t), pz - (a[1] + dz * t))
}
