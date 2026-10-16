// Metro «Заречная»: rumble, 81-717 arrival/departure, doors with the in-car announcement,
// station chime, escalators, turnstiles.

import { def } from '../registry.js'
import { speak } from '../speech.js'
import { filt, addBurst, addModes, buf, thump, Biquad, SVF, Osc, TAU, smooth, paHorn, Brown, Pink, tones } from './lib.js'
import { Wander, diffuse, mixInto } from '../dsp.js'

const peakNorm = d => { let p = 0; for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i])); if (p) for (let i = 0; i < d.length; i++) d[i] /= p; return d }

/** Rail joints under a bogie: «та-дах» double clicks. */
function joints(d, sr, r, t0, t1, speedAt, gainAt, { carLen = 19.2, lp = 1 } = {}) {
  // positions of axles along an 8-car train relative to the head; a joint every 12.5 m
  const axles = []
  for (let c = 0; c < 8; c++) for (const b of [2.5, carLen - 2.5]) for (const a of [-1.05, 1.05]) axles.push(c * carLen + b + a)
  let x = 0
  let nextJoint = 12.5
  for (let i = Math.floor(t0 * sr); i < Math.floor(t1 * sr) && i < d.length; i += 32) {
    const t = i / sr
    const v = speedAt(t)
    x += v * 32 / sr
    if (x >= nextJoint) {
      // each joint is hit by the axles passing it: emit the group near the listener only (first 4 axles)
      for (let k = 0; k < 4; k++) {
        const dt = (axles[k] - axles[0]) / Math.max(1, v)
        const at = Math.floor((t + dt) * sr)
        const g = gainAt(t + dt)
        if (at >= d.length || g < 0.01) continue
        thump(d, sr, at, { f: r.range(65, 85), dur: 0.035, gain: 0.9 * g })
        addModes(d, sr, at, [[r.range(480, 620), 0.25 * g * lp, 0.05], [r.range(1100, 1500), 0.12 * g * lp, 0.03]], 1, r)
      }
      nextJoint += 12.5
    }
  }
}

def('metro_rumble', {
  // a train in a tunnel heard through earth/concrete: deep swell (≈ 20 s)
  sr: 8000, variants: 2, prio: 3, norm: { peak: 0.85 }, maxDur: 22,
  gen(r, sr) {
    const L = r.range(18, 22)
    const d = buf(L, sr)
    const br = new Brown(), pk = new Pink()
    const lp = new Biquad(sr, 'lp', 70, 0.7), mid = new Biquad(sr, 'bp', 130, 0.8)
    const a = r.range(6, 8), h = 4
    const o1 = new Osc(sr), o2 = new Osc(sr)
    for (let i = 0; i < d.length; i++) {
      const t = i / sr
      const e = t < a ? smooth(t / a) : t < a + h ? 1 : smooth(Math.max(0, 1 - (t - a - h) / (L - a - h)))
      d[i] = (lp.process(br.next(r.bi())) * 3.5 + mid.process(pk.next(r.bi())) * 0.6 + o1.sine(31) * 0.18 + o2.sine(47) * 0.12) * e
    }
    // faint bogie clicks through the ground
    for (let t = a * 0.6; t < L - 3; t += r.range(0.5, 1)) {
      const g = t < a ? t / a : 1
      thump(d, sr, Math.floor(t * sr), { f: 60, dur: 0.04, gain: 0.3 * g })
      thump(d, sr, Math.floor((t + 0.12) * sr), { f: 65, dur: 0.04, gain: 0.25 * g })
    }
    return filt(d, sr, [['lp', 400, 0.7]])
  },
})

