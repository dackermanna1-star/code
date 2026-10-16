// Ambient emitter loops (played at positions by other packages) and the director's beds.
// Every loop is rendered len + x seconds and cross-faded into a seamless loop; steady tones use
// frequencies with an integer number of cycles over the loop length.

import { def } from '../registry.js'
import { speak, babbleText, laughInto } from '../speech.js'
import { tones, wall, filt, addBurst, addModes, buf, thump, squeak, chirp, Biquad, Osc, TAU, Brown, Pink, cheapSpeaker } from './lib.js'
import { Wander, smooth, diffuse, mixInto } from '../dsp.js'
import { creak } from './building.js'

/** Place speech clips one after another into d (mono), starting at t, until `until`. */
function fillSpeech(d, sr, r, t, until, makeClip, gap = [0.4, 1.2]) {
  while (t < until) {
    const clip = makeClip()
    let p = 0
    for (let i = 0; i < clip.length; i++) p = Math.max(p, Math.abs(clip[i]))
    mixInto(d, clip.map(v => v / (p || 1)), Math.floor(t * sr), 0.6)
    t += clip.length / sr + r.range(gap[0], gap[1])
  }
  return t
}

// ---- TV through a wall ------------------------------------------------------------------------

def('tv_muffled', {
  // v0: evening news (anchor, field report, music sting); v1: entertainment (dialogue, laugh track, jingle)
  sr: 8000, variants: 2, prio: 4, norm: { rms: 0.12, ceiling: 0.9 }, loop: 1.0,
  gen(r, sr, v) {
    const len = 34, x = 1.0
    const d = buf(len + x, sr)
    if (v === 0) {
      let t = 0.3
      t = fillSpeech(d, sr, r, t, 12, () => speak(babbleText(r, r.int(10, 18), 'news'), sr, 'anchor', r), [0.35, 0.7])
      // music sting under the cut to a report
      const sting = buf(3.2, sr)
      tones(sting, sr, [48, 55, 60, 63].map(m => ({ t: 0, dur: 3, f: 440 * Math.pow(2, (m - 69) / 12), gain: 0.25, attack: 0.05, release: 1.2 })), { wave: 'saw' })
      thump(sting, sr, 0, { f: 60, dur: 0.3, gain: 0.8 })
      mixInto(d, sting, Math.floor(t * sr), 0.9)
      t += 2.4
      // field report: female voice over street noise
      const repStart = t
      t = fillSpeech(d, sr, r, t, 25, () => speak(babbleText(r, r.int(8, 14), 'news'), sr, 'female', r, { rate: 5.0 }), [0.3, 0.8])
      const street = new Brown()
      for (let i = Math.floor(repStart * sr); i < Math.min(d.length, Math.floor(t * sr)); i++) d[i] += street.next(r.bi()) * 0.12
      t += 0.4
      fillSpeech(d, sr, r, t, len + x - 1.5, () => speak(babbleText(r, r.int(10, 16), 'news'), sr, 'anchor', r), [0.35, 0.7])
    } else {
      let t = 0.2
      let who = 0
      while (t < len + x - 2) {
        const roll = r()
        if (roll < 0.2) {
          // laugh-track burst: many voices
          const L = r.range(1.4, 2.6)
          for (let k = 0; k < 9; k++) laughInto(d, sr, Math.floor((t + r.range(0, 0.3)) * sr), r, { f0: r.range(130, 300), dur: L * r.range(0.6, 1), gain: 0.18, fs: r.range(1, 1.2) })
          t += L + r.range(0.2, 0.5)
        } else if (roll < 0.27) {
          // jingle / bumper music
          const J = r.range(3, 4.5)
          const jb = buf(J, sr)
          const roots = [57, 53, 60, 55]
          const notes = []
          for (let b = 0; b < 8; b++) {
            const root = roots[Math.floor(b / 2) % 4]
            notes.push({ t: b * J / 8, dur: J / 8 * 0.9, f: 440 * Math.pow(2, (root - 24 - 69) / 12) * 4, gain: 0.5, attack: 0.01, release: 0.05 })
            notes.push({ t: b * J / 8, dur: J / 8 * 0.5, f: 440 * Math.pow(2, (root + 12 - 69) / 12), gain: 0.25 })
          }
          tones(jb, sr, notes, { wave: 'saw' })
          for (let b = 0; b < 8; b++) thump(jb, sr, Math.floor(b * J / 8 * sr), { f: 55, dur: 0.12, gain: 0.9 })
          mixInto(d, jb, Math.floor(t * sr), 0.7)
          t += J + 0.3
        } else {
          const clip = speak(babbleText(r, r.int(3, 9), 'talk'), sr, who ? 'female' : 'male', r, { range: 1.3 })
          let p = 0
          for (let i = 0; i < clip.length; i++) p = Math.max(p, Math.abs(clip[i]))
          mixInto(d, clip.map(q => q / (p || 1)), Math.floor(t * sr), 0.6)
          t += clip.length / sr + r.range(0.15, 0.6)
          who = 1 - who
        }
      }
    }
    // small TV speaker, then a panel wall
    filt(d, sr, [['hp', 120, 0.7], ['peak', 900, 1, 3]])
    wall(d, sr, 380)
    return d
  },
})

