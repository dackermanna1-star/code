// Footstep recipes per surface class. Each variant = heel strike + toe-off (60–120 ms later,
// about −6 dB). Rendered at 24 kHz, 8–10 variants each; the player picks randomly, alternates
// feet and adds pitch/level jitter at play time.

import { def } from '../registry.js'
import { thump, grit, crunch, squeak, chirp, addBurst, addModes, filt, buf, Biquad, TAU } from './lib.js'

const SR = 24000

function lowSnow(d, sr, off, r, gain = 1, dur = 0.07) {
  // compression whump of powder: lowpassed noise swell
  const lp = new Biquad(sr, 'lp', 380, 0.7)
  const n = Math.floor(dur * 2.5 * sr)
  for (let i = 0; i < n && off + i < d.length; i++) {
    const t = i / sr
    const e = (t < 0.012 ? t / 0.012 : 1) * Math.exp(-Math.max(0, t - 0.012) / dur)
    d[off + i] += lp.process(r.bi()) * e * gain * 2.2
  }
}

def('step_snow', {
  sr: SR, variants: 10, prio: 0, norm: { peak: 0.85 },
  gen(r, sr) {
    const d = buf(0.5, sr)
    const heel = Math.floor(0.004 * sr)
    const dur = r.range(0.2, 0.29)
    thump(d, sr, heel, { f: r.range(70, 95), dur: 0.035, gain: 0.2, drop: 1.4, attack: 0.008 })
    lowSnow(d, sr, heel, r, 0.28)
    crunch(d, sr, heel + Math.floor(0.006 * sr), r, { dur, count: r.int(40, 62), fLo: 1000, fHi: 2900, q: 1.6, gain: 1.0, gl: [0.0008, 0.0028] })
    crunch(d, sr, heel, r, { dur: dur * 0.8, count: r.int(12, 20), fLo: 450, fHi: 1100, q: 1.2, gain: 0.6, gl: [0.002, 0.005] })
    if (r.chance(0.55)) squeak(d, sr, heel + Math.floor(r.range(0.03, 0.09) * sr), r, { dur: r.range(0.02, 0.04), rate: r.range(220, 380), f: r.range(1500, 2300), q: 10, gain: 0.2 })
    // toe-off
    const toe = heel + Math.floor(r.range(0.11, 0.17) * sr)
    crunch(d, sr, toe, r, { dur: 0.09, count: r.int(8, 15), fLo: 1300, fHi: 3000, q: 1.6, gain: 0.45 })
    return filt(d, sr, [['lp', 6500, 0.6], ['hs', 3500, 0.7, -3]])
  },
})

def('step_snow_packed', {
  sr: SR, variants: 10, prio: 0, norm: { peak: 0.85 },
  gen(r, sr) {
    const d = buf(0.42, sr)
    const heel = Math.floor(0.004 * sr)
    thump(d, sr, heel, { f: r.range(85, 110), dur: 0.025, gain: 0.14 })
    crunch(d, sr, heel, r, { dur: r.range(0.11, 0.15), count: r.int(18, 28), fLo: 1800, fHi: 3600, q: 2, gain: 0.8, gl: [0.0006, 0.002], skew: 0.2 })
    // the cold-snow squeak («скрип»): 2–4 resonant stick-slip bursts
    let t = heel + Math.floor(0.008 * sr)
    const nsq = r.int(2, 4)
    for (let k = 0; k < nsq; k++) {
      const len = r.range(0.028, 0.06)
      squeak(d, sr, t, r, { dur: len, rate: r.range(260, 520), rateEnd: r.range(200, 480), f: r.range(1500, 3000), q: r.range(9, 14), gain: r.range(0.55, 0.85) })
      t += Math.floor(len * sr * r.range(0.6, 1.0))
    }
    const toe = heel + Math.floor(r.range(0.1, 0.14) * sr)
    squeak(d, sr, toe, r, { dur: r.range(0.03, 0.05), rate: r.range(300, 520), f: r.range(1800, 3000), q: 11, gain: 0.25 })
    crunch(d, sr, toe, r, { dur: 0.06, count: 8, fLo: 2000, fHi: 3500, gain: 0.3 })
    return filt(d, sr, [['lp', 7500, 0.6]])
  },
})

