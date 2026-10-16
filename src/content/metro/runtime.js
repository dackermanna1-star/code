// Runtime of the metro: the terminus train cycle (arrive → «Конечная» → empty train into the
// turnaround → back on the other track → doors → «Осторожно, двери закрываются» → away), door
// leaves, passengers who get off and go up to the street (and the odd one who boards), the
// interval clock, escalator step bands and conveyors, turnstiles with their slamming flaps,
// the ticket office, platform-edge safety, sound emitters, and light/visibility culling.

import { Y, ESC, PLAT, TRACK, CAR, TUNNEL, TURN, STAIRS, LOWER, VEST, UNDERPASS, stairTreadY, escStepY } from './layout.js'
import { Train, approach, approachDuration, DOORS_HEAD, DOORS_MID } from './train.js'
import { LANES } from './vestibule.js'
import { COATS, faceAngle } from './people.js'
import { IntervalClock } from './clock.js'
import { ticketText } from './texts.js'

const F0 = Y.FLOOR
const ARRIVE_D = 200, ARRIVE_V = 15, BRAKE_A = 0.9, DEPART_A = 1.0
const ARRIVE_T = approachDuration(ARRIVE_D, ARRIVE_V, BRAKE_A)
const pt = (x, y, z, ride = false) => ({ x, y, z, ride })

// ---------------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------------
class Person {
  constructor(ctx, kind, tint) {
    this.kind = kind
    this.ps = ['stand', 'walk1', 'walk2'].map(pose => ctx.world.place(`metro_${kind}_${pose}`, {
      x: 0, y: -80, z: 0, dynamic: true, collide: false, visible: false, tint, tag: 'person', userData: { pkg: 'metro', role: 'passenger' },
    }))
    this.pose = 0; this.vis = false; this.busy = false
    this.x = 0; this.y = -80; this.z = 0; this.a = 0
  }
  setPose(i) {
    if (i === this.pose) return
    this.ps[this.pose].visible = false
    this.pose = i
    this.ps[i].visible = this.vis
    this.ps[i].set(this.x, this.y, this.z, this.a)
  }
  setVisible(v) { this.vis = v; for (let k = 0; k < 3; k++) this.ps[k].visible = v && k === this.pose }
  place(x, y, z, a) { this.x = x; this.y = y; this.z = z; this.a = a; this.ps[this.pose].set(x, y, z, a) }
  release() { this.setVisible(false); this.busy = false; this.place(0, -80, 0, 0) }
}

class Walker {
  /** path: [{x,y,z,ride}] — `ride` on a point means the segment leading to it is an escalator ride. */
  constructor(person, path, o = {}) {
    this.p = person; this.path = path; this.i = 0
    this.x = path[0].x; this.y = path[0].y; this.z = path[0].z
    this.speed = o.speed ?? 1.25
    this.delay = o.delay ?? 0
    this.onDone = o.onDone; this.onPoint = o.onPoint
    this.cycle = (Walker.n = (Walker.n || 0) + 1) * 0.37 % 2
    this.done = false
    this.hold = false // waits at its current point while true
    person.busy = true
    person.setVisible(true)
    person.place(this.x, this.y, this.z, person.a)
  }
  update(dt) {
    if (this.done) return
    if (this.delay > 0 || this.hold) { this.delay -= dt; this.p.setPose(0); return }
    const b = this.path[this.i + 1]
    if (!b) { this.done = true; this.onDone?.(this); return }
    const dx = b.x - this.x, dy = b.y - this.y, dz = b.z - this.z
    const L = b.ride ? Math.hypot(dx, dy, dz) : Math.hypot(dx, dz)
    const step = (b.ride ? ESC.speed : this.speed) * dt
    if (L < 1e-4 || step >= L) {
      this.x = b.x; this.y = b.y; this.z = b.z; this.i++
      this.onPoint?.(this, this.i)
    } else {
      const k = step / L
      this.x += dx * k; this.y += dy * k; this.z += dz * k
    }
    let a = this.p.a
    if (Math.hypot(dx, dz) > 0.05) a = faceAngle(dx, dz)
    if (b.ride) this.p.setPose(0)
    else { this.cycle += dt * this.speed / 0.42; this.p.setPose(1 + (Math.floor(this.cycle) % 2)) }
    this.p.place(this.x, this.y, this.z, a)
  }
}

/** Points up a stair from its foot to the street. */
function stairUp(st) {
  const xc = (st.x0 + st.x1) / 2 + (st.id.endsWith('W') ? -0.4 : 0.4)
  const zz = d => (st.rot === 0 ? st.zTop + d : st.zTop - d)
  return [pt(xc, F0, zz(10.3)), pt(xc, stairTreadY(9.8), zz(9.75)), pt(xc, stairTreadY(6.01), zz(6.0)), pt(xc, -2.0, zz(4.0)), pt(xc, 0.0, zz(0.2)), pt(xc, Y.SIDEWALK, zz(-0.8))]
}
function stairDown(st) { return stairUp(st).reverse() }