def('voices_muffled', {
  // two people in another room / behind a flat door
  sr: 8000, variants: 2, prio: 4, norm: { rms: 0.12, ceiling: 0.9 }, loop: 1.0,
  gen(r, sr) {
    const len = 32, x = 1.0
    const d = buf(len + x, sr)
    let t = 0.4
    let who = r.int(0, 1)
    const f0m = r.range(105, 125), f0f = r.range(190, 225)
    while (t < len + x - 2) {
      const turns = r.int(1, 3)
      let s = ''
      for (let k = 0; k < turns; k++) s += babbleText(r, r.int(2, 8), 'talk') + ' '
      const clip = speak(s, sr, who ? 'female' : 'male', r, { f0: who ? f0f : f0m, range: 1.25, rate: r.range(4.6, 5.8) })
      let p = 0
      for (let i = 0; i < clip.length; i++) p = Math.max(p, Math.abs(clip[i]))
      mixInto(d, clip.map(q => q / (p || 1)), Math.floor(t * sr), who ? 0.5 : 0.6)
      t += clip.length / sr
      if (r.chance(0.12)) { laughInto(d, sr, Math.floor((t + 0.1) * sr), r, { f0: who ? f0f : f0m, dur: r.range(0.8, 1.4), gain: 0.25 }); t += 1.2 }
      t += r.chance(0.15) ? r.range(2, 4) : r.range(0.25, 0.9)
      who = 1 - who
    }
    diffuse(d, sr, 0.5, 2500, 0.25)
    wall(d, sr, 520)
    return d
  },
})

// ---- hums and machines ----------------------------------------------------------------------

def('fridge_hum', {
  sr: 11025, prio: 3, norm: { rms: 0.15 }, loop: 0.3,
  gen(r, sr) {
    const len = 6, x = 0.3
    const d = buf(len + x, sr)
    const rat = new Biquad(sr, 'bp', 1400, 2)
    const w = new Wander(r, sr, 0.5)
    for (let i = 0; i < d.length; i++) {
      const t = i / sr
      const m = 1 + 0.06 * w.next()
      const v = Math.sin(TAU * 48.5 * t) * 0.35 + Math.sin(TAU * 97 * t) * 0.6 + Math.sin(TAU * 100 * t) * 0.25 +
        Math.sin(TAU * 194 * t) * 0.18 + Math.sin(TAU * 291 * t) * 0.08 + Math.sin(TAU * 400 * t) * 0.04
      const buzz = rat.process(r.bi()) * (0.5 + 0.5 * Math.sin(TAU * 97 * t)) * 0.12
      d[i] = v * m * 0.6 + buzz
    }
    for (let k = 0; k < 3; k++) chirp(d, sr, Math.floor(r.range(0.5, len) * sr), { f0: r.range(500, 800), f1: r.range(900, 1500), dur: 0.03, gain: 0.04 })
    return d
  },
})

