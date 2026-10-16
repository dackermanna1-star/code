// The elektrichka: an ER2-style commuter train passing on the railway embankment along the
// north edge (double track along x; rail top y ≈ 1.25). Every 6–12 minutes of play, either
// direction, lit windows, the big headlamp, red markers at the tail, a rumbling pass-by
// ('train_pass') and the two-tone horn ('train_horn') when it comes into view. It enters and
// leaves through the whiteout at the world ends. No trains in the dead of night (01:10–04:50).

import { RNG } from '../../core/rng.js'
import { Rig } from './rig.js'
import { TRAIN, TRAIN_PITCH, TRAIN_INFO } from './train.js'
import { drawPainted } from './plates.js'

/** Track layout (north package builds the embankment to match). */
export const RAILWAY = { tracks: [46.0, 50.0], railY: 1.25, xMin: -80, xMax: 720, crossingX: 300 }

const half = TRAIN.carL / 2

export class Railway {
  constructor(sys) {
    this.sys = sys
    this.rng = new RNG(0xe12)
    const mk = (model, info, extra = {}) => new Rig(sys, {
      model, info, kind: 'train', type: 'er2', tag: 'train', seed: this.rng.next(), rng: this.rng.fork(model.length + extra.k),
      interior: { color: 0xffd7a0, intensity: 12, range: 13, near: 42 }, tailLight: false, ...extra,
    })
    const headInfo = { L: TRAIN.carL, head: [TRAIN_INFO.headlamp, ...TRAIN_INFO.buffers], tail: [], lightInterior: [0, 3.0, 0], fleetFront: TRAIN_INFO.numberFront }
    const tailInfo = { L: TRAIN.carL, head: TRAIN_INFO.tailMarkers, tail: [], lightInterior: [0, 3.0, 0] }
    const midInfo = { L: TRAIN.carL, head: [], tail: [], lightInterior: [0, 3.0, 0] }
    this.heads = [mk('veh_er2_head', headInfo, { k: 1, head: { intensity: 240, range: 95, cone: 12, inner: 5, scatter: 2.2, color: 0xfff4dc }, glowHead: 80, glowSize: 1.1, fleet: 'ЭР2-' + this.rng.int(1000, 1350) })]
    this.tails = [mk('veh_er2_tail', tailInfo, { k: 2, glowHead: 26, glowSize: 0.4, glowColor: 0xff2a12 })]
    this.motors = [0, 1, 2].map(i => mk('veh_er2_motor', midInfo, { k: 10 + i }))
    this.trailers = [0, 1, 2].map(i => mk('veh_er2_trailer', midInfo, { k: 20 + i }))
    this.active = false
    this.cars = []
    this.timer = this.rng.float(50, 110)
    this.entry = { x: 0, z: 0, speed: 0, type: 'train', model: 'er2', dir: 0, angle: 0, length: 0 }
  }

  init() {
    for (const g of [...this.heads, ...this.tails, ...this.motors, ...this.trailers]) g.init()
    const ctx = this.sys.ctx
    const t = ctx.game?.params?.traintest
    if (t !== undefined) {
      const [x, d] = String(t).split(',')
      this.start(d ? parseFloat(d) : 1, parseFloat(x) || 300)
    }
    ctx.registry.train = this.state = { active: false, x: 0, z: 0, dir: 0, speed: 0, length: 0, railway: RAILWAY }
  }

  get railY() { return this.sys.ctx.registry.railway?.y ?? RAILWAY.railY }
  track(dir) {
    const t = this.sys.ctx.registry.railway?.tracks ?? RAILWAY.tracks
    return dir < 0 ? t[0] : t[1]
  }

  /** Start a train. dir +1 = eastbound, −1 = westbound; headX optional (default: world end). */
  start(dir, headX) {
    const r = this.rng
    const n = r.weighted([[4, 0.2], [6, 0.5], [8, 0.3]])
    const mids = []
    for (let i = 0; i < n - 2; i++) mids.push(i % 2 === 0 ? this.motors[(i / 2) % 3] : this.trailers[((i - 1) / 2) % 3])
    this.cars = [this.heads[0], ...mids, this.tails[0]]
    this.dir = dir
    this.z = this.track(dir)
    this.speed = r.float(18.5, 22.5)
    this.x = headX ?? (dir > 0 ? RAILWAY.xMin : RAILWAY.xMax)
    this.active = true
    this.passSnd = null; this.passT = 0; this.horned = false; this.hornX = false; this.lastHorn = -99
    for (const c of this.cars) { c.lit = true; c.speed = this.speed }
    this._place()
    for (const c of this.cars) c.show(c.x, c.y, c.z, c.angle)
  }

