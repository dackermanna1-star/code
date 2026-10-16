// Cars, buses, trolleybuses, the elektrichka, alarms, the snowplough. Pass-bys are rendered
// with geometry: a straight line past the listener at distance D, inverse-distance gain,
// Doppler on tonal parts and air absorption that opens up as the vehicle comes close.

import { def } from '../registry.js'
import { filt, addBurst, addModes, buf, thump, Biquad, SVF, Osc, TAU, echoes, distant, softClip, smooth, Brown, Pink } from './lib.js'
import { Wander } from '../dsp.js'

const C_SOUND = 343

/**
 * Generic pass-by renderer. src(t, dop, k) returns the vehicle's emitted sample at time t
 * (t = 0 at the closest point), dop = Doppler factor for tonal parts, k = closeness 0..1.
 * opts: { speed m/s, D m, T s (half length), sr, r }
 */
function passBy(sr, { speed, D = 6, T = 4, tail = 0.4, floor = 0 }, src) {
  const n = Math.floor((2 * T + tail) * sr)
  const d = new Float32Array(n)
  const lp = new SVF(sr, 8000, 0.6), lp2 = new SVF(sr, 8000, 0.6)
  for (let i = 0; i < n; i++) {
    const t = i / sr - T
    const x = speed * t
    const dist = Math.sqrt(D * D + x * x)
    const vr = (speed * x) / dist
    const dop = C_SOUND / (C_SOUND + vr)
    const g = D / dist
    if ((i & 31) === 0) {
      const fc = Math.max(700, 16000 / (1 + dist / 40)) * (x > 0 ? 0.8 : 1) // engine noise radiates forward
      lp.set(Math.min(fc, sr * 0.45), 0.6); lp2.set(Math.min(fc * 1.3, sr * 0.45), 0.6)
    }
    const s = src(t, dop, g)
    d[i] = lp2.process(lp.process(s)) * (g + floor)
  }
  // fade the extremes
  const f = Math.floor(0.6 * sr)
  for (let i = 0; i < f; i++) { d[i] *= smooth(i / f); d[n - 1 - i] *= smooth(i / f) }
  return d
}

/** Tyres on wet salted slush: hiss band + spray + stud crackle; returns a stateful sampler. */
function tyres(sr, r, speedKmh, big = false) {
  const pk = new Pink()
  const band = new Biquad(sr, 'bp', big ? 700 : 1000, 0.6), spray = new Biquad(sr, 'hp', 2200, 0.7), rumble = new Biquad(sr, 'lp', big ? 160 : 220, 0.7)
  const w = new Wander(r, sr, 2)
  const studRate = 15 * speedKmh // discrete clicks at ~15·v Hz
  let sp = 0
  const studBp = new Biquad(sr, 'bp', 4500, 1.2)
  const lvl = Math.pow(speedKmh / 50, 1.6)
  return () => {
    const nz = r.bi()
    const p = pk.next(nz)
    sp += studRate / sr
    let stud = 0
    if (sp >= 1) { sp -= 1; stud = r.bi() * (r() < 0.6 ? 1 : 0) }
    const splash = 1 + 0.35 * w.next()
    return (band.process(p) * 1.1 + spray.process(nz) * 0.22 * splash + rumble.process(p) * 1.4 + studBp.process(stud) * 0.25) * lvl
  }
}