def('fluorescent_buzz', {
  // v0: healthy tube (buzz + ballast hiss + rare ticks); v1: failing tube (starter tik-tik, pings, dropouts)
  sr: 11025, variants: 2, prio: 3, norm: { rms: 0.12 }, loop: 0.2,
  gen(r, sr, v) {
    const len = 10, x = 0.2
    const d = buf(len + x, sr)
    const bp = new Biquad(sr, 'bp', 1200, 0.5), bp2 = new Biquad(sr, 'bp', 2600, 3), hs = new Biquad(sr, 'hp', 4200, 0.7)
    const o = new Osc(sr)
    // dropouts for the failing tube
    const gate = new Float32Array(d.length).fill(1)
    if (v === 1) {
      let t = r.range(0.5, 1.5)
      while (t < len - 0.5) {
        const off = r.range(0.15, 0.6)
        const i0 = Math.floor(t * sr), i1 = Math.floor((t + off) * sr)
        for (let i = i0; i < i1; i++) gate[i] = 0.08
        // starter «тик-тик» and the strike «тинк»
        for (let k = 0; k < r.int(2, 3); k++) {
          const at = Math.floor((t + 0.03 + k * 0.1) * sr)
          addBurst(d, sr, at, 0.002, r, { f: 3000, q: 1.5, gain: 0.5, tau: 0.0006 })
        }
        addModes(d, sr, i1, [[4000, 0.25, 0.02], [6100, 0.08, 0.01]], 1, r)
        t += off + r.range(0.5, 3)
      }
    }
    let gs = 1
    for (let i = 0; i < d.length; i++) {
      const t = i / sr
      gs += (gate[i] - gs) * 0.02
      const saw = o.saw(100)
      const lam = r.bi() * (0.5 + 0.5 * Math.sin(TAU * 100 * t)) ** 4
      const v1 = bp.process(saw) * 0.5 + bp2.process(lam) * 0.5 + Math.sin(TAU * 100 * t) * 0.15 + Math.sin(TAU * 200 * t) * 0.08
      d[i] += v1 * gs + hs.process(r.bi()) * 0.015
    }
    if (v === 0) for (let k = 0; k < 2; k++) addBurst(d, sr, Math.floor(r.range(0.5, len) * sr), 0.0015, r, { f: 3500, q: 2, gain: 0.25, tau: 0.0005 })
    return d
  },
})

def('transformer_hum', {
  sr: 8000, prio: 3, norm: { rms: 0.18 }, loop: 0.5,
  gen(r, sr) {
    const len = 6, x = 0.5
    const d = buf(len + x, sr)
    const ws = [new Wander(r, sr, 0.3), new Wander(r, sr, 0.4), new Wander(r, sr, 0.5)]
    const hp = new Biquad(sr, 'bp', 1600, 1)
    for (let i = 0; i < d.length; i++) {
      const t = i / sr
      const j = 1 + 0.11 * ws[0].next()
      d[i] = Math.sin(TAU * 50 * t) * 0.15 + Math.sin(TAU * 100 * t) * 1 * j + Math.sin(TAU * 200 * t) * 0.5 * (1 + 0.1 * ws[1].next()) +
        Math.sin(TAU * 300 * t) * 0.35 + Math.sin(TAU * 400 * t) * 0.2 * (1 + 0.12 * ws[2].next()) + Math.sin(TAU * 500 * t) * 0.1 +
        hp.process(r.bi()) * 0.06 * (0.5 + 0.5 * Math.sin(TAU * 100 * t))
    }
    return d
  },
})