// ---------------------------------------------------------------------------------------------
// Door sounds: registered only if the audio package does not provide them
// ---------------------------------------------------------------------------------------------
function registerDoorSounds(audio) {
  if (!audio?.register || !audio.has) return
  const mk = (close) => (engine) => {
    const ac = engine.ctx
    const t = ac.currentTime
    const out = ac.createGain(); out.gain.value = 1
    // pneumatic hiss
    const n = ac.createBufferSource(); n.buffer = engine.noise('white', 2, close ? 31 : 37)
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800
    const g = ac.createGain()
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(close ? 0.12 : 0.16, t + 0.05)
    g.gain.setTargetAtTime(0, t + (close ? 0.35 : 0.5), 0.12)
    n.connect(hp); hp.connect(g); g.connect(out); n.start(t); n.stop(t + 1.4)
    // the leaves hitting home (close) or their stops (open)
    const at = t + (close ? 0.55 : 0.75)
    const o = ac.createOscillator(); o.type = 'sine'
    o.frequency.setValueAtTime(close ? 110 : 140, at); o.frequency.exponentialRampToValueAtTime(55, at + 0.18)
    const og = ac.createGain(); og.gain.setValueAtTime(0, t); og.gain.setValueAtTime(close ? 0.9 : 0.35, at); og.gain.setTargetAtTime(0, at + 0.01, close ? 0.07 : 0.05)
    o.connect(og); og.connect(out); o.start(t); o.stop(at + 0.6)
    const r = ac.createBufferSource(); r.buffer = engine.noise('white', 2, 41)
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 3
    const rg = ac.createGain(); rg.gain.setValueAtTime(0, t); rg.gain.setValueAtTime(close ? 0.35 : 0.15, at); rg.gain.setTargetAtTime(0, at + 0.01, 0.03)
    r.connect(bp); bp.connect(rg); rg.connect(out); r.start(t); r.stop(at + 0.5)
    return { output: out, duration: 1.4, stop(when) { try { n.stop(when); o.stop(when); r.stop(when) } catch { /* ended */ } } }
  }
  if (!audio.has('metro_door_open')) audio.register('metro_door_open', mk(false))
  if (!audio.has('metro_door_close')) audio.register('metro_door_close', mk(true))
}

// ---------------------------------------------------------------------------------------------
export class MetroRuntime {
  constructor(ctx, out) {
    this.ctx = ctx
    this.out = out
    this.rng = ctx.rng(20081216)
    this.time = 0
    this.train = new Train(ctx)
    this.clock = new IntervalClock(ctx)
    this.persons = []
    for (let i = 0; i < 7; i++) this.persons.push(new Person(ctx, i % 2 ? 'woman' : 'man', COATS[(i * 3) % COATS.length]))
    this.walkers = []
    this.phase = 'idle'
    this.t = 0
    this.wait = this.rng.float(70, 220) // the first train comes within a few minutes
    this.dwell = 30
    this.lastDeparture = -this.rng.float(150, 420)
    this.trainEm = null
    this.boarders = []
    this.loops = new Map()
    this.timers = { pa: this.rng.float(90, 200), drip: 2, freeRide: 0, slamSay: 0 }
    this._closingSaid = true
    this.passLane = -1; this.passT = 0
    this.fogK = 1
    this.groupsOn = {}
    this.visShallow = true; this.visDeep = true
    this.debug = null
  }

  init(ctx) {
    const st = ctx.game.state
    if (st.metroTrips === undefined) st.metroTrips = 0
    registerDoorSounds(ctx.audio)
    this.clock.build([
      { x: PLAT.x0 + 0.26, y: -12.5, z: TRACK.S.axis, angle: Math.PI / 2 },
      { x: PLAT.x1 - 0.26, y: -12.5, z: TRACK.N.axis, angle: -Math.PI / 2 },
    ])
    this.clock.set(ctx.atmos.minutes, this.time - this.lastDeparture, true)
    // dev / screenshot states: ?metro=docked|dockedS|arrive|arriveS|depart|people
    const dbg = ctx.game.params?.metro
    if (dbg) this._debugState(dbg)
  }