def('metro_rumble_loop', {
  // inside a moving 81-717 in the tunnel: roar, joints, coasting motor hum (loud)
  sr: 16000, prio: 4, norm: { rms: 0.18 }, loop: 0.5,
  gen(r, sr) {
    const L = 9.6, x = 0.5
    const d = buf(L + x, sr)
    const br = new Brown(), pk = new Pink()
    const lp = new Biquad(sr, 'lp', 260, 0.7), mid = new Biquad(sr, 'bp', 700, 0.5), hi = new Biquad(sr, 'bp', 2500, 0.8)
    const w = new Wander(r, sr, 0.5)
    const m1 = new Osc(sr), m2 = new Osc(sr)
    for (let i = 0; i < d.length; i++) {
      const t = i / sr
      const p = pk.next(r.bi())
      d[i] = (lp.process(br.next(r.bi())) * 2.5 + mid.process(p) * 0.9 + hi.process(p) * 0.15) * (1 + 0.15 * w.next()) +
        m1.sine(625) * 0.02 + m2.sine(1250) * 0.006
    }
    // joints every 12.5 m at ~70 km/h (19.4 m/s) → every 0.64 s; the car's own bogies
    for (let t = 0.2; t < L + x - 0.3; t += 12.5 / 19.4) {
      for (const dt of [0, 0.108, 0.86 - 0.64, 0.86 - 0.64 + 0.108]) {
        const at = Math.floor((t + dt) * sr)
        if (at >= d.length) continue
        thump(d, sr, at, { f: r.range(60, 80), dur: 0.04, gain: 0.7 })
        addModes(d, sr, at, [[r.range(450, 600), 0.15, 0.05], [r.range(1000, 1300), 0.08, 0.03]], 1, r)
      }
    }
    return d
  },
})