def('boiler_hum', {
  sr: 11025, prio: 4, norm: { rms: 0.16 }, loop: 0.5,
  gen(r, sr) {
    const len = 10, x = 0.5
    const d = buf(len + x, sr)
    const roar = new Brown(), pk = new Pink()
    const lp = new Biquad(sr, 'lp', 260, 0.7), bp = new Biquad(sr, 'bp', 600, 0.8)
    const w = new Wander(r, sr, 1.5)
    for (let i = 0; i < d.length; i++) {
      const t = i / sr
      const flame = 1 + 0.25 * w.next()
      d[i] = lp.process(roar.next(r.bi())) * 1.6 * flame + bp.process(pk.next(r.bi())) * 0.4 * flame +
        (Math.sin(TAU * 25 * t) * 0.25 + Math.sin(TAU * 50 * t) * 0.15 + Math.sin(TAU * 100 * t) * 0.18 + Math.sin(TAU * 150 * t) * 0.05)
    }
    for (let k = 0; k < 3; k++) {
      const at = Math.floor(r.range(0.5, len) * sr)
      addModes(d, sr, at, [[r.range(300, 500), 0.25, 0.2], [r.range(900, 1300), 0.1, 0.1]], 1, r)
    }
    return d
  },
})

def('ventilation', {
  sr: 16000, prio: 4, norm: { rms: 0.16 }, loop: 0.4,
  gen(r, sr) {
    const len = 8, x = 0.4
    const d = buf(len + x, sr)
    const pk = new Pink()
    const lp = new Biquad(sr, 'lp', 1300, 0.6), wh = new Biquad(sr, 'bp', 1150, 18)
    const w = new Wander(r, sr, 0.4)
    for (let i = 0; i < d.length; i++) {
      const t = i / sr
      const wob = 1 + 0.08 * w.next()
      const blade = Math.sin(TAU * 75 * t) * 0.35 + Math.sin(TAU * 150 * t) * 0.18 + Math.sin(TAU * 225 * t) * 0.07
      const nz = pk.next(r.bi())
      d[i] = (blade * 0.7 + lp.process(nz) * 1.5) * wob + wh.process(nz) * 0.25
    }
    return d
  },
})

def('escalator_loop', {
  sr: 22050, prio: 4, norm: { rms: 0.14 }, loop: 0.25,
  gen(r, sr) {
    const len = 8, x = 0.25
    const d = buf(len + x, sr)
    const chain = new Biquad(sr, 'lp', 400, 0.7)
    for (let i = 0; i < d.length; i++) {
      const t = i / sr
      d[i] = Math.sin(TAU * 50 * t) * 0.12 + Math.sin(TAU * 100 * t) * 0.18 + Math.sin(TAU * 150 * t) * 0.05 +
        chain.process(r.bi()) * 0.9 * (0.75 + 0.25 * Math.sin(TAU * 4 * t))
    }
    // a step passes the comb every 0.5 s: «тук-тррк»
    for (let k = 0; k * 0.5 < len + x; k++) {
      const at = Math.floor((0.11 + k * 0.5 + r.range(-0.004, 0.004)) * sr)
      if (at >= d.length) break
      thump(d, sr, at, { f: 120, dur: 0.02, gain: 0.35 })
      for (let j = 0; j < 4; j++) addModes(d, sr, at + Math.floor(j * 0.006 * sr), [[r.range(1700, 2300), 0.06, 0.012], [r.range(3200, 3800), 0.03, 0.008]], 1, r)
    }
    // handrail squeak, twice
    for (let k = 0; k < 2; k++) squeak(d, sr, Math.floor(r.range(0.5, len - 0.5) * sr), r, { dur: r.range(0.15, 0.3), rate: r.range(300, 450), f: r.range(1800, 2600), q: 14, gain: 0.05 })
    return d
  },
})

