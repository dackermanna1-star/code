// Ambience director (an AudioEngine controller): continuous layered beds that follow the zone,
// weather, time of day and location; sparse spatial one-shots far from the player; silence
// events; sparse ambient music. All gains move with setTargetAtTime (no clicks), automation is
// updated ~10× per second, and every node graph is built once and reused.

import { bank } from './bank.js'
import { bufferVoice } from './sounds.js'
import { getMix, updateMix, setDuck, setShelf, playFoley } from './mix.js'
import { buildPiece } from './music.js'
import { makeRng, clamp, smooth } from './dsp.js'

const AVENUE_Z = 540 // проспект Строителей centre line
const RAIL_Z = 48
const db = d => Math.pow(10, d / 20)
export { AVENUE_Z }

export class Director {
  constructor(ctx = null) {
    this.r = makeRng(1408)
    this.started = false
    this.acc = 0
    this.time = 0 // seconds since audio start (game-running time)
    this.env = { outdoor: 1, under: 0, indoor: 0, silenceZone: 0, avenue: 0, open: 0.6, corner: 0, night: 0, hour: 17 }
    this.silence = { state: 'normal', t: 0, next: this.r.range(480, 900), hold: 0, breathT: 3 }
    this.music = { next: this.r.range(240, 420), piece: null, endAt: 0, rendering: false, count: 0 }
    this.timers = {}
    this.janitor = null
    this.rays = { i: 0, d: new Float32Array(8).fill(30), t: 0 }
    this.beds = null
    this.ctxRef = ctx
    this.debug = { events: [] }
    this._unsub = null
  }

  // ---- lifecycle ---------------------------------------------------------------------------
  _start(engine, game) {
    this.started = true
    this.engine = engine
    this.mix = getMix(engine)
    const ctx = engine.ctx
    const amb = engine.bus.ambience
    const mk = (type, f, q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n }
    const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g }
    const pan = () => (ctx.createStereoPanner ? ctx.createStereoPanner() : gain(1))
    const B = this.beds = {}
    // each bed: source voice → filters → gain → (panner) → ambience bus
    const bed = (name, key, chain, v = 0) => {
      const out = gain(0)
      let head = out
      for (let i = chain.length - 1; i >= 0; i--) { chain[i].connect(head); head = chain[i] }
      out.connect(amb)
      const voice = bufferVoice(engine, key, v, { loop: true, gain: 1, sync: false })
      voice.output.connect(head)
      B[name] = { out, voice, chain, level: 0 }
      return B[name]
    }
    bed('city', 'bed_city', [mk('lowpass', 420)])
    B.trafficPan = pan()
    bed('traffic', 'bed_traffic', [mk('lowpass', 2500, 0.6), B.trafficPan])
    bed('wind', 'bed_brown', [mk('lowpass', 350, 0.7), mk('lowpass', 2000, 0.5)])
    // white noise feeds whistles, corner howl and blowing snow
    const white = bufferVoice(engine, 'bed_white', 0, { loop: true, gain: 1, sync: false })
    B.white = white
    const wh1 = mk('bandpass', 320, 45), wh2 = mk('bandpass', 230, 55)
    B.whistlePan = pan()
    B.whistle = { out: gain(0), f: [wh1, wh2] }
    white.output.connect(wh1); white.output.connect(wh2)
    wh1.connect(B.whistle.out); wh2.connect(B.whistle.out)
    B.whistle.out.connect(B.whistlePan); B.whistlePan.connect(amb)
    B.howl = { out: gain(0) }
    for (const f of [180, 410, 620]) { const b = mk('bandpass', f, 15); white.output.connect(b); b.connect(B.howl.out) }
    B.howl.out.connect(amb)
    const hs = mk('highpass', 4200, 0.7)
    B.hiss = { out: gain(0) }
    white.output.connect(hs); hs.connect(B.hiss.out); B.hiss.out.connect(amb)
    bed('room', 'bed_room', [mk('lowpass', 600)])
    bed('under', 'bed_underground', [mk('lowpass', 3000)])
    B.wiresPan = pan()
    bed('wires', 'wires_hum', [B.wiresPan])