  // ---- helpers ------------------------------------------------------------------------------
  minutes() { return this.ctx.atmos.minutes % 1440 }
  serviceClosed() { const m = this.minutes(); return m >= 65 && m < 335 } // 01:05–05:35: no trains
  escalatorsStopped() { const m = this.minutes(); return m >= 90 && m < 320 }
  night() { const m = this.minutes(); return m >= 22 * 60 || m < 6.5 * 60 }
  nextInterval() {
    const r = this.rng
    if (this.night()) return r.float(240, 540)
    return r.weighted([[r.float(110, 230), 0.35], [r.float(230, 420), 0.4], [r.float(420, 560), 0.25]])
  }
  freePerson() { return this.persons.find(p => !p.busy) || null }
  audioOk() { const a = this.ctx.audio; return a && a.ready }
  play(name, o) {
    const a = this.ctx.audio
    if (!a?.ready || !a.has?.(name)) return null
    try { return a.play(name, o) } catch { return null }
  }
  speak(text, o) {
    const rs = this.ctx.registry?.audio?.playSpeech
    if (!rs || !this.audioOk()) return null
    try { return rs(text, o) } catch { return null }
  }
  playerIn(min, max) {
    const p = this.ctx.player.pos
    return p.x >= min[0] && p.x <= max[0] && p.y >= min[1] && p.y <= max[1] && p.z >= min[2] && p.z <= max[2]
  }
  onPlatform() { return this.playerIn([LOWER.x0 - 3, -17, PLAT.wallN], [PLAT.x1 + 1, -14, PLAT.wallS]) }
  inMetro() { const p = this.ctx.player.pos; return p.y < -1.6 && p.x > UNDERPASS.x0 - 1 }

  /** Is the player inside the docked train, or standing in one of its doorways? */
  playerInTrain(margin = 0) {
    const tr = this.train
    if (!tr.visible) return false
    const p = this.ctx.player.pos
    if (p.y < -16.6 || p.y > -14.5) return false
    const [x0, x1] = tr.extent()
    if (p.x < x0 - 0.5 || p.x > x1 + 0.5) return false
    const T = TRACK[tr.track]
    const inBody = p.z > T.z0 - 0.05 && p.z < T.z1 + 0.05
    if (inBody) return true
    if (margin > 0) {
      const side = T.platSide > 0 ? T.z1 : T.z0
      if (Math.abs(p.z - side) < margin) return this.nearDoor(p.x, 1.0)
    }
    return false
  }
  nearDoor(x, w) {
    const tr = this.train
    for (let i = 0; i < CAR.n; i++) for (let d = 0; d < 4; d++) if (Math.abs(x - tr.doorX(i, d)) < w) return true
    return false
  }

  // ---- train cycle --------------------------------------------------------------------------
  startArrival(track) {
    const tr = this.train
    tr.setTrack(track)
    tr.doorF = 0
    tr.head = TRACK[track].stopHead - TRACK[track].dir * ARRIVE_D
    tr.show(true)
    this.phase = track === 'N' ? 'arriveN' : 'arriveS'
    this.t = 0
    this.arriveSound = false
    // passengers riding in to the terminus (none on the empty train back from the turnaround)
    if (track === 'N') {
      const n = this.night() ? this.rng.int(0, 2) : this.rng.int(1, 3)
      for (let k = 0; k < n; k++) {
        const P = this.freePerson()
        if (!P) break
        P.busy = true
        const car = this.rng.int(0, CAR.n - 1), door = this.rng.int(0, 3)
        const doors = car === 0 || car === CAR.n - 1 ? DOORS_HEAD : DOORS_MID
        const s = tr.slots[car]
        const dx = (s.rot === 0 ? doors[door] : -doors[door]) + this.rng.float(-0.4, 0.4)
        const dz = TRACK.N.platSide * this.rng.float(0.35, 0.7)
        P.setPose(0)
        tr.riders.push({ person: P, car, dx, dz, angle: faceAngle(0, TRACK.N.platSide), alight: true, door })
        P.setVisible(true)
      }
    } else {
      this.spawnBoarders()
    }
    tr.update()
  }