  _place() {
    const a = this.dir < 0 ? Math.PI / 2 : -Math.PI / 2
    const y = this.railY
    this.cars.forEach((c, i) => {
      const cx = this.x - this.dir * (half + i * TRAIN_PITCH)
      c.set(cx, y, this.z, i === this.cars.length - 1 ? a + Math.PI : a)
    })
  }

  update(dt, ctx, cam, time) {
    const r = this.rng
    const st = this.state
    if (!this.active) {
      this.timer -= dt
      if (this.timer <= 0) {
        const h = this.sys.hour()
        if (h > 1.17 && h < 4.83) this.timer = 60
        else { this.start(r.chance(0.5) ? 1 : -1); this.timer = r.float(360, 720) }
      }
      if (st) st.active = false
      return
    }
    this.x += this.dir * this.speed * dt
    this._place()
    const len = this.cars.length * TRAIN_PITCH
    const tailX = this.x - this.dir * len
    if ((this.dir > 0 && tailX > RAILWAY.xMax + 20) || (this.dir < 0 && tailX < RAILWAY.xMin - 20)) {
      this.active = false
      for (const c of this.cars) c.hide()
      if (this.passSnd) { try { this.passSnd.stop(2) } catch { /* ignore */ } this.passSnd = null }
      return
    }
    for (const c of this.cars) c.dress(cam, time, dt)
    // ---- sound: the pass-by follows the nearest point of the train; horn on approach
    const audio = ctx.audio
    const ahead = (cam.x - this.x) * this.dir // > 0: the train is coming toward the player's x
    const lo = Math.min(this.x, tailX), hi = Math.max(this.x, tailX)
    const nx = Math.min(hi, Math.max(lo, cam.x))
    const dTrack = Math.hypot(cam.x - nx, cam.z - this.z)
    if (audio?.ready) {
      try {
        if (!this.passSnd && ahead > 0 && ahead < this.speed * 13 && dTrack < 420) {
          this.passSnd = audio.play('train_pass', { pos: [nx, this.railY + 1.5, this.z] })
          this.passT = time
        }
        if (this.passSnd) {
          this.passSnd.setPosition(nx, this.railY + 1.5, this.z)
          if (time - this.passT > 34) this.passSnd = null
        }
        const dHead = Math.hypot(cam.x - this.x, cam.z - this.z)
        if (!this.horned && ahead > 0 && dHead < 320 && time - this.lastHorn > 6) {
          this.horned = true; this.lastHorn = time
          this.horn = audio.play('train_horn', { pos: [this.x, this.railY + 4, this.z] }); this.hornT = time
        }
        const toCross = (RAILWAY.crossingX - this.x) * this.dir
        if (!this.hornX && toCross > 0 && toCross < 150 && Math.hypot(cam.x - RAILWAY.crossingX, cam.z - this.z) < 400 && time - this.lastHorn > 6) {
          this.hornX = true; this.lastHorn = time
          this.horn = audio.play('train_horn', { pos: [this.x, this.railY + 4, this.z] }); this.hornT = time
        }
        if (this.horn) { this.horn.setPosition(this.x, this.railY + 4, this.z); if (time - this.hornT > 4) this.horn = null }
      } catch { /* audio is optional */ }
    }
    if (st) {
      st.active = true; st.x = (this.x + tailX) / 2; st.z = this.z; st.dir = this.dir; st.speed = this.speed; st.length = len
      st.headX = this.x; st.tailX = tailX
    }
    const e = this.entry
    e.x = (this.x + tailX) / 2; e.z = this.z; e.speed = this.speed; e.dir = this.dir; e.length = len
  }
}

export { drawPainted }