def('metro_train_arrive', {
  // 81-717 from the tunnel: roar building, piston wind, rheostatic brake whine falling, squeal, «пшш»
  sr: 16000, variants: 2, prio: 4, norm: { peak: 0.9 }, maxDur: 17,
  gen(r, sr) {
    const L = 17
    const d = buf(L, sr)
    const tIn = r.range(5.5, 7) // head enters the platform
    const v0 = 16 // m/s at the platform entrance
    const decel = 1.1
    const tStop = tIn + v0 / decel
    const speedAt = t => (t < tIn ? v0 + 0.3 * (tIn - t) : Math.max(0, v0 - decel * (t - tIn)))
    const levelAt = t => (t < tIn ? Math.pow(smooth(t / tIn), 1.6) * 0.8 : 0.8 + 0.2 * smooth((t - tIn) / 2))
    const br = new Brown(), pk = new Pink()
    const lp = new SVF(sr, 300, 0.7), wind = new Biquad(sr, 'lp', 600, 0.6)
    const wh1 = new Osc(sr), wh2 = new Osc(sr), wh3 = new Osc(sr)
    const whBp = new Biquad(sr, 'bp', 700, 0.5)
    const shoe = new Biquad(sr, 'bp', 850, 1.5)
    const sq = new Biquad(sr, 'bp', r.range(2800, 3600), 25), sq2 = new Biquad(sr, 'bp', 0, 30)
    sq2.set('bp', r.range(4200, 4800), 30)
    const sqw = new Wander(r, sr, 9)
    for (let i = 0; i < d.length; i++) {
      const t = i / sr
      const v = speedAt(t)
      const lev = levelAt(t)
      if ((i & 31) === 0) lp.set(t < tIn ? 300 + 1200 * smooth(t / tIn) : 1500 + 1500 * (v / v0), 0.7)
      const p = pk.next(r.bi())
      const roar = lp.process(br.next(r.bi()) * 2.2 + p * 0.6) * (0.25 + 0.75 * v / v0)
      const piston = t < tIn + 1 ? wind.process(r.bi()) * 1.5 * Math.exp(-((t - tIn + 0.5) ** 2) / 2) : 0
      // rheostatic brake whine: gear mesh ~9 Hz per km/h, falls with speed
      const fw = Math.max(30, 9 * v * 3.6)
      const wa = t > tIn ? smooth(Math.min(1, (t - tIn) / 1)) * Math.min(1, v / 3) : 0.4
      const whine = whBp.process(wh1.saw(fw) * 0.5 + wh2.sine(fw * 2) * 0.25 + wh3.sine(fw * 1.007) * 0.3) * wa
      const grind = t > tStop - 5 && t < tStop ? shoe.process(r.bi()) * 0.25 * smooth((t - tStop + 5) / 2) : 0
      // brake squeal below ~8 km/h
      let squeal = 0
      if (v < 2.3 && t < tStop + 0.1) {
        const s = r.bi()
        squeal = (sq.process(s) * 3 + sq2.process(s) * 1.5) * (0.6 + 0.4 * sqw.next()) * smooth((2.3 - v) / 1.2) * Math.min(1, (tStop + 0.1 - t) / 0.1)
      }
      d[i] = roar * lev + piston * 0.6 + whine * 0.5 * lev + grind + squeal * 0.5
    }
    joints(d, sr, r, 0.5, tStop, speedAt, t => levelAt(t) * Math.min(1, speedAt(t) / 4) * 0.7)
    // the final pneumatic «пшш»
    const ps = Math.floor((tStop + r.range(0.3, 0.6)) * sr)
    const hp = new Biquad(sr, 'hp', 2000, 0.7)
    for (let i = 0; i < Math.floor(1.0 * sr) && ps + i < d.length; i++) { const t = i / sr; d[ps + i] += hp.process(r.bi()) * 0.35 * Math.min(1, t / 0.02) * Math.exp(-t / 0.35) }
    thump(d, sr, Math.floor(tStop * sr), { f: 55, dur: 0.15, gain: 0.5 })
    const fade = Math.floor(1.2 * sr)
    for (let i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade
    return d
  },
})

def('metro_train_depart', {
  // contactor clicks under the floor, the stepped «sour» traction whine rising, into the tunnel
  sr: 16000, variants: 2, prio: 4, norm: { peak: 0.9 }, maxDur: 19,
  gen(r, sr) {
    const L = 19
    const d = buf(L, sr)
    const t0 = 0.4
    const acc = 1.2
    const notches = [0, 1.2, 2.3, 3.5, 4.8, 6.0, 7.4, 8.8]
    const speedAt = t => (t < t0 ? 0 : Math.min(22, acc * (t - t0)))
    // distance of the bulk of the train from the listener: leaves after ~10 s
    const levelAt = t => (t < 9 ? 1 : Math.exp(-(t - 9) / 2.8))
    const br = new Brown(), pk = new Pink()
    const lp = new SVF(sr, 1500, 0.7)
    const w1 = new Osc(sr), w2 = new Osc(sr), w3 = new Osc(sr)
    const whBp = new Biquad(sr, 'bp', 700, 0.45)
    for (let i = 0; i < d.length; i++) {
      const t = i / sr
      const v = speedAt(t)
      const lev = levelAt(t)
      if ((i & 31) === 0) lp.set(t < 9 ? 1500 + 60 * v : Math.max(250, 2800 * Math.exp(-(t - 9) / 3)), 0.7)
      const notch = notches.filter(n => t - t0 > n).length
      const step = 1 + 0.06 * Math.sin(notch * 2.3) // level steps at each controller notch
      const fw = Math.max(20, 9 * v * 3.6 * (1 + 0.012 * Math.sin(notch * 1.7)))
      const wa = smooth(Math.min(1, (t - t0) / 0.8))
      const whine = whBp.process(w1.saw(fw) * 0.5 + w2.sine(fw * 2) * 0.25 + w3.saw(fw * 0.994) * 0.35) * wa * step
      const roar = (br.next(r.bi()) * 2 + pk.next(r.bi()) * 0.5) * (0.15 + 0.85 * Math.min(1, v / 12))
      d[i] = lp.process(roar * 0.8 + whine * 0.7) * lev
    }
    // contactors under the floor, 12–18 over the first 10 s
    let tc = t0 + 0.1
    for (let k = 0; k < r.int(12, 18) && tc < 10; k++) {
      const at = Math.floor(tc * sr)
      addBurst(d, sr, at, 0.004, r, { type: 'lp', f: 2500, gain: 0.35, tau: 0.001 })
      addModes(d, sr, at, [[r.range(160, 220), 0.2, 0.08], [r.range(600, 750), 0.12, 0.05]], 1, r)
      tc += r.range(0.3, 0.8)
    }
    joints(d, sr, r, 1.5, L - 1, speedAt, t => levelAt(t) * Math.min(1, speedAt(t) / 5) * 0.7)
    return d
  },
})

/** The station «динь-дон»: E5 then C5, bell partials 1/2/2.76. */
function chimeInto(d, sr, off, gain = 1) {
  for (const [f, t0] of [[659.3, 0], [523.3, 0.7]]) {
    const i0 = off + Math.floor(t0 * sr)
    const n = Math.floor(2.0 * sr)
    for (let i = 0; i < n && i0 + i < d.length; i++) {
      const t = i / sr
      const e = Math.min(1, t / 0.004) * Math.exp(-t / 0.35)
      d[i0 + i] += (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 2 * f * t) * Math.exp(-t / 0.2) + 0.12 * Math.sin(TAU * 2.76 * f * t) * Math.exp(-t / 0.12)) * e * gain
    }
  }
}