def('step_ice', {
  sr: SR, variants: 8, prio: 0, norm: { peak: 0.85 },
  gen(r, sr, v) {
    const d = buf(0.32, sr)
    const heel = Math.floor(0.003 * sr)
    thump(d, sr, heel, { f: r.range(110, 140), dur: 0.02, gain: 0.45 })
    addBurst(d, sr, heel, 0.005, r, { f: r.range(2600, 3400), q: 1.4, gain: 0.9, tau: 0.0015 })
    addModes(d, sr, heel, [[r.range(1900, 2200), 0.28, 0.03], [r.range(3000, 3400), 0.14, 0.02], [r.range(4300, 5200), 0.07, 0.012]], 1, r)
    grit(d, sr, heel, r, { dur: 0.02, count: 5, f: 5000, gain: 0.25 })
    if (v % 4 === 1) { // tiny crack in thin ice
      const at = heel + Math.floor(0.02 * sr)
      addBurst(d, sr, at, 0.004, r, { type: 'hp', f: 2000, gain: 0.5, tau: 0.001 })
      addModes(d, sr, at, [[r.range(3000, 3600), 0.12, 0.05], [r.range(4400, 5200), 0.09, 0.04], [r.range(5600, 6400), 0.06, 0.03]], 1, r)
    }
    const toe = heel + Math.floor(r.range(0.07, 0.1) * sr)
    addBurst(d, sr, toe, 0.004, r, { f: r.range(3000, 3800), q: 1.5, gain: 0.35, tau: 0.001 })
    addModes(d, sr, toe, [[r.range(2000, 2300), 0.08, 0.02]], 1, r)
    return d
  },
})

def('step_slush', {
  sr: SR, variants: 8, prio: 0, norm: { peak: 0.85 },
  gen(r, sr) {
    const d = buf(0.5, sr)
    const heel = Math.floor(0.004 * sr)
    thump(d, sr, heel, { f: 80, dur: 0.03, gain: 0.14 })
    // wet splat: lowpassed noise
    const lp = new Biquad(sr, 'lp', 1500, 0.8)
    const n = Math.floor(0.2 * sr)
    for (let i = 0; i < n; i++) {
      const t = i / sr
      const e = (t < 0.006 ? t / 0.006 : 1) * Math.exp(-t / 0.05)
      d[heel + i] += lp.process(r.bi()) * e * 0.8
    }
    // squelch chirps 900→300 Hz
    const nc = r.int(3, 6)
    for (let k = 0; k < nc; k++) chirp(d, sr, heel + Math.floor(r.range(0.01, 0.16) * sr), { f0: r.range(700, 1100), f1: r.range(250, 380), dur: r.range(0.015, 0.028), gain: r.range(0.12, 0.3) })
    // spray
    addBurst(d, sr, heel + Math.floor(0.004 * sr), 0.08, r, { type: 'hp', f: 3000, gain: 0.12, tau: 0.03 })
    // toe-off suction swell
    const toe = heel + Math.floor(r.range(0.18, 0.24) * sr)
    const bp = new Biquad(sr, 'bp', r.range(350, 480), 2)
    const m = Math.floor(0.07 * sr)
    for (let i = 0; i < m && toe + i < d.length; i++) {
      const u = i / m
      d[toe + i] += bp.process(r.bi()) * Math.sin(Math.PI * u) * u * 1.2
    }
    chirp(d, sr, toe + Math.floor(0.05 * sr), { f0: 500, f1: 1100, dur: 0.018, gain: 0.12 })
    return d
  },
})