  spawnBoarders() {
    const p = this.ctx.player.pos
    const n = this.night() ? this.rng.int(0, 1) : this.rng.int(0, 2)
    const deep = p.y < -6
    const ne = STAIRS.find(s => s.id === 'NE')
    const fromStreet = !deep && Math.hypot(p.x - 391, p.z - 507) > 30 && p.y > -1
    if (!deep && !fromStreet) return
    for (let k = 0; k < n; k++) {
      const P = this.freePerson()
      if (!P) break
      const tr = this.train
      const car = this.rng.int(1, CAR.n - 2), door = this.rng.int(0, 3)
      // door x for the S train docked at its stop (computed from the stop head, before it arrives)
      const head = TRACK.S.stopHead
      const cx = head - TRACK.S.dir * (CAR.pitch / 2 + CAR.pitch * car)
      const xd = cx - DOORS_MID[door] // mid cars run rot 2 on the S track
      const path = []
      if (fromStreet) {
        path.push(pt(391.5, 0.5, 503.5), ...stairDown(ne), pt(386.0, F0, 523.5), pt(385.4, F0, 538.5))
      }
      path.push(pt(391.8, F0, 540.0), pt(396.0, F0, 539.4), pt(400.3, F0, 538.125), pt(403.3, F0, 538.125), pt(408.5, F0, 541.5),
        pt(411.8, F0, 541.5), pt(435.2, Y.PLAT, 541.5, true), pt(437.6, Y.PLAT, 541.5), pt(442.0, Y.PLAT, 544.0), pt(xd + this.rng.float(-0.5, 0.5), Y.PLAT, 544.1))
      const w = new Walker(P, path, { delay: k * this.rng.float(2, 6) + (fromStreet ? 0 : this.rng.float(0, 6)), speed: this.rng.float(1.15, 1.4) })
      w.board = { car, door, xd }
      w.onPoint = (wk, i) => { if (wk.path[i] && Math.abs(wk.path[i].x - 400.3) < 0.01) this.turnstileClick(wk.x, wk.z) }
      w.onDone = wk => { wk.waiting = true; wk.done = false; wk.hold = true }
      this.walkers.push(w)
      this.boarders.push(w)
      void tr
    }
  }

  turnstileClick(x, z) {
    const p = this.ctx.player.pos
    if (Math.hypot(p.x - x, p.y - F0, p.z - z) < 30) this.play('turnstile', { pos: [TURN.x0 + 0.1, F0 + 1.0, z], kind: 'pass', gain: 0.8 })
  }

  /** Send riders of the docked N train out onto the platform and up to the street. */
  alight() {
    const tr = this.train
    const keep = []
    let k = 0
    for (const r of tr.riders) {
      if (!r.alight) { keep.push(r); continue }
      const P = r.person
      const x = P.x, z = P.z
      const exit = this.rng.chance(0.5) ? 'NE' : 'SE'
      const st = STAIRS.find(s => s.id === exit)
      const aisle = 536.0 + this.rng.float(-0.2, 0.25)
      const path = [pt(x, Y.PLAT, z), pt(x, Y.PLAT, TRACK.N.z1 + 0.15), pt(x - 0.6, Y.PLAT, aisle), pt(446.5, Y.PLAT, aisle + 0.2), pt(442.5, Y.PLAT, 538.5),
        pt(435.4, Y.PLAT, 538.5), pt(412.0, F0, 538.5, true), pt(410.3, F0, 538.5), pt(404.0, F0, 541.875), pt(399.6, F0, 541.875),
        pt(395.0, F0, 540.0), pt(390.6, F0, 540.0), pt(386.0, F0, 540.0)]
      if (exit === 'NE') path.push(pt(385.6, F0, 524.0), pt(390.6, F0, 520.6), ...stairUp(st).slice(1), pt(391.6, Y.SIDEWALK, 506.5), pt(392.6, 0.5, 503.0))
      else path.push(pt(385.6, F0, 556.0), pt(390.6, F0, 559.6), ...stairUp(st).slice(1), pt(391.6, Y.SIDEWALK, 573.0), pt(396.5, Y.SIDEWALK, 574.5))
      const w = new Walker(P, path, { delay: 0.6 + k * this.rng.float(0.6, 1.8), speed: this.rng.float(1.15, 1.45) })
      w.onDone = wk => wk.p.release()
      this.walkers.push(w)
      k++
    }
    tr.riders = keep
  }

  /** Boarders waiting at the S train's doors step in and ride away. */
  board() {
    const tr = this.train
    for (const w of this.boarders) {
      if (!w.waiting || w.boarded) continue
      const P = w.p
      w.boarded = true
      const zIn = TRACK.S.axis + TRACK.S.platSide * -0.1 - 0.2
      const xIn = P.x
      // a short walk in, then become a rider
      w.path = [pt(P.x, Y.PLAT, P.z), pt(xIn, Y.PLAT, TRACK.S.z0 - 0.1), pt(xIn + this.rng.float(-0.3, 0.3), Y.PLAT, zIn)]
      w.i = 0; w.hold = false; w.done = false; w.delay = this.rng.float(0.2, 1.2)
      w.onDone = wk => {
        const cx = tr.carX(wk.board.car)
        tr.riders.push({ person: wk.p, car: wk.board.car, dx: wk.x - cx, dz: wk.z - tr.z, angle: faceAngle(this.rng.float(-1, 1), 0.2), alight: false })
        wk.p.setPose(0)
        const i = this.walkers.indexOf(wk); if (i >= 0) this.walkers.splice(i, 1)
      }
    }
  }

  boardersPending() { return this.boarders.some(w => !w.boarded || !w.done) }

