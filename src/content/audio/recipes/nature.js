// Dogs, crows, snow off branches, ice. Distant sources carry a little baked courtyard flutter
// echo (parallel 9–17-storey slabs 40–70 m apart → 0.23–0.41 s slapback).

import { def } from '../registry.js'
import { filt, addBurst, addModes, buf, thump, Biquad, Reso, Osc, TAU, echoes, smooth } from './lib.js'
import { Wander } from '../dsp.js'

// ---- dogs -------------------------------------------------------------------------------------

const DOGS = [
  { f0: [230, 280, 175], fs: 0.82, rate: 1.7, len: 0.2, rough: 0.5, n: [3, 6] }, // big guard dog
  { f0: [430, 520, 340], fs: 1.0, rate: 2.5, len: 0.15, rough: 0.35, n: [4, 8] }, // medium mutt
  { f0: [700, 820, 580], fs: 1.25, rate: 3.4, len: 0.11, rough: 0.25, n: [5, 9] }, // small yappy dog
  { f0: [330, 400, 260], fs: 0.92, rate: 2.0, len: 0.17, rough: 0.45, n: [2, 5] }, // husky-ish mix
  { f0: [500, 600, 400], fs: 1.08, rate: 2.8, len: 0.13, rough: 0.3, n: [3, 7] },
]

export function barkInto(d, sr, off, r, dog, gain = 1) {
  const len = dog.len * r.range(0.8, 1.25)
  const n = Math.min(d.length - off, Math.floor((len + 0.05) * sr))
  const osc = new Osc(sr, r()), sub = new Osc(sr, r())
  const k = dog.fs * r.range(0.95, 1.05)
  const F1 = new Reso(sr, 550 * k, 140), F2 = new Reso(sr, 1250 * k, 200), F3 = new Reso(sr, 2500 * k, 300)
  const nb = new Biquad(sr, 'bp', 1600 * k, 0.8)
  const [fa, fb, fc] = dog.f0
  const pk = r.range(0.25, 0.4)
  let jit = 0
  for (let i = 0; i < n; i++) {
    const t = i / sr, u = Math.min(1, t / len)
    // pitch: quick rise to the peak, then a fall
    const f = (u < pk ? fa + (fb - fa) * smooth(u / pk) : fb + (fc - fb) * smooth((u - pk) / (1 - pk))) * r.range(0.995, 1.005) * (1 + jit)
    if ((i & 63) === 0) jit = r.bi() * 0.03 * dog.rough
    // mouth opens: formants rise from «у» towards «а» («вуаф»)
    if ((i & 7) === 0) { const o = smooth(u * 2.5); F1.set((380 + 300 * o) * k, 140); F2.set((900 + 450 * o) * k, 200) }
    const env = (t < 0.006 ? t / 0.006 : 1) * (u < 0.6 ? 1 : Math.exp(-(u - 0.6) * 9)) * (t < len ? 1 : Math.exp(-(t - len) * 60))
    const s = osc.saw(f) + sub.saw(f * 0.5) * dog.rough * 0.6
    const nz = r.bi()
    const src = s * 0.7 + nz * (0.35 + dog.rough * 0.4)
    let y = F3.process(F2.process(F1.process(src)))
    y = Math.tanh(y * 2.5) * 0.6 + nb.process(nz) * 0.25 * (t < 0.015 ? 3 : 1)
    d[off + i] += y * env * gain
  }
  return len
}

def('dog_bark', {
  // v0-4: different dogs, a run of barks; v5: a distant howl
  sr: 16000, variants: 6, prio: 3, norm: { peak: 0.85 },
  gen(r, sr, v) {
    if (v === 5) {
      const d = buf(3.6, sr)
      const osc = new Osc(sr)
      const F1 = new Reso(sr, 600, 150), F2 = new Reso(sr, 1100, 200)
      const L = r.range(2.0, 2.8)
      for (let i = 0; i < Math.floor(L * sr); i++) {
        const t = i / sr, u = t / L
        const f = (u < 0.3 ? 440 + 160 * smooth(u / 0.3) : 600 - 180 * smooth((u - 0.3) / 0.7)) * (1 + 0.012 * Math.sin(TAU * 5 * t))
        const e = smooth(t / 0.25) * smooth((L - t) / 0.6)
        d[i] += F2.process(F1.process(osc.saw(f) * 0.5 + osc.ph * 0 + r.bi() * 0.08)) * e
      }
      filt(d, sr, [['lp', 3000, 0.7]])
      return echoes(d, sr, [[0.31, 0.3], [0.62, 0.15]], 1800)
    }
    const dog = DOGS[v]
    const count = r.int(dog.n[0], dog.n[1])
    const d = buf(count / dog.rate + 1.6, sr)
    let t = 0.03
    for (let k = 0; k < count; k++) {
      const len = barkInto(d, sr, Math.floor(t * sr), r, dog, r.range(0.7, 1))
      // occasionally a double bark
      if (r.chance(0.25)) { barkInto(d, sr, Math.floor((t + len + 0.06) * sr), r, dog, 0.7); t += len + 0.06 }
      t += (1 / dog.rate) * r.range(0.75, 1.35)
    }
    filt(d, sr, [['lp', 5000, 0.7], ['hp', 120, 0.7]])
    return echoes(d, sr, [[r.range(0.24, 0.36), 0.28], [r.range(0.5, 0.7), 0.13]], 2200)
  },
})