def('metro_chime', {
  sr: 22050, prio: 2, norm: { peak: 0.8 },
  gen(r, sr) {
    const d = buf(2.6, sr)
    chimeInto(d, sr, Math.floor(0.01 * sr))
    filt(d, sr, [['hp', 250, 0.7], ['lp', 5000, 0.7]])
    return diffuse(d, sr, 1.8, 3000, 0.25)
  },
})

const MALE_PA = { f0: 108, fs: 1, bw: 1, breath: 0.03, rate: 4.6, range: 0.9 }

def('metro_doors', {
  // chime + «Осторожно, двери закрываются. Следующая станция — „Заречная“.» + the doors slamming
  sr: 11025, variants: 2, prio: 4, norm: { peak: 0.9 }, maxDur: 12,
  gen(r, sr) {
    const a = peakNorm(speak('Осторо+жно, две+ри закрыва+ются.', sr, MALE_PA, r, { pauseScale: 1.2 }))
    const b = peakNorm(speak('Сле+дующая ста+нция — Заре+чная.', sr, MALE_PA, r, { pauseScale: 1.4 }))
    const tA = 1.45
    const tSlam = tA + a.length / sr - 0.15
    const tB = tSlam + 0.75
    const d = buf(tB + b.length / sr + 1.6, sr)
    const voice = buf(d.length / sr, sr)
    mixInto(voice, a, Math.floor(tA * sr), 1)
    mixInto(voice, b, Math.floor(tB * sr), 1)
    paHorn(voice, sr, 2.0)
    const ch = buf(d.length / sr, sr)
    chimeInto(ch, sr, Math.floor(0.02 * sr), 0.8)
    filt(ch, sr, [['hp', 300, 0.7], ['lp', 4000, 0.7]])
    for (let i = 0; i < d.length; i++) d[i] = voice[i] * 0.75 + ch[i] * 0.5
    // doors: pneumatic hiss, then the double-leaf slam (80–150 Hz + rattle)
    const s = Math.floor(tSlam * sr)
    const hp = new Biquad(sr, 'hp', 1800, 0.7)
    for (let i = 0; i < Math.floor(0.5 * sr); i++) { const t = i / sr; d[s - Math.floor(0.45 * sr) + i] += hp.process(r.bi()) * 0.12 * Math.sin(Math.PI * t / 0.5) }
    thump(d, sr, s, { f: 95, dur: 0.08, gain: 1 })
    thump(d, sr, s + Math.floor(0.025 * sr), { f: 130, dur: 0.05, gain: 0.6 })
    addBurst(d, sr, s, 0.01, r, { type: 'lp', f: 3000, gain: 0.5, tau: 0.003 })
    addModes(d, sr, s, [[r.range(380, 450), 0.3, 0.15], [r.range(900, 1100), 0.2, 0.1], [r.range(1900, 2300), 0.1, 0.06]], 1, r)
    for (let k = 1; k < 4; k++) addModes(d, sr, s + Math.floor(k * r.range(0.03, 0.05) * sr), [[r.range(1200, 1800), 0.08, 0.03]], 1, r)
    return diffuse(d, sr, 1.5, 2600, 0.22)
  },
})