  updateTrain(dt) {
    const tr = this.train
    const T = TRACK[tr.track]
    this.t += dt
    const ph = this.phase
    const playerNear = this.inMetro() && this.ctx.player.pos.x > 400
    if (ph === 'idle' || ph === 'turnaround') {
      tr.visible && tr.show(false)
      if (this.serviceClosed()) { this.t = 0; return }
      if (this.t >= this.wait) this.startArrival(ph === 'idle' ? 'N' : 'S')
      return
    }
    if (ph === 'arriveN' || ph === 'arriveS') {
      const a = approach(this.t, ARRIVE_D, ARRIVE_V, BRAKE_A)
      tr.head = T.stopHead - T.dir * (ARRIVE_D - a.s)
      if (!this.arriveSound && this.t > ARRIVE_T - 18.5) {
        this.arriveSound = true
        this.trainEm = this.play('metro_train_arrive', { pos: [tr.head, -15.5, tr.z] })
        if (ph === 'arriveN' && playerNear && this.onPlatform() && this.rng.chance(0.5)) this.play('announcement', { pos: [490, -12.6, 540], phrase: 0, gain: 0.8 })
      }
      if (a.done) { tr.head = T.stopHead; this.phase = ph === 'arriveN' ? 'dwellN' : 'dwellS'; this.t = 0; this.dwell = ph === 'arriveN' ? this.rng.float(26, 34) : this.rng.float(45, 95); this.said = {} }
    } else if (ph === 'dwellN' || ph === 'dwellS') {
      const N = ph === 'dwellN'
      if (N && this.t > 1.2 && !this.said.station) {
        this.said.station = true
        this.play('metro_station_announce', { pos: [tr.carX(2), -14.5, tr.z], terminus: true })
        if (this.onPlatform() || this.playerInTrain()) this.ctx.ui.say({ ru: 'Станция «Заречная». Конечная. Поезд дальше не идёт, просьба освободить вагоны.', en: '"Zarechnaya". Terminus. This train goes no further, please leave the cars.' }, 6)
      }
      if (this.t > 2.0 && !this.said.open) { this.said.open = true; this.play('metro_door_open', { pos: [tr.carX(2), -15, tr.z + T.platSide * 1.4], gain: 0.9 }) }
      if (this.t > 2.0) tr.doorF = Math.min(1, tr.doorF + dt / 1.1)
      if (N && this.t > 3.2 && !this.said.alight) { this.said.alight = true; this.alight() }
      if (!N && tr.doorF >= 1) this.board()
      if (N && this.t > 13 && !this.said.pa) { this.said.pa = true; if (this.onPlatform()) this.play('announcement', { pos: [494, -12.6, 540], phrase: 4 }) }
      const extra = !N && this.boardersPending() && this.t < this.dwell + 60
      if (this.t > this.dwell && !extra) { this.phase = N ? 'closingN' : 'closingS'; this.t = 0; this.closeStart = -1; this.holdT = 0 }
    } else if (ph === 'closingN' || ph === 'closingS') {
      const N = ph === 'closingN'
      const blocked = this.playerInTrain(0.75)
      if (blocked) {
        // doors stay open; the announcement repeats until the cars are empty
        tr.doorF = Math.min(1, tr.doorF + dt / 0.8)
        this.closeStart = -1
        this.holdT -= dt
        if (this.holdT <= 0) {
          this.holdT = 9
          this.play('metro_chime', { pos: [tr.carX(2), -12.6, 540], gain: 0.7 })
          const em = this.speak('Освободи+те ваго+ны. По+езд да+льше не идё+т.', { chain: 'pa', voice: 'male', pos: [tr.carX(2), -12.6, 540] })
          if (!em) this.play('announcement', { pos: [tr.carX(2), -12.6, 540], phrase: 4 })
          this.ctx.ui.say({ ru: '«Освободите вагоны. Поезд дальше не идёт».', en: '"Please leave the cars. This train goes no further."' }, 5)
        }
        this.t = 0
        tr.update()
        return
      }
      if (this.closeStart < 0) {
        this.closeStart = this.t
        if (N) this.play('metro_door_close', { pos: [tr.carX(2), -15, tr.z + T.platSide * 1.4] })
        else this.play('metro_doors', { pos: [tr.carX(2), -14.5, tr.z + T.platSide * 1.4] })
      }
      const lead = N ? 0.35 : 2.85 // the slam in 'metro_doors' comes after the warning
      const k = this.t - this.closeStart - lead
      if (k > 0) tr.doorF = Math.max(0, tr.doorF - dt / 0.55)
      if (tr.doorF <= 0 && k > 2.2) {
        this.phase = N ? 'departN' : 'departS'; this.t = 0
        this.departSound = false
        this.intervalReset = false
      }
    } else if (ph === 'departN' || ph === 'departS') {
      if (!this.departSound && this.t > 0.3) { this.departSound = true; this.trainEm = this.play('metro_train_depart', { pos: [tr.head, -15.5, tr.z] }) }
      tr.head = T.stopHead + T.dir * 0.5 * DEPART_A * this.t * this.t
      const tail = tr.head - T.dir * CAR.pitch * CAR.n
      const mouth = T.dir > 0 ? PLAT.x1 : PLAT.x0
      if (!this.intervalReset && (T.dir > 0 ? tail > mouth : tail < mouth)) { this.intervalReset = true; this.lastDeparture = this.time }
      const end = T.dir > 0 ? TUNNEL.east[1] + 2 : TUNNEL.west[0] - 2
      if (T.dir > 0 ? tail > end : tail < end) {
        tr.show(false)
        for (const r of tr.riders) r.person.release()
        tr.riders = []
        this.boarders = this.boarders.filter(w => !w.boarded) // whoever missed it waits for the next one
        this.phase = ph === 'departN' ? 'turnaround' : 'idle'
        this.t = 0
        this.wait = ph === 'departN' ? this.rng.float(55, 140) : this.nextInterval()
      }
    }
    if (this.trainEm) { try { this.trainEm.setPosition(tr.head - T.dir * 4, -15.5, tr.z) } catch { this.trainEm = null } }
    tr.update()
  }