// ---- crows ------------------------------------------------------------------------------------

function cawInto(d, sr, off, r, { f0 = 550, len = 0.42, gain = 1, rough = 1 } = {}) {
  const n = Math.min(d.length - off, Math.floor((len + 0.1) * sr))
  const osc = new Osc(sr, r())
  const b1 = new Biquad(sr, 'bp', 1200 * r.range(0.92, 1.08), 4), b2 = new Biquad(sr, 'bp', 2300 * r.range(0.92, 1.08), 4), b0 = new Biquad(sr, 'bp', 700, 2)
  const fmRate = r.range(80, 150)
  let fm = 0, fmT = 0
  for (let i = 0; i < n; i++) {
    const t = i / sr, u = Math.min(1, t / len)
    fmT += fmRate / sr
    if (fmT >= 1) { fmT -= 1; fm = r.bi() * 30 * rough }
    const f = f0 * (1.09 - 0.22 * u) + fm
    const env = Math.min(1, t / 0.025) * (t > len ? Math.max(0, 1 - (t - len) / 0.08) : 1) * (0.8 + 0.2 * Math.sin(Math.PI * u))
    let s = osc.saw(f) + r.bi() * 0.35 * rough * (osc.ph < 0.3 ? 1 : 0.3)
    s = Math.tanh(s * 2.2)
    const y = b1.process(s) * 1.2 + b2.process(s) * 0.8 + b0.process(s) * 0.3
    d[off + i] += y * env * gain
  }
}

def('crow_caw', {
  // hooded crow (серая ворона): 2–6 hoarse caws; v4: a jackdaw flock «кья»
  sr: 16000, variants: 5, prio: 3, norm: { peak: 0.85 },
  gen(r, sr, v) {
    if (v === 4) {
      const d = buf(3, sr)
      for (let k = 0; k < r.int(6, 12); k++) cawInto(d, sr, Math.floor(r.range(0.02, 2.4) * sr), r, { f0: r.range(1000, 1400), len: r.range(0.09, 0.14), gain: r.range(0.4, 1), rough: 0.4 })
      return echoes(filt(d, sr, [['lp', 6000, 0.7]]), sr, [[0.28, 0.2]], 2500)
    }
    const count = r.int(2, 6)
    const f0 = r.range(480, 600)
    const d = buf(count * 0.85 + 1.2, sr)
    let t = 0.02
    for (let k = 0; k < count; k++) {
      cawInto(d, sr, Math.floor(t * sr), r, { f0: f0 * r.range(0.95, 1.05), len: r.range(0.3, 0.55) * (k === count - 1 ? 1.15 : 1), gain: r.range(0.75, 1) })
      t += r.range(0.5, 0.9)
    }
    filt(d, sr, [['lp', 6500, 0.7], ['hp', 300, 0.7]])
    return echoes(d, sr, [[r.range(0.25, 0.38), 0.22], [r.range(0.55, 0.75), 0.1]], 2500)
  },
})