function hardStep(d, sr, r, { thumpF = 120, thumpG = 0.7, gritG = 0.4, gritF = 4200, gritN = 14, click = null, clickG = 0.7, scuff = 0.25, toeG = 0.5 }) {
  const heel = Math.floor(0.003 * sr)
  thump(d, sr, heel, { f: thumpF * r.range(0.9, 1.1), dur: 0.035, gain: thumpG, drop: 1.5, attack: 0.002 })
  addBurst(d, sr, heel, 0.012, r, { type: 'lp', f: 1800, gain: 0.35, tau: 0.004 })
  if (click) addBurst(d, sr, heel, 0.015, r, { f: click * r.range(0.9, 1.1), q: 2.5, gain: clickG, tau: 0.004 })
  grit(d, sr, heel, r, { dur: 0.04, count: gritN, f: gritF, gain: gritG })
  // scuff: short bandpass sweep of the sole sliding
  const toe = heel + Math.floor(r.range(0.07, 0.11) * sr)
  if (scuff) {
    const sv = new Biquad(sr, 'bp', 1400, 1.2)
    const m = Math.floor(r.range(0.04, 0.07) * sr)
    for (let i = 0; i < m && toe + i < d.length; i++) {
      const u = i / m
      if ((i & 7) === 0) sv.set('bp', 900 + 1600 * u, 1.2)
      d[toe + i] += sv.process(r.bi()) * Math.sin(Math.PI * u) * scuff
    }
  }
  thump(d, sr, toe, { f: thumpF * 1.2, dur: 0.02, gain: thumpG * toeG })
  if (click) addBurst(d, sr, toe, 0.01, r, { f: click * 1.1, q: 2.5, gain: clickG * 0.43 * toeG, tau: 0.003 })
  grit(d, sr, toe, r, { dur: 0.03, count: Math.floor(gritN / 2), f: gritF, gain: gritG * 0.6 })
  return toe
}