  // ---- turnstiles, kassa ----------------------------------------------------------------------
  buyTicket(game) {
    if (this.serviceClosed()) { game.ui.say({ ru: 'Касса закрыта. Станция откроется в 5:30.', en: 'The ticket office is closed. The station opens at 5:30.' }, 4); return }
    const st = game.state
    st.metroTrips = (st.metroTrips || 0) + 1
    st.metroTicketsBought = (st.metroTicketsBought || 0) + 1
    const serial = String(4710000 + Math.floor(this.rng.next() * 89999)).padStart(7, '0')
    this.play('cashier_voice', { pos: [394.75, F0 + 1.4, 532.4], phrase: this.rng.pick([1, 3, 5]) })
    game.ui.showNote(ticketText(1, `${serial.slice(0, 3)} ${serial.slice(3)}`))
  }

  updateTurnstiles(dt) {
    const out = this.out
    for (const f of out.flaps) {
      if (f.t > 0) { f.t -= dt; if (f.t <= 0) { f.p.visible = false; f.p.collide = false } }
    }
    if (this.passT > 0) this.passT -= dt
    const P = this.ctx.player
    const p = P.pos
    if (p.y > F0 + 0.8 || p.y < F0 - 0.6 || p.x < TURN.x0 - 0.7 || p.x > TURN.x0 + 0.5) return
    const lane = LANES.find(L => p.z >= L.z0 && p.z <= L.z1)
    if (!lane) return
    if (P.vel.x <= 0.05) return
    if (this.passLane === lane.i && this.passT > 0) return
    if (p.x < TURN.x0 - 0.5) return
    const free = this.serviceClosed()
    const trips = this.ctx.game.state.metroTrips || 0
    if (free) { this.passLane = lane.i; this.passT = 4; return }
    if (lane.entry && trips > 0) {
      this.ctx.game.state.metroTrips = trips - 1
      this.passLane = lane.i; this.passT = 5
      this.play('turnstile', { pos: [TURN.x0, F0 + 1.0, (lane.z0 + lane.z1) / 2], kind: 'pass' })
      return
    }
    const f = this.out.flaps[lane.i]
    if (f.t > 0) return
    f.t = 2.4; f.p.visible = true; f.p.collide = true
    this.play('turnstile', { pos: [TURN.x0 + 0.9, F0 + 0.8, (lane.z0 + lane.z1) / 2], kind: 'slam' })
    if (this.timers.slamSay <= 0) {
      this.timers.slamSay = 25
      this.ctx.ui.say(lane.entry
        ? { ru: 'Створки захлопнулись. Нужен билет — касса у входа.', en: 'The flaps slammed shut. You need a ticket — the ticket office is by the entrance.' }
        : { ru: 'Входа нет — это выход.', en: 'No entry — this lane is the exit.' }, 4)
    }
  }

  // ---- platform edge ----------------------------------------------------------------------------
  guardEdges() {
    const P = this.ctx.player
    const p = P.pos
    if (p.y < -16.7 || p.y > -15.2 || p.x < LOWER.x0 || p.x > PLAT.x1) return
    const tr = this.train
    const open = (track) => tr.visible && tr.track === track && tr.doorF > 0.6 && (this.phase.startsWith('dwell') || this.phase.startsWith('closing'))
    if (p.z < PLAT.edgeN + 0.25 && p.z > TRACK.N.z1 - 0.45) {
      if (!(open('N') && this.nearDoor(p.x, 0.5))) { p.z = PLAT.edgeN + 0.25; if (P.vel.z < 0) P.vel.z = 0 }
    }
    if (p.z > PLAT.edgeS - 0.25 && p.z < TRACK.S.z0 + 0.45) {
      if (!(open('S') && this.nearDoor(p.x, 0.5))) { p.z = PLAT.edgeS - 0.25; if (P.vel.z > 0) P.vel.z = 0 }
    }
  }