def('car_idle', {
  // v0: carburetted Lada 4-cyl (~27 Hz firing), v1: Volga, deeper and smoother
  sr: 11025, variants: 2, prio: 4, norm: { rms: 0.16 }, loop: 0.3,
  gen(r, sr, v) {
    const len = 4, x = 0.3
    const d = buf(len + x, sr)
    const fire = v ? 24 : 27
    const exhaust = [new Biquad(sr, 'bp', v ? 110 : 130, 3), new Biquad(sr, 'bp', v ? 230 : 260, 4), new Biquad(sr, 'lp', 700, 0.7)]
    const pulses = new Float32Array(d.length)
    let t = 0.01
    const w = new Wander(r, sr, 0.6)
    let cyl = 0
    while (t < len + x) {
      const i = Math.floor(t * sr)
      const a = (v ? 0.85 : 0.75) + r.range(-0.12, 0.12) + (cyl === 2 && !v ? -0.15 : 0) // a slightly weak cylinder
      pulses[i] += a
      cyl = (cyl + 1) % 4
      t += (1 / fire) * (1 + r.range(-0.03, 0.03) + 0.04 * w.next())
    }
    const tick = new Biquad(sr, 'bp', 3000, 2)
    for (let i = 0; i < d.length; i++) {
      const p = pulses[i] + r.bi() * 0.02
      d[i] = exhaust[0].process(p) * 1.2 + exhaust[1].process(p) * 0.6 + exhaust[2].process(p) * 0.25 + tick.process(pulses[i] * r.bi()) * 0.15
    }
    // belt / alternator whine
    for (let i = 0; i < d.length; i++) d[i] += Math.sin(TAU * 1210 * i / sr) * 0.004
    return filt(d, sr, [['hp', 22, 0.7]])
  },
})

def('swing_creak', {
  // a rusty swing moved by the wind: a squeak each half-swing, intensity breathing with gusts
  sr: 16000, variants: 1, prio: 4, norm: { peak: 0.8 }, loop: 0.2,
  gen(r, sr, v) {
    const period = v ? 2.6 : 2.8
    const len = period * 6, x = 0.2
    const d = buf(len + x, sr)
    for (let k = 0; k < 12; k++) {
      const t0 = k * period / 2 + r.range(0.15, 0.3)
      const amp = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin((k / 12) * TAU + r.range(-0.3, 0.3))) * r.range(0.6, 1)
      if (amp < 0.3 && r.chance(0.5)) continue
      const dur = period / 2 * r.range(0.45, 0.65)
      creak(d, sr, Math.floor(t0 * sr), r, { dur, rate0: k % 2 ? 420 : 300, rate1: k % 2 ? 300 : 460, modes: [[r.range(850, 950), 35], [r.range(1700, 1900), 60], [r.range(2900, 3200), 90]], gain: amp, jitter: 0.12 })
      // chain links clink at the turn
      if (r.chance(0.6)) addModes(d, sr, Math.floor((t0 - 0.1) * sr), [[r.range(2500, 3500), 0.02 * amp, 0.03], [r.range(4500, 5500), 0.012 * amp, 0.02]], 1, r)
    }
    return filt(d, sr, [['hp', 300, 0.7]])
  },
})