def('crows_takeoff', {
  sr: 16000, variants: 3, prio: 4, norm: { peak: 0.85 },
  gen(r, sr) {
    const d = buf(3.6, sr)
    const birds = r.int(2, 5)
    for (let b = 0; b < birds; b++) {
      let t = r.range(0, 0.6)
      let rate = r.range(6, 8)
      const flaps = r.int(5, 9)
      const g = r.range(0.5, 1)
      for (let k = 0; k < flaps; k++) {
        const at = Math.floor(t * sr)
        // a downstroke: soft lowpassed whoosh + feather rustle
        const lp = new Biquad(sr, 'lp', 420, 0.8), bp = new Biquad(sr, 'bp', r.range(1500, 2800), 1)
        const n = Math.floor(0.06 * sr)
        const fg = g * Math.exp(-k * 0.18)
        for (let i = 0; i < n && at + i < d.length; i++) {
          const u = i / n
          const e = Math.sin(Math.PI * u) ** 1.5
          const nz = r.bi()
          d[at + i] += (lp.process(nz) * 2.2 + bp.process(nz) * 0.3) * e * fg
        }
        t += 1 / rate
        rate *= 0.94
      }
    }
    if (r.chance(0.8)) cawInto(d, sr, Math.floor(r.range(0.4, 1.4) * sr), r, { f0: r.range(500, 600), len: 0.35, gain: 0.35 })
    // a little snow knocked off the branch
    const sn = new Biquad(sr, 'bp', 3500, 0.8)
    const s0 = Math.floor(r.range(0.1, 0.4) * sr)
    for (let i = 0; i < Math.floor(0.8 * sr) && s0 + i < d.length; i++) d[s0 + i] += sn.process(r.bi()) * 0.06 * Math.exp(-i / sr / 0.25)
    return d
  },
})

// ---- snow & ice ---------------------------------------------------------------------------------

def('snow_fall_branch', {
  sr: 22050, variants: 4, prio: 3, norm: { peak: 0.8 },
  gen(r, sr) {
    const d = buf(2.0, sr)
    // branch spring-back: tiny ticks
    for (let k = 0; k < r.int(8, 12); k++) addBurst(d, sr, Math.floor(r.range(0, 0.06) * sr), 0.001, r, { f: r.range(2500, 5000), q: 1.5, gain: r.range(0.05, 0.18), tau: 0.0004 })
    // «плюх»: the clump landing on snow
    const at = Math.floor(r.range(0.25, 0.45) * sr)
    const lp = new Biquad(sr, 'lp', 600, 0.7)
    for (let i = 0; i < Math.floor(0.6 * sr); i++) {
      const t = i / sr
      const e = (t < 0.02 ? t / 0.02 : 1) * Math.exp(-Math.max(0, t - 0.02) / 0.2)
      d[at + i] += lp.process(r.bi()) * e * 2.2
    }
    thump(d, sr, at, { f: 70, dur: 0.06, gain: 0.35, attack: 0.012 })
    // powder trail sifting down
    const bp = new Biquad(sr, 'bp', 3500, 0.6)
    const trail = r.range(0.6, 1.4)
    for (let i = 0; i < Math.floor(trail * sr) && i < d.length; i++) {
      const t = i / sr
      d[i] += bp.process(r.bi()) * 0.14 * Math.sin(Math.PI * Math.min(1, t / trail)) * (0.6 + 0.4 * Math.sin(TAU * 7 * t))
    }
    return d
  },
})

def('ice_crack', {
  // v0-2: crust / puddle cracks; v3-4: frozen pond «пиу» (dispersive ping)
  sr: 32000, variants: 5, prio: 3, norm: { peak: 0.85 },
  gen(r, sr, v) {
    const d = buf(1.4, sr)
    if (v < 3) {
      let t = 0.005
      for (let k = 0; k < r.int(2, 5); k++) {
        const at = Math.floor(t * sr)
        addBurst(d, sr, at, 0.003, r, { type: 'hp', f: 1500, gain: r.range(0.5, 1), tau: 0.0008 })
        addModes(d, sr, at, [[r.range(2800, 3600), 0.2, 0.06], [r.range(4000, 4800), 0.15, 0.05], [r.range(5200, 6200), 0.1, 0.04], [r.range(1200, 1800), 0.12, 0.04]], 1, r)
        t += r.range(0.01, 0.07)
      }
      thump(d, sr, Math.floor(0.005 * sr), { f: 140, dur: 0.02, gain: 0.3 })
      return d
    }
    // dispersive chirp: high frequencies arrive first
    const L = r.range(0.35, 0.7)
    let ph = 0
    const f0 = r.range(3500, 5000), f1 = r.range(180, 320)
    for (let i = 0; i < Math.floor(L * sr); i++) {
      const t = i / sr, u = t / L
      const f = f1 + (f0 - f1) * Math.exp(-u * 4.5)
      ph += (TAU * f) / sr
      d[i + Math.floor(0.01 * sr)] += Math.sin(ph) * Math.exp(-u * 3) * Math.min(1, t / 0.002) * 0.6
    }
    thump(d, sr, Math.floor(0.012 * sr), { f: 60, dur: 0.15, gain: 0.5 })
    addBurst(d, sr, Math.floor(0.008 * sr), 0.004, r, { type: 'hp', f: 2000, gain: 0.4, tau: 0.001 })
    return echoes(d, sr, [[0.18, 0.2], [0.37, 0.1]], 3000)
  },
})

export { Wander }