    // listen for interactions (they end a silence event) and zone changes
    try {
      this._unsub = game.events.on('interact', () => { if (this.silence.state === 'fading' || this.silence.state === 'silent') this._endSilence() })
    } catch { /* events optional */ }
    // ask the worker for the far one-shots we will schedule
    for (const k of ['dog_bark', 'crow_caw', 'distant_door_slam', 'traffic_far', 'metro_rumble', 'drip', 'breath']) bank.requestAll(k)
    window.__audioDirector = this
  }

  update(dt, engine, game) {
    if (!engine.ready || !engine.ctx) return
    if (!this.started) {
      // wait until the core beds are rendered to avoid main-thread renders at the first click
      this._start(engine, game)
    }
    if (dt <= 0) return
    this.time += dt
    updateMix(this.mix)
    this._rays(dt, game)
    this.acc += dt
    if (this.acc < 0.1) return
    const step = this.acc
    this.acc = 0
    const env = this._env(step, engine, game)
    this._silence(step, engine, game, env)
    this._beds(step, engine, game, env)
    this._events(step, engine, game, env)
    this._music(step, engine, game, env)
  }

  // ---- environment ------------------------------------------------------------------------
  _rays(dt, game) {
    // openness probe: 8 horizontal rays at ear height, one per frame, refreshed ~1.5 s
    const R = this.rays
    R.t += dt
    if (R.t < 0.18) return
    R.t = 0
    const w = game?.world, p = game?.player?.pos
    if (!w || !p) return
    const a = (R.i / 8) * Math.PI * 2
    try {
      const hit = w.raycast(p.x, p.y + 1.6, p.z, Math.cos(a), 0, Math.sin(a), 40, 1.0)
      R.d[R.i] = hit ? hit.dist : 40
    } catch { R.d[R.i] = 30 }
    R.i = (R.i + 1) % 8
  }

  _env(dt, engine, game) {
    const E = this.env
    const zone = game?.zone || {}
    const atm = game?.atmos
    const p = game?.player?.pos || engine.listener
    const reverb = zone.reverb || 'outdoor'
    const underTarget = (p.y < -3 || reverb === 'metro' || reverb === 'underpass' || reverb === 'tunnel' || zone.type === 'metro' || zone.type === 'underpass') ? 1 : 0
    const indoorTarget = zone.indoor ? 1 : 0
    const k = 1 - Math.exp(-dt / 0.6)
    E.under += (underTarget - E.under) * k
    E.indoor += (indoorTarget - E.indoor) * k
    E.outdoor = clamp(1 - Math.max(E.indoor, E.under), 0, 1)
    E.silenceZone += ((zone.silence ? 1 : 0) - E.silenceZone) * (1 - Math.exp(-dt / 1.5))
    E.zoneWind = zone.wind ?? 1
    E.zoneTraffic = zone.traffic ?? 1
    E.reverb = reverb
    E.x = p.x; E.y = p.y; E.z = p.z
    E.minutes = atm?.minutes ?? 17 * 60
    E.hour = E.minutes / 60
    const h = E.hour
    // night quietness (23–5 quiet hours, deepest at 3)
    E.night = h >= 23 || h < 5 ? 1 : h >= 21 ? (h - 21) / 2 : h < 6.5 ? 1 - (h - 5) / 1.5 : 0
    E.snow = atm?.cur?.snow ?? 0.3
    E.windSpeed = atm?.windSpeed ?? atm?.cur?.wind ?? 1
    E.gust = atm?.gust ?? 0
    // avenue proximity (0..1): louder near z 520–560
    const dz = Math.abs(E.z - AVENUE_Z)
    E.avenueDist = dz
    E.avenue = clamp(1 - (dz - 18) / 220, 0, 1)
    // openness from the ray probe
    const R = this.rays.d
    let sum = 0, mn = 99, mx = 0
    for (let i = 0; i < 8; i++) { sum += R[i]; mn = Math.min(mn, R[i]); mx = Math.max(mx, R[i]) }
    E.open = clamp(sum / 8 / 34, 0, 1)
    E.corner = clamp((mx - mn) / 30, 0, 1) * clamp(1.2 - mn / 12, 0, 1)
    // wind direction relative to the listener (for panning the whistles)
    // listener right vector = (cos yaw, 0, −sin yaw); pan = dot(direction of the source, right)
    const yaw = game?.player?.yaw ?? 0
    E.yaw = yaw
    const wd = atm?.windDir ?? 0
    E.windPan = -Math.cos(wd + yaw) // wind is heard from upwind
    E.trafficPan = (E.z < AVENUE_Z ? -1 : 1) * Math.sin(yaw) * 0.6
    return E
  }

  // ---- beds ------------------------------------------------------------------------------
  _set(node, v, tc = 0.8) {
    const lv = node._lv ?? -1
    if (Math.abs(v - lv) <= Math.max(1e-5, lv * 0.01)) return
    node._lv = v
    node.gain.setTargetAtTime(v, this.engine.ctx.currentTime, tc)
  }

  _beds(dt, engine, game, E) {
    const B = this.beds
    const t = engine.ctx.currentTime
    const q = this.silence.state === 'normal' ? 1 : this.silence.state === 'returning' ? 0.8 : 0
    const live = (1 - E.silenceZone) * q
    // city hum: very low and constant, the millions of lives beyond view
    const city = db(-30) * (1 - 0.45 * E.night) * (E.outdoor + 0.35 * E.indoor * (1 - E.under) + 0.15 * E.under) * live
    this._set(B.city.out, city, 2)
    B.city.chain[0].frequency.setTargetAtTime(E.outdoor > 0.5 ? 420 : 200, t, 1)
    // distant traffic: from the avenue direction, swelling
    if (!this.swell) this.swell = { v: 0, target: 0, next: 2 }
    const S = this.swell
    S.next -= dt
    const busy = (1 - 0.7 * E.night) * (E.hour > 17 && E.hour < 19.5 ? 1.25 : 1)
    if (S.next <= 0) { S.target = this.r.range(0.2, 1) * busy; S.next = this.r.range(3, 9) / Math.max(0.3, busy) }
    S.v += (S.target - S.v) * (1 - Math.exp(-dt / 1.6))
    S.target *= Math.exp(-dt / 4)
    const near = E.avenue
    const traffic = (db(-40) + db(-18) * near * near) * (0.55 + 0.6 * S.v) * busy * E.zoneTraffic * (E.outdoor + 0.35 * E.indoor * (1 - E.under)) * live
    this._set(B.traffic.out, traffic, 0.9)
    B.traffic.chain[0].frequency.setTargetAtTime(E.outdoor < 0.5 ? 350 : 700 + 4500 * near * near, t, 0.8)
    if (B.trafficPan.pan) B.trafficPan.pan.setTargetAtTime(E.trafficPan * (0.4 + 0.6 * (1 - near)), t, 0.3)
    // wind: strength × gusts × openness; whistles near corners in strong gusts
    if (!this.gust) this.gust = { v: 0.5, target: 0.5, next: 1, sub: 0 }
    const G = this.gust
    G.next -= dt
    if (G.next <= 0) { G.target = this.r.range(0.15, 1); G.next = this.r.range(6, 20) }
    G.v += (G.target - G.v) * (1 - Math.exp(-dt / this.r.range(2, 5)))
    G.sub += dt * this.r.range(0.3, 1) * Math.PI * 2
    const sub = 1 + 0.25 * Math.sin(G.sub)
    const ws = clamp(E.windSpeed / 3.2, 0.05, 1.5)
    const gust = clamp(G.v * sub + E.gust * 0.35, 0, 1.6)
    const open = 0.35 + 0.65 * E.open
    const windOut = (E.outdoor * open + E.indoor * 0.18 * (1 - E.under) * Math.min(1, E.zoneWind * 3)) * live
    const windLvl = db(-25) * (0.35 + ws) * (0.45 + 0.75 * gust) * windOut
    this._set(B.wind.out, windLvl, 0.5)
    B.wind.chain[0].frequency.setTargetAtTime(E.outdoor > 0.5 ? 230 + 270 * gust * ws : 180, t, 0.6)
    const U = 2 + 7 * ws * gust // "m/s" for the aeolian whistle pitch f ≈ k·U
    B.whistle.f[0].frequency.setTargetAtTime(40 * U, t, 0.6)
    B.whistle.f[1].frequency.setTargetAtTime(29 * U, t, 0.6)
    const whistle = db(-27) * clamp((ws * gust - 0.45) * 2, 0, 1) * (0.4 + E.corner) * E.outdoor * live
    this._set(B.whistle.out, whistle, 0.7)
    if (B.whistlePan.pan) B.whistlePan.pan.setTargetAtTime(clamp(E.windPan * 0.7, -0.8, 0.8), t, 1.5)
    this._set(B.howl.out, db(-38) * clamp(ws * gust - 0.3, 0, 1) * E.corner * E.outdoor * live, 0.8)
    this._set(B.hiss.out, db(-40) * Math.pow(clamp(gust * ws, 0, 1.4), 3) * (0.3 + E.snow) * E.outdoor * live, 0.4)
    // indoor building presence (stairwells, flats, shops) and the underground room tone
    this._set(B.room.out, db(-42) * E.indoor * (1 - E.under) * (E.reverb === 'stairwell' ? 1.3 : 1) * live, 1)
    this._set(B.under.out, db(-33) * E.under * live, 1)
    // trolleybus wires singing near the avenue
    const wires = db(-40) * clamp(1 - (E.avenueDist - 6) / 30, 0, 1) * E.outdoor * (0.6 + 0.4 * ws) * live
    this._set(B.wires.out, wires, 1)
    if (B.wiresPan.pan) B.wiresPan.pan.setTargetAtTime(E.trafficPan * 0.5, t, 0.5)
    // snow absorption shelf: fresh snow outdoors eats the highs
    setShelf(this.mix, -(2 + 4 * clamp(E.snow * 1.5, 0, 1)) * E.outdoor, 3)
  }

  // ---- silence events ------------------------------------------------------------------------
  _silence(dt, engine, game, E) {
    const S = this.silence
    const musicOn = !!this.music.piece
    S.t += dt
    if (S.state === 'normal') {
      S.next -= dt
      if (S.next <= 0) {
        if (musicOn || E.under > 0.5) S.next = 60
        else { S.state = 'fading'; S.t = 0; S.hold = this.r.range(20, 60); this._log('silence begins') }
      }
    } else if (S.state === 'fading') {
      if (S.t > 8) { S.state = 'silent'; S.t = 0 }
    } else if (S.state === 'silent') {
      if (S.t > S.hold) this._endSilence()
    } else if (S.state === 'returning') {
      if (S.t > 16) { S.state = 'normal'; S.t = 0; S.next = this.r.range(480, 1200) }
    }
    // the duck: world → near-silence; silence zones keep it low
    let duck = 1
    if (S.state === 'fading') duck = 1 - 0.965 * smooth(S.t / 8)
    else if (S.state === 'silent') duck = 0.035
    else if (S.state === 'returning') duck = 0.035 + 0.965 * smooth(S.t / 15)
    duck = Math.min(duck, 1 - 0.9 * E.silenceZone)
    if (Math.abs(duck - (this._duck ?? -1)) > 0.002) { this._duck = duck; setDuck(this.mix, duck, 0.35) }
    if (game?.state) game.state.audioSilence = S.state === 'fading' || S.state === 'silent' || E.silenceZone > 0.5
    // breathing when the player stands still in the silence
    const quiet = S.state === 'silent' || (S.state === 'fading' && S.t > 5) || E.silenceZone > 0.6
    const idle = game?.player?.idleTime ?? 0
    if (quiet && idle > 2.5) {
      S.breathT -= dt
      if (S.breathT <= 0) {
        S.breathT = this.r.range(3.8, 6.5)
        const v = bufferVoice(engine, 'breath', Math.floor(this.r() * 5), { rate: this.r.range(0.93, 1.05), sync: true })
        playFoley(engine, v, { gain: db(this.r.range(-26, -22)), pan: this.r.range(-0.05, 0.05), send: 0.5 })
      }
    } else S.breathT = Math.min(S.breathT, 1.5)
  }

  _endSilence() {
    const S = this.silence
    S.state = 'returning'
    S.t = 0
    this._log('silence ends')
  }

  // ---- far one-shots -------------------------------------------------------------------------
  _timer(name, dt, meanFn) {
    let t = this.timers[name]
    if (t === undefined) t = this.timers[name] = this._exp(meanFn()) * this.r.range(0.3, 1)
    t -= dt
    if (t <= 0) { this.timers[name] = this._exp(meanFn()); return true }
    this.timers[name] = t
    return false
  }
  _exp(mean) { return Math.max(mean * 0.25, -Math.log(1 - this.r() * 0.999) * mean) }

  _farPos(E, dMin, dMax, yMin, yMax) {
    const a = this.r() * Math.PI * 2
    const d = this.r.range(dMin, dMax)
    return [E.x + Math.cos(a) * d, this.r.range(yMin, yMax), E.z + Math.sin(a) * d]
  }

  _play(name, opts) {
    try {
      const em = this.engine.play(name, opts)
      this._log(name)
      return em
    } catch (e) { return null }
  }

  _log(s) {
    const ev = this.debug.events
    ev.push(`${this.time.toFixed(0)}s ${s}`)
    if (ev.length > 40) ev.shift()
  }

  _events(dt, engine, game, E) {
    if (this.silence.state !== 'normal' || E.silenceZone > 0.3) return
    const h = E.hour
    const out = E.outdoor
    const muffle = out > 0.5 ? undefined : E.under > 0.5 ? 250 : 700 // heard from inside: through walls
    const gIn = out > 0.5 ? 1 : E.under > 0.5 ? 0.12 : 0.35
    const day = h >= 8.5 && h < 17.5
    const dusk = h >= 15.3 && h < 17
    // dogs across the courtyards (more at night), sometimes answered
    if (this._timer('dog', dt, () => (E.night > 0.5 ? 50 : h >= 18 ? 70 : 110))) {
      const pos = this._farPos(E, 70, 260, 1.5, 3)
      const howl = E.night > 0.5 && this.r.chance(0.06)
      this._play('dog_bark', { pos, gain: gIn * this.r.range(0.6, 1), howl, cutoff: muffle })
      if (this.r.chance(0.3)) {
        const pos2 = this._farPos(E, 90, 300, 1.5, 3)
        setTimeout(() => this._play('dog_bark', { pos: pos2, gain: gIn * this.r.range(0.4, 0.8), cutoff: muffle }), this.r.range(2000, 7000))
      }
    }
    // crows on the roofs (day and dusk — streams at dusk)
    if ((day || dusk) && E.under < 0.5 && this._timer('crow', dt, () => (dusk ? 22 : 50) * (1 + E.snow))) {
      const pos = this._farPos(E, 25, 140, 12, 30)
      if (this.r.chance(0.15) && day) this._play('crows_takeoff', { pos: this._farPos(E, 25, 70, 6, 14), gain: gIn, cutoff: muffle })
      else this._play('crow_caw', { pos, gain: gIn * this.r.range(0.6, 1), jackdaw: this.r.chance(0.12), cutoff: muffle })
    }
    // a car alarm far away (rare)
    if (E.under < 0.5 && this._timer('alarm', dt, () => (E.night > 0.5 ? 380 : 560))) {
      this._play('car_alarm', { pos: this._farPos(E, 100, 250, 1, 2), gain: gIn * this.r.range(0.5, 0.9), cutoff: muffle })
    }
    // entrance doors slamming across the yard (evening commute peak)
    if (E.under < 0.5 && this._timer('door', dt, () => (h >= 18 && h < 20.5 ? 55 : h >= 7 && h < 9 ? 70 : h >= 20.5 && h < 23 ? 100 : h >= 23 || h < 6 ? 320 : 150))) {
      this._play('distant_door_slam', { pos: this._farPos(E, 40, 150, 1, 2), gain: gIn * this.r.range(0.5, 1), cutoff: muffle })
    }
    // the janitor scraping snow at dawn (sessions of pushes at one spot)
    if (h >= 5 && h < 8.5 && E.under < 0.5) {
      let J = this.janitor
      if (!J || this.time > J.until + J.pause) {
        J = this.janitor = { pos: this._farPos(E, 40, 120, 1, 1.5), until: this.time + this.r.range(60, 180), next: 0, pause: this.r.range(120, 300) }
      }
      if (this.time <= J.until) {
        J.next -= dt
        if (J.next <= 0) { J.next = this.r.range(4, 6.5); this._play('snow_shovel', { pos: J.pos, gain: gIn * 0.8, cutoff: muffle }) }
      }
    }
    // kids on the sledding hill (rare, daytime / early evening)
    if (h >= 11 && h < 19.5 && E.under < 0.5 && this._timer('kids', dt, () => (h >= 15 ? 300 : 480))) {
      this._play('kids_sledding', { pos: this._farPos(E, 60, 150, 1, 2), gain: gIn * 0.8, cutoff: muffle })
    }
    // distant traffic pass-bys on the avenue
    if (E.under < 0.5 && this._timer('pass', dt, () => (E.avenue > 0.2 ? 9 : 22) / Math.max(0.25, 1 - 0.75 * E.night))) {
      const side = this.r.chance(0.5) ? 1 : -1
      const lane = this.r.chance(0.5) ? 531 : 549
      const pos = [E.x + side * this.r.range(50, 190), 1, lane]
      this._play('traffic_far', { pos, gain: gIn * (E.avenue > 0.2 ? 0.8 : 0.5) * this.r.range(0.5, 1), cutoff: muffle })
    }
    // a train horn from the railway to the north (sound carries on frosty nights)
    if (E.under < 0.5 && this._timer('horn', dt, () => (E.night > 0.5 ? 420 : 700))) {
      this._play('train_horn', { pos: [E.x + this.r.range(-250, 250), 4, RAIL_Z], gain: gIn * 0.8, cutoff: muffle })
    }
    // someone unseen walking away in the snow, behind the player (night, rare)
    if ((E.night > 0.3 || h >= 18 || h < 7) && out > 0.8 && this._timer('phantom', dt, () => 840)) {
      const yaw = E.yaw + Math.PI + this.r.range(-0.7, 0.7)
      const d = this.r.range(14, 26)
      this._play('footsteps_phantom', { pos: [E.x - Math.sin(yaw) * d, 0.5, E.z - Math.cos(yaw) * d], gain: 0.7 })
    }
    // a radio fragment from an open форточка (very rare)
    if (out > 0.8 && h >= 8 && h < 23.5 && this._timer('radio', dt, () => 1300)) {
      this._play('radio_distant', { pos: this._farPos(E, 25, 60, 6, 20), fragment: true, duration: this.r.range(10, 20), gain: 0.5 })
    }
    // underground: other trains rumbling in the tunnels (platform level), drips in the underpass
    if (E.y < -8 && this._timer('metroRumble', dt, () => 120)) {
      this._play('metro_rumble', { gain: this.r.range(0.35, 0.6) })
    }
    if (E.reverb === 'underpass' && this._timer('drip', dt, () => 4.5)) {
      const pos = this._farPos(E, 2, 9, 0, 0.3)
      pos[1] = E.y + 0.05
      this._play('drip', { pos, gain: this.r.range(0.4, 1) })
    }
    // faint metro under the avenue, through manholes and the underpass stair pits
    if (out > 0.5 && E.avenueDist < 45 && this._timer('manhole', dt, () => 170)) {
      const mh = this._nearestManhole(game, E)
      if (mh) this._play('metro_rumble', { pos: [mh[0], -1, mh[1]], gain: 0.35, refDistance: 4, rolloff: 1.4 })
    }
    // stairwells: the building lives around you
    if (E.reverb === 'stairwell' && this._timer('stair', dt, () => 30)) {
      const roll = this.r()
      const pos = [E.x + this.r.range(-3, 3), E.y + (this.r.chance(0.5) ? 1 : -1) * this.r.range(4, 18), E.z + this.r.range(-3, 3)]
      if (roll < 0.35) this._play('radiator_knock', { pos, gain: 0.7 })
      else if (roll < 0.55) this._play('garbage_chute', { pos, gain: 0.6 })
      else if (roll < 0.8) this._play('door_metal_slam', { pos: [E.x, E.y - this.r.range(8, 20), E.z], gain: 0.35 })
      else this._elevatorSomewhere(pos)
    }
  }

  _nearestManhole(game, E) {
    const list = game?.registry?.manholes
    let best = null, bd = 30
    if (Array.isArray(list)) {
      for (const m of list) {
        const x = m.x ?? m.pos?.x ?? m[0], z = m.z ?? m.pos?.z ?? m[1]
        if (x === undefined || z === undefined) continue
        const d = Math.hypot(x - E.x, z - E.z)
        if (d < bd) { bd = d; best = [x, z] }
      }
      if (best) return best
    }
    // fallback: the underpass stair pits under the avenue (x 378–392)
    for (const z of [513, 564]) {
      const d = Math.hypot(385 - E.x, z - E.z)
      if (d < bd) { bd = d; best = [385, z] }
    }
    return best
  }

  _elevatorSomewhere(pos) {
    const em = this._play('elevator_motor', { pos, gain: 0.45, loop: true })
    if (!em) return
    const run = this.r.range(6, 16)
    setTimeout(() => {
      em.stop(0.4)
      this._play('elevator_stop', { pos, gain: 0.5 })
    }, run * 1000)
  }

  // ---- music --------------------------------------------------------------------------------
  _music(dt, engine, game, E) {
    const M = this.music
    if (M.piece) {
      if (this.time > M.endAt) { M.piece = null; M.next = this.r.range(360, 900); this._log('music ends') } else if (E.silenceZone > 0.5) { M.piece.stop(4); M.piece = null; M.next = 120 }
      return
    }
    M.next -= dt
    if (M.next > 0) return
    if (this.silence.state !== 'normal' || E.silenceZone > 0.2 || (engine.volumes?.music ?? 0.7) < 0.01) { M.next = 30; return }
    this.playMusic()
  }

  /** Start a music piece now (also used for testing via window.__audioDirector). */
  playMusic(seed) {
    const M = this.music
    if (M.piece || !this.engine) return null
    const ctx = this.engine.ctx
    try {
      const s = seed ?? (2008 + M.count * 7919 + Math.floor(this.r() * 1e6))
      M.count++
      const piece = buildPiece(ctx, this.engine.bus.music, s, ctx.currentTime + 0.2, { level: 0.6 })
      M.piece = piece
      M.endAt = this.time + piece.duration + 1
      setTimeout(() => piece.dispose(), (piece.duration + 3) * 1000)
      this._log('music begins ' + piece.duration.toFixed(0) + 's')
      return piece
    } catch (e) {
      console.warn('[audio] music', e)
      M.next = 600
      return null
    }
  }

  /** Force a silence event now (testing / other packages via api.requestSilence). */
  startSilence(hold = null) {
    const S = this.silence
    if (this.music.piece) { this.music.piece.stop(5); this.music.piece = null; this.music.next = 300 }
    S.state = 'fading'; S.t = 0; S.hold = hold ?? this.r.range(20, 60)
    this._log('silence begins (requested)')
  }

  stats() {
    const B = this.beds || {}
    const lv = {}
    for (const k of ['city', 'traffic', 'wind', 'room', 'under', 'wires']) if (B[k]) lv[k] = +(20 * Math.log10(B[k].out.gain.value + 1e-9)).toFixed(1)
    for (const k of ['whistle', 'howl', 'hiss']) if (B[k]) lv[k] = +(20 * Math.log10(B[k].out.gain.value + 1e-9)).toFixed(1)
    return {
      env: { ...this.env },
      silence: { ...this.silence },
      music: { playing: !!this.music.piece, next: this.music.next },
      beds: lv,
      emitters: this.engine?.emitters?.size,
      bank: { ...bank.stats, pending: bank.pending() },
      events: this.debug.events.slice(-12),
    }
  }
}