def('shop_ambience', {
  // inside a 2008 «Продукты»: fridges, tubes, a murmur at the counter, scale beeps, the till, a printer
  sr: 11025, prio: 5, norm: { rms: 0.1, ceiling: 0.9 }, loop: 1.0,
  gen(r, sr) {
    const len = 30, x = 1.0
    const d = buf(len + x, sr)
    const rat = new Biquad(sr, 'bp', 900, 2)
    const o = new Osc(sr)
    const bz = new Biquad(sr, 'bp', 1500, 0.7)
    for (let i = 0; i < d.length; i++) {
      const t = i / sr
      d[i] = (Math.sin(TAU * 49 * t) * 0.2 + Math.sin(TAU * 98 * t) * 0.3 + Math.sin(TAU * 147 * t) * 0.08) * 0.5 +
        rat.process(r.bi()) * 0.03 + bz.process(o.saw(100)) * 0.04
    }
    // murmur at the counter (muffled by distance across the shop)
    const talk = buf(len + x, sr)
    let t = 1.5
    while (t < len - 3) {
      const clip = speak(babbleText(r, r.int(2, 5), 'talk'), sr, r.chance(0.6) ? 'female' : r.chance(0.5) ? 'old' : 'male', r, { range: 1.1 })
      let p = 0
      for (let i = 0; i < clip.length; i++) p = Math.max(p, Math.abs(clip[i]))
      mixInto(talk, clip.map(q => q / (p || 1)), Math.floor(t * sr), 0.5)
      t += clip.length / sr + r.range(1.5, 5)
    }
    diffuse(talk, sr, 0.6, 2000, 0.35)
    filt(talk, sr, [['lp', 1600, 0.7]])
    mixInto(d, talk, 0, 0.55)
    // scale beeps, till drawer, coins, receipt printer, a plastic bag
    for (let k = 0; k < 3; k++) tones(d, sr, [{ t: r.range(2, len - 2), dur: 0.12, f: 2600, gain: 0.08 }], { wave: 'square' })
    const till = r.range(8, 22)
    addModes(d, sr, Math.floor(till * sr), [[2100, 0.12, 0.6], [2950, 0.06, 0.4]], 1, r) // drawer bell
    addModes(d, sr, Math.floor((till + 0.25) * sr), [[180, 0.2, 0.12], [520, 0.12, 0.08], [1300, 0.08, 0.04]], 1, r)
    for (let k = 0; k < 6; k++) addModes(d, sr, Math.floor((till + 1.2 + k * r.range(0.04, 0.12)) * sr), [[r.range(3500, 5500), 0.05, 0.05], [r.range(6000, 7500), 0.03, 0.03]], 1, r)
    const pr = till + 3
    for (let i = Math.floor(pr * sr); i < Math.floor((pr + 1.1) * sr); i++) d[i] += ((i % Math.floor(sr / 420)) < 6 ? 1 : 0) * 0.05 * (0.6 + 0.4 * Math.sin(TAU * 7 * i / sr))
    const bag = Math.floor(r.range(4, 26) * sr)
    for (let c = 0; c < 40; c++) addBurst(d, sr, bag + Math.floor(r() * 0.8 * sr), 0.001, r, { f: r.range(2500, 6500), q: 1, gain: 0.08 * r(), tau: 0.0004 })
    return d
  },
})

def('wires_hum', {
  // trolleybus overhead wires singing in the frost: aeolian tone + faint crackle
  sr: 16000, prio: 5, norm: { rms: 0.12 }, loop: 0.5,
  gen(r, sr) {
    const len = 12, x = 0.5
    const d = buf(len + x, sr)
    const b1 = new Biquad(sr, 'bp', 330, 60), b2 = new Biquad(sr, 'bp', 660, 50), b3 = new Biquad(sr, 'bp', 1020, 40)
    const w = new Wander(r, sr, 0.3)
    for (let i = 0; i < d.length; i++) {
      const nz = r.bi()
      const s = 0.7 + 0.3 * w.next()
      if ((i & 31) === 0) { const k = 1 + 0.03 * w.next(); b1.set('bp', 330 * k, 60); b2.set('bp', 660 * k, 50) }
      d[i] = (b1.process(nz) * 1.6 + b2.process(nz) * 0.7 + b3.process(nz) * 0.25) * s + Math.sin(TAU * 100 * i / sr) * 0.004
    }
    for (let k = 0; k < 14; k++) addBurst(d, sr, Math.floor(r() * (d.length - 200)), 0.002, r, { type: 'hp', f: 3000, gain: r.range(0.02, 0.07), tau: 0.0005 })
    return d
  },
})

def('drip', {
  sr: 22050, variants: 6, prio: 4, norm: { peak: 0.8 },
  gen(r, sr) {
    const d = buf(0.35, sr)
    const at = Math.floor(0.004 * sr)
    addBurst(d, sr, at, 0.006, r, { type: 'hp', f: 2500, gain: 0.35, tau: 0.0015 })
    chirp(d, sr, at + Math.floor(0.002 * sr), { f0: r.range(900, 1400), f1: r.range(1800, 2800), dur: r.range(0.012, 0.025), gain: 0.8 })
    if (r.chance(0.5)) chirp(d, sr, at + Math.floor(r.range(0.03, 0.06) * sr), { f0: r.range(1500, 2000), f1: r.range(2500, 3200), dur: 0.01, gain: 0.25 })
    return d
  },
})

// ---- director beds ------------------------------------------------------------------------------