/** 4-stroke engine: firing pulses through exhaust/body resonances, with Doppler. */
function engine(sr, r, { cyl = 4, rpm = 2500, diesel = false, bpF = [130, 280] }) {
  const osc = new Osc(sr, r()), osc2 = new Osc(sr, r())
  const b1 = new Biquad(sr, 'bp', bpF[0], 2.5), b2 = new Biquad(sr, 'bp', bpF[1], 3), lp = new Biquad(sr, 'lp', diesel ? 1400 : 900, 0.7)
  const clat = new Biquad(sr, 'bp', 2000, 1.5)
  const w = new Wander(r, sr, 3)
  const fire = (rpm / 60) * (cyl / 2)
  return (dop, rpmMul = 1) => {
    const f = fire * dop * rpmMul * (1 + 0.01 * w.next())
    const s = osc.saw(f) * 0.6 + osc2.square(f * 0.5, 0.3) * 0.25
    let y = b1.process(s) * 1.2 + b2.process(s) * 0.7 + lp.process(s) * 0.4
    if (diesel) y += clat.process(osc.ph < 0.08 ? r.bi() : 0) * 0.5
    return y
  }
}

// ---- cars ---------------------------------------------------------------------------------------

const CAR_SPEEDS = [35, 60] // km/h classes; variant = class*2 + model
export { CAR_SPEEDS }

def('car_pass', {
  sr: 16000, variants: 4, prio: 2, norm: { peak: 0.85 }, maxDur: 10,
  gen(r, sr, v) {
    const kmh = CAR_SPEEDS[Math.floor(v / 2)], model = v % 2
    const speed = kmh / 3.6
    const T = Math.min(4.8, 45 / speed)
    const tyre = tyres(sr, r, kmh)
    const eng = engine(sr, r, { rpm: 1800 + kmh * 18, bpF: model ? [110, 240] : [140, 300] })
    return passBy(sr, { speed, D: r.range(5, 8), T }, (t, dop) => {
      const front = t < 0 ? 1 : 0.7
      return tyre() * 1.0 + eng(dop) * 0.35 * front * (model ? 0.8 : 1.1)
    })
  },
})
def('car_drive', {
  // steady loop for a vehicle the caller moves (no envelope / Doppler baked in); nominal 50 km/h
  sr: 16000, variants: 2, prio: 2, norm: { rms: 0.16 }, loop: 0.4,
  gen(r, sr, v) {
    const d = buf(6.4, sr)
    const tyre = tyres(sr, r, 50)
    const eng = engine(sr, r, { rpm: 2700, bpF: v ? [110, 240] : [140, 300] })
    for (let i = 0; i < d.length; i++) d[i] = tyre() + eng(1) * 0.35
    return d
  },
})

// ---- buses & trolleybuses ------------------------------------------------------------------------

def('bus_pass', {
  sr: 16000, variants: 2, prio: 2, norm: { peak: 0.85 }, maxDur: 11,
  gen(r, sr) {
    const kmh = r.range(35, 50), speed = kmh / 3.6
    const T = Math.min(5, 50 / speed)
    const tyre = tyres(sr, r, kmh, true)
    const eng = engine(sr, r, { cyl: 8, rpm: 1500, diesel: true, bpF: [95, 220] })
    const rattle = new Biquad(sr, 'bp', 600, 2)
    const brake = r.chance(0.5) ? r.range(-1, 1.5) : 99
    const brk = new Biquad(sr, 'hp', 2500, 0.7)
    return passBy(sr, { speed, D: r.range(6, 9), T }, t => {
      const body = rattle.process(r.bi()) * (r() < 0.02 ? 1 : 0.2)
      const hiss = t > brake && t < brake + 0.5 ? brk.process(r.bi()) * 0.6 * (1 - (t - brake) / 0.5) : 0
      return tyre() * 1.2 + eng(1) * 0.55 + body * 0.3 + hiss
    })
  },
})
def('bus_drive', {
  sr: 16000, prio: 3, norm: { rms: 0.16 }, loop: 0.4,
  gen(r, sr) {
    const d = buf(6.4, sr)
    const tyre = tyres(sr, r, 40, true)
    const eng = engine(sr, r, { cyl: 8, rpm: 1500, diesel: true, bpF: [95, 220] })
    const rattle = new Biquad(sr, 'bp', 600, 2)
    for (let i = 0; i < d.length; i++) d[i] = tyre() * 1.1 + eng(1) * 0.55 + rattle.process(r.bi()) * (r() < 0.02 ? 0.3 : 0.06)
    return d
  },
})