def('step_concrete', {
  sr: SR, variants: 8, prio: 0, norm: { peak: 0.85 },
  gen(r, sr) {
    const d = buf(0.3, sr)
    hardStep(d, sr, r, { thumpF: 120, thumpG: 0.42, gritG: 0.7, gritF: 4200, gritN: 18, click: 1600, clickG: 0.8, scuff: 0.22 })
    return filt(d, sr, [['peak', 600, 1.5, 2]])
  },
})
def('step_asphalt', {
  sr: SR, variants: 8, prio: 0, norm: { peak: 0.85 },
  gen(r, sr) {
    const d = buf(0.3, sr)
    hardStep(d, sr, r, { thumpF: 105, thumpG: 0.42, gritG: 0.9, gritF: 3600, gritN: 28, click: 1200, scuff: 0.32 })
    return filt(d, sr, [['lp', 7000, 0.7]])
  },
})
def('step_tile', {
  sr: SR, variants: 8, prio: 0, norm: { peak: 0.85 },
  gen(r, sr, v) {
    const d = buf(0.3, sr)
    // hard, echoing click of a heel on 150×150 ceramic tile (the stairwell reverb does the rest)
    const toe = hardStep(d, sr, r, { thumpF: 125, thumpG: 0.3, gritG: 0.7, gritF: 5000, gritN: 18, click: 2500, clickG: 1.0, scuff: 0.12 })
    addModes(d, sr, Math.floor(0.003 * sr), [[r.range(2300, 2700), 0.32, 0.014], [r.range(3600, 4200), 0.12, 0.009]], 1, r)
    if (v % 3 === 0) squeak(d, sr, toe + Math.floor(0.01 * sr), r, { dur: 0.04, rate: 420, f: 4000, q: 20, gain: 0.2 })
    return d
  },
})
def('step_linoleum', {
  sr: SR, variants: 8, prio: 1, norm: { peak: 0.85 },
  gen(r, sr, v) {
    const d = buf(0.3, sr)
    const heel = Math.floor(0.003 * sr)
    thump(d, sr, heel, { f: r.range(90, 110), dur: 0.04, gain: 0.42 })
    addBurst(d, sr, heel, 0.03, r, { type: 'lp', f: 1300, gain: 0.6, tau: 0.008 })
    const toe = heel + Math.floor(r.range(0.08, 0.11) * sr)
    addBurst(d, sr, toe, 0.02, r, { type: 'lp', f: 1500, gain: 0.25, tau: 0.006 })
    if (v % 3 === 1) squeak(d, sr, toe, r, { dur: 0.035, rate: 380, f: r.range(1800, 2600), q: 14, gain: 0.18 })
    return d
  },
})
def('step_wood', {
  sr: SR, variants: 8, prio: 1, norm: { peak: 0.85 },
  gen(r, sr, v) {
    const d = buf(0.4, sr)
    const heel = Math.floor(0.003 * sr)
    thump(d, sr, heel, { f: r.range(130, 160), dur: 0.04, gain: 0.7 })
    addBurst(d, sr, heel, 0.01, r, { f: 900, q: 1, gain: 0.4, tau: 0.003 })
    addModes(d, sr, heel, [[r.range(210, 240), 0.35, 0.07], [r.range(460, 520), 0.22, 0.05], [r.range(880, 980), 0.12, 0.035], [r.range(1500, 1700), 0.05, 0.02]], 1, r)
    const toe = heel + Math.floor(r.range(0.08, 0.12) * sr)
    thump(d, sr, toe, { f: 170, dur: 0.02, gain: 0.3 })
    addModes(d, sr, toe, [[r.range(210, 240), 0.12, 0.05], [r.range(460, 520), 0.08, 0.03]], 1, r)
    if (v % 4 === 2) squeak(d, sr, toe + Math.floor(0.02 * sr), r, { dur: 0.08, rate: 90, rateEnd: 140, f: 700, q: 6, gain: 0.25, noise: 0.5 })
    return d
  },
})
def('step_gravel', {
  sr: SR, variants: 8, prio: 1, norm: { peak: 0.85 },
  gen(r, sr) {
    const d = buf(0.42, sr)
    const heel = Math.floor(0.004 * sr)
    thump(d, sr, heel, { f: 90, dur: 0.03, gain: 0.45 })
    crunch(d, sr, heel, r, { dur: r.range(0.18, 0.25), count: r.int(45, 70), fLo: 450, fHi: 1900, q: 1.3, gain: 0.85, gl: [0.002, 0.006], skew: 0.3 })
    for (let k = 0; k < r.int(3, 6); k++) addModes(d, sr, heel + Math.floor(r.range(0.01, 0.2) * sr), [[r.range(2500, 4200), 0.12, 0.012]], 1, r)
    const toe = heel + Math.floor(r.range(0.12, 0.16) * sr)
    crunch(d, sr, toe, r, { dur: 0.1, count: 18, fLo: 600, fHi: 2000, gain: 0.45, gl: [0.002, 0.005] })
    return d
  },
})
def('step_carpet', {
  sr: SR, variants: 8, prio: 2, norm: { peak: 0.85 },
  gen(r, sr) {
    const d = buf(0.3, sr)
    const heel = Math.floor(0.004 * sr)
    thump(d, sr, heel, { f: r.range(70, 90), dur: 0.045, gain: 0.8, attack: 0.008 })
    addBurst(d, sr, heel, 0.08, r, { type: 'lp', f: 700, gain: 0.35, tau: 0.025, attack: 0.01 })
    const toe = heel + Math.floor(r.range(0.09, 0.12) * sr)
    addBurst(d, sr, toe, 0.06, r, { type: 'lp', f: 900, gain: 0.2, tau: 0.02, attack: 0.01 })
    return d
  },
})
def('step_metal', {
  sr: SR, variants: 8, prio: 1, norm: { peak: 0.85 },
  gen(r, sr) {
    const d = buf(0.75, sr)
    const heel = Math.floor(0.003 * sr)
    thump(d, sr, heel, { f: r.range(140, 170), dur: 0.03, gain: 0.6 })
    addBurst(d, sr, heel, 0.006, r, { f: 2500, q: 0.8, gain: 0.5, tau: 0.002 })
    const k = r.range(0.95, 1.05)
    addModes(d, sr, heel, [
      [160 * k, 0.25, 0.12], [310 * k, 0.4, r.range(0.3, 0.5)], [742 * k, 0.3, r.range(0.25, 0.4)], [747 * k, 0.12, 0.35],
      [1290 * k, 0.22, r.range(0.2, 0.3)], [2110 * k, 0.14, r.range(0.12, 0.2)], [3050 * k, 0.06, 0.08],
    ], 0.8, r)
    // rattle: 3 rapid secondary impacts
    let t = heel
    for (let i = 0; i < 3; i++) {
      t += Math.floor(r.range(0.012, 0.03) * sr)
      addModes(d, sr, t, [[r.range(900, 1400), 0.1, 0.03], [r.range(2000, 2600), 0.06, 0.02]], 1 - i * 0.25, r)
    }
    const toe = heel + Math.floor(r.range(0.08, 0.11) * sr)
    addModes(d, sr, toe, [[310 * k, 0.12, 0.25], [742 * k, 0.1, 0.2], [1290 * k, 0.06, 0.15]], 1, r)
    return d
  },
})
def('step_metal_grate', {
  sr: SR, variants: 8, prio: 1, norm: { peak: 0.85 },
  gen(r, sr) {
    const d = buf(0.6, sr)
    const heel = Math.floor(0.003 * sr)
    thump(d, sr, heel, { f: r.range(180, 220), dur: 0.025, gain: 0.5 })
    const nr = r.int(5, 9)
    let t = heel
    for (let i = 0; i < nr; i++) {
      addModes(d, sr, t, [[r.range(500, 800), 0.12, 0.05], [r.range(1200, 1800), 0.12, 0.04], [r.range(2400, 3400), 0.08, 0.02]], Math.exp(-i * 0.3), r)
      addBurst(d, sr, t, 0.003, r, { f: 3000, q: 1, gain: 0.25 * Math.exp(-i * 0.3), tau: 0.001 })
      t += Math.floor(r.range(0.006, 0.02) * sr)
    }
    addModes(d, sr, heel, [[r.range(200, 240), 0.2, 0.15], [r.range(420, 470), 0.1, 0.12]], 1, r)
    const toe = heel + Math.floor(r.range(0.08, 0.12) * sr)
    for (let i = 0; i < 3; i++) addModes(d, sr, toe + Math.floor(i * 0.01 * sr), [[r.range(600, 900), 0.06, 0.04], [r.range(1500, 2200), 0.05, 0.03]], 1, r)
    return d
  },
})