  // ---- escalators ----------------------------------------------------------------------------
  updateEscalators(dt) {
    const stopped = this.escalatorsStopped()
    const steps = ESC.speed / Math.hypot(ESC.run, ESC.rise) // steps per second
    for (const e of this.out.escalators) {
      if (!e.zone.__conv) e.zone.__conv = e.zone.conveyor
      e.zone.conveyor = stopped ? null : e.zone.__conv
      e.running = !stopped
      if (!stopped) e.phase = (e.phase + dt * steps) % 1
      const s = stopped ? 0 : e.phase
      const [bx, by, bz] = e.base
      e.band.set(bx + e.dir * ESC.run * s, by - e.dir * ESC.rise * s, bz, 0)
    }
    // the comb plate clack when the player steps on
    const z = this.ctx.game.zone
    const onEsc = z && z.data?.escalator ? z.data.escalator : null
    if (onEsc && onEsc !== this._lastEsc && !stopped) {
      const p = this.ctx.player.pos
      this.play('escalator_step', { pos: [p.x, p.y, p.z], gain: 0.8 })
      if (this.rng.chance(0.25) && this.timers.freeRide <= 0) { this.timers.freeRide = 120; this.play('announcement', { pos: [438.5, -13.8, 543.5], phrase: 3, gain: 0.8 }) }
    }
    this._lastEsc = onEsc
  }

  // ---- sound emitters -------------------------------------------------------------------------
  loop(key, want, name, pos, opts) {
    let em = this.loops.get(key)
    if (want && !em) {
      em = this.play(name, { ...opts, pos, loop: true })
      if (em) this.loops.set(key, em)
    } else if (!want && em) {
      try { em.stop(0.6) } catch { /* ignore */ }
      this.loops.delete(key)
    }
  }

  updateAudio(dt) {
    if (!this.audioOk()) return
    const p = this.ctx.player.pos
    const d = (x, y, z) => Math.hypot(p.x - x, (p.y - y) * 1.5, p.z - z)
    // fluorescent tubes: the two nearest working ones and the dying one
    const tubes = this.out.tubes
    const near = []
    for (let i = 0; i < tubes.length; i++) {
      const t = tubes[i]
      if (t.state === 'dead') continue
      const dd = d(t.x, t.y, t.z)
      if (dd < 11) near.push([dd, i])
    }
    near.sort((a, b) => a[0] - b[0])
    const want = new Set(near.slice(0, 2).map(n => n[1]))
    tubes.forEach((t, i) => { if (t.state === 'dying' && d(t.x, t.y, t.z) < 16) want.add(i) })
    tubes.forEach((t, i) => this.loop('tube' + i, want.has(i), 'fluorescent_buzz', [t.x, t.y, t.z], { gain: t.state === 'dying' ? 0.9 : 0.55, failing: t.state === 'dying' }))
    // escalator machinery
    for (const e of this.out.escalators) {
      const zc = e.base[2] + 0.5, xm = (ESC.xTop + ESC.xBot) / 2
      this.loop('esc' + e.lane, e.running && d(xm, escStepY(xm), zc) < 40, 'escalator_loop', [xm, escStepY(xm) + 0.3, zc], { gain: 0.8 })
    }
    // kiosk radio, platform ventilation
    const dvd = this.out.kiosks.find(k => k.kind === 'dvd')
    if (dvd) this.loop('radio', d(dvd.x, dvd.y, dvd.z) < 22 && !this.serviceClosed(), 'radio_distant', [dvd.x, dvd.y, dvd.z], { gain: 0.32, variant: 1 })
    this.loop('vent', this.onPlatform(), 'ventilation', [PLAT.x1 + 0.2, -13.2, 541.75], { gain: 0.35 })
    // the leak
    const drip = this.out.drips[0]
    if (drip && d(drip[0], drip[1], drip[2]) < 14) {
      this.timers.drip -= dt
      if (this.timers.drip <= 0) { this.timers.drip = this.rng.float(1.4, 4.5); this.play('drip', { pos: [drip[0], F0 + 0.3, drip[2]], gain: 0.9 }) }
    }
    // station PA now and then, and closing time
    if (this.inMetro() && p.x > 395) {
      this.timers.pa -= dt
      if (this.timers.pa <= 0) {
        this.timers.pa = this.rng.float(170, 360)
        const pos = p.y < -10 ? [494, -12.6, 540] : [403, F0 + 2.4, 540]
        this.play('announcement', { pos, phrase: this.rng.pick([2, 5, 2]), gain: 0.85 })
      }
      const m = Math.floor(this.minutes())
      if (m < 52 || m >= 60) this._closingSaid = false
      else if (!this._closingSaid) {
        this._closingSaid = true
        this.speak('Уважа+емые пассажи+ры. Ста+нция закрыва+ется. Про+сьба поки+нуть ста+нцию.', { chain: 'pa', voice: 'female', pos })
        this.ctx.ui.say({ ru: '«Уважаемые пассажиры, станция закрывается».', en: '"Dear passengers, the station is closing."' }, 5)
      }
    }
  }