/** ZiU traction whine: gear-mesh saw + 2nd harmonic + ×4.3 partial through a 300–3000 Hz band. */
function whine(sr, r) {
  const o1 = new Osc(sr, r()), o2 = new Osc(sr, r()), o3 = new Osc(sr, r())
  const bp = new Biquad(sr, 'bp', 1000, 0.45), hum = new Osc(sr), o4 = new Osc(sr, r()), sawLp = new Biquad(sr, 'lp', 1800, 0.7)
  return (f, dop = 1) => {
    const ff = Math.max(1, f * dop)
    const s = o1.sine(ff) * 0.1 + o2.sine(ff * 2) * 0.05 + o3.sine(ff * 4.3) * 0.025
    return bp.process(s + sawLp.process(o4.saw(ff)) * 0.035) * 2 + hum.sine(Math.max(1, ff * 0.25)) * 0.03
  }
}
function contactor(d, sr, at, r, g = 1) {
  addBurst(d, sr, at, 0.004, r, { type: 'lp', f: 5000, gain: 0.8 * g, tau: 0.001 })
  addModes(d, sr, at, [[180, 0.4, 0.12], [650, 0.3, 0.08], [1800, 0.2, 0.05], [2900, 0.08, 0.03]], g, r)
}

def('trolleybus_pass', {
  sr: 16000, variants: 2, prio: 1, norm: { peak: 0.85 }, maxDur: 11,
  gen(r, sr) {
    const kmh = r.range(35, 50), speed = kmh / 3.6
    const T = Math.min(5, 50 / speed)
    const tyre = tyres(sr, r, kmh, true)
    const wh = whine(sr, r)
    const wire = new Biquad(sr, 'bp', 3000, 2)
    const fWh = 11 * kmh
    const clicks = [r.range(-2.5, -0.5), r.range(0.5, 2)]
    const swAt = r.chance(0.6) ? r.range(-1, 1) : 99
    const d = passBy(sr, { speed, D: r.range(6, 9), T }, (t, dop) => {
      const coast = t > clicks[1] ? 0.5 : 1
      return tyre() * 1.1 + wh(fWh, dop) * 0.8 * coast + wire.process(r.bi()) * 0.05
    })
    // contactors dropping as the driver releases, and the trolley shoes crossing a wire switch («тынц-тынц»)
    for (const c of clicks) { const at = Math.floor((c + T) * sr); const g = 1 / Math.sqrt(1 + (speed * c / 7) ** 2); contactor(d, sr, at, r, 0.25 * g) }
    if (swAt < 50) {
      const at = Math.floor((swAt + T) * sr)
      for (let k = 0; k < 2; k++) addModes(d, sr, at + Math.floor(k * r.range(0.12, 0.2) * sr), [[r.range(1500, 1700), 0.12, 0.25], [r.range(2600, 2900), 0.08, 0.18], [r.range(4100, 4500), 0.04, 0.1]], 1, r)
    }
    return d
  },
})
def('trolleybus_drive', {
  sr: 16000, prio: 2, norm: { rms: 0.16 }, loop: 0.4,
  gen(r, sr) {
    const d = buf(6.4, sr)
    const tyre = tyres(sr, r, 40, true)
    const wh = whine(sr, r)
    const wire = new Biquad(sr, 'bp', 3000, 2)
    for (let i = 0; i < d.length; i++) d[i] = tyre() * 1.1 + wh(440) * 0.8 + wire.process(r.bi()) * 0.05
    return d
  },
})