// a soft wet-sole squeak layered on hard indoor floors after walking in snow
def('step_wet_squeak', {
  sr: SR, variants: 6, prio: 2, norm: { peak: 0.8 },
  gen(r, sr) {
    const d = buf(0.12, sr)
    squeak(d, sr, Math.floor(0.005 * sr), r, { dur: r.range(0.03, 0.06), rate: r.range(350, 600), rateEnd: r.range(300, 700), f: r.range(3200, 4400), q: 18, gain: 0.6 })
    return d
  },
})

// stamping snow off boots at a door (2–3 heavy stamps)
def('stamp_snow', {
  sr: SR, variants: 3, prio: 4, norm: { peak: 0.85 },
  gen(r, sr) {
    const d = buf(1.4, sr)
    const n = r.int(2, 3)
    for (let k = 0; k < n; k++) {
      const off = Math.floor((0.02 + k * r.range(0.36, 0.42)) * sr)
      thump(d, sr, off, { f: r.range(70, 85), dur: 0.05, gain: 1 })
      crunch(d, sr, off, r, { dur: 0.08, count: 20, fLo: 1000, fHi: 2500, gain: 0.5 })
      addBurst(d, sr, off, 0.04, r, { type: 'lp', f: 900, gain: 0.5, tau: 0.012 })
    }
    return d
  },
})