function stereoNoise(r, sr, len, x, fn) {
  return [0, 1].map(() => {
    const d = buf(len + x, sr)
    fn(d)
    return d
  })
}

def('bed_city', {
  // the city beyond view: a very low broadband drone (MKAD, millions of flats), stereo
  sr: 8000, prio: 0, norm: { rms: 0.2 }, loop: 2,
  gen(r, sr) {
    return stereoNoise(r, sr, 16, 2, d => {
      const br = new Brown(), pk = new Pink()
      const lp = new Biquad(sr, 'lp', 140, 0.7), bp = new Biquad(sr, 'bp', 380, 0.6)
      const w = new Wander(r, sr, 0.08)
      for (let i = 0; i < d.length; i++) d[i] = (lp.process(br.next(r.bi())) * 2.2 + bp.process(pk.next(r.bi())) * 0.35) * (1 + 0.15 * w.next())
    })
  },
})
def('bed_traffic', {
  // distant traffic on wet, salted roads: drone + tyre band + spray, stereo
  sr: 11025, prio: 0, norm: { rms: 0.2 }, loop: 2,
  gen(r, sr) {
    return stereoNoise(r, sr, 15, 2, d => {
      const br = new Brown(), pk = new Pink()
      const lp = new Biquad(sr, 'lp', 300, 0.7), bp = new Biquad(sr, 'bp', 900, 0.6), hp = new Biquad(sr, 'hp', 2200, 0.7), lp2 = new Biquad(sr, 'lp', 6000, 0.7)
      const w = new Wander(r, sr, 0.15)
      for (let i = 0; i < d.length; i++) {
        const nz = pk.next(r.bi())
        d[i] = (lp.process(br.next(r.bi())) * 1.6 + bp.process(nz) * 0.5 + lp2.process(hp.process(r.bi())) * 0.08) * (1 + 0.2 * w.next())
      }
    })
  },
})
def('bed_brown', {
  sr: 8000, prio: 0, norm: { rms: 0.2 }, loop: 1,
  gen(r, sr) { return stereoNoise(r, sr, 12, 1, d => { const b = new Brown(); for (let i = 0; i < d.length; i++) d[i] = b.next(r.bi()) }) },
})
def('bed_white', {
  sr: 22050, prio: 0, norm: { rms: 0.2 }, loop: 0.5,
  gen(r, sr) { const d = buf(8.5, sr); for (let i = 0; i < d.length; i++) d[i] = r.bi(); return d },
})
def('bed_room', {
  // indoor building presence: faint mains hum, air, distant plumbing
  sr: 8000, prio: 2, norm: { rms: 0.2 }, loop: 1,
  gen(r, sr) {
    const d = buf(13, sr)
    const pk = new Pink()
    const lp = new Biquad(sr, 'lp', 420, 0.7)
    const w = new Wander(r, sr, 0.2)
    for (let i = 0; i < d.length; i++) {
      const t = i / sr
      d[i] = lp.process(pk.next(r.bi())) * 1.5 * (1 + 0.2 * w.next()) + Math.sin(TAU * 50 * t) * 0.05 + Math.sin(TAU * 100 * t) * 0.07
    }
    return d
  },
})
def('bed_underground', {
  // underpass / vestibule / platform room tone: low rumble, ventilation hiss, mains
  sr: 8000, prio: 2, norm: { rms: 0.2 }, loop: 1,
  gen(r, sr) {
    return stereoNoise(r, sr, 12, 1, d => {
      const br = new Brown(), pk = new Pink()
      const lp = new Biquad(sr, 'lp', 110, 0.7), bp = new Biquad(sr, 'bp', 1100, 0.7)
      const w = new Wander(r, sr, 0.15)
      for (let i = 0; i < d.length; i++) {
        const t = i / sr
        d[i] = lp.process(br.next(r.bi())) * 2.2 * (1 + 0.2 * w.next()) + bp.process(pk.next(r.bi())) * 0.18 + Math.sin(TAU * 100 * t) * 0.03
      }
    })
  },
})

export { smooth, cheapSpeaker }