def('trolleybus_depart', {
  // at the stop: doors fold shut, line contactor, rheostat ratchet, whine rising as it pulls away
  sr: 16000, variants: 1, prio: 0, norm: { peak: 0.9 }, maxDur: 15.2,
  gen(r, sr) {
    const L = 15
    const d = buf(L, sr)
    // pneumatic door hiss + folding door clatter
    const hp = new Biquad(sr, 'hp', 2000, 0.7)
    for (let i = 0; i < Math.floor(0.9 * sr); i++) { const t = i / sr; d[i + Math.floor(0.05 * sr)] += hp.process(r.bi()) * 0.35 * Math.min(1, t / 0.02) * Math.exp(-t / 0.3) }
    for (let k = 0; k < 4; k++) addModes(d, sr, Math.floor((0.55 + k * 0.05) * sr), [[r.range(250, 330), 0.25, 0.12], [r.range(700, 900), 0.15, 0.08], [r.range(1600, 2000), 0.08, 0.04]], 1 - k * 0.2, r)
    thump(d, sr, Math.floor(0.62 * sr), { f: 90, dur: 0.06, gain: 0.5 })
    // line contactor «КЛАЦ»
    const t0 = r.range(1.6, 2.2)
    contactor(d, sr, Math.floor(t0 * sr), r, 0.9)
    // rheostat controller stepping through positions
    const nclick = r.int(8, 15)
    let tc = t0 + 0.25
    for (let k = 0; k < nclick; k++) { contactor(d, sr, Math.floor(tc * sr), r, 0.25); tc += 1 / r.range(4, 8) }
    // motion: accelerate at ~1.1 m/s² away from the stop
    const acc = r.range(0.9, 1.2)
    const tyreGen = (k => () => k())(tyres(sr, r, 30, true))
    const wh = whine(sr, r)
    const lp = new SVF(sr, 8000, 0.6)
    const wire = new Biquad(sr, 'bp', 3000, 2)
    const n = Math.floor((L - t0) * sr)
    const o0 = Math.floor(t0 * sr)
    for (let i = 0; i < n; i++) {
      const t = i / sr
      const v = Math.min(14, acc * t)
      const x = 0.5 * acc * t * t
      const dist = Math.sqrt(25 + x * x)
      const g = 5 / dist
      const dop = C_SOUND / (C_SOUND + v * (x / dist))
      if ((i & 31) === 0) lp.set(Math.max(800, 16000 / (1 + dist / 40)), 0.6)
      const kmh = v * 3.6
      const s = wh(11 * kmh + 6, dop) * Math.min(1, t / 0.4) * 0.9 + tyreGen() * Math.min(1, kmh / 30) * 0.9 + wire.process(r.bi()) * 0.04
      d[o0 + i] += lp.process(s) * g * smooth(Math.min(1, (L - t0 - t) / 1.5))
    }
    return d
  },
})

def('pantograph_spark', {
  // arcing on rimed wire: crackling bursts of broadband pops
  sr: 32000, variants: 4, prio: 3, norm: { peak: 0.85 },
  gen(r, sr, v) {
    const d = buf(0.8, sr)
    const bursts = r.int(1, 3)
    let t = 0.01
    for (let b = 0; b < bursts; b++) {
      const len = r.range(0.02, 0.2)
      const pops = r.int(10, 40)
      for (let k = 0; k < pops; k++) addBurst(d, sr, Math.floor((t + r() * len) * sr), r.range(0.0005, 0.003), r, { type: 'hp', f: r.range(800, 3000), gain: r.range(0.2, 1), tau: 0.0005 })
      // the arc's buzz
      const hb = new Biquad(sr, 'bp', r.range(1500, 3000), 1)
      for (let i = 0; i < Math.floor(len * sr); i++) d[Math.floor(t * sr) + i] += hb.process(r.bi()) * 0.15 * (r() < 0.3 ? 1 : 0.2)
      t += len + r.range(0.03, 0.15)
    }
    if (v === 3) for (let k = 0; k < 2; k++) addModes(d, sr, Math.floor((0.02 + k * 0.15) * sr), [[1600, 0.15, 0.2], [2750, 0.08, 0.15]], 1, r)
    return d
  },
})