  // ---- culling of lights and placements ---------------------------------------------------------
  updateCulling() {
    const p = this.ctx.player.pos
    const nearUnderpass = p.x > UNDERPASS.x0 - 22 && p.x < UNDERPASS.x1 + 22 && p.z > 498 && p.z < 582 && p.y < 6
    const under = p.y < -1.6
    const groups = {
      underpass: nearUnderpass,
      vestibule: (under && p.x > 380 && p.x < 445) || (nearUnderpass && p.y < 0),
      deep: under && p.x > 388,
      tunnel: under && p.x > 425,
    }
    for (const [k, on] of Object.entries(groups)) {
      if (this.groupsOn[k] === on) continue
      this.groupsOn[k] = on
      for (const l of this.out.lightGroups[k] || []) l.enabled = on
    }
    const shallow = nearUnderpass || under
    if (shallow !== this.visShallow) { this.visShallow = shallow; for (const q of this.out.underground) q.visible = shallow && !q.userData.hidden }
    const deep = under && p.x > 386
    if (deep !== this.visDeep) {
      this.visDeep = deep
      for (const q of this.out.deep) q.visible = deep
      if (!deep) for (const q of this.out.deep) void q
    }
  }

  updateFog(dt) {
    const a = this.ctx.atmos
    if (!a || !(a.fogMul > 0)) return
    const p = this.ctx.player.pos
    const target = p.y < -1.8 && p.x > UNDERPASS.x0 - 1 ? 0.3 : 1
    const k = this.fogK + (target - this.fogK) * Math.min(1, dt * 1.5)
    if (Math.abs(k - this.fogK) < 1e-5) return
    a.fogMul = a.fogMul / this.fogK * k
    this.fogK = k
  }

  update(dt, ctx) {
    this.time += dt
    if (this.timers.slamSay > 0) this.timers.slamSay -= dt
    if (this.timers.freeRide > 0) this.timers.freeRide -= dt
    this.updateCulling()
    this.updateEscalators(dt)
    this.updateTrain(dt)
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i]
      w.update(dt)
      if (w.done && !w.waiting) this.walkers.splice(i, 1)
    }
    this.updateTurnstiles(dt)
    this.guardEdges()
    this.clock.set(ctx.atmos.minutes, this.time - this.lastDeparture, Math.floor(this.time * 2) % 2 === 0)
    this.updateAudio(dt)
    this.updateFog(dt)
    const reg = ctx.registry.metro
    if (reg) {
      reg.phase = this.phase
      reg.trainVisible = this.train.visible
      reg.trainTrack = this.train.track
      reg.trainHead = this.train.head
      reg.interval = this.time - this.lastDeparture
      reg.nextArrivalIn = this.phase === 'idle' ? Math.max(0, this.wait - this.t) : null
    }
  }

  // ---- debug / screenshots ----------------------------------------------------------------------
  _debugState(s) {
    const tr = this.train
    if (s === 'docked' || s === 'dockedS' || s === 'people') {
      const track = s === 'dockedS' ? 'S' : 'N'
      this.startArrival(track)
      tr.head = TRACK[track].stopHead
      tr.doorF = 1
      this.phase = track === 'N' ? 'dwellN' : 'dwellS'
      this.t = 5; this.dwell = 1e9
      this.said = { station: true, open: true, alight: s !== 'people', pa: true }
      if (s === 'people') { this.t = 3.3; this.alight(); for (const w of this.walkers) { w.delay = 0; for (let k = 0; k < 60; k++) w.update(0.05) } }
    } else if (s.startsWith('arrive')) {
      // arrive[S][:seconds before the stop]
      const [name, sec] = s.split(':')
      this.startArrival(name === 'arriveS' ? 'S' : 'N')
      this.t = ARRIVE_T - (sec ? parseFloat(sec) : 7)
      this.updateTrain(0.0001)
    } else if (s === 'depart') {
      this.startArrival('N')
      this.phase = 'departN'; this.t = 7; this.departSound = true
    }
    tr.update()
    this.debug = s
  }
}