def('metro_station_announce', {
  // in-car: v0 «Станция „Заречная“.»; v1 terminus «… Конечная. Поезд дальше не идёт, просьба освободить вагоны.»
  sr: 11025, variants: 2, prio: 6, norm: { peak: 0.85 }, maxDur: 11,
  gen(r, sr, v) {
    const text = v ? 'Ста+нция Заре+чная. Коне+чная. По+езд да+льше не идё+т, про+сьба освободи+ть ваго+ны.' : 'Ста+нция Заре+чная.'
    const s = peakNorm(speak(text, sr, MALE_PA, r, { pauseScale: 1.3 }))
    const d = buf(s.length / sr + 1.2, sr)
    mixInto(d, s, Math.floor(0.05 * sr), 1)
    paHorn(d, sr, 2.0)
    return diffuse(d, sr, 0.6, 2500, 0.15)
  },
})

def('escalator_step', {
  sr: 22050, variants: 4, prio: 3, norm: { peak: 0.85 },
  gen(r, sr) {
    const d = buf(0.45, sr)
    const at = Math.floor(0.004 * sr)
    thump(d, sr, at, { f: r.range(110, 140), dur: 0.03, gain: 0.7 })
    addBurst(d, sr, at, 0.004, r, { f: 2500, q: 1, gain: 0.4, tau: 0.001 })
    addModes(d, sr, at, [[r.range(600, 750), 0.25, 0.08], [r.range(1500, 1800), 0.15, 0.05], [r.range(2900, 3300), 0.06, 0.03]], 1, r)
    // comb plate teeth ticking under the sole
    for (let k = 1; k < 5; k++) addModes(d, sr, at + Math.floor(k * 0.008 * sr), [[r.range(2000, 2600), 0.05, 0.01]], 1, r)
    return d
  },
})

def('turnstile', {
  // v0 valid pass (reader «пик» + latch), v1 АКП-73 flaps slamming «БАМ!», v2 УТ-2000 paddles swinging
  sr: 22050, variants: 3, prio: 3, norm: { peak: 0.9 },
  gen(r, sr, v) {
    const d = buf(1.0, sr)
    if (v === 0) {
      tones(d, sr, [{ t: 0.005, dur: 0.12, f: 1800, gain: 0.35 }], { wave: 'sine' })
      const at = Math.floor(0.2 * sr)
      thump(d, sr, at, { f: 90, dur: 0.03, gain: 0.5 })
      addModes(d, sr, at, [[r.range(900, 1100), 0.25, 0.05], [r.range(2100, 2500), 0.12, 0.03]], 1, r)
    } else if (v === 1) {
      const at = Math.floor(0.01 * sr)
      addBurst(d, sr, at, 0.006, r, { type: 'lp', f: 6000, gain: 1, tau: 0.0015 })
      addModes(d, sr, at, [[r.range(240, 280), 0.6, 0.25], [r.range(560, 640), 0.4, 0.2], [r.range(1150, 1300), 0.3, 0.12], [r.range(2300, 2600), 0.15, 0.07]], 1, r)
      thump(d, sr, at, { f: 70, dur: 0.08, gain: 1 })
      const hp = new Biquad(sr, 'lp', 900, 0.7)
      for (let i = 0; i < Math.floor(0.25 * sr); i++) d[at + i] += hp.process(r.bi()) * 0.3 * Math.exp(-i / sr / 0.06)
    } else {
      const o = new Osc(sr)
      const lp = new Biquad(sr, 'lp', 900, 0.7)
      for (let i = 0; i < Math.floor(0.5 * sr); i++) { const t = i / sr; d[i + Math.floor(0.05 * sr)] += lp.process(o.saw(110 + 80 * t)) * 0.3 * Math.sin(Math.PI * t / 0.5) }
      const at = Math.floor(0.56 * sr)
      addModes(d, sr, at, [[r.range(500, 600), 0.3, 0.08], [r.range(1300, 1500), 0.15, 0.05]], 1, r)
      thump(d, sr, at, { f: 100, dur: 0.03, gain: 0.5 })
    }
    return d
  },
})