// ---- elektrichka ---------------------------------------------------------------------------------

def('train_pass', {
  // an ER2-type suburban train on the embankment, heard from 100–300 m (long)
  sr: 8000, variants: 2, prio: 7, lazy: true, norm: { peak: 0.85 }, maxDur: 30,
  gen(r, sr, v) {
    const L = v ? 30 : 26
    const d = buf(L, sr)
    const br = new Brown()
    const lp = new Biquad(sr, 'lp', 160, 0.7), mid = new Biquad(sr, 'bp', 450, 0.6), hi = new Biquad(sr, 'bp', 1800, 0.8)
    const pk = new Pink()
    const c = L * 0.45, wdt = L * 0.17
    const mot = new Osc(sr), mot2 = new Osc(sr)
    for (let i = 0; i < d.length; i++) {
      const t = i / sr
      const e = Math.exp(-((t - c) ** 2) / (2 * wdt * wdt))
      const p = pk.next(r.bi())
      d[i] = (lp.process(br.next(r.bi())) * 3 + mid.process(p) * 0.8 + hi.process(p) * 0.25 * e) * e +
        (mot.sine(380 + 30 * (t - c) / L) * 0.02 + mot2.sine(760) * 0.008) * e
    }
    // wheels over rail joints: 10 cars × 2 bogies × 2 axles, joint near the closest point
    const speed = v ? 19 : 22
    const cars = 10, carLen = 20.2
    const tFirst = c - (cars * carLen) / speed / 2
    for (let k = 0; k < cars; k++) {
      for (const bog of [3.0, carLen - 3.0]) {
        for (const ax of [-1.3, 1.3]) {
          const tt = tFirst + (k * carLen + bog + ax) / speed
          if (tt < 0.1 || tt > L - 0.5) continue
          const e = Math.exp(-((tt - c) ** 2) / (2 * (wdt * 1.2) ** 2))
          const at = Math.floor(tt * sr)
          thump(d, sr, at, { f: r.range(70, 90), dur: 0.04, gain: 0.9 * e })
          addModes(d, sr, at, [[r.range(500, 650), 0.18 * e, 0.06], [r.range(1100, 1400), 0.08 * e, 0.04]], 1, r)
        }
      }
    }
    filt(d, sr, [['lp', 2600, 0.6]])
    return echoes(d, sr, [[0.4, 0.2], [0.85, 0.1]], 1500)
  },
})

def('train_horn', {
  // «тифон»: v0 chord, v1 low-then-high, v2 two short blasts; distant
  sr: 11025, variants: 3, prio: 7, lazy: true, norm: { peak: 0.85 }, maxDur: 5,
  gen(r, sr, v) {
    const d = buf(4.5, sr)
    const blasts = v === 0 ? [[0.05, 1.9, [350, 440]]] : v === 1 ? [[0.05, 0.9, [350]], [0.95, 1.2, [440]]] : [[0.05, 0.55, [350, 440]], [0.85, 0.6, [350, 440]]]
    for (const [t0, len, fs] of blasts) {
      for (const f0 of fs) {
        const o = new Osc(sr, r())
        const bell = new Biquad(sr, 'peak', 1000, 1.2, 8), lp = new Biquad(sr, 'lp', 2800, 0.7)
        const det = r.range(0.997, 1.003)
        for (let i = 0; i < Math.floor((len + 0.15) * sr); i++) {
          const t = i / sr
          const press = smooth(Math.min(1, t / 0.09))
          const f = f0 * det * (0.94 + 0.06 * press) * (1 + 0.002 * Math.sin(TAU * 5.5 * t))
          const e = press * (t > len ? Math.max(0, 1 - (t - len) / 0.12) : 1)
          const s = o.square(f, 0.32) * 0.6 + o.saw(f) * 0
          d[Math.floor(t0 * sr) + i] += lp.process(bell.process(s)) * e * 0.5
        }
      }
    }
    softClip(d, 1.3)
    return distant(d, sr, 250, { taps: [[0.45, 0.35], [0.9, 0.2], [1.5, 0.1]] })
  },
})

// ---- car alarm -----------------------------------------------------------------------------------

function alarmCycle(r, sr, order) {
  const seg = 4.2
  const d = buf(order.length * seg + 1.5, sr)
  const o = new Osc(sr)
  for (let si = 0; si < order.length; si++) {
    const t0 = si * seg
    const kind = order[si]
    for (let i = 0; i < Math.floor(seg * sr); i++) {
      const t = i / sr
      let f, on = 1
      switch (kind) {
        case 0: { const p = (t % 1.8) / 1.8; f = 700 + 1000 * Math.sin(Math.PI * p); break } // slow wail
        case 1: { const p = (t % 0.25) / 0.25; f = 700 + 1000 * p; break } // fast yelp
        case 2: f = (t % 0.7) < 0.35 ? 1000 : 1400; break // hi-lo
        case 3: f = 1600; on = (t % (1 / 12)) < (0.5 / 12) ? 1 : 0; break // machine gun
        case 4: { const p = (t % 0.75) / 0.6; f = 400 + 1400 * Math.min(1, p); on = p <= 1 ? 1 : 0; break } // whoop
        default: { const p = (t % (1 / 6)) / 0.1; f = 2500 - 1900 * Math.min(1, p); on = p <= 1 ? 1 : 0 } // ray gun
      }
      d[Math.floor(t0 * sr) + i] += o.square(f, 0.5) * on
    }
  }
  filt(d, sr, [['bp', 1700, 0.5], ['peak', 2400, 2, 4]])
  return softClip(d, 2.2)
}
def('car_alarm', {
  sr: 11025, variants: 2, prio: 8, lazy: true, norm: { peak: 0.85 }, maxDur: 27,
  gen(r, sr, v) {
    const d = alarmCycle(r, sr, v ? [2, 0, 3, 1, 5, 4] : [0, 1, 2, 3, 4, 5])
    return distant(d, sr, r.range(100, 180), { taps: [[r.range(0.24, 0.32), 0.4], [r.range(0.5, 0.65), 0.22], [0.9, 0.1]] })
  },
})

// ---- snowplough (KAMAZ with blade) ---------------------------------------------------------------

def('snowplow_pass', {
  sr: 11025, prio: 8, lazy: true, norm: { peak: 0.85 }, maxDur: 15,
  gen(r, sr) {
    const speed = 30 / 3.6
    const T = 7
    const eng = engine(sr, r, { cyl: 8, rpm: 1800, diesel: true, bpF: [100, 240] })
    const blade = new Biquad(sr, 'bp', 1400, 0.5)
    const w = new Wander(r, sr, 30)
    const tyre = tyres(sr, r, 30, true)
    return passBy(sr, { speed, D: 7, T }, (t, dop) => {
      const g = 0.5 + 0.5 * Math.max(0, w.next())
      return eng(dop) * 0.7 + blade.process(r.bi()) * g * 0.8 + tyre() * 0.5 + (r() < 0.0004 ? 1 : 0)
    })
  },
})

// ---- distant traffic swell (for the ambience director) --------------------------------------------

def('traffic_far', {
  sr: 8000, variants: 3, prio: 3, norm: { peak: 0.85 }, maxDur: 13.6,
  gen(r, sr, v) {
    const kmh = r.range(40, 70), speed = kmh / 3.6
    const tyre = tyres(sr, r, kmh, v === 2)
    const eng = engine(sr, r, { rpm: 2600, cyl: v === 2 ? 8 : 4, diesel: v === 2 })
    const d = passBy(sr, { speed, D: r.range(60, 140), T: r.range(5, 6.5), floor: 0.02 }, (t, dop) => tyre() + eng(dop) * 0.3)
    return filt(d, sr, [['lp', 2500, 0.6]])
  },
})
void Brown
